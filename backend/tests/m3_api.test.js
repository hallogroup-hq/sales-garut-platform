const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server.js');

test('Milestone M3: API Health & Current User (Aghia)', async (t) => {
  // Test route handler logic directly or via fetch
  // Start server on a test port
  const port = 3999;
  const srv = app.listen(port);

  try {
    const resHealth = await fetch(`http://localhost:${port}/health`);
    const dataHealth = await resHealth.json();
    assert.equal(dataHealth.status, 'OK');
    assert.equal(dataHealth.user, 'Aghia');

    const resUser = await fetch(`http://localhost:${port}/api/auth/current-user`);
    const dataUser = await resUser.json();
    assert.equal(dataUser.user.fullName, 'Aghia');
    assert.equal(dataUser.user.role, 'DSM');
    assert.equal(dataUser.user.roleLabel, 'Sales Manager / Admin DSM');

    const resFilters = await fetch(`http://localhost:${port}/api/filters/options`);
    const dataFilters = await resFilters.json();
    assert.ok(dataFilters.periods.length > 0);
    assert.ok(dataFilters.spvs.length >= 2);
    assert.ok(dataFilters.salesmen.length >= 7);

    const resDash = await fetch(`http://localhost:${port}/api/dashboard/executive?year=2026&month=5`);
    const dataDash = await resDash.json();
    assert.ok(dataDash.summary);
    assert.ok(dataDash.topSalesmen);
    assert.ok(dataDash.mustHave);
    assert.ok(dataDash.insights);

    const resSales = await fetch(`http://localhost:${port}/api/sales/performance?year=2026&month=5`);
    const dataSales = await resSales.json();
    assert.ok(dataSales.products);

    const resInc = await fetch(`http://localhost:${port}/api/salesmen/107075/incentive?year=2026&month=5`);
    const dataInc = await resInc.json();
    assert.equal(dataInc.salesmanName, 'Muhamad Fikri Hambali');
    assert.equal(dataInc.components.length, 6);
    assert.equal(dataInc.components[5].status, 'TBD');

    const resSettings = await fetch(`http://localhost:${port}/api/settings`);
    const dataSettings = await resSettings.json();
    assert.ok(dataSettings.settings.length > 0);
    assert.ok(dataSettings.mustHave.length > 0);
  } finally {
    srv.close();
  }
});
