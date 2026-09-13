const path = require('node:path');
const fs = require('node:fs');
const { getDb, initSchema } = require('../db/connection.js');
const { seedInitialData } = require('../db/seed_initial.js');
const { commitImport } = require('../services/importEngine.js');

async function seedAllSpreadsheets() {
  console.log('--- INITIALIZING DATABASE SCHEMA & SEED ---');
  initSchema();
  seedInitialData();

  const user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' };
  const rootDir = path.join(__dirname, '../../../');

  const filesToImport = [
    { filename: 'DATA CL.xlsx', type: 'CUSTOMER_LIST' },
    { filename: 'TARGET KUANTITI SALES.xlsx', type: 'TARGETS' },
    { filename: 'DATA STOK.xlsx', type: 'STOCK' },
    { filename: 'piutang aktif.xlsx', type: 'AR' },
    { filename: 'master data.xlsx', type: 'TRANSACTIONS' }
  ];

  for (const item of filesToImport) {
    const fullPath = path.join(rootDir, item.filename);
    if (fs.existsSync(fullPath)) {
      console.log(`Ingesting ${item.filename} as ${item.type}...`);
      const startTime = Date.now();
      try {
        const result = commitImport(fullPath, item.type, user);
        console.log(`✓ Ingested ${item.filename} in ${Date.now() - startTime}ms (Status: ${result.status})`);
      } catch (err) {
        console.error(`✗ Error importing ${item.filename}:`, err);
      }
    } else {
      console.warn(`File not found: ${fullPath}`);
    }
  }

  const db = getDb();
  console.log('--- DATABASE STATUS SUMMARY ---');
  console.log('Outlets:', db.query('SELECT count(*) as c FROM dim_outlet')[0].c);
  console.log('Products:', db.query('SELECT count(*) as c FROM dim_product')[0].c);
  console.log('Sales Transactions:', db.query('SELECT count(*) as c FROM fact_sales_header')[0].c);
  console.log('Sales Lines:', db.query('SELECT count(*) as c FROM fact_sales_line')[0].c);
  console.log('Targets:', db.query('SELECT count(*) as c FROM fact_quantity_target')[0].c);
  console.log('Stock Snapshots:', db.query('SELECT count(*) as c FROM fact_inventory_snapshot')[0].c);
  console.log('AR Invoices:', db.query('SELECT count(*) as c FROM fact_ar_invoice')[0].c);
  console.log('--- SEEDING COMPLETE ---');
}

if (require.main === module) {
  seedAllSpreadsheets().catch(console.error);
}

module.exports = { seedAllSpreadsheets };
