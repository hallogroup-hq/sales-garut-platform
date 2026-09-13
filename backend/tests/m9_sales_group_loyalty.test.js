const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server.js');
const { getCalendarPace, calculateMonFriWorkingDays } = require('../src/services/calendarEngine.js');
const { getTopSalesmen, getExecutiveSummary } = require('../src/services/metricsEngine.js');
const http = require('node:http');

test('M9-1: Monday-to-Friday Working Days & Timegone Calculation', (t) => {
  // As of May 21 (system reference date)
  const monFri21 = calculateMonFriWorkingDays(2026, 5, 21);
  assert.equal(monFri21.monFriTotalHk, 21, 'May 2026 has 21 Monday-to-Friday working days');
  assert.equal(monFri21.monFriAsOfHke, 15, 'As of May 21, 15 Mon-Fri working days elapsed');
  assert.equal(monFri21.monFriRemainingHk, 6, 'As of May 21, 6 Mon-Fri working days remain');
  assert.equal(monFri21.monFriTimegonePct, 71.4, 'Timegone % is 71.4% (15/21)');

  const cal = getCalendarPace(2026, 5);
  assert.equal(cal.monFriTotalHk, 21);
  assert.ok(cal.timegonePct >= 70.0);
});

test('M9-2: Salesman Groups & Type Allocation Rules', (t) => {
  // Default list returns salesmen with assigned rayons (Kanvas, GT, CB)
  const defaultSalesmen = getTopSalesmen({ year: 2026, month: 5 }, 20);
  assert.ok(defaultSalesmen.length >= 7, 'Default list includes organic Savoria salesmen with rayon');
  
  for (const s of defaultSalesmen) {
    assert.equal(s.hasRayon, 1, `Salesman ${s.salesmanName} must have has_rayon = 1`);
    assert.ok(s.registeredOutlets > 0, `Salesman ${s.salesmanName} must have registered outlets`);
  }

  // Kanvas salesmen: Target CL 375, Cycle 3 Minggu
  const kanvas = defaultSalesmen.filter(s => s.salesmanType === 'Kanvas');
  assert.ok(kanvas.length >= 5, 'Should have 5 Kanvas salesmen');
  kanvas.forEach(k => {
    assert.equal(k.targetCl, 375);
    assert.equal(k.visitCycle, '3 Minggu');
  });

  // GT salesman: Target CL 375, Cycle 3 Minggu
  const gt = defaultSalesmen.find(s => s.salesmanType === 'GT');
  assert.ok(gt, 'Should have GT salesman');
  assert.equal(gt.targetCl, 375);
  assert.equal(gt.visitCycle, '3 Minggu');

  // CB salesman: Target CL 200, Cycle 2 Minggu
  const cb = defaultSalesmen.find(s => s.salesmanType === 'CB');
  assert.ok(cb, 'Should have CB salesman (Mulyana)');
  assert.equal(cb.targetCl, 200);
  assert.equal(cb.visitCycle, '2 Minggu');

  // Specific Group Filter: SMC
  const smcList = getTopSalesmen({ year: 2026, month: 5, salesGroup: 'SMC' }, 10);
  assert.ok(smcList.length >= 1, 'Should find SMC group');
  assert.equal(smcList[0].salesGroup, 'SMC');
  assert.equal(smcList[0].hasRayon, 0);

  // Specific Group Filter: SAVORIA_OTHERS
  const othList = getTopSalesmen({ year: 2026, month: 5, salesGroup: 'SAVORIA_OTHERS' }, 10);
  assert.ok(othList.length >= 1, 'Should find SAVORIA_OTHERS group');
  assert.equal(othList[0].salesGroup, 'SAVORIA_OTHERS');
});

test('M9-3: Store Loyalty Program APIs & Template Download', async (t) => {
  const server = http.createServer(app).listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Program list
    const resList = await fetch(`${baseUrl}/api/programs/store-loyalty`);
    assert.equal(resList.status, 200);
    const dataList = await resList.json();
    assert.ok(Array.isArray(dataList.programs), 'Should return programs array');
    const ktgProg = dataList.programs.find(p => p.programId === 'PROG_KTG_LOYALTY');
    assert.ok(ktgProg, 'Should find Loyalty Kopi Tubruk Gadjah program');
    assert.equal(ktgProg.totalOutlets, 20, 'Should have 20 participating stores');

    // 2. Program detail
    const resDetail = await fetch(`${baseUrl}/api/programs/store-loyalty/PROG_KTG_LOYALTY?sortBy=customerName&sortDir=asc`);
    assert.equal(resDetail.status, 200);
    const dataDetail = await resDetail.json();
    assert.equal(dataDetail.program.programId, 'PROG_KTG_LOYALTY');
    assert.equal(dataDetail.stores.length, 20);
    const firstStore = dataDetail.stores[0];
    assert.ok(firstStore.customerCode);
    assert.ok(firstStore.customerName);
    assert.ok(firstStore.targetCartons > 0);
    assert.ok(firstStore.strata);
    assert.ok(firstStore.statusCapai);

    // 3. Template download
    const resTpl = await fetch(`${baseUrl}/api/programs/store-loyalty/template`);
    assert.equal(resTpl.status, 200);
    assert.ok(resTpl.headers.get('content-type').includes('text/csv'));
    const csv = await resTpl.text();
    assert.ok(csv.includes('kode_toko,nama_toko,target_ktn'));
    assert.ok(csv.split('\n').length >= 21, 'Template should contain headers + 20 store rows');

    // 4. Create new program
    const createRes = await fetch(`${baseUrl}/api/programs/store-loyalty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programId: 'PROG_CUSTOM_TEST',
        programName: 'Program Trade Promo UHT & Croissant',
        productFocus: 'MILK LIFE UHT',
        outlets: [
          { customerCode: '305000534', customerName: 'Anugrah Wanaraja', targetCartons: 15, strata: '6-20 ktn', rewardPct: 3.0 }
        ]
      })
    });
    assert.equal(createRes.status, 200);
    const createData = await createRes.json();
    assert.equal(createData.success, true);
    assert.equal(createData.programId, 'PROG_CUSTOM_TEST');
  } finally {
    server.close();
  }
});
