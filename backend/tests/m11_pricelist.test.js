const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server.js');
const { getDb} = require('../src/db/connection.js');

test('M11-1: Database dim_pricelist table contains master data', async (t) => {
  const db = getDb();
  const rows = db.query('SELECT COUNT(*) as count FROM dim_pricelist');
  assert.ok(rows[0].count >= 320, `Should have at least 320 SKUs, found ${rows[0].count}`);

  const principals = db.query('SELECT DISTINCT principal FROM dim_pricelist ORDER BY principal');
  assert.equal(principals.length, 5, 'Should have exactly 5 principals');

  const sample = db.query("SELECT * FROM dim_pricelist WHERE item_name LIKE '%CAFFINO%' LIMIT 1");
  assert.ok(sample.length > 0, 'Sample SKU Caffino Classic must exist');
  assert.ok(sample[0].price_carton_inc_ppn > 0, 'Price inc PPN must be > 0');
  assert.ok(sample[0].het_pcs_inc_ppn > 0, 'HET pcs inc PPN must be > 0');
});

test('M11-2: REST API GET /api/pricelist supports filtering and search', async (t) => {
  const port = 3995;
  const srv = app.listen(port);

  try {
    const res = await fetch(`http://localhost:${port}/api/pricelist`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.total >= 320);
    assert.equal(json.principals.length, 5);
    assert.ok(json.items.length >= 320);

    const firstItem = json.items[0];
    assert.ok('retail_margin_pct' in firstItem, 'Must calculate retail_margin_pct');

    const resFiltered = await fetch(`http://localhost:${port}/api/pricelist?principal=${encodeURIComponent('SUMBER KOPI PRIMA')}`);
    assert.equal(resFiltered.status, 200);
    const jsonFiltered = await resFiltered.json();
    assert.ok(jsonFiltered.items.length >= 70);
    for (const item of jsonFiltered.items) {
      assert.equal(item.principal, 'SUMBER KOPI PRIMA');
    }

    const resSearch = await fetch(`http://localhost:${port}/api/pricelist?search=CAFFINO`);
    assert.equal(resSearch.status, 200);
    const jsonSearch = await resSearch.json();
    assert.ok(jsonSearch.items.length > 0);
    for (const item of jsonSearch.items) {
      const match = item.item_name.toUpperCase().includes('CAFFINO') || 
                    (item.brand && item.brand.toUpperCase().includes('CAFFINO')) || 
                    item.item_code.includes('CAFFINO');
      assert.ok(match, `Item ${item.item_name} must match CAFFINO in name, brand, or code`);
    }
  } finally {
    srv.close();
  }
});

test('M11-3: REST API GET /api/pricelist/export generates CSV', async (t) => {
  const port = 3994;
  const srv = app.listen(port);

  try {
    const res = await fetch(`http://localhost:${port}/api/pricelist/export?principal=${encodeURIComponent('SUMBER KOPI PRIMA')}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    const csv = await res.text();
    assert.ok(csv.includes('Item Code'));
    assert.ok(csv.includes('Item Description'));
    assert.ok(csv.includes('PL Karton Inc PPN'));
    assert.ok(csv.includes('SUMBER KOPI PRIMA'));
  } finally {
    srv.close();
  }
});
