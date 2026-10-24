const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { getDb } = require('../src/db/connection.js');
const { getExecutiveSummary } = require('../src/services/metricsEngine.js');

test('OC Calculation Reconciliation & Regression Suite', async (t) => {
  const db = getDb();

  await t.test('Scenario 1: Single counting per outlet per month (Standard month with multiple sales)', () => {
    // Outlet with multiple sales in Sep 2026 must be counted exactly once
    const multiTxOutlets = db.query(`
      SELECT outlet_id, COUNT(*) as tx_count
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND unit_type = 'Sales'
      GROUP BY outlet_id
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    assert.ok(multiTxOutlets.length > 0, 'Must have at least one outlet with multiple transactions');
    const targetOutlet = multiTxOutlets[0].outlet_id;

    const countRes = db.query(`
      SELECT COUNT(DISTINCT CASE WHEN unit_type = 'Sales' THEN outlet_id END) as oc
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND outlet_id = ?
    `, [targetOutlet])[0].oc;

    assert.equal(countRes, 1, 'Outlet with multiple sales transactions must count exactly 1');
  });

  await t.test('Scenario 2: Outlet with sales AND return in the same month must count 1', () => {
    const mixedOutlets = db.query(`
      SELECT outlet_id
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND unit_type = 'Sales'
      INTERSECT
      SELECT outlet_id
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND unit_type = 'Return'
      LIMIT 1
    `);
    if (mixedOutlets.length > 0) {
      const targetOutlet = mixedOutlets[0].outlet_id;
      const countRes = db.query(`
        SELECT COUNT(DISTINCT CASE WHEN unit_type = 'Sales' THEN outlet_id END) as oc
        FROM fact_sales_header
        WHERE period_year = 2026 AND period_month = 9 AND outlet_id = ?
      `, [targetOutlet])[0].oc;
      assert.equal(countRes, 1, 'Outlet with both sales and return must count 1');
    }
  });

  await t.test('Scenario 3: Outlet with ONLY return transactions in a month must count 0', () => {
    const returnOnlyOutlets = db.query(`
      SELECT outlet_id
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND unit_type = 'Return'
      EXCEPT
      SELECT outlet_id
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND unit_type = 'Sales'
      LIMIT 1
    `);
    assert.ok(returnOnlyOutlets.length > 0, 'Must have at least one return-only outlet in Sep 2026');
    const targetOutlet = returnOnlyOutlets[0].outlet_id;

    const countRes = db.query(`
      SELECT COUNT(DISTINCT CASE WHEN unit_type = 'Sales' THEN outlet_id END) as oc
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND outlet_id = ?
    `, [targetOutlet])[0].oc;

    assert.equal(countRes, 0, 'Outlet with only return transactions must count 0 in OC');
  });

  await t.test('Scenario 4: Sales in previous month (Aug) and only return in target month (Sep) -> 1 in Aug, 0 in Sep', () => {
    // Outlet 30538500003 had sales in Aug 2026 and return in Sep 2026
    const augCount = db.query(`
      SELECT COUNT(DISTINCT CASE WHEN unit_type = 'Sales' THEN outlet_id END) as oc
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 8 AND outlet_id = '30538500003'
    `)[0].oc;

    const sepCount = db.query(`
      SELECT COUNT(DISTINCT CASE WHEN unit_type = 'Sales' THEN outlet_id END) as oc
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND outlet_id = '30538500003'
    `)[0].oc;

    assert.equal(augCount, 1, 'Outlet with sales in August must count 1 for August');
    assert.equal(sepCount, 0, 'Outlet with only return in September must count 0 for September');
  });

  await t.test('Scenario 5: Consecutive qualifying sales months -> 1 in each month', () => {
    const consecutiveOutlets = db.query(`
      SELECT outlet_id
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 8 AND unit_type = 'Sales'
      INTERSECT
      SELECT outlet_id
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND unit_type = 'Sales'
      LIMIT 1
    `);
    assert.ok(consecutiveOutlets.length > 0, 'Must have outlets ordering in both Aug and Sep');
    const targetOutlet = consecutiveOutlets[0].outlet_id;

    const augCount = db.query(`
      SELECT COUNT(DISTINCT CASE WHEN unit_type = 'Sales' THEN outlet_id END) as oc
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 8 AND outlet_id = ?
    `, [targetOutlet])[0].oc;

    const sepCount = db.query(`
      SELECT COUNT(DISTINCT CASE WHEN unit_type = 'Sales' THEN outlet_id END) as oc
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND outlet_id = ?
    `, [targetOutlet])[0].oc;

    assert.equal(augCount, 1, 'Count 1 in August');
    assert.equal(sepCount, 1, 'Count 1 in September');
  });

  await t.test('Scenario 6: Inactive outlet with zero transactions in target month -> count 0', () => {
    const inactiveOutlet = db.query(`
      SELECT outlet_id FROM dim_outlet
      EXCEPT
      SELECT outlet_id FROM fact_sales_header WHERE period_year = 2026 AND period_month = 9
      LIMIT 1
    `)[0].outlet_id;

    const sepCount = db.query(`
      SELECT COUNT(DISTINCT CASE WHEN unit_type = 'Sales' THEN outlet_id END) as oc
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND outlet_id = ?
    `, [inactiveOutlet])[0].oc;

    assert.equal(sepCount, 0, 'Zero transactions must evaluate to 0 active count');
  });

  await t.test('Scenario 7: Blank or invalid outlet code handling', () => {
    const blankCount = db.query(`
      SELECT COUNT(DISTINCT CASE WHEN unit_type = 'Sales' AND outlet_id IS NOT NULL AND outlet_id != '' THEN outlet_id END) as oc
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND (outlet_id IS NULL OR outlet_id = '')
    `)[0].oc;

    assert.equal(blankCount, 0, 'Blank/null outlet codes must not contribute to OC');
  });

  await t.test('Scenario 8: SAVORIA 7 Salesman Rayon group filter excludes Promotor Motorist and DSM', () => {
    const savoriaSummary = getExecutiveSummary({ year: 2026, month: 9, salesGroup: 'SAVORIA' });
    // Core 7 salesmen sales-only count is 1,874 (or 1,892 total qualifying distinct)
    assert.ok(savoriaSummary.coverage.activeOutletsMtd < 2000, `Must be around 1874, got ${savoriaSummary.coverage.activeOutletsMtd} (previous buggy value was 2116)`);
    assert.equal(savoriaSummary.coverage.activeOutletsMtd, 1874, 'Must equal exactly 1,874 active sales outlets');
  });

  await t.test('Scenario 9: Individual salesman OC matches reference pivot table exactly', () => {
    const expectedBreakdown = {
      '107075': { name: 'Muhamad Fikri Hambali', pivotTotal: 314, salesOnly: 310 },
      '305028': { name: 'Mulyana', pivotTotal: 183, salesOnly: 181 },
      '305029': { name: 'Mega Nugraha', pivotTotal: 301, salesOnly: 295 },
      '305030': { name: 'Ibna Faizal Rahman', pivotTotal: 281, salesOnly: 281 },
      '305031': { name: 'Risan Setiawan', pivotTotal: 297, salesOnly: 297 },
      '305032': { name: 'ANDI AGUNG GUMILAR', pivotTotal: 270, salesOnly: 265 },
      '305033': { name: 'Muhammad Zulfa Akbar', pivotTotal: 246, salesOnly: 245 }
    };

    for (const [smId, exp] of Object.entries(expectedBreakdown)) {
      const summary = getExecutiveSummary({ year: 2026, month: 9, salesmanId: smId });
      const rawCount = db.query(`
        SELECT COUNT(DISTINCT outlet_id) as total_raw
        FROM fact_sales_header
        WHERE period_year = 2026 AND period_month = 9 AND current_owner_salesman_id = ?
      `, [smId])[0].total_raw;

      assert.equal(rawCount, exp.pivotTotal, `Salesman ${exp.name} total raw distinct must equal ${exp.pivotTotal}`);
      assert.equal(summary.coverage.activeOutletsMtd, exp.salesOnly, `Salesman ${exp.name} sales OC must equal ${exp.salesOnly}`);
    }
  });

  await t.test('Scenario 10: Promotor Motorist (GZWF) is completely isolated under SAVORIA_OTHERS', () => {
    const promotorOutlets = db.query(`
      SELECT COUNT(DISTINCT outlet_id) as c
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9 AND current_owner_salesman_id = 'SAVORIA_OTH' AND document_number LIKE 'GZWF%'
    `)[0].c;

    assert.equal(promotorOutlets, 239, 'Promotor motorist must have 239 outlets under SAVORIA_OTH');
  });

  await t.test('Scenario 11: Total DSO active outlets matches pivot Grand Total', () => {
    const rawTotalDso = db.query(`
      SELECT COUNT(DISTINCT outlet_id) as c
      FROM fact_sales_header
      WHERE period_year = 2026 AND period_month = 9
    `)[0].c;

    assert.equal(rawTotalDso, 3220, 'Raw Grand Total distinct outlets in Sep 2026 must be 3,220');
  });

  await t.test('Scenario 12: Coverage percentage formula integrity: OC / Registered CL capped at 100%', () => {
    const summary = getExecutiveSummary({ year: 2026, month: 9, salesGroup: 'SAVORIA' });
    const expectedPct = Math.min(Math.round((summary.coverage.activeOutletsMtd / summary.coverage.registeredOutlets) * 1000) / 10, 100);
    assert.equal(summary.coverage.coveragePct, expectedPct);
  });
});
