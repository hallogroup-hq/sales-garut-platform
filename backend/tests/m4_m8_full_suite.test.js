const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server.js');
const { getDb } = require('../src/db/connection.js');

test('Milestone M4: Outlet 360 & Customer Intelligence APIs', async (t) => {
  const port = 3991;
  const srv = app.listen(port);

  try {
    const resList = await fetch(`http://localhost:${port}/api/outlets?limit=10`);
    assert.equal(resList.status, 200);
    const dataList = await resList.json();
    assert.ok(dataList.outlets.length > 0, 'Must return outlet list');
    const first = dataList.outlets[0];
    assert.ok(first.outletId, 'Outlet must have outletId');
    assert.ok(first.name, 'Outlet must have canonical name');
    assert.ok(['Aktif', 'Inaktif MTD', 'Dormant (>60 Hari)', 'Belum Pernah Order', 'Dormant'].includes(first.status), 'Valid status flag');

    // Test 360 detail
    const res360 = await fetch(`http://localhost:${port}/api/outlets/${first.outletId}/360`);
    assert.equal(res360.status, 200);
    const data360 = await res360.json();
    assert.equal(data360.identity.outletId, first.outletId);
    assert.ok(data360.identity.canonicalName);
    assert.ok(Array.isArray(data360.identity.aliases));
    assert.ok(data360.summaryMetrics);
    assert.ok(Array.isArray(data360.topSkus));
    assert.ok(data360.mustHave);
    assert.ok(Array.isArray(data360.recommendations));
  } finally {
    srv.close();
  }
});

test('Milestone M5: Product Performance & NPL Campaign Architecture', async (t) => {
  const port = 3992;
  const srv = app.listen(port);

  try {
    const resDash = await fetch(`http://localhost:${port}/api/dashboard/executive?year=2026&month=5`);
    const dataDash = await resDash.json();
    assert.ok(dataDash.mustHave.length >= 5, 'Must Have lines must cover at least 5 focus lines');
    const deliLine = dataDash.mustHave.find(m => m.lineCode === 'DELI');
    assert.ok(deliLine, 'DELI line must exist');
    assert.ok(deliLine.targetPenetrationPct > 0);

    // Test campaign-configurable NPL creation
    const resNpl = await fetch(`http://localhost:${port}/api/settings/npl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: 'CAMPAIGN_TEST_NPL',
        campaignName: 'Peluncuran Kopi Gadjah RTD Botol',
        startDate: '2026-05-01',
        endDate: '2026-07-31',
        targetRo1: 250,
        targetRo2: 150,
        skus: ['CAF RTD OAT MARIE LATTE (12) MT']
      })
    });
    assert.equal(resNpl.status, 200);
    const dataNpl = await resNpl.json();
    assert.equal(dataNpl.success, true);
    assert.equal(dataNpl.campaignId, 'CAMPAIGN_TEST_NPL');

    const db = getDb();
    const cRow = db.query('SELECT * FROM npl_campaign WHERE campaign_id = ?', ['CAMPAIGN_TEST_NPL'])[0];
    assert.equal(cRow.campaign_name, 'Peluncuran Kopi Gadjah RTD Botol');
    assert.equal(cRow.target_m1_penetration_pct, 250);
  } finally {
    srv.close();
  }
});

test('Milestone M6: Tim Sales Performance & Manual Target Admin', async (t) => {
  const port = 3993;
  const srv = app.listen(port);

  try {
    const resSales = await fetch(`http://localhost:${port}/api/salesmen?year=2026&month=5`);
    const dataSales = await resSales.json();
    assert.ok(dataSales.salesmen.length >= 7, 'Must return at least 7 active salesmen');
    const firstSales = dataSales.salesmen[0];
    assert.ok(firstSales.salesmanId);
    assert.ok(firstSales.salesmanName);

    // Test manual target input
    const resTgt = await fetch(`http://localhost:${port}/api/settings/target`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salesmanId: '107075',
        groupSku: 'KOPI TUBRUK GADJAH',
        year: 2026,
        month: 5,
        targetCartons: 500
      })
    });
    assert.equal(resTgt.status, 200);
    const dataTgt = await resTgt.json();
    assert.equal(dataTgt.success, true);

    const db = getDb();
    const tgtRow = db.query('SELECT target_cartons FROM fact_quantity_target WHERE salesman_id = ? AND group_sku = ? AND year = 2026 AND month = 5', ['107075', 'KOPI TUBRUK GADJAH'])[0];
    assert.equal(tgtRow.target_cartons, 500);

    // Test incentive calculation with TBD AR Component
    const resInc = await fetch(`http://localhost:${port}/api/salesmen/107075/incentive?year=2026&month=5`);
    const dataInc = await resInc.json();
    assert.equal(dataInc.components.length, 6);
    assert.equal(dataInc.components[5].status, 'TBD', 'AR Performance must be locked at TBD');
  } finally {
    srv.close();
  }
});

test('Milestone M7: Stock Health (Dual Cover) & AR Aging Ledger', async (t) => {
  const port = 3994;
  const srv = app.listen(port);

  try {
    const resStock = await fetch(`http://localhost:${port}/api/stock`);
    assert.equal(resStock.status, 200);
    const dataStock = await resStock.json();
    assert.ok(dataStock.summary.totalSkus > 0);
    assert.ok(dataStock.items.length > 0);
    const firstStock = dataStock.items[0];
    assert.ok(firstStock.item_code);
    assert.ok(['OOS', 'LOW', 'HEALTHY', 'OVERSTOCK'].includes(firstStock.status));
    assert.ok(typeof firstStock.coverDays === 'number');

    const resAr = await fetch(`http://localhost:${port}/api/ar`);
    assert.equal(resAr.status, 200);
    const dataAr = await resAr.json();
    assert.ok(dataAr.summary.totalInvoices > 0);
    assert.ok(dataAr.summary.buckets.length === 5);
    const firstInv = dataAr.invoices[0];
    assert.ok(firstInv.invoice_number);
    assert.ok(typeof firstInv.overdue_days === 'number', 'Raw overdue_days must be preserved');
    assert.ok(firstInv.saldo_piutang > 0);
  } finally {
    srv.close();
  }
});

test('Milestone M8: Outlet Reassignment & Audit Trail Logging', async (t) => {
  const port = 3995;
  const srv = app.listen(port);

  try {
    const db = getDb();
    const sampleOutlet = db.query('SELECT outlet_id, current_salesman_id, current_rayon_id FROM dim_outlet LIMIT 1')[0];
    assert.ok(sampleOutlet);

    // Reassign outlet
    const resReassign = await fetch(`http://localhost:${port}/api/settings/outlet-assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outletId: sampleOutlet.outlet_id,
        salesmanId: '107075',
        rayonId: 'R05',
        note: 'Rotasi rayon per Mei 2026 oleh Aghia'
      })
    });
    assert.equal(resReassign.status, 200);
    const dataReassign = await resReassign.json();
    assert.equal(dataReassign.success, true);
    assert.ok(dataReassign.assignmentId);

    // Verify DB updated
    const updatedOutlet = db.query('SELECT current_salesman_id, current_rayon_id FROM dim_outlet WHERE outlet_id = ?', [sampleOutlet.outlet_id])[0];
    assert.equal(updatedOutlet.current_salesman_id, '107075');
    assert.equal(updatedOutlet.current_rayon_id, 'R05');

    // Verify assignment history record
    const asgRow = db.query('SELECT * FROM outlet_assignment_history WHERE outlet_id = ? ORDER BY valid_from DESC LIMIT 1', [sampleOutlet.outlet_id])[0];
    assert.equal(asgRow.salesman_id, '107075');
    assert.equal(asgRow.changed_by, 'Aghia');

    // Verify audit log captured
    const resLogs = await fetch(`http://localhost:${port}/api/audit-logs`);
    const dataLogs = await resLogs.json();
    const foundLog = dataLogs.logs.find(l => l.action === 'REASSIGN_OUTLET' && l.entity_id === sampleOutlet.outlet_id);
    assert.ok(foundLog, 'Audit log must record REASSIGN_OUTLET');
    assert.equal(foundLog.user_name, 'Aghia');
  } finally {
    srv.close();
  }
});
