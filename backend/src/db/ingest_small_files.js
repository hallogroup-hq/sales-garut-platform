const fs = require('node:fs');
const path = require('node:path');
const xlsx = require('xlsx');
const { getDb } = require('./connection.js');

function parseIndonesianNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim().replace(/\s+/g, '');
  if (str.includes(',') && str.includes('.')) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (str.includes(',')) {
    return parseFloat(str.replace(',', '.')) || 0;
  }
  if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length > 1 && parts.slice(1).every(p => p.length === 3)) {
      return parseFloat(parts.join('')) || 0;
    }
    return parseFloat(str) || 0;
  }
  return parseFloat(str) || 0;
}

function parseDate(val) {
  if (!val) return '2026-09-15';
  if (typeof val === 'number') {
    const d = new Date((val - (25567 + 2)) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (s.includes('/')) {
    const [d, m, y] = s.split('/');
    if (d && m && y) {
      return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return s;
}

const CANONICAL_UNIT_PRICES = {
  'KOPI TUBRUK GADJAH ASLI': 277910,
  'GADJAH MANIS': 165936,
  'GADJAH SPECIAL MIX': 154813,
  'GADJAH RTD': 48909,
  'CAFFINO': 238727,
  'CAFFINO BVG': 63759,
  'MILKLIFE UHT KIDS': 90824,
  'MILKLIFE UHT TEENS': 90101,
  'MILKLIFE UHT FULL CREAM': 202331,
  'MILKLIFE YOGURT': 60371,
  'DELI WAFER': 42617,
  'FOX\'S CANDY': 140097,
  'FOX CANDY': 140097,
  'HYDROPLUS': 31525,
  'MBG': 89612,
  'SHOT': 157036,
  'ROYO': 2743094
};

function getBrandUnitPrice(brand) {
  const norm = String(brand || '').trim().toUpperCase();
  for (const [k, v] of Object.entries(CANONICAL_UNIT_PRICES)) {
    if (norm.includes(k) || k.includes(norm)) return v;
  }
  return 120000;
}

function resolveFilePath(rawDir, rootDir, candidates) {
  for (const c of candidates) {
    const p1 = path.join(rawDir, c);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(rootDir, c);
    if (fs.existsSync(p2)) return p2;
  }
  return null;
}

async function runSmallIngestion() {
  const db = getDb();
  const rawDir = path.resolve(__dirname, '../../../New Raw Data');
  const rootDir = path.resolve(__dirname, '../../..');

  console.log('>>> [1/4] Ingesting TARGET SALES.xlsx (Year 2026)...');
  const targetPath = resolveFilePath(rawDir, rootDir, ['TARGET KUANTITI SALES.xlsx', 'TARGET SALES.xlsx']);
  if (targetPath && fs.existsSync(targetPath)) {
    const wb = xlsx.readFile(targetPath);
    const matrix = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(10, matrix.length); r++) {
      const rowStr = matrix[r].map(c => String(c).trim().toLowerCase());
      if (rowStr.includes('sales name') || rowStr.includes('nama sales')) {
        headerRowIdx = r;
        break;
      }
    }
    const headers = matrix[headerRowIdx].map(h => String(h).trim());
    const rows = [];
    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const obj = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = matrix[r][i];
      });
      rows.push(obj);
    }
    const salesmanMap = {
      'ANDI AGUNG GUMILAR': '305032',
      'Ibna Faizal Rahman': '305030',
      'Mega Nugraha': '305029',
      'Muhamad Fikri Hambali': '107075',
      'Muhammad Zulfa Akbar': '305033',
      'Mulyana': '305028',
      'Risan Setiawan': '305031',
      'DSM_GARUT': 'DSM_GARUT'
    };

    const monthCols = [
      { name: 'JAN', m: 1 },
      { name: 'FEB', m: 2 },
      { name: 'MAR', m: 3 },
      { name: 'APR', m: 4 },
      { name: 'MAY', m: 5 },
      { name: 'MEI', m: 5 },
      { name: 'JUN', m: 6 },
      { name: 'JUL', m: 7 },
      { name: 'AUG', m: 8 },
      { name: 'AGU', m: 8 },
      { name: 'SEP', m: 9 }
    ];

    let targetCount = 0;
    for (const r of rows) {
      const salesName = (r['Sales Name'] || r['Nama Sales'] || '').trim();
      const sId = salesmanMap[salesName];
      const brand = (r['Brand'] || r['Group SKU'] || '').trim();
      if (!sId || !brand || salesName.toLowerCase() === 'grand total' || brand.toLowerCase() === 'grand total') continue;

      const unitPrice = getBrandUnitPrice(brand);

      for (const mc of monthCols) {
        if (r[mc.name] === undefined && r[mc.name.toLowerCase()] === undefined) continue;
        const rawVal = r[mc.name] !== undefined ? r[mc.name] : r[mc.name.toLowerCase()];
        const tgtVal = parseFloat(rawVal) || 0;
        const targetId = `TGT_2026_${mc.m}_${sId}_${brand.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const targetValueRp = Math.round(tgtVal * unitPrice);

        db.run(
          `INSERT INTO fact_quantity_target (
            target_id, year, month, salesman_id, group_sku, target_cartons, target_value, updated_at
          ) VALUES (?, 2026, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT (target_id) DO UPDATE SET
            target_cartons=EXCLUDED.target_cartons,
            target_value=EXCLUDED.target_value,
            updated_at=EXCLUDED.updated_at`,
          [targetId, mc.m, sId, brand, tgtVal, targetValueRp]
        );
        targetCount++;
      }
    }
    console.log(`  Inserted/updated ${targetCount} target entries for Jan-Sep 2026.`);

    // Sync fact_incentive_value_target
    db.run(`
      INSERT OR REPLACE INTO fact_incentive_value_target (
        id, year, month, salesman_id, target_value, updated_at
      )
      SELECT 
        'INC_TGT_' || year || '_' || month || '_' || salesman_id,
        year,
        month,
        salesman_id,
        SUM(target_value),
        CURRENT_TIMESTAMP
      FROM fact_quantity_target
      WHERE year = 2026
      GROUP BY year, month, salesman_id
    `);
  }

  console.log('>>> [2/4] Updating master customer mappings...');
  const custPath = resolveFilePath(rawDir, rootDir, ['master customer.xlsx', 'master data.xlsx', 'DATA CL.xlsx']);
  if (custPath && fs.existsSync(custPath)) {
    const wb = xlsx.readFile(custPath);
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let updatedCount = 0;
    for (const r of rows) {
      const code = String(r['Kode Outlet'] || r['Customer Code'] || '').trim();
      if (!code) continue;
      const addr = String(r['Alamat Outlet'] || r['Alamat'] || '').trim();
      const salesId = String(r['Kode Sales'] || r['Salesman Code (Transaction)'] || '').trim();
      const rayon = String(r['Rayon'] || r['Rayon outlet'] || '').trim();
      const kecName = String(r['KECAMATAN\\'] || r['KECAMATAN'] || '').trim();
      const kecId = kecName ? `KEC_${kecName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}` : null;

      // Validate FK references
      const validSalesman = db.query('SELECT salesman_id FROM org_salesman WHERE salesman_id = ?', [salesId]).length > 0 ? salesId : null;
      const validRayon = db.query('SELECT rayon_id FROM dim_rayon WHERE rayon_id = ?', [rayon]).length > 0 ? rayon : null;
      let validKec = null;
      if (kecId && kecName) {
        db.run('INSERT INTO dim_kecamatan (kecamatan_id, name) VALUES (?, ?) ON CONFLICT (kecamatan_id) DO NOTHING', [kecId, kecName]);
        validKec = kecId;
      }

      // Check alias
      const aliasRows = db.query('SELECT outlet_id FROM outlet_alias WHERE source_customer_code = ?', [code]);
      if (aliasRows.length > 0) {
        const canonicalId = aliasRows[0].outlet_id;
        db.run(
          `UPDATE dim_outlet SET
             address_text=COALESCE(?, address_text),
             current_salesman_id=COALESCE(?, current_salesman_id),
             current_rayon_id=COALESCE(?, current_rayon_id),
             kecamatan_id=COALESCE(?, kecamatan_id),
             updated_at=datetime('now')
           WHERE outlet_id = ?`,
          [addr || null, validSalesman, validRayon, validKec, canonicalId]
        );
        updatedCount++;
      }
    }
    console.log(`  Updated ${updatedCount} existing outlets from master customer.`);
  }

  console.log('>>> [3/4] Ingesting stock gudang.xlsx...');
  const stockPath = resolveFilePath(rawDir, rootDir, ['stock gudang.xlsx', 'DATA STOK.xlsx']);
  if (fs.existsSync(stockPath)) {
    const wb = xlsx.readFile(stockPath);
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let stockCount = 0;
    const snapshotDate = '2026-09-15';

    for (const r of rows) {
      const itemCode = String(r['Kode'] || r['SKU'] || '').trim();
      if (!itemCode) continue;
      const itemName = String(r['Produk'] || '').trim();
      const groupSku = String(r['SKU GROUP'] || '').trim();
      const finalGroup = groupSku || 'OTHERS';

      db.run(
        `INSERT INTO dim_product (item_code, item_name, principal, category_sku, brand, group_sku)
         VALUES (?, ?, 'SAVORIA', ?, 'SAVORIA', ?)
         ON CONFLICT (item_code) DO UPDATE SET
           item_name=EXCLUDED.item_name,
           group_sku=COALESCE(EXCLUDED.group_sku, dim_product.group_sku)`,
        [itemCode, itemName, finalGroup, finalGroup]
      );

      const saldoAdm = parseIndonesianNumber(r['Saldo Stok Administrasi']);
      const bonProd = parseIndonesianNumber(r['Bon Produk']);
      const availStock = parseIndonesianNumber(r['Available Stock']);
      const stokFisik = parseIndonesianNumber(r['Stok Fisik']);
      const stokTransit = parseIndonesianNumber(r['Stok dalam Perjalanan']);

      db.run(
        `INSERT INTO fact_inventory_snapshot (
          snapshot_date, item_code, saldo_administrasi_ctn, bon_produk_ctn, available_stock_ctn, stok_fisik_ctn, stok_perjalanan_ctn
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (snapshot_date, item_code) DO UPDATE SET
          saldo_administrasi_ctn=EXCLUDED.saldo_administrasi_ctn,
          bon_produk_ctn=EXCLUDED.bon_produk_ctn,
          available_stock_ctn=EXCLUDED.available_stock_ctn,
          stok_fisik_ctn=EXCLUDED.stok_fisik_ctn,
          stok_perjalanan_ctn=EXCLUDED.stok_perjalanan_ctn`,
        [snapshotDate, itemCode, saldoAdm, bonProd, availStock, stokFisik, stokTransit]
      );
      stockCount++;
    }
    console.log(`  Processed ${stockCount} inventory snapshot items.`);
  }

  console.log('>>> [4/4] Ingesting data piutang.xlsx...');
  const arPath = path.join(rawDir, 'data piutang.xlsx');
  if (fs.existsSync(arPath)) {
    const wb = xlsx.readFile(arPath);
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let arCount = 0;
    const asOfDateStr = '2026-09-15';
    const asOfDate = new Date(asOfDateStr);

    for (const r of rows) {
      const invNum = String(r['No Faktur'] || '').trim();
      const code = String(r['Kode Outlet'] || '').trim();
      if (!invNum || !code) continue;

      // Find canonical outlet
      const aliasRows = db.query('SELECT outlet_id FROM outlet_alias WHERE source_customer_code = ?', [code]);
      let canonicalOutletId = aliasRows.length > 0 ? aliasRows[0].outlet_id : null;

      if (!canonicalOutletId) {
        const directOut = db.query('SELECT outlet_id FROM dim_outlet WHERE outlet_id = ?', [code]);
        if (directOut.length > 0) {
          canonicalOutletId = code;
        } else {
          canonicalOutletId = `OUT_AR_${code}`;
          db.run(
            `INSERT INTO dim_outlet (outlet_id, canonical_name, is_mbg, channel, is_active_cl)
             VALUES (?, ?, 0, 'GT', 0)
             ON CONFLICT (outlet_id) DO NOTHING`,
            [canonicalOutletId, String(r['Outlet'] || code).trim()]
          );
        }
      }

      const invDate = parseDate(r['Tgl Faktur']);
      const dueDate = parseDate(r['Tgl J. Tempo']);
      const fakturNetto = parseIndonesianNumber(r['Faktur Netto']);
      const sudahBayar = parseIndonesianNumber(r['Sudah Bayar']);
      const saldoPiutang = parseIndonesianNumber(r['Saldo Piutang']);

      const dueObj = new Date(dueDate);
      const diffMs = asOfDate.getTime() - dueObj.getTime();
      const overdueDays = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;

      const smRow = db.query('SELECT current_salesman_id FROM dim_outlet WHERE outlet_id = ?', [canonicalOutletId]);
      const salesmanId = smRow.length > 0 ? smRow[0].current_salesman_id : null;

      db.run(
        `INSERT INTO fact_ar_invoice (
          invoice_number, outlet_id, salesman_id, invoice_date, due_date, faktur_netto, sudah_bayar, saldo_piutang, overdue_days, as_of_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (invoice_number) DO UPDATE SET
          saldo_piutang=EXCLUDED.saldo_piutang,
          sudah_bayar=EXCLUDED.sudah_bayar,
          overdue_days=EXCLUDED.overdue_days,
          as_of_date=EXCLUDED.as_of_date`,
        [invNum, canonicalOutletId, salesmanId, invDate, dueDate, fakturNetto, sudahBayar, saldoPiutang, overdueDays, asOfDateStr]
      );
      arCount++;
    }
    console.log(`  Processed ${arCount} AR invoices.`);
  }

  console.log('>>> Small files ingestion completed successfully.');
}

if (require.main === module) {
  runSmallIngestion().catch(console.error);
}

module.exports = { runSmallIngestion };
