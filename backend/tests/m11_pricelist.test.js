const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server.js');
const { getDb } = require('../src/db/connection.js');
const { DISCOUNT_STRATA_RULES, classifyItem, getDiscountForQty } = require('../src/services/discountStrata.js');

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

test('M11-2: REST API GET /api/pricelist supports filtering, search, and strata metadata', async (t) => {
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
    assert.ok('strata_category_id' in firstItem, 'Must include strata_category_id');
    assert.ok('strata_category_name' in firstItem, 'Must include strata_category_name');

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

test('M11-4: Discount Strata Rules & Volume Tier Calculations', async (t) => {
  // 1. Rule Structure
  assert.ok(DISCOUNT_STRATA_RULES.KOPI_NON_RTD, 'Must have KOPI_NON_RTD rule');
  assert.ok(DISCOUNT_STRATA_RULES.BEVERAGE_RTD_MILKLIFE, 'Must have BEVERAGE_RTD_MILKLIFE rule');
  assert.ok(DISCOUNT_STRATA_RULES.PRIMA_TOP_BOGA, 'Must have PRIMA_TOP_BOGA rule');
  assert.ok(DISCOUNT_STRATA_RULES.CANDY_FOXS, 'Must have CANDY_FOXS rule');
  assert.ok(DISCOUNT_STRATA_RULES.UNILEVER, 'Must have UNILEVER rule');

  // 2. Kopi non-RTD (0-1: 0%, 2-7: 2%, 8-14: 3%, >=15: 4%)
  assert.equal(getDiscountForQty('KOPI_NON_RTD', 0).discPct, 0);
  assert.equal(getDiscountForQty('KOPI_NON_RTD', 1).discPct, 0);
  assert.equal(getDiscountForQty('KOPI_NON_RTD', 2).discPct, 2);
  assert.equal(getDiscountForQty('KOPI_NON_RTD', 7).discPct, 2);
  assert.equal(getDiscountForQty('KOPI_NON_RTD', 8).discPct, 3);
  assert.equal(getDiscountForQty('KOPI_NON_RTD', 14).discPct, 3);
  assert.equal(getDiscountForQty('KOPI_NON_RTD', 15).discPct, 4);
  assert.equal(getDiscountForQty('KOPI_NON_RTD', 30).discPct, 4);

  // 3. Beverage RTD & MilkLife (<1: 0%, 1-2: 1%, 3-9: 2%, >=10: 3%)
  assert.equal(getDiscountForQty('BEVERAGE_RTD_MILKLIFE', 0.5).discPct, 0);
  assert.equal(getDiscountForQty('BEVERAGE_RTD_MILKLIFE', 1).discPct, 1);
  assert.equal(getDiscountForQty('BEVERAGE_RTD_MILKLIFE', 2).discPct, 1);
  assert.equal(getDiscountForQty('BEVERAGE_RTD_MILKLIFE', 3).discPct, 2);
  assert.equal(getDiscountForQty('BEVERAGE_RTD_MILKLIFE', 9).discPct, 2);
  assert.equal(getDiscountForQty('BEVERAGE_RTD_MILKLIFE', 10).discPct, 3);
  assert.equal(getDiscountForQty('BEVERAGE_RTD_MILKLIFE', 25).discPct, 3);

  // 4. Prima Top Boga (<1: 0%, 1-4: 2%, >=5: 3%)
  assert.equal(getDiscountForQty('PRIMA_TOP_BOGA', 0).discPct, 0);
  assert.equal(getDiscountForQty('PRIMA_TOP_BOGA', 1).discPct, 2);
  assert.equal(getDiscountForQty('PRIMA_TOP_BOGA', 4).discPct, 2);
  assert.equal(getDiscountForQty('PRIMA_TOP_BOGA', 5).discPct, 3);
  assert.equal(getDiscountForQty('PRIMA_TOP_BOGA', 12).discPct, 3);

  // 5. Candy Fox's (<1: 0%, 1-4: 2%, >=5: 3%)
  assert.equal(getDiscountForQty('CANDY_FOXS', 0.5).discPct, 0);
  assert.equal(getDiscountForQty('CANDY_FOXS', 1).discPct, 2);
  assert.equal(getDiscountForQty('CANDY_FOXS', 4).discPct, 2);
  assert.equal(getDiscountForQty('CANDY_FOXS', 5).discPct, 3);

  // 6. Unilever (0-5: 0%, 6-19: 2%, 20-49: 3%, >=50: 5%)
  assert.equal(getDiscountForQty('UNILEVER', 3).discPct, 0);
  assert.equal(getDiscountForQty('UNILEVER', 5).discPct, 0);
  assert.equal(getDiscountForQty('UNILEVER', 6).discPct, 2);
  assert.equal(getDiscountForQty('UNILEVER', 19).discPct, 2);
  assert.equal(getDiscountForQty('UNILEVER', 20).discPct, 3);
  assert.equal(getDiscountForQty('UNILEVER', 49).discPct, 3);
  assert.equal(getDiscountForQty('UNILEVER', 50).discPct, 5);
  assert.equal(getDiscountForQty('UNILEVER', 100).discPct, 5);

  // 7. Test Upsell Hints
  const hintKopi = getDiscountForQty('KOPI_NON_RTD', 6);
  assert.equal(hintKopi.neededToNext, 2, 'Ordering 6 ktn needs 2 more cartons to reach 8 ktn (3%)');
  assert.ok(hintKopi.hint.includes('Tambah 2 ktn'));

  const hintUnilever = getDiscountForQty('UNILEVER', 15);
  assert.equal(hintUnilever.neededToNext, 5, 'Ordering 15 ktn needs 5 more cartons to reach 20 ktn (3%)');
});

test('M11-5: REST API GET /api/pricelist/strata endpoint', async (t) => {
  const port = 3993;
  const srv = app.listen(port);

  try {
    // 1. Fetch full strata rules matrix
    const res = await fetch(`http://localhost:${port}/api/pricelist/strata`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.rules.KOPI_NON_RTD);
    assert.ok(json.rules.BEVERAGE_RTD_MILKLIFE);
    assert.ok(json.rules.PRIMA_TOP_BOGA);
    assert.ok(json.rules.CANDY_FOXS);
    assert.ok(json.rules.UNILEVER);

    // 2. Query specific category & qty
    const resCalc = await fetch(`http://localhost:${port}/api/pricelist/strata?category=KOPI_NON_RTD&qty=10`);
    assert.equal(resCalc.status, 200);
    const jsonCalc = await resCalc.json();
    assert.equal(jsonCalc.success, true);
    assert.equal(jsonCalc.discPct, 3);
    assert.equal(jsonCalc.currentTier.label, '8 - 14 ktn');
    assert.equal(jsonCalc.neededToNext, 5);
  } finally {
    srv.close();
  }
});
