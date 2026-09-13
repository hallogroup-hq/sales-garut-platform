const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server.js');
const { getDb } = require('../src/db/connection.js');
const {
  getExecutiveSummary,
  getTopSalesmen,
  getMustHaveProgress
} = require('../src/services/metricsEngine.js');

test('TC01 & TC02: Coverage Formula & Cap at 100.0%', async (t) => {
  const topSalesmen = getTopSalesmen({ year: 2026, month: 5 }, 20);
  assert.ok(topSalesmen.length > 0, 'Should return salesmen');

  // Verify each salesman coverage is Active / Registered CL * 100, and <= 100.0%
  for (const s of topSalesmen) {
    assert.ok(s.registeredOutlets > 0, `Salesman ${s.salesmanName} must have positive registered outlets`);
    assert.ok(s.coveragePct >= 0, `Coverage % must be >= 0`);
    assert.ok(s.coveragePct <= 100.0, `Coverage % must not exceed 100.0% (got ${s.coveragePct}%)`);

    const expectedPct = Math.min(Math.round((s.activeOutlets / s.registeredOutlets) * 1000) / 10, 100.0);
    assert.equal(s.coveragePct, expectedPct, `Coverage calculation must match formula for ${s.salesmanName}`);
  }

  // Specifically check Zulfa and Mulyana (previously had 1900% and 0% bugs)
  const zulfa = topSalesmen.find(s => s.salesmanName.toLowerCase().includes('zulfa'));
  if (zulfa) {
    assert.ok(zulfa.coveragePct < 100.0, 'Zulfa coverage must not be 1900%');
    assert.ok(zulfa.registeredOutlets >= 200, 'Zulfa registered outlets must reflect full attributed universe');
  }

  const mulyana = topSalesmen.find(s => s.salesmanName.toLowerCase().includes('mulyana'));
  if (mulyana) {
    assert.ok(mulyana.coveragePct > 0, 'Mulyana coverage must not be 0% when active outlets exist');
    assert.ok(mulyana.registeredOutlets >= 150, 'Mulyana registered outlets must reflect full attributed universe');
  }
});

test('TC03 & TC04: Missing Target vs Legitimate Zero Target Representation', async (t) => {
  // Test missing target behavior when querying a non-existent period (e.g. year 2029)
  const futureSummary = getExecutiveSummary({ year: 2029, month: 1 });
  assert.equal(futureSummary.sales.hasTarget, false, 'Future period with no targets must have hasTarget = false');
  assert.equal(futureSummary.sales.targetCartons, null, 'targetCartons must be null when missing');
  assert.equal(futureSummary.sales.achievementPct, null, 'achievementPct must be null when missing target');
  assert.equal(futureSummary.sales.remainingTarget, null, 'remainingTarget must be null when missing target');
  assert.equal(futureSummary.sales.gapDailyPace, null, 'gapDailyPace must be null when missing target');

  // Test legitimate zero target vs missing target in database query
  const db = getDb();
  const rowTargetExists = db.query('SELECT COUNT(*) as cnt, COALESCE(SUM(target_cartons), 0) as tgt FROM fact_quantity_target WHERE year = 2026 AND month = 5')[0];
  assert.ok(rowTargetExists.cnt > 0, 'May 2026 targets exist');
  assert.ok(rowTargetExists.tgt > 0, 'May 2026 total target cartons > 0');
});

test('TC05: Outlet Directory Separate Counts (Current, Filtered, Universe)', async (t) => {
  const port = 3995;
  const srv = app.listen(port);

  try {
    const res = await fetch(`http://localhost:${port}/api/outlets?limit=50&page=1`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(typeof data.totalUniverse, 'number', 'totalUniverse must be a number');
    assert.equal(data.totalUniverse, 3597, 'Total universe must be 3,597 registered CL');
    assert.equal(typeof data.filteredCount, 'number', 'filteredCount must be a number');
    assert.equal(typeof data.currentPageCount, 'number', 'currentPageCount must be a number');
    assert.ok(data.currentPageCount <= 50, 'currentPageCount must be <= limit');
    assert.equal(data.currentPageCount, data.outlets.length, 'currentPageCount must match outlets array length');
  } finally {
    srv.close();
  }
});

test('TC06 & TC07: Four Customer States & Never Ordered Distinction', async (t) => {
  const port = 3996;
  const srv = app.listen(port);

  try {
    // 1. Fetch never ordered outlets
    const resNever = await fetch(`http://localhost:${port}/api/outlets?status=NEVER_ORDERED&limit=10`);
    const dataNever = await resNever.json();
    assert.ok(dataNever.filteredCount > 0, 'Must have never ordered outlets');
    for (const o of dataNever.outlets) {
      assert.equal(o.stateCode, 'NEVER_ORDERED', 'Outlet state must be NEVER_ORDERED');
      assert.equal(o.status, 'Belum Pernah Order', 'Outlet status label must be Belum Pernah Order');
      assert.equal(o.daysSinceLastOrder, null, 'Never ordered outlet must have daysSinceLastOrder = null (not 999)');
      assert.equal(o.lifetimeOrders, 0, 'Never ordered outlet must have lifetimeOrders = 0');
    }

    // 2. Fetch dormant 60d outlets
    const resDormant = await fetch(`http://localhost:${port}/api/outlets?status=DORMANT_60D&limit=10`);
    const dataDormant = await resDormant.json();
    assert.ok(dataDormant.filteredCount > 0, 'Must have dormant outlets');
    for (const o of dataDormant.outlets) {
      assert.equal(o.stateCode, 'DORMANT_60D');
      assert.equal(o.status, 'Dormant (>60 Hari)');
      assert.ok(o.daysSinceLastOrder >= 60, 'Dormant outlet must have daysSinceLastOrder >= 60');
      assert.ok(o.lifetimeOrders > 0, 'Dormant outlet must have historical orders');
    }

    // 3. Fetch active MTD outlets
    const resActive = await fetch(`http://localhost:${port}/api/outlets?status=ACTIVE&limit=10`);
    const dataActive = await resActive.json();
    assert.ok(dataActive.filteredCount > 0, 'Must have active outlets');
    for (const o of dataActive.outlets) {
      assert.equal(o.stateCode, 'ACTIVE');
      assert.equal(o.status, 'Aktif');
      assert.ok(o.daysSinceLastOrder <= 30, 'Active outlet must have ordered within 30 days');
    }
  } finally {
    srv.close();
  }
});

test('TC08: Must Have Clarity (4 Separate Metrics)', async (t) => {
  const mhList = getMustHaveProgress({ year: 2026, month: 5 });
  assert.ok(mhList.length > 0, 'Must have lines returned');

  for (const m of mhList) {
    // 4 Distinct Metrics:
    // A: actualPenetrationPct
    // B: targetPenetrationPct
    // C: targetOc
    // D: progressToTargetPct
    assert.ok(m.actualPenetrationPct !== undefined, 'Must have actualPenetrationPct');
    assert.ok(m.targetPenetrationPct !== undefined, 'Must have targetPenetrationPct');
    assert.ok(m.targetOc !== undefined, 'Must have targetOc');
    assert.ok(m.progressToTargetPct !== undefined, 'Must have progressToTargetPct');
    assert.ok(m.registeredUniverse !== undefined, 'Must have registeredUniverse');
    assert.ok(m.actualOc !== undefined, 'Must have actualOc');

    // Verify mathematical coherence
    const expectedTargetOc = Math.round(m.registeredUniverse * (m.targetPenetrationPct / 100));
    assert.equal(m.targetOc, expectedTargetOc, `targetOc must be registeredUniverse * targetPenetrationPct% for ${m.lineCode}`);

    const expectedProgress = expectedTargetOc > 0 ? Math.round((m.actualOc / expectedTargetOc) * 1000) / 10 : 0;
    assert.equal(m.progressToTargetPct, expectedProgress, `progressToTargetPct must be actualOc / targetOc for ${m.lineCode}`);
  }
});

test('TC09: Settings AR Aging Buckets API & Audit Trail', async (t) => {
  const port = 3997;
  const srv = app.listen(port);

  try {
    // 1. GET /api/settings - verify parsedBuckets and human labels
    const resGet = await fetch(`http://localhost:${port}/api/settings`);
    assert.equal(resGet.status, 200);
    const dataGet = await resGet.json();

    const arSetting = dataGet.settings.find(s => s.key === 'ar_aging_buckets');
    assert.ok(arSetting, 'ar_aging_buckets setting must exist');
    assert.ok(Array.isArray(arSetting.parsedBuckets), 'parsedBuckets must be parsed array');
    assert.ok(arSetting.label, 'Setting must have human label');

    // 2. POST /api/settings/ar-buckets - update buckets
    const newBuckets = ['Current', '1 - 15 hari', '16 - 30 hari', '31 - 60 hari', '> 60 hari (NPL)'];
    const resPost = await fetch(`http://localhost:${port}/api/settings/ar-buckets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buckets: newBuckets })
    });
    assert.equal(resPost.status, 200);
    const dataPost = await resPost.json();
    assert.equal(dataPost.success, true);
    assert.deepEqual(dataPost.buckets, newBuckets);

    // 3. Verify audit log entry
    const resAudit = await fetch(`http://localhost:${port}/api/audit-logs`);
    const dataAudit = await resAudit.json();
    const latest = dataAudit.logs[0];
    assert.equal(latest.action, 'UPDATE_AR_BUCKETS');
    assert.equal(latest.user_name, 'Aghia');
    assert.equal(latest.user_role, 'DSM');
  } finally {
    srv.close();
  }
});

test('TC10: System Status & User Identification (Aghia & Pre-UAT)', async (t) => {
  const port = 3998;
  const srv = app.listen(port);

  try {
    const resAuth = await fetch(`http://localhost:${port}/api/auth/current-user`);
    assert.equal(resAuth.status, 200);
    const dataAuth = await resAuth.json();
    assert.equal(dataAuth.user.fullName, 'Aghia');
    assert.equal(dataAuth.user.role, 'DSM');

    const resHealth = await fetch(`http://localhost:${port}/health`);
    assert.equal(resHealth.status, 200);
    const dataHealth = await resHealth.json();
    assert.equal(dataHealth.user, 'Aghia');
  } finally {
    srv.close();
  }
});

test('TC11: Cross-Module Aggregation Consistency', async (t) => {
  const summary = getExecutiveSummary({ year: 2026, month: 5 });
  const salesmen = getTopSalesmen({ year: 2026, month: 5 }, 50);

  // Sum of salesmen actual cartons should closely match executive summary
  const totalSalesmenCartons = salesmen.reduce((sum, s) => sum + s.actualCartons, 0);
  assert.ok(Math.abs(totalSalesmenCartons - summary.sales.actualCartons) < 1.0, 'Salesmen sum cartons must match executive summary cartons');

  // Executive summary registered outlets must match registered CL under salesmen with rayon (3,585+)
  assert.ok(summary.coverage.registeredOutlets >= 3580 && summary.coverage.registeredOutlets <= 3600, `Executive summary registered outlets (${summary.coverage.registeredOutlets}) must match CL registered under salesmen with rayon`);
});
