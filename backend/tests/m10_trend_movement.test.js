const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server.js');
const { getDb } = require('../src/db/connection.js');
const { getMovementAnalytics, exportMovementCsv } = require('../src/services/trendEngine.js');
const { runSmallIngestion } = require('../src/db/ingest_small_files.js');

test('M10-1: Fact Quantity Targets for 2026 Ingestion', async (t) => {
  await runSmallIngestion();
  const db = getDb();
  const rows = db.query(`
    SELECT month, COUNT(*) as cnt, SUM(target_cartons) as total_tgt
    FROM fact_quantity_target
    WHERE year = 2026
    GROUP BY month
    ORDER BY month
  `);

  assert.ok(rows.length >= 9, 'Must have targets for at least Jan-Sep 2026');
  for (const r of rows) {
    assert.ok(r.cnt > 0, `Month ${r.month} must have target records`);
    assert.ok(r.total_tgt > 0, `Month ${r.month} total target cartons must be > 0`);
  }
});

test('M10-2: Sales Movement Aggregation Integrity (2025-2026)', async (t) => {
  const db = getDb();
  const years = db.query(`
    SELECT year, COUNT(DISTINCT month) as mo_count, COUNT(*) as rows, SUM(net_cartons) as sum_ctn, SUM(net_value) as sum_val
    FROM agg_monthly_sales_movement
    GROUP BY year
    ORDER BY year
  `);

  assert.ok(years.length >= 2, 'Must have data for both 2025 and 2026');
  const y2025 = years.find(y => y.year === 2025);
  const y2026 = years.find(y => y.year === 2026);

  assert.ok(y2025, '2025 data must exist');
  assert.equal(y2025.mo_count, 12, '2025 must have 12 months');
  assert.ok(y2025.sum_ctn > 0, '2025 net cartons must be positive');
  assert.ok(y2025.sum_val > 0, '2025 net value must be positive');

  assert.ok(y2026, '2026 data must exist');
  assert.ok(y2026.mo_count >= 9, '2026 must have at least 9 months (Jan-Sep)');
  assert.ok(y2026.sum_ctn > 0, '2026 net cartons must be positive');
  assert.ok(y2026.sum_val > 0, '2026 net value must be positive');
});

test('M10-3: Trend Engine Analytics by Dimension & Metric', async (t) => {
  // Salesman by Qty
  const smRes = getMovementAnalytics({ dimension: 'salesman', metric: 'qty', periodRange: '2026' });
  assert.equal(smRes.dimension, 'salesman');
  assert.equal(smRes.metric, 'qty');
  assert.equal(smRes.timeline.length, 9, 'Must have 9 months in 2026 timeline');
  assert.ok(smRes.chart.series.length > 0, 'Must have chart series');
  assert.ok(smRes.summary.totalQty > 0, 'Total Qty must be > 0');
  assert.ok(smRes.matrix.length > 0, 'Matrix rows must exist');

  // Principal by Value
  const prRes = getMovementAnalytics({ dimension: 'principal', metric: 'value', periodRange: '2026' });
  assert.equal(prRes.dimension, 'principal');
  assert.equal(prRes.metric, 'value');
  assert.ok(prRes.chart.series.length > 0, 'Must have principal series');
  assert.ok(prRes.summary.totalValue > 0, 'Total Value must be > 0');

  // Brand by OA
  const brRes = getMovementAnalytics({ dimension: 'brand', metric: 'oa', periodRange: '2026' });
  assert.equal(brRes.dimension, 'brand');
  assert.equal(brRes.metric, 'oa');
  assert.ok(brRes.chart.series.length > 0, 'Must have brand series');

  // Full 21-month timeline
  const allRes = getMovementAnalytics({ dimension: 'salesman', metric: 'qty', periodRange: 'all' });
  assert.equal(allRes.timeline.length, 21, 'Must have 21 months for full 2025-2026 timeline');
});

test('M10-4: REST API /api/analytics/movement & CSV Export', async (t) => {
  const port = 3998;
  const srv = app.listen(port);

  try {
    // 1. Test GET /api/analytics/movement
    const res = await fetch(`http://localhost:${port}/api/analytics/movement?dimension=brand&metric=qty&periodRange=2026`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.dimension, 'brand');
    assert.ok(Array.isArray(json.chart.series));
    assert.ok(json.chart.series.length > 0);
    assert.ok(json.matrix.length > 0);

    // 2. Test GET /api/analytics/movement/export
    const csvRes = await fetch(`http://localhost:${port}/api/analytics/movement/export?dimension=salesman&metric=qty&periodRange=2026`);
    assert.equal(csvRes.status, 200);
    assert.equal(csvRes.headers.get('content-type'), 'text/csv; charset=utf-8');
    const csvText = await csvRes.text();
    assert.ok(csvText.includes('SALESMAN'));
    assert.ok(csvText.includes('TOTAL'));
    assert.ok(csvText.includes('TARGET 2026'));
  } finally {
    srv.close();
  }
});

test('M10-5: September 2026 Sales & Target Value Dynamic Calculation', async (t) => {
  const port = 3991;
  const srv = app.listen(port);

  try {
    // 1. Executive Dashboard for September 2026
    const resDash = await fetch(`http://localhost:${port}/api/dashboard/executive?year=2026&month=9`);
    assert.equal(resDash.status, 200);
    const dataDash = await resDash.json();
    assert.ok(dataDash.summary, 'Summary must exist for September 2026');
    assert.ok(dataDash.summary.sales.actualCartons > 0, 'September 2026 must have actual cartons');
    assert.ok(dataDash.summary.sales.targetCartons > 0, 'September 2026 must have target cartons');
    assert.ok(dataDash.summary.sales.targetValue > 0, 'September 2026 must have target value');
    assert.ok(dataDash.summary.sales.totalInvoices > 0, 'September 2026 must have invoices');
    assert.ok(dataDash.summary.coverage.activeOutletsMtd > 0, 'September 2026 must have active outlets');
    assert.ok(dataDash.topSalesmen.length > 0, 'September 2026 must have top salesmen');

    // 2. Sales Performance for September 2026
    const resSales = await fetch(`http://localhost:${port}/api/sales/performance?year=2026&month=9`);
    assert.equal(resSales.status, 200);
    const dataSales = await resSales.json();
    assert.ok(dataSales.summary.totalCartons > 0, 'Sales performance must have cartons for September 2026');
    assert.ok(dataSales.summary.totalTargetValue > 0, 'Sales performance must have target value for September 2026');
    assert.ok(dataSales.groupSkus.length > 0, 'Group SKUs must exist');

    // 3. Tim Sales for September 2026
    const resSalesmen = await fetch(`http://localhost:${port}/api/salesmen?year=2026&month=9`);
    assert.equal(resSalesmen.status, 200);
    const dataSalesmen = await resSalesmen.json();
    assert.ok(dataSalesmen.salesmen.length >= 7, 'Must return salesmen for September 2026');
    const fikri = dataSalesmen.salesmen.find(s => s.salesmanId === '107075');
    assert.ok(fikri, 'Salesman Fikri must exist');
    assert.ok(fikri.targetCartons > 0, 'Fikri must have target cartons in September 2026');
    assert.ok(fikri.targetValue > 0, 'Fikri must have target value in September 2026');

    // 4. Incentive Calculator for September 2026
    const resInc = await fetch(`http://localhost:${port}/api/salesmen/107075/incentive?year=2026&month=9`);
    assert.equal(resInc.status, 200);
    const dataInc = await resInc.json();
    assert.equal(dataInc.components.length, 6);
    const compVal = dataInc.components.find(c => c.num === 4);
    assert.ok(compVal.target > 0, 'Component 4 target value must be dynamically derived from targets');
  } finally {
    srv.close();
  }
});
