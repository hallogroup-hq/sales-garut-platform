const test = require('node:test');
const assert = require('node:assert/strict');
const { getTotalPerformanceSummary, exportPerformanceCsv } = require('../src/services/performanceEngine.js');
const { getMovementAnalytics } = require('../src/services/trendEngine.js');
const { getDb } = require('../src/db/connection.js');

test('M13-1: Filter Options include Subbrands, Principals, Brands, Group SKUs, and Rayons', () => {
  const db = getDb();
  const subbrands = db.query('SELECT DISTINCT subbrand FROM dim_product WHERE subbrand IS NOT NULL ORDER BY subbrand').map(r => r.subbrand);
  const principals = db.query('SELECT DISTINCT principal FROM dim_product WHERE principal IS NOT NULL ORDER BY principal').map(r => r.principal);
  const brands = db.query('SELECT DISTINCT brand FROM dim_product WHERE brand IS NOT NULL ORDER BY brand').map(r => r.brand);
  const groupSkus = db.query('SELECT DISTINCT group_sku FROM dim_product WHERE group_sku IS NOT NULL ORDER BY group_sku').map(r => r.group_sku);
  const rayons = db.query('SELECT rayon_id, code, name FROM dim_rayon ORDER BY code');

  assert.ok(subbrands.length > 20, 'Subbrands list should contain master product subbrands');
  assert.ok(principals.length >= 5, 'Principals list should contain at least 5 principals');
  assert.ok(brands.length >= 10, 'Brands list should contain at least 10 brands');
  assert.ok(groupSkus.length >= 5, 'Group SKUs list should contain group SKUs');
  assert.ok(rayons.length >= 10, 'Rayons list should contain R01-R15');
});

test('M13-2: Total Performance Summary provides complete KPIs, DSO Monthly, Salesmen, and Subbrands', () => {
  const perf = getTotalPerformanceSummary({ year: 2026, month: 9, asOfDate: '2026-09-25' });

  // 1. KPIs
  assert.equal(perf.kpis.year, 2026);
  assert.equal(perf.kpis.month, 9);
  assert.equal(perf.kpis.targetCartons, 11723.29);
  assert.equal(perf.kpis.actualCartons, 5432.96);
  assert.equal(perf.kpis.registeredOutlets, 2452);
  assert.equal(perf.kpis.activeOutletsMtd, 2717);
  assert.equal(perf.kpis.achievementPct, 46.3);
  assert.equal(perf.kpis.gapDaily, 1258.07);

  // 2. DSO Monthly Breakdown
  assert.equal(perf.dsoMonthly.length, 9, 'DSO monthly has 9 months for 2026');
  const sepRow = perf.dsoMonthly.find(m => m.month === 9);
  assert.ok(sepRow, 'September row exists in monthly table');
  assert.equal(sepRow.actualCartons, 5432.96);
  assert.equal(sepRow.activeOutlets, 2717);

  // 3. Performance by Salesman
  assert.ok(perf.bySalesman.length >= 7, 'Has at least 7 active salesmen');
  const mulyana = perf.bySalesman.find(s => s.salesmanId === '305028');
  assert.ok(mulyana, 'Mulyana found in salesmen list');
  assert.equal(mulyana.actualCartons, 1822);
  assert.equal(mulyana.targetCartons, 2732.6);
  assert.equal(mulyana.activeOutlets, 161);
  assert.equal(mulyana.rank, 1, 'Mulyana is rank 1');

  // 4. Performance by Sub-brand
  assert.ok(perf.bySubbrand.length > 10, 'Subbrands list contains all active sold subbrands');
  const topSub = perf.bySubbrand[0];
  assert.ok(topSub.actualCartons > 0, 'Top subbrand has volume > 0');
  assert.ok(topSub.contributionPct > 0, 'Top subbrand has contribution % > 0');
  assert.ok(topSub.activeOutlets > 0, 'Top subbrand has buying outlets OA > 0');
});

test('M13-3: Total Performance Brand Filtering isolates specific brand volume and subbrands', () => {
  const perf5Days = getTotalPerformanceSummary({ year: 2026, month: 9, brand: '5DAYS' });

  assert.equal(perf5Days.kpis.targetCartons, 2559.26, 'Target for 5DAYS group SKU');
  assert.equal(perf5Days.kpis.actualCartons, 988.03, 'Actual volume for 5DAYS in September 2026');
  assert.ok(perf5Days.bySubbrand.every(b => b.brand === '5DAYS'), 'All returned subbrands belong to 5DAYS');
});

test('M13-4: Movement Analytics respects Brand filter on dual-axis chart and OA count', () => {
  const movAll = getMovementAnalytics({ periodRange: '2026', dimension: 'brand', metric: 'qty' });
  const mov5Days = getMovementAnalytics({ periodRange: '2026', dimension: 'brand', metric: 'qty', brand: '5DAYS' });

  assert.notEqual(
    mov5Days.dsoMovement.totals.totalVolume,
    movAll.dsoMovement.totals.totalVolume,
    '5DAYS filtered volume should be distinct from total DSO volume'
  );
  assert.ok(
    mov5Days.dsoMovement.totals.totalVolume < movAll.dsoMovement.totals.totalVolume,
    'Filtered brand volume must be less than overall branch volume'
  );
});

test('M13-5: Performance CSV Export generates valid CSV for all 3 views', () => {
  const csvDso = exportPerformanceCsv({ year: 2026, month: 9 }, 'dso');
  assert.ok(csvDso.includes('Periode'), 'DSO CSV contains Periode header');
  assert.ok(csvDso.includes('Target Volume (KTN)'), 'DSO CSV contains Target header');

  const csvSalesman = exportPerformanceCsv({ year: 2026, month: 9 }, 'salesman');
  assert.ok(csvSalesman.includes('Nama Salesman'), 'Salesman CSV contains Salesman header');
  assert.ok(csvSalesman.includes('Mulyana'), 'Salesman CSV contains Mulyana');

  const csvSubbrand = exportPerformanceCsv({ year: 2026, month: 9 }, 'subbrand');
  assert.ok(csvSubbrand.includes('Sub-brand'), 'Subbrand CSV contains Sub-brand header');
  assert.ok(csvSubbrand.includes('Kontribusi (%)'), 'Subbrand CSV contains Kontribusi header');
});
