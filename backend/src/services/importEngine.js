const fs = require('node:fs');
const crypto = require('node:crypto');
const XLSX = require('xlsx');
const { getDb } = require('../db/connection.js');
const { logAudit } = require('../middleware/audit.js');

function computeFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function detectDatasetType(headers) {
  const hSet = new Set(headers.map(h => String(h).trim().toLowerCase()));

  // 1. AR / Aging Piutang (e.g. piutang aktif.xlsx)
  if ((hSet.has('no faktur') || hSet.has('no faktur penjualan') || hSet.has('invoice number')) &&
      (hSet.has('saldo piutang') || hSet.has('piutang') || hSet.has('tgl j. tempo') || hSet.has('faktur netto') || hSet.has('total tagihan') || hSet.has('potongan'))) {
    return 'AR';
  }

  // 2. STOCK / Gudang (e.g. DATA STOK.xlsx)
  if (hSet.has('available stock') || hSet.has('saldo stok administrasi') || hSet.has('stok fisik') ||
      (hSet.has('bon produk') && (hSet.has('kode') || hSet.has('produk') || hSet.has('sku')))) {
    return 'STOCK';
  }

  // 3. TARGETS / Kuantiti (e.g. TARGET KUANTITI SALES.xlsx)
  if ((hSet.has('sales name') || hSet.has('nama sales')) && (hSet.has('brand') || hSet.has('group sku') || hSet.has('principal'))) {
    return 'TARGETS';
  }

  // 4. TRANSACTIONS (e.g. master data.xlsx)
  if ((hSet.has('document number') || hSet.has('no dokumen') || hSet.has('salesman (transaction)')) &&
      (hSet.has('item code') || hSet.has('kode item') || hSet.has('item') || hSet.has('sales ctn') || hSet.has('sales netto'))) {
    return 'TRANSACTIONS';
  }

  // 5. CUSTOMER_LIST (e.g. DATA CL.xlsx)
  if ((hSet.has('kode outlet') || hSet.has('customer code')) &&
      (hSet.has('nama outlet') || hSet.has('customer name') || hSet.has('alamat outlet') || hSet.has('rayon')) &&
      !hSet.has('no faktur') && !hSet.has('saldo piutang')) {
    return 'CUSTOMER_LIST';
  }

  // 6. INCENTIVE_VALUE_TARGETS
  if (hSet.has('salesman') && (hSet.has('target value') || hSet.has('target rupiah'))) {
    return 'INCENTIVE_VALUE_TARGETS';
  }

  return 'UNKNOWN';
}

function sanitizeNumber(val, defaultVal = 0) {
  if (val === null || val === undefined || val === '') return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  let str = String(val).trim().replace(/Rp/gi, '').replace(/\s+/g, '');
  
  const commas = (str.match(/,/g) || []).length;
  const dots = (str.match(/\./g) || []).length;

  if (dots > 0 && commas === 1) {
    // Indonesian currency: 1.250.000,50
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (commas > 0 && dots === 1) {
    // US currency: 1,250,000.50
    str = str.replace(/,/g, '');
  } else if (commas > 1) {
    str = str.replace(/,/g, '');
  } else if (dots > 1) {
    str = str.replace(/\./g, '');
  } else if (commas === 1) {
    if (/,\d{3}$/.test(str)) {
      str = str.replace(',', '');
    } else {
      str = str.replace(',', '.');
    }
  }
  const n = parseFloat(str);
  return isNaN(n) ? defaultVal : n;
}

function sanitizeDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    const date = new Date((val - (25567 + 2)) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3];
    return `${y}-${m}-${d}`;
  }
  return str.split('T')[0];
}

function sanitizeCode(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function readSheetWithSmartHeaders(workbook, forcedType = null) {
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawMatrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rawMatrix.length === 0) {
    return { headers: [], rawRows: [], detectedType: 'EMPTY', headerRowIndex: 0 };
  }

  let headerRowIndex = 0;
  let detectedType = 'UNKNOWN';
  let headers = [];

  for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
    const candidateHeaders = rawMatrix[r].filter(c => c !== null && c !== undefined && c !== '');
    if (candidateHeaders.length >= 2) {
      const rowLower = candidateHeaders.map(c => String(c).trim().toLowerCase());
      
      // Specifically check for targets header row
      if (forcedType === 'TARGETS' || (rowLower.includes('sales name') && (rowLower.includes('brand') || rowLower.includes('principal')))) {
        headerRowIndex = r;
        detectedType = 'TARGETS';
        headers = rawMatrix[r].map(h => String(h).trim());
        break;
      }

      const type = detectDatasetType(candidateHeaders);
      if (type !== 'UNKNOWN') {
        headerRowIndex = r;
        detectedType = type;
        headers = rawMatrix[r].map(h => String(h).trim());
        break;
      }
    }
  }

  if (detectedType === 'UNKNOWN' || headers.length === 0) {
    headerRowIndex = 0;
    headers = rawMatrix[0].map(h => String(h).trim());
    detectedType = forcedType || detectDatasetType(headers);
  }

  const rawRows = [];
  for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
    const rowObj = {};
    let hasData = false;
    headers.forEach((h, colIdx) => {
      if (!h) return;
      const val = rawMatrix[r][colIdx];
      rowObj[h] = val !== undefined ? val : '';
      if (val !== '' && val !== null && val !== undefined) hasData = true;
    });
    if (hasData) {
      rawRows.push(rowObj);
    }
  }

  return { headers, rawRows, detectedType: forcedType || detectedType, headerRowIndex };
}

function dryRunValidate(filePath, forcedType = null) {
  const hash = computeFileHash(filePath);
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const { headers, rawRows, detectedType: autoType } = readSheetWithSmartHeaders(workbook, forcedType);

  const detectedType = forcedType || autoType;

  if (rawRows.length === 0) {
    return {
      batchId: 'BATCH_' + crypto.randomUUID(),
      datasetType: 'EMPTY',
      fileHash: hash,
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      errorRows: 0,
      errors: ['Berkas Excel kosong.'],
      samplePreview: []
    };
  }

  const errors = [];
  const warnings = [];
  let validRows = 0;
  let errorRows = 0;
  let warningRows = 0;

  const samplePreview = rawRows.slice(0, 10);

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    let rowHasError = false;
    let rowHasWarning = false;

    if (detectedType === 'TRANSACTIONS') {
      const docNo = row['Document Number'] || row['No Dokumen'];
      const custCode = row['Customer Code'] || row['Kode Outlet'];
      const itemCode = row['Item Code'] || row['Kode Item'] || row['Item'];
      const date = row['Transaction Date'] || row['Tanggal'];

      if (!docNo || !custCode || !itemCode || !date) {
        errors.push(`Baris ${rowNum}: Data transaksi wajib tidak lengkap (No Dokumen / Outlet / SKU / Tanggal).`);
        rowHasError = true;
      }
      if (String(custCode).includes('E+')) {
        warnings.push(`Baris ${rowNum}: Format kode outlet mengandung notasi saintifik (${custCode}).`);
        rowHasWarning = true;
      }
    } else if (detectedType === 'CUSTOMER_LIST') {
      const outletCode = row['Kode Outlet'] || row['Customer Code'];
      const outletName = row['Nama Outlet'] || row['Customer Name'];
      if (!outletCode || !outletName) {
        errors.push(`Baris ${rowNum}: Kode Outlet atau Nama Outlet tidak boleh kosong.`);
        rowHasError = true;
      }
      if (String(outletCode).includes('E+')) {
        warnings.push(`Baris ${rowNum}: Kode outlet mengandung notasi saintifik (${outletCode}).`);
        rowHasWarning = true;
      }
    } else if (detectedType === 'TARGETS') {
      const salesName = String(row['Sales Name'] || row['Nama Sales'] || '').trim();
      const brand = String(row['Brand'] || row['Group SKU'] || '').trim();
      // Skip summary / Grand Total row from errors
      if (salesName.toLowerCase() === 'grand total' || brand.toLowerCase() === 'grand total') {
        return;
      }
      if (!salesName || !brand) {
        errors.push(`Baris ${rowNum}: Target baris wajib Sales Name dan Brand.`);
        rowHasError = true;
      }
    } else if (detectedType === 'STOCK') {
      const skuCode = row['Kode'] || row['Item Code'];
      if (!skuCode) {
        errors.push(`Baris ${rowNum}: Kode SKU kosong.`);
        rowHasError = true;
      }
    } else if (detectedType === 'AR') {
      const invNo = row['No Faktur'] || row['No Faktur Penjualan'];
      if (!invNo) {
        errors.push(`Baris ${rowNum}: No Faktur kosong.`);
        rowHasError = true;
      }
    }

    if (rowHasError) errorRows++;
    else if (rowHasWarning) {
      warningRows++;
      validRows++;
    } else {
      validRows++;
    }
  });

  const batchId = 'BATCH_' + crypto.randomUUID();

  return {
    batchId,
    datasetType: detectedType,
    fileHash: hash,
    totalRows: rawRows.length,
    validRows,
    warningRows,
    errorRows,
    errors: errors.slice(0, 50),
    warnings: warnings.slice(0, 50),
    samplePreview
  };
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

function commitImport(filePath, datasetType, user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' }) {
  const db = getDb();
  const hash = computeFileHash(filePath);
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const { rawRows } = readSheetWithSmartHeaders(workbook, datasetType);

  const batchId = 'BATCH_' + crypto.randomUUID();
  const filename = filePath.split('/').pop();

  db.run(
    `INSERT INTO import_batch (
      batch_id, dataset_type, filename, file_hash_sha256, uploader_id, status, total_rows, valid_rows
    ) VALUES (?, ?, ?, ?, ?, 'STAGED', ?, ?)`,
    [batchId, datasetType, filename, hash, user.userId, rawRows.length, rawRows.length]
  );

  db.exec('BEGIN TRANSACTION;');
  try {
    if (datasetType === 'CUSTOMER_LIST') {
      for (const row of rawRows) {
        const rawCode = sanitizeCode(row['Kode Outlet'] || row['Customer Code']);
        const rawName = String(row['Nama Outlet'] || row['Customer Name'] || 'Outlet Tanpa Nama').trim();
        const address = String(row['Alamat Outlet'] || row['Alamat'] || '').trim();
        const salesmanName = String(row['Salesman Name'] || row['Salesman'] || '').trim();
        const rayon = String(row['Rayon'] || row['Rayon outlet'] || '').trim().toUpperCase();
        const pasarName = String(row['pasar'] || row['Mapping Pasar'] || 'non pasar').trim();
        const kecName = String(row['KECAMATAN\\'] || row['KECAMATAN'] || row['Kecamatan'] || 'GARUT KOTA').trim();
        const cluster = String(row['Cluster outlet'] || 'retail 1').trim();
        const isMbg = String(row['MBG/Non MBG'] || '').toUpperCase().includes('MBG') ? 1 : 0;
        const creditLimit = sanitizeNumber(row['Credit Limit'], 0);
        const top = parseInt(row['TOP'] || row['Payment Term'] || 0, 10);

        if (!rawCode) continue;

        const kecId = 'KEC_' + kecName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        db.run(`INSERT OR IGNORE INTO dim_kecamatan (kecamatan_id, name) VALUES (?, ?)`, [kecId, kecName]);

        const pasarId = 'PASAR_' + pasarName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        db.run(`INSERT OR IGNORE INTO dim_pasar (pasar_id, name, is_pasar) VALUES (?, ?, ?)`, [pasarId, pasarName, pasarName.toLowerCase() === 'non pasar' ? 0 : 1]);

        let salesId = null;
        if (salesmanName) {
          const sMatch = db.query(
            `SELECT salesman_id FROM org_salesman WHERE name LIKE ? OR code = ?`,
            [`%${salesmanName}%`, salesmanName]
          )[0];
          if (sMatch) salesId = sMatch.salesman_id;
        }

        let canonicalId = null;
        const existingAlias = db.query(`SELECT outlet_id FROM outlet_alias WHERE source_customer_code = ?`, [rawCode])[0];

        if (existingAlias) {
          canonicalId = existingAlias.outlet_id;
          db.run(
            `UPDATE dim_outlet SET
              canonical_name = ?, address_text = ?, current_salesman_id = COALESCE(?, current_salesman_id),
              current_rayon_id = COALESCE(?, current_rayon_id), kecamatan_id = ?, pasar_id = ?,
              cluster_tier = ?, is_mbg = ?, credit_limit = ?, term_of_payment = ?, updated_at = CURRENT_TIMESTAMP
             WHERE outlet_id = ?`,
            [rawName, address, salesId, rayon || null, kecId, pasarId, cluster, isMbg, creditLimit, top, canonicalId]
          );
        } else {
          canonicalId = 'OUT_' + crypto.randomUUID();
          db.run(
            `INSERT INTO dim_outlet (
              outlet_id, canonical_name, address_text, current_salesman_id, current_rayon_id,
              kecamatan_id, pasar_id, cluster_tier, is_mbg, credit_limit, term_of_payment, is_active_cl
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [canonicalId, rawName, address, salesId, rayon || null, kecId, pasarId, cluster, isMbg, creditLimit, top]
          );

          const aliasId = 'AL_' + crypto.randomUUID();
          const sys = rawCode.startsWith('G') || rawCode.startsWith('S') ? 'SFA' : (rawCode.length === 9 ? 'ERP' : 'DSO');
          db.run(
            `INSERT INTO outlet_alias (alias_id, outlet_id, source_system, source_customer_code, source_customer_name) VALUES (?, ?, ?, ?, ?)`,
            [aliasId, canonicalId, sys, rawCode, rawName]
          );

          if (salesId) {
            db.run(
              `INSERT INTO outlet_assignment_history (assignment_id, outlet_id, salesman_id, rayon_id, valid_from, changed_by) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
              ['ASG_' + crypto.randomUUID(), canonicalId, salesId, rayon || null, user.fullName]
            );
          }
        }
      }
    } else if (datasetType === 'TARGETS') {
      const year = 2026;
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
      
      for (const row of rawRows) {
        const salesName = String(row['Sales Name'] || row['Nama Sales'] || '').trim();
        const brand = String(row['Brand'] || row['Group SKU'] || '').trim();
        if (!salesName || !brand || brand.toLowerCase() === 'grand total' || salesName.toLowerCase() === 'grand total') continue;

        const sMatch = db.query(
          `SELECT salesman_id FROM org_salesman WHERE name LIKE ? OR code = ?`,
          [`%${salesName}%`, salesName]
        )[0];
        const salesmanId = sMatch ? sMatch.salesman_id : (salesName.toUpperCase().includes('DSM') ? 'DSM_GARUT' : null);
        if (!salesmanId) continue;

        const unitPrice = getBrandUnitPrice(brand);

        monthCols.forEach(m => {
          let targetVal = 0;
          for (const key of m.names) {
            if (row[key] !== undefined && row[key] !== '') {
              targetVal = sanitizeNumber(row[key], 0);
              break;
            }
          }
          const targetId = `TGT_${year}_${m.num}_${salesmanId}_${brand}`.replace(/[^A-Z0-9_]/gi, '_');
          const targetValueRp = Math.round(targetVal * unitPrice);

          db.run(
            `INSERT OR REPLACE INTO fact_quantity_target (
              target_id, year, month, salesman_id, group_sku, target_cartons, target_value, import_batch_id, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [targetId, year, m.num, salesmanId, brand, targetVal, targetValueRp, batchId]
          );
        });
      }

      // Automatically sync incentive value target from quantity targets * unit price
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
        WHERE year = ?
        GROUP BY year, month, salesman_id
      `, [year]);
    } else if (datasetType === 'STOCK') {
      const snapshotDate = new Date().toISOString().split('T')[0];
      for (const row of rawRows) {
        const skuCode = sanitizeCode(row['Kode'] || row['Item Code']);
        const prodName = String(row['Produk'] || row['Item'] || '').trim();
        if (!skuCode || !prodName) continue;

        db.run(
          `INSERT OR IGNORE INTO dim_product (item_code, item_name, principal, category_sku, brand, group_sku, conversion_pcs_carton) VALUES (?, ?, 'SAVORIA', 'GENERAL', 'GENERAL', 'GENERAL', 1)`,
          [skuCode, prodName]
        );

        const saldoAdm = sanitizeNumber(row['Saldo Stok Administrasi'], 0);
        const bon = sanitizeNumber(row['Bon Produk'], 0);
        const avail = sanitizeNumber(row['Available Stock'], 0);
        const fisik = sanitizeNumber(row['Stok Fisik'], 0);
        const jalan = sanitizeNumber(row['Stok dalam Perjalanan'], 0);

        db.run(
          `INSERT OR REPLACE INTO fact_inventory_snapshot (
            snapshot_date, item_code, saldo_administrasi_ctn, bon_produk_ctn, available_stock_ctn, stok_fisik_ctn, stok_perjalanan_ctn, import_batch_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [snapshotDate, skuCode, saldoAdm, bon, avail, fisik, jalan, batchId]
        );
      }
    } else if (datasetType === 'AR') {
      const asOfDate = new Date().toISOString().split('T')[0];
      for (const row of rawRows) {
        const invNo = sanitizeCode(row['No Faktur'] || row['No Faktur Penjualan']);
        const custCode = sanitizeCode(row['Kode Outlet'] || row['Kode Pelanggan']);
        if (!invNo || !custCode) continue;

        let outletId = null;
        const alias = db.query(`SELECT outlet_id FROM outlet_alias WHERE source_customer_code = ?`, [custCode])[0];
        if (alias) {
          outletId = alias.outlet_id;
        } else {
          outletId = 'OUT_' + crypto.randomUUID();
          db.run(`INSERT INTO dim_outlet (outlet_id, canonical_name, cluster_tier) VALUES (?, ?, 'retail 1')`, [outletId, String(row['Outlet'] || row['Nama Pelanggan'] || custCode)]);
          db.run(`INSERT INTO outlet_alias (alias_id, outlet_id, source_system, source_customer_code) VALUES (?, ?, 'ERP', ?)`, ['AL_' + crypto.randomUUID(), outletId, custCode]);
        }

        const invDate = sanitizeDate(row['Tgl Faktur']) || asOfDate;
        const dueDate = sanitizeDate(row['Tgl J. Tempo']) || invDate;
        const netto = sanitizeNumber(row['Faktur Netto'] || row['Netto'], 0);
        const sudah = sanitizeNumber(row['Sudah Bayar'], 0);
        const saldo = sanitizeNumber(row['Saldo Piutang'] || row['Sisa Piutang'], netto);
        let overdueDays = parseInt(row['OD DAYS'] || row['Overdue Days'] || 0, 10);
        if (!overdueDays && dueDate) {
          const diffMs = new Date(asOfDate).getTime() - new Date(dueDate).getTime();
          overdueDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }

        db.run(
          `INSERT OR REPLACE INTO fact_ar_invoice (
            invoice_number, outlet_id, invoice_date, due_date, faktur_netto, sudah_bayar, saldo_piutang, overdue_days, as_of_date, import_batch_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [invNo, outletId, invDate, dueDate, netto, sudah, saldo, overdueDays, asOfDate, batchId]
        );
      }
    } else if (datasetType === 'TRANSACTIONS') {
      // Preload in-memory maps for high-throughput bulk insert
      const aliasRows = db.query(
        `SELECT a.source_customer_code, o.outlet_id, o.current_salesman_id 
         FROM outlet_alias a 
         JOIN dim_outlet o ON a.outlet_id = o.outlet_id`
      );
      const aliasMap = new Map();
      for (const ar of aliasRows) {
        aliasMap.set(ar.source_customer_code, {
          outlet_id: ar.outlet_id,
          current_salesman_id: ar.current_salesman_id
        });
      }

      const allSalesmen = db.query(`SELECT salesman_id, name, code FROM org_salesman`);

      const stmtProduct = db.raw.prepare(`
        INSERT OR REPLACE INTO dim_product (
          item_code, item_name, principal, category_sku, brand, group_sku, subbrand, conversion_pcs_carton, must_have_line
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const stmtOutlet = db.raw.prepare(`
        INSERT INTO dim_outlet (outlet_id, canonical_name, cluster_tier) VALUES (?, ?, 'retail 1')
      `);

      const stmtAlias = db.raw.prepare(`
        INSERT INTO outlet_alias (alias_id, outlet_id, source_system, source_customer_code) VALUES (?, ?, 'ERP', ?)
      `);

      const stmtHeader = db.raw.prepare(`
        INSERT OR REPLACE INTO fact_sales_header (
          document_number, transaction_date, due_date, outlet_id, invoice_salesman_id, current_owner_salesman_id,
          unit_type, payment_term_days, credit_limit, period_year, period_month, import_batch_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const stmtLine = db.raw.prepare(`
        INSERT INTO fact_sales_line (
          line_id, document_number, item_code, primary_quantity, carton_quantity, sales_before_discount,
          discount_amount, discount_distributor, discount_principal, sales_netto, vat_amount, dpp_amount,
          return_reason, is_non_omzet
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const monthMap = {
        'JAN': 1, 'JANUARI': 1, 'JANUARY': 1,
        'FEB': 2, 'FEBRUARI': 2, 'FEBRUARY': 2,
        'MAR': 3, 'MARET': 3, 'MARCH': 3,
        'APR': 4, 'APRIL': 4,
        'MEI': 5, 'MAY': 5,
        'JUN': 6, 'JUNI': 6, 'JUNE': 6,
        'JUL': 7, 'JULI': 7, 'JULY': 7,
        'AGU': 8, 'AGUSTUS': 8, 'AUG': 8, 'AUGUST': 8,
        'SEP': 9, 'SEPT': 9, 'SEPTEMBER': 9,
        'OKT': 10, 'OKTOBER': 10, 'OCT': 10, 'OCTOBER': 10,
        'NOP': 11, 'NOV': 11, 'NOPEMBER': 11, 'NOVEMBER': 11,
        'DES': 12, 'DEC': 12, 'DESEMBER': 12, 'DECEMBER': 12
      };

      for (const row of rawRows) {
        const docNo = sanitizeCode(row['Document Number'] || row['No Dokumen']);
        const custCode = sanitizeCode(row['Customer Code'] || row['Kode Outlet']);
        const itemCode = sanitizeCode(row['Item Code'] || row['Kode Item']);
        if (!docNo || !custCode || !itemCode) continue;

        const itemName = String(row['Item'] || itemCode).trim();
        const principal = String(row['Principal'] || 'SAVORIA').trim();
        const catSku = String(row['category sku'] || 'GENERAL').trim();
        const brand = String(row['Brand'] || 'GENERAL').trim();
        const groupSku = String(row['Group SKU'] || brand).trim();
        const subbrand = String(row['Subbrand'] || '').trim();
        const cPcsCtn = sanitizeNumber(row['Item Conversion 3'], 1);
        const mustHave = String(row['MUST HAVE DEC'] || 'NONE').trim();

        stmtProduct.run(itemCode, itemName, principal, catSku, brand, groupSku, subbrand, cPcsCtn, mustHave);

        let outletId = null;
        let currentOwnerId = null;
        const cachedAlias = aliasMap.get(custCode);

        if (cachedAlias) {
          outletId = cachedAlias.outlet_id;
          currentOwnerId = cachedAlias.current_salesman_id;
        } else {
          outletId = 'OUT_' + crypto.randomUUID();
          const custName = String(row['Customer Name'] || custCode).trim();
          stmtOutlet.run(outletId, custName);
          stmtAlias.run('AL_' + crypto.randomUUID(), outletId, custCode);
          aliasMap.set(custCode, { outlet_id: outletId, current_salesman_id: null });
        }

        const sName = String(row['Salesman (Transaction)'] || row['Salesman Code (Transaction)'] || '').trim();
        let invSalesId = '107075';
        const sMatch = allSalesmen.find(s => (sName && s.name.toLowerCase().includes(sName.toLowerCase())) || s.code === sName);
        if (sMatch) invSalesId = sMatch.salesman_id;
        if (!currentOwnerId) currentOwnerId = invSalesId;

        const txDate = sanitizeDate(row['Transaction Date']);
        const dueDate = sanitizeDate(row['Due Date']) || txDate;
        const unitType = String(row['Sales\'[Unit Type'] || row['Unit Type'] || 'Sales').trim();
        const payTerm = parseInt(row['Payment Term'] || 0, 10);
        const creditLimit = sanitizeNumber(row['Credit Limit'], 0);

        let pYear = parseInt(row['Year'] || row['Tahun'] || 0, 10);
        let pMonth = null;
        const monthRaw = String(row['MONTH'] || row['Month'] || row['Bulan'] || '').trim().toUpperCase();
        if (monthMap[monthRaw]) {
          pMonth = monthMap[monthRaw];
        }
        if (!pYear && txDate) {
          pYear = parseInt(txDate.split('-')[0], 10);
        }
        if (!pMonth && txDate) {
          pMonth = parseInt(txDate.split('-')[1], 10);
        }

        stmtHeader.run(docNo, txDate, dueDate, outletId, invSalesId, currentOwnerId, unitType, payTerm, creditLimit, pYear, pMonth, batchId);

        const lineId = 'L_' + crypto.randomUUID();
        const primaryQty = sanitizeNumber(row['Sales Primary Qty'], 0);
        const cartonQty = sanitizeNumber(row['Sales Ctn'] || row['Sales'], 0);
        const beforeDisc = sanitizeNumber(row['Sales Before Disc'], 0);
        const disc = sanitizeNumber(row['Discount Amount'], 0);
        const discDist = sanitizeNumber(row['Total Amount Distributor'], disc);
        const discPrin = sanitizeNumber(row['Total Amount Principal'], 0);
        const netto = sanitizeNumber(row['Sales Netto'], beforeDisc - disc);
        const vat = sanitizeNumber(row['Vat'], 0);
        const dpp = sanitizeNumber(row['Sales Netto - Vat'], netto - vat);
        const returReason = row['Retur Reason Name'] ? String(row['Retur Reason Name']).trim() : null;
        const isNonOmzet = Boolean(row['Is Non Omzet']) ? 1 : 0;

        stmtLine.run(lineId, docNo, itemCode, primaryQty, cartonQty, beforeDisc, disc, discDist, discPrin, netto, vat, dpp, returReason, isNonOmzet);
      }
    }

    db.run(
      `UPDATE import_batch SET status = 'COMMITTED', committed_at = CURRENT_TIMESTAMP WHERE batch_id = ?`,
      [batchId]
    );

    db.exec('COMMIT;');

    logAudit({
      userId: user.userId,
      userName: user.fullName,
      userRole: user.role,
      action: 'IMPORT_COMMIT',
      entityType: datasetType.toLowerCase(),
      entityId: batchId,
      afterState: { filename, totalRows: rawRows.length }
    });

    return {
      success: true,
      batchId,
      datasetType,
      committedRows: rawRows.length
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    db.run(`UPDATE import_batch SET status = 'FAILED', error_details_json = ? WHERE batch_id = ?`, [err.message, batchId]);
    throw err;
  }
}

function rollbackImport(batchId, user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' }) {
  const db = getDb();
  const batch = db.query(`SELECT * FROM import_batch WHERE batch_id = ?`, [batchId])[0];
  if (!batch) throw new Error(`Batch ${batchId} tidak ditemukan.`);
  if (batch.status === 'ROLLED_BACK') throw new Error(`Batch ${batchId} sudah pernah di-rollback.`);

  db.exec('BEGIN TRANSACTION;');
  try {
    if (batch.dataset_type === 'TRANSACTIONS') {
      db.run(`DELETE FROM fact_sales_line WHERE document_number IN (SELECT document_number FROM fact_sales_header WHERE import_batch_id = ?)`, [batchId]);
      db.run(`DELETE FROM fact_sales_header WHERE import_batch_id = ?`, [batchId]);
    } else if (batch.dataset_type === 'TARGETS') {
      db.run(`DELETE FROM fact_quantity_target WHERE import_batch_id = ?`, [batchId]);
    } else if (batch.dataset_type === 'STOCK') {
      db.run(`DELETE FROM fact_inventory_snapshot WHERE import_batch_id = ?`, [batchId]);
    } else if (batch.dataset_type === 'AR') {
      db.run(`DELETE FROM fact_ar_invoice WHERE import_batch_id = ?`, [batchId]);
    }

    db.run(`UPDATE import_batch SET status = 'ROLLED_BACK' WHERE batch_id = ?`, [batchId]);
    db.exec('COMMIT;');

    logAudit({
      userId: user.userId,
      userName: user.fullName,
      userRole: user.role,
      action: 'IMPORT_ROLLBACK',
      entityType: batch.dataset_type.toLowerCase(),
      entityId: batchId,
      beforeState: { status: batch.status, rows: batch.valid_rows }
    });

    return { success: true, batchId, status: 'ROLLED_BACK' };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

module.exports = {
  detectDatasetType,
  sanitizeNumber,
  sanitizeDate,
  sanitizeCode,
  dryRunValidate,
  commitImport,
  rollbackImport
};
