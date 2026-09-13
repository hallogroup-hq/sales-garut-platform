const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb, initSchema } = require('../src/db/connection.js');
const { seedInitialData } = require('../src/db/seed_initial.js');
const { logAudit, getAuditLogs } = require('../src/middleware/audit.js');
const { authenticateUser, enforceScope } = require('../src/middleware/auth.js');

test('Milestone M0: Schema & Database Initialization', (t) => {
  initSchema();
  seedInitialData();
  const db = getDb();

  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);
  
  const expectedTables = [
    'org_district', 'org_sub_dso', 'org_spv', 'org_salesman',
    'dim_rayon', 'dim_kecamatan', 'dim_pasar', 'dim_outlet',
    'outlet_alias', 'outlet_assignment_history', 'dim_product',
    'fact_sales_header', 'fact_sales_line', 'fact_quantity_target',
    'fact_incentive_value_target', 'fact_inventory_snapshot', 'fact_ar_invoice',
    'must_have_program_config', 'npl_campaign', 'npl_campaign_sku',
    'incentive_rule', 'business_calendar', 'business_settings',
    'import_batch', 'audit_log', 'app_user'
  ];

  for (const table of expectedTables) {
    assert.ok(tables.includes(table), `Table ${table} must exist in schema`);
  }
});

test('Milestone M0: Canonical Outlet Identity & Alias Mapping', (t) => {
  const db = getDb();
  
  const canonicalId = 'OUT_TEST_001';
  db.run(
    `INSERT OR REPLACE INTO dim_outlet (
      outlet_id, canonical_name, address_text, cluster_tier, is_mbg
    ) VALUES (?, ?, ?, ?, ?)`,
    [canonicalId, 'Toko Rejeki Jaya', 'Jl. Raya Garut No. 12', 'Retail 2', 0]
  );

  // Map 3 different source codes from ERP, SFA, DSO
  db.run(`INSERT OR REPLACE INTO outlet_alias (alias_id, outlet_id, source_system, source_customer_code) VALUES (?, ?, ?, ?)`,
    ['AL_1', canonicalId, 'ERP', '305000099']
  );
  db.run(`INSERT OR REPLACE INTO outlet_alias (alias_id, outlet_id, source_system, source_customer_code) VALUES (?, ?, ?, ?)`,
    ['AL_2', canonicalId, 'SFA', 'G305ZWF260502999999999']
  );
  db.run(`INSERT OR REPLACE INTO outlet_alias (alias_id, outlet_id, source_system, source_customer_code) VALUES (?, ?, ?, ?)`,
    ['AL_3', canonicalId, 'DSO', '30522700999']
  );

  // Query by any alias resolves to canonical outlet
  const resolved = db.query(
    `SELECT o.outlet_id, o.canonical_name, o.is_mbg, o.cluster_tier
     FROM dim_outlet o
     JOIN outlet_alias a ON o.outlet_id = a.outlet_id
     WHERE a.source_customer_code = ?`,
    ['G305ZWF260502999999999']
  )[0];

  assert.equal(resolved.outlet_id, canonicalId);
  assert.equal(resolved.canonical_name, 'Toko Rejeki Jaya');
  assert.equal(resolved.is_mbg, 0, 'MBG must remain a distinct flag');
  assert.equal(resolved.cluster_tier, 'Retail 2');
});

test('Milestone M0: Ownership Attribution & Reassignment Integrity', (t) => {
  const db = getDb();
  const outletId = 'OUT_TEST_002';
  
  db.run(
    `INSERT OR REPLACE INTO dim_outlet (
      outlet_id, canonical_name, current_salesman_id
    ) VALUES (?, ?, ?)`,
    [outletId, 'Toko Feri Barokah', '107075'] // Initially Fikri
  );

  // Record initial assignment
  db.run(
    `INSERT OR REPLACE INTO outlet_assignment_history (
      assignment_id, outlet_id, salesman_id, valid_from, valid_to, changed_by
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    ['ASG_1', outletId, '107075', '2025-01-01', '2026-05-01', 'Admin']
  );

  // Simulate an invoice created in April 2026 by Fikri
  db.run(
    `INSERT OR REPLACE INTO fact_sales_header (
      document_number, transaction_date, outlet_id, invoice_salesman_id, current_owner_salesman_id, unit_type
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    ['INV_001', '2026-04-15', outletId, '107075', '107075', 'Sales']
  );

  // Reassign outlet in May 2026 to Zulfa (305033)
  db.run(
    `UPDATE dim_outlet SET current_salesman_id = ?, updated_at = CURRENT_TIMESTAMP WHERE outlet_id = ?`,
    ['305033', outletId]
  );
  db.run(
    `INSERT OR REPLACE INTO outlet_assignment_history (
      assignment_id, outlet_id, salesman_id, valid_from, valid_to, changed_by
    ) VALUES (?, ?, ?, ?, NULL, ?)`,
    ['ASG_2', outletId, '305033', '2026-05-01', 'Admin']
  );

  // Update header current_owner_salesman_id without changing invoice_salesman_id
  db.run(
    `UPDATE fact_sales_header SET current_owner_salesman_id = ? WHERE outlet_id = ?`,
    ['305033', outletId]
  );

  const tx = db.query("SELECT * FROM fact_sales_header WHERE document_number = 'INV_001'")[0];
  assert.equal(tx.invoice_salesman_id, '107075', 'Original invoice salesman must remain unchanged');
  assert.equal(tx.current_owner_salesman_id, '305033', 'Management current owner view correctly reflects reassignment');
});

test('Milestone M0: Audit Trail Infrastructure', (t) => {
  const auditId = logAudit({
    userId: 'USR_ADMIN',
    userName: 'Admin DSM',
    userRole: 'DSM',
    action: 'UPDATE_CALENDAR',
    entityType: 'calendar',
    entityId: '2026-05',
    beforeState: { total_hk: 25, as_of_hke: 8 },
    afterState: { total_hk: 26, as_of_hke: 9 }
  });

  const logs = getAuditLogs({ entityType: 'calendar', entityId: '2026-05' });
  assert.ok(logs.length > 0);
  assert.equal(logs[0].audit_id, auditId);
  assert.equal(logs[0].action, 'UPDATE_CALENDAR');
  const after = JSON.parse(logs[0].after_state_json);
  assert.equal(after.total_hk, 26);
});

test('Milestone M0: Role-Based Access Scoping', (t) => {
  const dsm = authenticateUser('admin', 'admin123');
  assert.ok(dsm);
  assert.equal(dsm.role, 'DSM');
  assert.equal(dsm.permissions.canUploadSales, true);

  const scopedDsm = enforceScope(dsm, { spvId: 'SPV_NOPAN' });
  assert.equal(scopedDsm.spvId, 'SPV_NOPAN', 'DSM can freely filter any SPV');

  const spv = authenticateUser('spv_nopan', 'spv123');
  assert.ok(spv);
  assert.equal(spv.role, 'SPV');
  const scopedSpv = enforceScope(spv, { spvId: 'SPV_TRI_H' });
  assert.equal(scopedSpv.spvId, 'SPV_NOPAN', 'SPV cannot bypass scope to inspect other teams');

  const sales = authenticateUser('sales_fikri', 'sales123');
  assert.ok(sales);
  assert.equal(sales.role, 'SALESMAN');
  const scopedSales = enforceScope(sales, { salesmanId: '305033' });
  assert.equal(scopedSales.salesmanId, '107075', 'Salesman cannot view another salesman data');
});
