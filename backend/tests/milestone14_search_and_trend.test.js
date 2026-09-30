const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { app } = require('../src/server.js');
const { getDb } = require('../src/db/connection.js');
const { getMovementAnalytics } = require('../src/services/trendEngine.js');

test('M14-1: Quick Login buttons removed from login view', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.ok(!indexHtml.includes('quickLogin('), 'quickLogin function call should not exist in index.html');
  assert.ok(!indexHtml.includes('Aghia Anggala (Super Admin)'), 'Preset quick role selector should be removed');
  assert.ok(!indexHtml.includes('1-Click Cepat'), 'Quick login badge should be removed');
});

test('M14-2: REST API GET /api/outlets/search-suggestions returns accurate autocomplete matches', async () => {
  const port = 3998;
  const srv = app.listen(port);
  try {
    const res = await fetch(`http://localhost:${port}/api/outlets/search-suggestions?q=SINAR`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.suggestions), 'Should return suggestions array');
    assert.ok(data.suggestions.length > 0, 'Should find at least one match for SINAR');

    const match = data.suggestions.find(s => (s.outlet_name || s.canonicalName).includes('SINAR'));
    assert.ok(match, 'Found matching store in suggestions');
    assert.ok(match.outlet_id || match.outletId, 'Should have outlet_id');
    assert.ok(match.outlet_name || match.canonicalName, 'Should have outlet_name');
    assert.ok(match.outlet_code || match.code, 'Should have outlet_code');
  } finally {
    srv.close();
  }
});

test('M14-3: Outlet-level movement analytics supports store trend and reactive groupSku/brand filters', () => {
  const db = getDb();
  const rows = db.query(`
    SELECT o.outlet_id, o.canonical_name 
    FROM dim_outlet o 
    WHERE o.canonical_name LIKE '%SINAR MUKTI%' 
    LIMIT 1
  `);
  assert.ok(rows.length > 0, 'PD SINAR MUKTI must exist in database');
  const outlet = rows[0];

  // 1. Overall outlet movement
  const mov = getMovementAnalytics({ outletId: outlet.outlet_id, periodRange: 'all' });
  assert.equal(mov.isOutletScope, true, 'isOutletScope should be true');
  assert.ok(mov.outletInfo, 'outletInfo should be populated');
  assert.equal(mov.outletInfo.id, outlet.outlet_id);
  assert.ok(mov.dsoMovement, 'dsoMovement should be populated');
  assert.ok(mov.dsoMovement.volumeSeries.length > 0, 'volumeSeries should contain data');
  assert.ok(mov.dsoMovement.valSeries.length > 0, 'valSeries should contain data');
  assert.ok(mov.dsoMovement.totals.totalVolume > 0, 'Store totalVolume should be positive');

  const initialVolume = mov.dsoMovement.totals.totalVolume;

  // 2. Filtered with groupSku: DELI
  const movDeli = getMovementAnalytics({ outletId: outlet.outlet_id, periodRange: 'all', groupSku: 'DELI' });
  assert.equal(movDeli.isOutletScope, true);
  assert.ok(movDeli.dsoMovement.totals.totalVolume > 0, 'Filtered volume should be positive');
  assert.ok(movDeli.dsoMovement.totals.totalVolume <= initialVolume, 'Filtered DELI volume should be <= total volume');
});

test('M14-4: REST API GET /api/outlets accurately aggregates alias transactions and displays active status', async () => {
  const port = 3997;
  const srv = app.listen(port);
  try {
    const res = await fetch(`http://localhost:${port}/api/outlets?search=saepul`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.outlets), 'Should return outlets array');
    const saepul = data.outlets.find(o => o.name === 'SAEPUL ROHMAN' && (o.rayon === 'R05' || o.kecamatan === 'Pangatikan'));
    assert.ok(saepul, 'Should find SAEPUL ROHMAN in Pangatikan / R05');
    assert.equal(saepul.status, 'Aktif', 'SAEPUL ROHMAN should have status Aktif');
    assert.ok(saepul.totalYtdCartons > 200, `totalYtdCartons should be > 200 KTN (actual: ${saepul.totalYtdCartons})`);
    assert.ok(saepul.monthlySales.m1 > 0, 'Month 1 (Jan) should be > 0');
    assert.ok(saepul.monthlySales.m9 > 0, 'Month 9 (Sep) should be > 0');
    assert.ok(saepul.lifetimeOrders >= 20, 'Lifetime orders should be >= 20');
    assert.ok(saepul.lifetimeValueJt >= 18, 'Lifetime value should be >= 18 Jt');
  } finally {
    srv.close();
  }
});

test('M14-5: REST API GET /api/outlets/:id/360 resolves both canonical and alias customer codes', async () => {
  const port = 3996;
  const srv = app.listen(port);
  try {
    // 1. Query by canonical outlet ID
    const resCanonical = await fetch(`http://localhost:${port}/api/outlets/OUT_73176d4f-b7d5-481a-a84f-31902d861875/360`);
    assert.equal(resCanonical.status, 200);
    const dataCanonical = await resCanonical.json();
    assert.equal(dataCanonical.identity.status, 'Aktif');
    assert.ok(dataCanonical.summaryMetrics.totalCartons > 200);
    assert.ok(dataCanonical.summaryMetrics.totalInvoices > 0);
    assert.ok(dataCanonical.topSkus.length > 0);

    // 2. Query by ERP customer code alias
    const resAlias = await fetch(`http://localhost:${port}/api/outlets/G3050BF250425145021101/360`);
    assert.equal(resAlias.status, 200);
    const dataAlias = await resAlias.json();
    assert.equal(dataAlias.identity.outletId, 'OUT_73176d4f-b7d5-481a-a84f-31902d861875');
    assert.equal(dataAlias.identity.status, 'Aktif');
    assert.ok(dataAlias.summaryMetrics.totalCartons > 200);
  } finally {
    srv.close();
  }
});

test('M14-6: REST API GET /api/outlets dynamically updates sales metrics when brand or groupSku filter is selected', async () => {
  const port = 3997;
  const srv = app.listen(port);
  try {
    // 1. Filtered by Group SKU: GADJAH MANIS
    const resGadjah = await fetch(`http://localhost:${port}/api/outlets?search=saepul+rohman&groupSku=GADJAH+MANIS`);
    assert.equal(resGadjah.status, 200);
    const dataGadjah = await resGadjah.json();
    assert.equal(dataGadjah.outlets.length, 1);
    const saepulGadjah = dataGadjah.outlets[0];
    assert.equal(saepulGadjah.name, 'SAEPUL ROHMAN');
    assert.equal(saepulGadjah.totalYtdCartons, 1.9, 'Saepul Rohman GADJAH MANIS YTD cartons must be 1.9');
    assert.equal(saepulGadjah.avgLast3Months, 0.5, 'Saepul Rohman GADJAH MANIS Avg L3M must be 0.5');
    assert.equal(saepulGadjah.monthlySales.m9, 0.1, 'Saepul Rohman GADJAH MANIS September sales must be 0.1');
    assert.equal(saepulGadjah.status, 'Aktif');

    // 2. Filtered by Brand: 5DAYS
    const res5Days = await fetch(`http://localhost:${port}/api/outlets?search=saepul+rohman&brand=5DAYS`);
    assert.equal(res5Days.status, 200);
    const data5Days = await res5Days.json();
    assert.equal(data5Days.outlets.length, 1);
    const saepul5Days = data5Days.outlets[0];
    assert.equal(saepul5Days.totalYtdCartons, 123.8, 'Saepul Rohman 5DAYS YTD cartons must be 123.8');
    assert.equal(saepul5Days.monthlySales.m9, 19.4, 'Saepul Rohman 5DAYS September sales must be 19.4');
    assert.equal(saepul5Days.status, 'Aktif');

    // 3. Unfiltered baseline
    const resAll = await fetch(`http://localhost:${port}/api/outlets?search=saepul+rohman`);
    assert.equal(resAll.status, 200);
    const dataAll = await resAll.json();
    assert.equal(dataAll.outlets.length, 1);
    const saepulAll = dataAll.outlets[0];
    assert.equal(saepulAll.totalYtdCartons, 219.4, 'Saepul Rohman total unfiltered YTD cartons must be 219.4');
    assert.equal(saepulAll.avgLast3Months, 22.4, 'Saepul Rohman total unfiltered Avg L3M must be 22.4');
  } finally {
    srv.close();
  }
});

