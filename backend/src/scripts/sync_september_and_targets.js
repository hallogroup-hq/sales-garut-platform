const path = require('node:path');
const fs = require('node:fs');
const XLSX = require('xlsx');
const { getDb, initSchema } = require('../db/connection.js');

const MONTH_MAP = {
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
  'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
  'januari': 1, 'februari': 2, 'maret': 3, 'april': 4, 'mei': 5, 'juni': 6,
  'juli': 7, 'agustus': 8, 'september': 9, 'oktober': 10, 'nopember': 11, 'november': 11, 'desember': 12
};

const CANONICAL_UNIT_PRICES = {
  'KOPI TUBRUK GADJAH ASLI': 277910,
  'GADJAH ASLI': 277910,
  'KOPI TUBRUK GADJAH MANIS': 165936,
  'GADJAH MANIS': 165936,
  'GADJAH SPECIAL MIX': 154813,
  'GADJAH MANGGA': 147869,
  'KOPI TUBRUK GADJAH RTD': 48909,
  'GADJAH RTD': 48909,
  'KOPI TUBRUK GADJAH BVG': 48909,
  'KOPI TUBRUK GADJAH': 171658,
  'CAFFINO': 238727,
  'CAFFINO BVG': 63759,
  'MILK LIFE UHT': 91615,
  'UHT KIDS': 90824,
  'UHT TEENS': 90101,
  'UHT FULL CREAM': 202331,
  'UHT STRAWBERRY': 84706,
  'UHT LACTOSE FREE': 101209,
  'MILK LIFE YOGURT': 60371,
  'YOGHURT': 60371,
  '5DAYS': 168999,
  'DELI': 42617,
  'DELI (NPL)': 49081,
  'FOX\'S CANDY': 140097,
  'FOX\'S Candy': 140097,
  'HYDROPLUS': 31525,
  'Hydroplus': 31525,
  'MBG': 89612,
  'SHOT': 157036,
  'SARIWANGI RTG': 236247,
  'SARIWANGI PACK': 267595,
  'ROYO': 2743094
};

function getUnitPrice(brandName) {
  if (!brandName) return 100000;
  const upper = brandName.trim().toUpperCase();
  if (CANONICAL_UNIT_PRICES[upper]) return CANONICAL_UNIT_PRICES[upper];
  for (const [k, v] of Object.entries(CANONICAL_UNIT_PRICES)) {
    if (upper.includes(k) || k.includes(upper)) return v;
  }
  return 100000;
}

async function syncAll() {
  console.log('=== STARTING SALES GARUT DATA & TARGET SYNC ===');
  initSchema();
  const db = getDb();

  // 1. Ensure columns exist in SQLite
  try {
    const headerCols = db.query('PRAGMA table_info(fact_sales_header)').map(c => c.name);
    if (!headerCols.includes('period_year')) db.exec("ALTER TABLE fact_sales_header ADD COLUMN period_year INTEGER");
    if (!headerCols.includes('period_month')) db.exec("ALTER TABLE fact_sales_header ADD COLUMN period_month INTEGER");
    db.exec("CREATE INDEX IF NOT EXISTS idx_sales_header_period ON fact_sales_header(period_year, period_month)");

    const targetCols = db.query('PRAGMA table_info(fact_quantity_target)').map(c => c.name);
    if (!targetCols.includes('target_value')) db.exec("ALTER TABLE fact_quantity_target ADD COLUMN target_value NUMERIC(15, 2) DEFAULT 0");
  } catch (e) {
    console.warn('Column check note:', e.message);
  }

  // 2. Sync period_year and period_month from master data.xlsx
  const masterPath = path.join(__dirname, '../../../master data.xlsx');
  if (fs.existsSync(masterPath)) {
    console.log(`Reading master data from ${masterPath}...`);
    const wb = XLSX.readFile(masterPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet);
    console.log(`Loaded ${rawRows.length} rows from master data.xlsx.`);

    const docPeriodMap = new Map();
    for (const r of rawRows) {
      const docNo = String(r['Document Number'] || r['No Dokumen'] || '').trim();
      if (!docNo) continue;
      const yr = parseInt(r['Year'] || 0, 10);
      const moStr = String(r['MONTH'] || '').trim().toLowerCase().slice(0, 3);
      const mo = MONTH_MAP[moStr] || 0;
      if (yr > 2020 && mo > 0 && !docPeriodMap.has(docNo)) {
        docPeriodMap.set(docNo, { year: yr, month: mo });
      }
    }

    console.log(`Mapping ${docPeriodMap.size} unique document numbers to period_year & period_month...`);
    db.exec('BEGIN TRANSACTION;');
    const stmtUpdateHeader = db.raw.prepare(`
      UPDATE fact_sales_header SET period_year = ?, period_month = ? WHERE document_number = ?
    `);

    let updatedCount = 0;
    for (const [docNo, p] of docPeriodMap.entries()) {
      stmtUpdateHeader.run(p.year, p.month, docNo);
      updatedCount++;
    }
    db.exec('COMMIT;');
    console.log(`✓ Updated period_year & period_month for ${updatedCount} headers in fact_sales_header.`);
  }

  // Fallback update for any remaining headers missing period_year
  db.exec(`
    UPDATE fact_sales_header
    SET 
      period_year = CAST(substr(transaction_date, 1, 4) AS INTEGER),
      period_month = CAST(substr(transaction_date, 6, 2) AS INTEGER)
    WHERE period_year IS NULL OR period_month IS NULL;
  `);

  // 3. Ingest TARGET KUANTITI SALES.xlsx
  const targetPath = path.join(__dirname, '../../../TARGET KUANTITI SALES.xlsx');
  if (fs.existsSync(targetPath)) {
    console.log(`Reading targets from ${targetPath}...`);
    const wb = XLSX.readFile(targetPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const monthCols = [
      { num: 1, names: ['JAN', 'Januari', 'January'] },
      { num: 2, names: ['FEB', 'Februari', 'February'] },
      { num: 3, names: ['MAR', 'Maret', 'March'] },
      { num: 4, names: ['APR', 'April'] },
      { num: 5, names: ['MEI', 'MAY', 'Mei', 'May'] },
      { num: 6, names: ['JUN', 'Juni', 'June'] },
      { num: 7, names: ['JUL', 'Juli', 'July'] },
      { num: 8, names: ['AGU', 'AUG', 'Agustus', 'August'] },
      { num: 9, names: ['SEP', 'SEPT', 'September'] },
      { num: 10, names: ['OKT', 'OCT', 'Oktober', 'October'] },
      { num: 11, names: ['NOP', 'NOV', 'Nopember', 'November'] },
      { num: 12, names: ['DES', 'DEC', 'Desember', 'December'] }
    ];

    const headerRow = rawData[1];
    const colIndexMap = {};
    headerRow.forEach((h, idx) => {
      if (!h) return;
      const cleanH = String(h).trim().toUpperCase();
      colIndexMap[cleanH] = idx;
    });

    const allSalesmen = db.query('SELECT salesman_id, name, code FROM org_salesman');

    db.exec('BEGIN TRANSACTION;');
    const stmtInsertTarget = db.raw.prepare(`
      INSERT OR REPLACE INTO fact_quantity_target (
        target_id, year, month, salesman_id, group_sku, target_cartons, target_value, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const salesmanMonthlyValue = {}; // `${year}_${month}_${salesmanId}` -> totalValue

    let targetRowsInserted = 0;
    for (let r = 2; r < rawData.length; r++) {
      const row = rawData[r];
      const salesName = String(row[1] || '').trim();
      const brand = String(row[2] || '').trim();
      if (!salesName || !brand || salesName.toLowerCase() === 'grand total' || brand.toLowerCase() === 'grand total') continue;

      let sMatch = allSalesmen.find(s => s.name.toLowerCase().includes(salesName.toLowerCase()) || s.code === salesName);
      let salesmanId = sMatch ? sMatch.salesman_id : (salesName.toUpperCase().includes('DSM') ? 'DSM_GARUT' : null);
      if (!salesmanId) continue;

      const unitPrice = getUnitPrice(brand);

      for (const m of monthCols) {
        let colIdx = -1;
        for (const name of m.names) {
          if (colIndexMap[name.toUpperCase()] !== undefined) {
            colIdx = colIndexMap[name.toUpperCase()];
            break;
          }
        }
        if (colIdx === -1) continue;

        const valRaw = row[colIdx];
        const targetCartons = valRaw !== undefined && valRaw !== '' ? Number(valRaw) || 0 : 0;
        const targetValue = Math.round(targetCartons * unitPrice);

        const targetId = `TGT_2026_${m.num}_${salesmanId}_${brand}`.replace(/[^A-Za-z0-9_]/g, '_');
        stmtInsertTarget.run(targetId, 2026, m.num, salesmanId, brand, targetCartons, targetValue);
        targetRowsInserted++;

        const smKey = `2026|${m.num}|${salesmanId}`;
        salesmanMonthlyValue[smKey] = (salesmanMonthlyValue[smKey] || 0) + targetValue;
      }
    }

    // Populate fact_incentive_value_target
    const stmtInsertIncentiveVal = db.raw.prepare(`
      INSERT OR REPLACE INTO fact_incentive_value_target (
        id, year, month, salesman_id, target_value, updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    for (const [key, totalVal] of Object.entries(salesmanMonthlyValue)) {
      const [yr, mo, sId] = key.split('|');
      const incId = `INC_VAL_${yr}_${mo}_${sId}`.replace(/[^A-Za-z0-9_]/g, '_');
      stmtInsertIncentiveVal.run(incId, parseInt(yr, 10), parseInt(mo, 10), sId, totalVal);
    }

    db.exec('COMMIT;');
    console.log(`✓ Inserted ${targetRowsInserted} target records across Jan-Sep 2026 into fact_quantity_target.`);
    console.log(`✓ Updated monthly target values in fact_incentive_value_target for all salesmen.`);
  }

  // 4. Verification Check for September 2026
  console.log('\n--- VERIFICATION: SEPTEMBER 2026 METRICS ---');
  const sepHeaders = db.query(`SELECT count(*) as c FROM fact_sales_header WHERE period_year = 2026 AND period_month = 9`)[0].c;
  const sepActuals = db.query(`
    SELECT 
      round(sum(case when h.unit_type = 'Sales' then l.carton_quantity else -l.carton_quantity end), 2) as net_cartons,
      round(sum(case when h.unit_type = 'Sales' then l.sales_netto else -l.sales_netto end), 2) as net_value,
      count(distinct h.outlet_id) as active_outlets
    FROM fact_sales_line l
    JOIN fact_sales_header h ON l.document_number = h.document_number
    WHERE h.period_year = 2026 AND h.period_month = 9
  `)[0];

  const sepTargets = db.query(`
    SELECT 
      count(*) as target_count,
      round(sum(target_cartons), 2) as target_cartons,
      round(sum(target_value), 2) as target_value
    FROM fact_quantity_target
    WHERE year = 2026 AND month = 9
  `)[0];

  console.log(`September 2026 Invoices: ${sepHeaders}`);
  console.log(`September 2026 Actual Cartons: ${sepActuals.net_cartons} KTN`);
  console.log(`September 2026 Actual Net Value: Rp ${Number(sepActuals.net_value).toLocaleString('id-ID')}`);
  console.log(`September 2026 Active Outlets: ${sepActuals.active_outlets}`);
  console.log(`September 2026 Target Cartons: ${sepTargets.target_cartons} KTN`);
  console.log(`September 2026 Target Value: Rp ${Number(sepTargets.target_value).toLocaleString('id-ID')}`);
  if (sepTargets.target_cartons > 0) {
    const achv = Math.round((sepActuals.net_cartons / sepTargets.target_cartons) * 1000) / 10;
    console.log(`September 2026 Achievement Qty: ${achv}%`);
  }

  console.log('=== SYNC COMPLETED SUCCESSFULLY ===');
}

if (require.main === module) {
  syncAll().catch(err => {
    console.error('Sync error:', err);
    process.exit(1);
  });
}

module.exports = { syncAll, CANONICAL_UNIT_PRICES, getUnitPrice };

