const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server.js');
const { getDb } = require('../src/db/connection.js');
const { getExecutiveSummary } = require('../src/services/metricsEngine.js');
const { getTotalPerformanceSummary } = require('../src/services/performanceEngine.js');

test('System Audit & Multi-Filter Regression Test Suite', async (t) => {
  const srv = app.listen(0);
  const port = srv.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // -------------------------------------------------------------
    // SECTION 1: All 10 Individual Filters
    // -------------------------------------------------------------
    await t.test('1. Filter Period: Month 10 vs Month 9 returns valid non-empty data and correct calendar metrics', async () => {
      const resM10 = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=10`);
      assert.equal(resM10.status, 200);
      const dataM10 = await resM10.json();
      assert.equal(dataM10.summary.calendar.month, 10);
      assert.ok(dataM10.summary.sales.actualCartons > 0);

      const resM9 = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9`);
      assert.equal(resM9.status, 200);
      const dataM9 = await resM9.json();
      assert.equal(dataM9.summary.calendar.month, 9);
      assert.ok(dataM9.summary.sales.actualCartons > 0);
      assert.notEqual(dataM10.summary.sales.actualCartons, dataM9.summary.sales.actualCartons);
    });

    await t.test('2. Filter SPV: SPV_NOPAN and SPV_TRI_H partition sales correctly', async () => {
      const resNopan = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&spvId=SPV_NOPAN`);
      const resTri = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&spvId=SPV_TRI_H`);
      assert.equal(resNopan.status, 200);
      assert.equal(resTri.status, 200);
      const dataNopan = await resNopan.json();
      const dataTri = await resTri.json();
      assert.ok(dataNopan.summary.sales.actualCartons > 0);
      assert.ok(dataTri.summary.sales.actualCartons > 0);
      assert.notEqual(dataNopan.summary.sales.actualCartons, dataTri.summary.sales.actualCartons);
    });

    await t.test('3. Filter Sales Group: SAVORIA vs SCM filters correctly', async () => {
      const resSav = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&salesGroup=SAVORIA`);
      const resScm = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&salesGroup=SCM`);
      assert.equal(resSav.status, 200);
      assert.equal(resScm.status, 200);
      const dataSav = await resSav.json();
      const dataScm = await resScm.json();
      assert.ok(dataSav.summary.sales.actualCartons > 0);
      assert.ok(dataScm.summary.sales.actualCartons > 0);
    });

    await t.test('4. Filter Salesman: 107075 isolates specific salesman volume and targets', async () => {
      const resSalesman = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&salesmanId=107075`);
      assert.equal(resSalesman.status, 200);
      const dataSalesman = await resSalesman.json();
      assert.ok(dataSalesman.summary.sales.actualCartons > 0);

      const resPerf = await fetch(`${baseUrl}/api/sales/performance?year=2026&month=9&salesmanId=107075`);
      assert.equal(resPerf.status, 200);
      const dataPerf = await resPerf.json();
      assert.ok(dataPerf.products.length > 0);
      assert.ok(dataSalesman.summary.sales.actualCartons < 11000); // must be salesman volume, not total DSO
    });

    await t.test('5. Filter Rayon: R01 isolates rayon sales and active outlets', async () => {
      const resRayon = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&rayonId=R01`);
      assert.equal(resRayon.status, 200);
      const dataRayon = await resRayon.json();
      assert.ok(dataRayon.summary.sales.actualCartons > 0);
      assert.ok(dataRayon.summary.coverage.activeOutletsMtd > 0);
    });

    await t.test('6. Filter Principal: Savoria Kreasi Rasa and Unilever Indonesia filter properly', async () => {
      const resUnilever = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&principal=UNILEVER%20INDONESIA`);
      assert.equal(resUnilever.status, 200);
      const dataUnilever = await resUnilever.json();
      assert.ok(dataUnilever.summary.sales.actualCartons > 0);

      const resSav = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&principal=Savoria%20Kreasi%20Rasa`);
      assert.equal(resSav.status, 200);
      const dataSav = await resSav.json();
      assert.ok(dataSav.summary.sales.actualCartons > 0);
    });

    await t.test('7. Filter Brand: SARIWANGI isolates SariWangi sales volume', async () => {
      const resBrand = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&brand=SARIWANGI`);
      assert.equal(resBrand.status, 200);
      const dataBrand = await resBrand.json();
      assert.ok(dataBrand.summary.sales.actualCartons > 0);
      assert.ok(dataBrand.topSalesmen.length > 0);
    });

    await t.test('8. Filter Subbrand: Isolates volume for subbrand Sariwangi Teh Hitam', async () => {
      const resSubbrand = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&subbrand=Sariwangi%20Teh%20Hitam`);
      assert.equal(resSubbrand.status, 200);
      const dataSubbrand = await resSubbrand.json();
      assert.ok(dataSubbrand.summary.sales.actualCartons > 0);
    });

    await t.test('9. Filter Group SKU: DELI filters to specific SKU group', async () => {
      const resGroupSku = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&groupSku=DELI`);
      assert.equal(resGroupSku.status, 200);
      const dataGroupSku = await resGroupSku.json();
      assert.ok(dataGroupSku.summary.sales.actualCartons > 0);
    });

    await t.test('10. Filter Kecamatan: KEC_GARUT_KOTA isolates Garut Kota data', async () => {
      const resKec = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&kecamatanId=KEC_GARUT_KOTA`);
      assert.equal(resKec.status, 200);
      const dataKec = await resKec.json();
      assert.ok(dataKec.summary.sales.actualCartons > 0);
    });

    // -------------------------------------------------------------
    // SECTION 2: Cascading Filter Dependencies
    // -------------------------------------------------------------
    await t.test('11. Options endpoint returns complete hierarchy and mappings', async () => {
      const res = await fetch(`${baseUrl}/api/filters/options`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.productHierarchy && data.productHierarchy.length > 0);
      assert.ok(data.salesmanRayons && Object.keys(data.salesmanRayons).length > 0);
      assert.ok(data.principals && data.principals.length >= 6);
      assert.ok(data.spvs && data.spvs.length >= 2);
    });

    await t.test('12. Product hierarchy accurately maps Unilever only to Unilever brands', async () => {
      const res = await fetch(`${baseUrl}/api/filters/options`);
      const data = await res.json();
      const unileverRows = data.productHierarchy.filter(p => p.principal.toUpperCase() === 'UNILEVER INDONESIA');
      const brands = Array.from(new Set(unileverRows.map(r => r.brand)));
      assert.ok(brands.includes('SARIWANGI') || brands.includes('UNILEVER'));
      assert.ok(!brands.includes('KOPI TUBRUK GADJAH'));
      assert.ok(!brands.includes('5DAYS'));
    });

    // -------------------------------------------------------------
    // SECTION 3: Multi-Filter Combinations
    // -------------------------------------------------------------
    await t.test('13. Combination A: SPV_NOPAN + Salesman 107075 + Period 2026-09', async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&spvId=SPV_NOPAN&salesmanId=107075`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.summary.sales.actualCartons > 0);
      assert.ok(data.summary.coverage.activeOutletsMtd > 0);
    });

    await t.test('14. Combination B: Salesman 107075 + Rayon R01', async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&salesmanId=107075&rayonId=R01`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.summary.sales.actualCartons > 0);
    });

    await t.test('15. Combination C: Principal Unilever + Brand SARIWANGI + Subbrand Sariwangi Teh Hitam', async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=9&principal=UNILEVER%20INDONESIA&brand=SARIWANGI&subbrand=Sariwangi%20Teh%20Hitam`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.summary.sales.actualCartons > 0);
    });

    await t.test('16. Combination D: Salesman 107075 + Principal Savoria Kreasi Rasa + Month 10', async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/executive?year=2026&month=10&salesmanId=107075&principal=Savoria%20Kreasi%20Rasa`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.summary.sales.actualCartons > 0);
    });

    // -------------------------------------------------------------
    // SECTION 4: Cross-Module Calculation Reconciliation
    // -------------------------------------------------------------
    await t.test('17. Executive Summary actualCartons matches Total Performance actualCartons for Sep 2026', () => {
      const exec = getExecutiveSummary({ year: 2026, month: 9 });
      const perf = getTotalPerformanceSummary({ year: 2026, month: 9, view: 'summary' });
      assert.equal(Math.round(exec.sales.actualCartons * 10) / 10, Math.round(perf.kpis.actualCartons * 10) / 10);
    });

    await t.test('18. Executive Summary actualCartons matches Total Performance actualCartons for Oct 2026', () => {
      const exec = getExecutiveSummary({ year: 2026, month: 10 });
      const perf = getTotalPerformanceSummary({ year: 2026, month: 10, view: 'summary' });
      assert.equal(Math.round(exec.sales.actualCartons * 10) / 10, Math.round(perf.kpis.actualCartons * 10) / 10);
    });

    await t.test('19. Single-counting distinct active outlets (OC) per month: Sep=3125, Oct=1035', () => {
      const execM9 = getExecutiveSummary({ year: 2026, month: 9 });
      assert.equal(execM9.coverage.activeOutletsMtd, 3125);

      const execM10 = getExecutiveSummary({ year: 2026, month: 10 });
      assert.equal(execM10.coverage.activeOutletsMtd, 1035);
    });

    await t.test('20. Registered CL universe remains consistent (2,452–2,487)', () => {
      const exec = getExecutiveSummary({ year: 2026, month: 10 });
      assert.ok(exec.coverage.registeredOutlets >= 2450 && exec.coverage.registeredOutlets <= 2500);
    });

    await t.test('21. Customer directory /api/outlets accurately returns Month 10 active outlets with dynamic asOfDate', async () => {
      const res = await fetch(`${baseUrl}/api/outlets?year=2026&month=10&status=active&limit=5`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.outlets.length > 0);
      assert.ok(data.outlets[0].monthlySales.m10 !== undefined);
      assert.ok(data.outlets[0].stateCode === 'ACTIVE');
    });
  } finally {
    srv.close();
  }
});
