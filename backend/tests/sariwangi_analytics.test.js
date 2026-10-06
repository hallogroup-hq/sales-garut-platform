const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const router = require('../src/routes/api.js');
const { getDb } = require('../src/db/connection.js');
const { getSariwangiAnalytics, formatRecency, calculateStrataDiscount } = require('../src/services/sariwangiService.js');

test('SariWangi Analytics — Unit & Integration Test Suite', async (t) => {
  const db = getDb();

  await t.test('Unit: formatRecency human-friendly recency labels', () => {
    assert.equal(formatRecency(0).label, '0 days lalu');
    assert.equal(formatRecency(3).label, '3 days lalu');
    assert.equal(formatRecency(6).label, '6 days lalu');
    assert.equal(formatRecency(7).label, '1 week lalu');
    assert.equal(formatRecency(13).label, '1 week lalu');
    assert.equal(formatRecency(14).label, '> 1 week lalu');
    assert.equal(formatRecency(20).label, '> 1 week lalu');
    assert.equal(formatRecency(21).label, '> 2 week lalu');
    assert.equal(formatRecency(45).label, '> 2 week lalu');
  });

  await t.test('Unit: calculateStrataDiscount dual-layer stacking discount', () => {
    // 50 cartons of Selected SKU: Regular 1.25% + Promo 5% = 6.25%
    const d50 = calculateStrataDiscount(50, true);
    assert.equal(d50.regDisc, 1.25);
    assert.equal(d50.selDisc, 5.00);
    assert.equal(d50.totalDisc, 6.25);

    // 6 cartons of Selected SKU: Regular 1.00% + Promo 2% = 3.00%
    const d6 = calculateStrataDiscount(6, true);
    assert.equal(d6.regDisc, 1.00);
    assert.equal(d6.selDisc, 2.00);
    assert.equal(d6.totalDisc, 3.00);

    // 0.5 carton of Non-Selected SKU: 0% discount
    const d05 = calculateStrataDiscount(0.5, false);
    assert.equal(d05.regDisc, 0);
    assert.equal(d05.selDisc, 0);
    assert.equal(d05.totalDisc, 0);

    // 2 cartons of Non-Selected: Regular 0.75%, Selected 0%
    const d2 = calculateStrataDiscount(2, false);
    assert.equal(d2.regDisc, 0.75);
    assert.equal(d2.selDisc, 0);
    assert.equal(d2.totalDisc, 0.75);
  });

  await t.test('Service: getSariwangiAnalytics baseline calculations', () => {
    const data = getSariwangiAnalytics(db);
    assert.ok(data.summary);
    assert.ok(data.summary.totalCartons > 600, 'Total cartons must be > 600');
    assert.ok(data.summary.totalNetto > 150000000, 'Total netto must be > Rp 150M');
    assert.ok(data.summary.totalOA > 1500, 'Total active outlets must be > 1,500');
    assert.ok(data.summary.totalOC > 1700, 'Total order calls must be > 1,700');

    // Mathematical identity: dropsize = volume / OC
    const expectedDropsize = Math.round((data.summary.totalCartons / data.summary.totalOC) * 1000) / 1000;
    assert.equal(data.summary.avgDropsizeCtn, expectedDropsize, 'Avg dropsize must equal totalCartons / totalOC');

    // Dropsize brackets check
    const b = data.dropsizeBrackets;
    assert.ok(b.under_half.count > 1000, '< 0.5 ktn must be majority of small orders');
    assert.ok(b.half_to_one.count > 150, '0.5-1 ktn must have significant orders');
    assert.ok(b.over_one.count > 50, '> 1 ktn must have orders');
    assert.ok(b.strata_promo_tier.count >= 20, '≥ 6 ktn promo tier must have at least 20 orders');

    // Outlets table check
    assert.ok(data.outlets.length > 1500);
    const firstOutlet = data.outlets[0];
    assert.ok(firstOutlet.outlet_id);
    assert.ok(firstOutlet.outlet_name);
    assert.ok(firstOutlet.total_cartons > 0);
    assert.ok(firstOutlet.last_order_date);
    assert.ok(['days', '1week', 'gt1week', 'gt2week'].includes(firstOutlet.recency_key));
    assert.ok(firstOutlet.skus.length > 0);

    // Kecamatan distribution
    assert.ok(data.kecamatanDistribution.length >= 40, 'Must cover 40+ Garut kecamatans');
    const topKec = data.kecamatanDistribution[0];
    assert.ok(topKec.kecamatan_name);
    assert.ok(topKec.total_cartons > 0);
  });

  await t.test('Integration: REST API GET /api/analytics/sariwangi with filters', async () => {
    const app = express();
    app.use('/api', router);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      // 1. Baseline unfiltered
      const res = await fetch(`http://localhost:${port}/api/analytics/sariwangi`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.summary.totalOA > 1500);

      // 2. Filter by Kecamatan = Bayongbong
      const resKec = await fetch(`http://localhost:${port}/api/analytics/sariwangi?kecamatan=Bayongbong`);
      assert.equal(resKec.status, 200);
      const jsonKec = await resKec.json();
      assert.equal(jsonKec.success, true);
      assert.equal(jsonKec.summary.totalOA, 76, 'Bayongbong has exactly 76 transacting outlets');
      jsonKec.outlets.forEach(o => assert.equal(o.kecamatan, 'Bayongbong'));

      // 3. Filter by Salesman = Mulyana
      const resSm = await fetch(`http://localhost:${port}/api/analytics/sariwangi?salesman=Mulyana`);
      assert.equal(resSm.status, 200);
      const jsonSm = await resSm.json();
      assert.equal(jsonSm.success, true);
      assert.equal(jsonSm.summary.totalOA, 147, 'Mulyana has 147 transacting outlets');
      jsonSm.outlets.forEach(o => assert.equal(o.salesman_name, 'Mulyana'));

      // 4. CSV Export
      const resCsv = await fetch(`http://localhost:${port}/api/analytics/sariwangi/export`);
      assert.equal(resCsv.status, 200);
      assert.ok(resCsv.headers.get('content-type').includes('text/csv'));
      const text = await resCsv.text();
      assert.ok(text.includes('Outlet ID,Nama Toko / Outlet,Kecamatan,Rayon,Salesman'));
      assert.ok(text.includes('TOKO SULTAN CELL'));
    } finally {
      server.close();
    }
  });
});
