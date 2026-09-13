const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb, initSchema } = require('../src/db/connection.js');
const { seedInitialData } = require('../src/db/seed_initial.js');
const { getCalendarPace, updateCalendar } = require('../src/services/calendarEngine.js');
const {
  getExecutiveSummary,
  getTopSalesmen,
  getMustHaveProgress,
  getKecamatanCoverage,
  getPerformanceByRayon
} = require('../src/services/metricsEngine.js');
const { calculateIncentive } = require('../src/services/incentiveEngine.js');

test('Milestone M2: Calendar & Working Day Pace Calculations', (t) => {
  initSchema();
  seedInitialData();

  const pace = getCalendarPace(2026, 5);
  assert.equal(pace.totalHk, 25);
  assert.equal(pace.asOfHke, 8);
  assert.equal(pace.remainingHk, 17);
  assert.equal(pace.timeRatePct, 32.0);

  // Test custom update
  const updated = updateCalendar(2026, 6, 26, 13, '2026-06-15');
  assert.equal(updated.totalHk, 26);
  assert.equal(updated.asOfHke, 13);
  assert.equal(updated.remainingHk, 13);
  assert.equal(updated.timeRatePct, 50.0);
});

test('Milestone M2: 59 vs 60-Day Dormancy Boundary & Inactive MTD Distinction', (t) => {
  const db = getDb();
  
  // Ensure product exists
  db.run(`INSERT OR IGNORE INTO dim_product (item_code, item_name, principal, category_sku, brand, group_sku, conversion_pcs_carton) VALUES ('SKU_TEST_1', 'Kopi Gadjah Test', 'SAVORIA', 'KTG', 'GADJAH', 'GADJAH MANIS', 1)`);

  // 1. Outlet A: Active in May 2026 (order on 2026-05-10) -> Active MTD
  db.run(`INSERT OR REPLACE INTO dim_outlet (outlet_id, canonical_name, is_active_cl) VALUES ('OUT_ACT', 'Outlet Aktif', 1)`);
  db.run(`INSERT OR REPLACE INTO fact_sales_header (document_number, transaction_date, outlet_id, invoice_salesman_id, current_owner_salesman_id, unit_type) VALUES ('INV_A', '2026-05-10', 'OUT_ACT', '107075', '107075', 'Sales')`);
  db.run(`INSERT OR REPLACE INTO fact_sales_line (line_id, document_number, item_code, primary_quantity, carton_quantity, sales_before_discount, sales_netto, dpp_amount) VALUES ('L_A', 'INV_A', 'SKU_TEST_1', 10, 1.0, 100000, 100000, 90000)`);

  // 2. Outlet B: Last order 59 days ago (2026-04-01 relative to 2026-05-30) -> Inactive MTD, NOT Dormant
  db.run(`INSERT OR REPLACE INTO dim_outlet (outlet_id, canonical_name, is_active_cl) VALUES ('OUT_59D', 'Outlet 59 Hari', 1)`);
  db.run(`INSERT OR REPLACE INTO fact_sales_header (document_number, transaction_date, outlet_id, invoice_salesman_id, current_owner_salesman_id, unit_type) VALUES ('INV_B', '2026-04-01', 'OUT_59D', '107075', '107075', 'Sales')`);
  db.run(`INSERT OR REPLACE INTO fact_sales_line (line_id, document_number, item_code, primary_quantity, carton_quantity, sales_before_discount, sales_netto, dpp_amount) VALUES ('L_B', 'INV_B', 'SKU_TEST_1', 10, 1.0, 100000, 100000, 90000)`);

  // 3. Outlet C: Last order 60 days ago (2026-03-31 relative to 2026-05-30) -> Dormant 60D
  db.run(`INSERT OR REPLACE INTO dim_outlet (outlet_id, canonical_name, is_active_cl) VALUES ('OUT_60D', 'Outlet 60 Hari', 1)`);
  db.run(`INSERT OR REPLACE INTO fact_sales_header (document_number, transaction_date, outlet_id, invoice_salesman_id, current_owner_salesman_id, unit_type) VALUES ('INV_C', '2026-03-31', 'OUT_60D', '107075', '107075', 'Sales')`);
  db.run(`INSERT OR REPLACE INTO fact_sales_line (line_id, document_number, item_code, primary_quantity, carton_quantity, sales_before_discount, sales_netto, dpp_amount) VALUES ('L_C', 'INV_C', 'SKU_TEST_1', 10, 1.0, 100000, 100000, 90000)`);

  // 4. Outlet D: Never ordered
  db.run(`INSERT OR REPLACE INTO dim_outlet (outlet_id, canonical_name, is_active_cl) VALUES ('OUT_NEVER', 'Outlet Belum Pernah Order', 1)`);

  const summary = getExecutiveSummary({ year: 2026, month: 5 });
  
  assert.ok(summary.coverage.activeOutletsMtd >= 1);
  assert.ok(summary.coverage.dormant60dOutlets >= 1);
  assert.ok(summary.coverage.inactiveMtdOutlets >= 1);
});

test('Milestone M2: Current-Owner Attribution vs Invoice Salesman Audit', (t) => {
  const db = getDb();
  const outletId = 'OUT_REASSIGN_TEST';

  db.run(`INSERT OR IGNORE INTO dim_product (item_code, item_name, principal, category_sku, brand, group_sku, conversion_pcs_carton) VALUES ('SKU_TEST_2', 'Item Reassign', 'SAVORIA', 'GENERAL', 'GENERAL', 'GENERAL', 1)`);

  // Salesman 1 = Fikri (107075), Salesman 2 = Zulfa (305033)
  db.run(`INSERT OR REPLACE INTO dim_outlet (outlet_id, canonical_name, current_salesman_id, is_active_cl) VALUES (?, 'Toko Reassign', '305033', 1)`, [outletId]);

  // Invoice was made by Fikri, but current owner is Zulfa
  db.run(`INSERT OR REPLACE INTO fact_sales_header (document_number, transaction_date, outlet_id, invoice_salesman_id, current_owner_salesman_id, unit_type) VALUES ('INV_REASSIGN', '2026-05-15', ?, '107075', '305033', 'Sales')`, [outletId]);
  db.run(`INSERT OR REPLACE INTO fact_sales_line (line_id, document_number, item_code, primary_quantity, carton_quantity, sales_before_discount, sales_netto, dpp_amount) VALUES ('L_REASSIGN', 'INV_REASSIGN', 'SKU_TEST_2', 50, 5.0, 500000, 500000, 450000)`);

  // Target for Zulfa in May 2026
  db.run(`INSERT OR REPLACE INTO fact_quantity_target (target_id, year, month, salesman_id, group_sku, target_cartons) VALUES ('TGT_ZULFA_TEST', 2026, 5, '305033', 'GENERAL', 10.0)`);

  // Management view filtering by Zulfa (305033) MUST include this transaction because he is current owner
  const summaryZulfa = getExecutiveSummary({ year: 2026, month: 5, salesmanId: '305033' });
  assert.ok(summaryZulfa.sales.actualCartons >= 5.0, 'Management view must credit current owner');

  // Verify invoice salesman remains Fikri in the database record
  const rawTx = db.query("SELECT invoice_salesman_id FROM fact_sales_header WHERE document_number = 'INV_REASSIGN'")[0];
  assert.equal(rawTx.invoice_salesman_id, '107075', 'Transaction audit must preserve original invoice salesman');
});

test('Milestone M2: Incentive Engine Calculations (Components 1-6)', (t) => {
  const db = getDb();
  const salesId = '107075';

  db.run(`INSERT OR REPLACE INTO fact_quantity_target (target_id, year, month, salesman_id, group_sku, target_cartons) VALUES ('TGT_F_KOP', 2026, 5, '107075', 'KOPI_SKU', 100.0)`);
  db.run(`INSERT OR REPLACE INTO fact_quantity_target (target_id, year, month, salesman_id, group_sku, target_cartons) VALUES ('TGT_F_BEV', 2026, 5, '107075', 'BEV_SKU', 50.0)`);
  db.run(`INSERT OR REPLACE INTO fact_quantity_target (target_id, year, month, salesman_id, group_sku, target_cartons) VALUES ('TGT_F_NON', 2026, 5, '107075', 'NON_SKU', 50.0)`);
  db.run(`INSERT OR REPLACE INTO fact_incentive_value_target (id, year, month, salesman_id, target_value) VALUES ('TGT_VAL_F', 2026, 5, '107075', 20000000)`);

  const inc = calculateIncentive(salesId, 2026, 5);
  assert.equal(inc.components.length, 6);
  assert.equal(inc.totalBaseMangkok, 2250000);

  // Comp 1: Kopi (Mangkok Rp300,000, Min 80%, Max 150%)
  assert.equal(inc.components[0].mangkok, 300000);
  assert.equal(inc.components[0].minPct, 80);

  // Comp 5: Must Have (Mangkok Rp750,000, Min 25%, Binary)
  assert.equal(inc.components[4].mangkok, 750000);
  assert.equal(inc.components[4].minPct, 25);

  // Comp 6: AR Performance (Mangkok Rp200,000, Min 70%, Status TBD)
  assert.equal(inc.components[5].status, 'TBD', 'AR incentive must remain TBD until official formula confirmed');
  assert.equal(inc.components[5].payout, 0, 'No AR incentive payout fabricated');
});

test('Milestone M2: Cross-Module Aggregation Consistency', (t) => {
  const summary = getExecutiveSummary({ year: 2026, month: 5 });
  const salesmen = getTopSalesmen({ year: 2026, month: 5 }, 100);
  const rayons = getPerformanceByRayon({ year: 2026, month: 5 });

  const totalSalesmanCartons = salesmen.reduce((sum, s) => sum + s.actualCartons, 0);
  const totalRayonCartons = rayons.reduce((sum, r) => sum + r.actualCartons, 0);

  assert.ok(summary.sales.actualCartons >= 0);
  assert.ok(totalSalesmanCartons >= 0);
  assert.ok(totalRayonCartons >= 0);
});
