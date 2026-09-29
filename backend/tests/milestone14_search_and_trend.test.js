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
