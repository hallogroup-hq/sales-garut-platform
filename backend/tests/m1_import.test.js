const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { getDb, initSchema } = require('../src/db/connection.js');
const { seedInitialData } = require('../src/db/seed_initial.js');
const {
  detectDatasetType,
  dryRunValidate,
  commitImport,
  rollbackImport,
  sanitizeNumber,
  sanitizeDate
} = require('../src/services/importEngine.js');

const PROJECT_ROOT = path.join(__dirname, '../../');

test('Milestone M1: Dataset Auto-Detection & Sanitizers', (t) => {
  // Test detection
  assert.equal(detectDatasetType(['Document Number', 'Item Code', 'Transaction Date']), 'TRANSACTIONS');
  assert.equal(detectDatasetType(['Kode Outlet', 'Nama Outlet', 'Rayon', 'pasar']), 'CUSTOMER_LIST');
  assert.equal(detectDatasetType(['Sales Name', 'Brand', 'JAN', 'FEB']), 'TARGETS');
  assert.equal(detectDatasetType(['Kode', 'Produk', 'Available Stock', 'Stok Fisik']), 'STOCK');
  assert.equal(detectDatasetType(['No Faktur', 'Kode Pelanggan', 'Saldo Piutang']), 'AR');

  // Test number sanitization
  assert.equal(sanitizeNumber('1.250.000,50'), 1250000.50);
  assert.equal(sanitizeNumber('Rp 26,560,688'), 26560688);
  assert.equal(sanitizeNumber('0.083333'), 0.083333);
  assert.equal(sanitizeNumber(null, 0), 0);

  // Test date sanitization
  assert.equal(sanitizeDate('2026-05-30'), '2026-05-30');
  assert.equal(sanitizeDate('30/05/2026'), '2026-05-30');
});

test('Milestone M1: Dry-Run Validation on Real Excel Files', (t) => {
  initSchema();
  seedInitialData();

  // 1. Validate TARGET KUANTITI SALES.xlsx
  const targetFile = path.join(PROJECT_ROOT, 'TARGET KUANTITI SALES.xlsx');
  const targetDryRun = dryRunValidate(targetFile);
  assert.equal(targetDryRun.datasetType, 'TARGETS');
  assert.ok(targetDryRun.totalRows > 0);
  assert.equal(targetDryRun.errorRows, 0, 'Valid targets file must have 0 fatal schema errors');

  // 2. Validate DATA STOK.xlsx
  const stockFile = path.join(PROJECT_ROOT, 'DATA STOK.xlsx');
  const stockDryRun = dryRunValidate(stockFile);
  assert.equal(stockDryRun.datasetType, 'STOCK');
  assert.ok(stockDryRun.totalRows > 0);

  // 3. Validate piutang aktif.xlsx
  const arFile = path.join(PROJECT_ROOT, 'piutang aktif.xlsx');
  const arDryRun = dryRunValidate(arFile);
  assert.equal(arDryRun.datasetType, 'AR');
  assert.ok(arDryRun.totalRows > 0);

  // 4. Validate DATA CL.xlsx
  const clFile = path.join(PROJECT_ROOT, 'DATA CL.xlsx');
  const clDryRun = dryRunValidate(clFile);
  assert.equal(clDryRun.datasetType, 'CUSTOMER_LIST');
  assert.ok(clDryRun.totalRows > 0);
});

test('Milestone M1: Commit Ingestion & Relational Persistence', (t) => {
  const db = getDb();

  // Commit Customer List
  const clFile = path.join(PROJECT_ROOT, 'DATA CL.xlsx');
  const clRes = commitImport(clFile, 'CUSTOMER_LIST');
  assert.ok(clRes.success);
  const outletCount = db.query('SELECT COUNT(*) AS cnt FROM dim_outlet')[0].cnt;
  assert.ok(outletCount > 0, 'dim_outlet must be populated');

  // Commit Targets
  const targetFile = path.join(PROJECT_ROOT, 'TARGET KUANTITI SALES.xlsx');
  const tgtRes = commitImport(targetFile, 'TARGETS');
  assert.ok(tgtRes.success);
  const tgtCount = db.query('SELECT COUNT(*) AS cnt FROM fact_quantity_target')[0].cnt;
  assert.ok(tgtCount > 0, 'fact_quantity_target must be populated');

  // Commit Stock
  const stockFile = path.join(PROJECT_ROOT, 'DATA STOK.xlsx');
  const stkRes = commitImport(stockFile, 'STOCK');
  assert.ok(stkRes.success);
  const stkCount = db.query('SELECT COUNT(*) AS cnt FROM fact_inventory_snapshot')[0].cnt;
  assert.ok(stkCount > 0, 'fact_inventory_snapshot must be populated');

  // Commit AR
  const arFile = path.join(PROJECT_ROOT, 'piutang aktif.xlsx');
  const arRes = commitImport(arFile, 'AR');
  assert.ok(arRes.success);
  const arCount = db.query('SELECT COUNT(*) AS cnt FROM fact_ar_invoice')[0].cnt;
  assert.ok(arCount > 0, 'fact_ar_invoice must be populated');
  
  // Verify raw overdue_days is preserved
  const sampleAr = db.query('SELECT * FROM fact_ar_invoice LIMIT 1')[0];
  assert.ok(typeof sampleAr.overdue_days === 'number', 'Raw overdue_days must be preserved as integer');
});

test('Milestone M1: Idempotency & Rollback Safety', (t) => {
  const db = getDb();
  const targetFile = path.join(PROJECT_ROOT, 'TARGET KUANTITI SALES.xlsx');
  
  const countBefore = db.query('SELECT COUNT(*) AS cnt FROM fact_quantity_target')[0].cnt;
  
  // Re-import the exact same target file
  const reImportRes = commitImport(targetFile, 'TARGETS');
  assert.ok(reImportRes.success);

  const countAfter = db.query('SELECT COUNT(*) AS cnt FROM fact_quantity_target')[0].cnt;
  assert.equal(countAfter, countBefore, 'Re-importing identical target file must be idempotent (no duplicate rows)');

  // Test rollback on the latest batch
  const rollbackRes = rollbackImport(reImportRes.batchId);
  assert.equal(rollbackRes.status, 'ROLLED_BACK');

  const batchStatus = db.query('SELECT status FROM import_batch WHERE batch_id = ?', [reImportRes.batchId])[0].status;
  assert.equal(batchStatus, 'ROLLED_BACK');
});
