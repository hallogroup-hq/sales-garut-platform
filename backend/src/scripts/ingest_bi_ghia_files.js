const fs = require('node:fs');
const path = require('node:path');
const xlsx = require('xlsx');
const { getDb } = require('../db/connection.js');

const MONTH_MAP = {
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
  'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
};

const SALESMAN_NAME_MAP = {
  'ANDI AGUNG GUMILAR': { id: '305032', name: 'ANDI AGUNG GUMILAR', group: 'SAVORIA' },
  'Ibna Faizal Rahman': { id: '305030', name: 'Ibna Faizal Rahman', group: 'SAVORIA' },
  'Mega Nugraha': { id: '305029', name: 'Mega Nugraha', group: 'SAVORIA' },
  'Muhamad Fikri Hambali': { id: '107075', name: 'Muhamad Fikri Hambali', group: 'SAVORIA' },
  'Muhammad Zulfa Akbar': { id: '305033', name: 'Muhammad Zulfa Akbar', group: 'SAVORIA' },
  'Mulyana': { id: '305028', name: 'Mulyana', group: 'SAVORIA' },
  'Risan Setiawan': { id: '305031', name: 'Risan Setiawan', group: 'SAVORIA' },
  'DSM_GARUT': { id: 'DSM_GARUT', name: 'DSM GARUT', group: 'SAVORIA' },
  'DSM GARUT': { id: 'DSM_GARUT', name: 'DSM GARUT', group: 'SAVORIA' }
};

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
  return parseFloat(str) || 0;
}

function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (s.includes('/')) {
    const [d, m, y] = s.split('/');
    if (d && m && y) {
      return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

async function ingestStockGudang(db, stockPath) {
  console.log(`\n========================================`);
  console.log(`[1/3] INGESTING STOCK GUDANG: ${stockPath}`);
  console.log(`========================================`);
  if (!fs.existsSync(stockPath)) {
    console.warn(`File not found: ${stockPath}`);
    return;
  }
  const wb = xlsx.readFile(stockPath);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const snapshotDate = '2026-09-25';

  db.exec('BEGIN TRANSACTION;');
  const stmtProd = db.raw.prepare(`
    INSERT INTO dim_product (item_code, item_name, principal, category_sku, brand, group_sku)
    VALUES (?, ?, 'SAVORIA', ?, 'SAVORIA', ?)
    ON CONFLICT (item_code) DO UPDATE SET
      item_name=EXCLUDED.item_name,
      group_sku=COALESCE(EXCLUDED.group_sku, dim_product.group_sku)
  `);

  const stmtSnap = db.raw.prepare(`
    INSERT INTO fact_inventory_snapshot (
      snapshot_date, item_code, saldo_administrasi_ctn, bon_produk_ctn,
      available_stock_ctn, stok_fisik_ctn, stok_perjalanan_ctn
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (snapshot_date, item_code) DO UPDATE SET
      saldo_administrasi_ctn=EXCLUDED.saldo_administrasi_ctn,
      bon_produk_ctn=EXCLUDED.bon_produk_ctn,
      available_stock_ctn=EXCLUDED.available_stock_ctn,
      stok_fisik_ctn=EXCLUDED.stok_fisik_ctn,
      stok_perjalanan_ctn=EXCLUDED.stok_perjalanan_ctn
  `);

  let count = 0;
  for (const r of rows) {
    const itemCode = String(r['Kode'] || r['SKU'] || '').trim();
    if (!itemCode) continue;
    const itemName = String(r['Produk'] || '').trim();
    const groupSku = String(r['SKU GROUP'] || '').trim() || 'OTHERS';

    stmtProd.run(itemCode, itemName, groupSku, groupSku);

    const saldoAdm = parseIndonesianNumber(r['Saldo Stok Administrasi']);
    const bonProd = parseIndonesianNumber(r['Bon Produk']);
    const availStock = parseIndonesianNumber(r['Available Stock']);
    const stokFisik = parseIndonesianNumber(r['Stok Fisik']);
    const stokTransit = parseIndonesianNumber(r['Stok dalam Perjalanan']);

    stmtSnap.run(snapshotDate, itemCode, saldoAdm, bonProd, availStock, stokFisik, stokTransit);
    count++;
  }
  db.exec('COMMIT;');
  console.log(`✓ Ingested ${count} inventory snapshot items for date ${snapshotDate}.`);
}

async function ingestDataPiutang(db, arPath) {
  console.log(`\n========================================`);
  console.log(`[2/3] INGESTING DATA PIUTANG: ${arPath}`);
  console.log(`========================================`);
  if (!fs.existsSync(arPath)) {
    console.warn(`File not found: ${arPath}`);
    return;
  }
  const wb = xlsx.readFile(arPath);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const asOfDateStr = '2026-09-25';
  const asOfDate = new Date(asOfDateStr);

  db.exec('BEGIN TRANSACTION;');
  // Clear old ar invoice data so active invoices reflect current state
  db.exec('DELETE FROM fact_ar_invoice;');

  const stmtOutlet = db.raw.prepare(`
    INSERT INTO dim_outlet (outlet_id, canonical_name, is_mbg, channel, is_active_cl)
    VALUES (?, ?, 0, 'GT', 0)
    ON CONFLICT (outlet_id) DO NOTHING
  `);

  const stmtAlias = db.raw.prepare(`
    INSERT INTO outlet_alias (alias_id, outlet_id, source_system, source_customer_code, source_customer_name)
    VALUES (?, ?, 'ERP', ?, ?)
    ON CONFLICT (alias_id) DO NOTHING
  `);

  const stmtAr = db.raw.prepare(`
    INSERT INTO fact_ar_invoice (
      invoice_number, outlet_id, salesman_id, invoice_date, due_date,
      faktur_netto, sudah_bayar, saldo_piutang, overdue_days, as_of_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (invoice_number) DO UPDATE SET
      outlet_id=EXCLUDED.outlet_id,
      salesman_id=EXCLUDED.salesman_id,
      saldo_piutang=EXCLUDED.saldo_piutang,
      sudah_bayar=EXCLUDED.sudah_bayar,
      overdue_days=EXCLUDED.overdue_days,
      as_of_date=EXCLUDED.as_of_date
  `);

  // Preload alias map
  const aliasMap = new Map();
  db.query('SELECT source_customer_code, outlet_id FROM outlet_alias').forEach(r => {
    aliasMap.set(String(r.source_customer_code).trim(), r.outlet_id);
  });
  const outletSet = new Set(db.query('SELECT outlet_id FROM dim_outlet').map(r => r.outlet_id));
  const salesmanMap = new Map();
  db.query('SELECT outlet_id, current_salesman_id FROM dim_outlet').forEach(r => {
    salesmanMap.set(r.outlet_id, r.current_salesman_id);
  });

  let count = 0;
  let totalSaldo = 0;
  for (const r of rows) {
    const invNum = String(r['No Faktur'] || '').trim();
    const code = String(r['Kode Outlet'] || '').trim();
    if (!invNum || !code || invNum.toLowerCase().includes('total') || code.toLowerCase().includes('total')) continue;

    let canonicalOutletId = aliasMap.get(code);
    if (!canonicalOutletId) {
      if (outletSet.has(code)) {
        canonicalOutletId = code;
      } else {
        canonicalOutletId = `OUT_AR_${code}`;
        const outName = String(r['Outlet'] || code).trim();
        stmtOutlet.run(canonicalOutletId, outName);
        stmtAlias.run(`AL_AR_${code}`, canonicalOutletId, code, outName);
        outletSet.add(canonicalOutletId);
        aliasMap.set(code, canonicalOutletId);
      }
    }

    const invDate = parseDate(r['Tgl Faktur']) || asOfDateStr;
    const dueDate = parseDate(r['Tgl J. Tempo']) || invDate;
    const fakturNetto = parseIndonesianNumber(r['Faktur Netto']);
    const sudahBayar = parseIndonesianNumber(r['Sudah Bayar']);
    const saldoPiutang = parseIndonesianNumber(r['Saldo Piutang']);

    const dueObj = new Date(dueDate);
    const diffMs = asOfDate.getTime() - dueObj.getTime();
    const overdueDays = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
    const salesmanId = salesmanMap.get(canonicalOutletId) || null;

    stmtAr.run(invNum, canonicalOutletId, salesmanId, invDate, dueDate, fakturNetto, sudahBayar, saldoPiutang, overdueDays, asOfDateStr);
    totalSaldo += saldoPiutang;
    count++;
  }
  db.exec('COMMIT;');
  console.log(`✓ Ingested ${count} active AR invoices with total saldo Rp ${Math.round(totalSaldo).toLocaleString('id-ID')}.`);
}

async function ingestMasterData(db, scratchDir) {
  console.log(`\n========================================`);
  console.log(`[3/3] INGESTING MASTER DATA FROM STREAM`);
  console.log(`========================================`);

  const strPath = path.join(scratchDir, 'sharedStrings.xml');
  const sheetPath = path.join(scratchDir, 'sheet1.xml');

  if (!fs.existsSync(strPath) || !fs.existsSync(sheetPath)) {
    console.error(`Extracted XML not found in ${scratchDir}! Please ensure sharedStrings.xml and sheet1.xml exist.`);
    return;
  }

  console.log('Loading shared strings from disk...');
  const t0 = Date.now();
  const strings = [];
  let fullStrXml = fs.readFileSync(strPath, 'utf8');
  const siRegex = /<si>(.*?)<\/si>/gs;
  const tRegex = /<t[^>]*>(.*?)<\/t>/gs;
  let siMatch;
  while ((siMatch = siRegex.exec(fullStrXml)) !== null) {
    const siContent = siMatch[1];
    let tMatch;
    let s = '';
    while ((tMatch = tRegex.exec(siContent)) !== null) {
      s += tMatch[1];
    }
    s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    strings.push(s);
  }
  fullStrXml = null;
  console.log(`Loaded ${strings.length} shared strings in ${(Date.now() - t0) / 1000}s.`);

  console.log('Streaming sheet1.xml and computing monthly aggregation & 2026 transactions...');
  const sheetStream = fs.createReadStream(sheetPath, { encoding: 'utf8', highWaterMark: 256 * 1024 });

  const agg = new Map();
  const productsSeen = new Map();
  const outletsSeen = new Map();
  const dsoOaMonthly = new Map();
  const smOaMonthly = new Map();

  const headers2026 = new Map();
  const lines2026 = [];

  function parseCell(cellXml) {
    const rMatch = cellXml.match(/r="([A-Z]+)(\d+)"/);
    if (!rMatch) return null;
    const col = rMatch[1];
    const isStr = cellXml.includes('t="s"');
    const vMatch = cellXml.match(/<v>(.*?)<\/v>/);
    const rawVal = vMatch ? vMatch[1] : '';
    let val = rawVal;
    if (isStr && rawVal !== '') {
      val = strings[parseInt(rawVal, 10)] || '';
    }
    return { col, val };
  }

  let rowCount = 0;
  let buffer = '';

  function processRow(rowXml) {
    if (rowXml.startsWith('<row r="1"')) return;
    rowCount++;

    const cells = rowXml.match(/<c [^>]*>(?:<v>.*?<\/v>)?<\/c>|<c [^>]*\/>/g);
    if (!cells) return;

    let yearVal = 0;
    let monthRaw = '';
    let smCode = '';
    let smName = '';
    let txDateRaw = '';
    let dueDateRaw = '';
    let docNum = '';
    let payTerm = 0;
    let kecName = '';
    let custCode = '';
    let custName = '';
    let unitType = 'Sales';
    let principal = 'SAVORIA';
    let brand = 'OTHERS';
    let subbrand = '';
    let itemCode = '';
    let itemName = '';
    let cPcsCtn = 1;
    let primaryQty = 0;
    let salesCtn = 0;
    let beforeDisc = 0;
    let discAmt = 0;
    let salesNetto = 0;
    let vatAmt = 0;
    let salesDpp = 0;
    let returReason = '';
    let creditLimit = 0;
    let isNonOmzet = 0;
    let groupSku = '';
    let mustHave = 'NONE';
    let salesGroup = 'SAVORIA';
    let isMbg = 0;
    let rayon = '';
    let cluster = '';
    let categorySku = 'OTHERS';

    for (const c of cells) {
      const p = parseCell(c);
      if (!p) continue;
      const col = p.col;
      const val = p.val;

      if (col === 'D') yearVal = parseInt(val, 10) || 0;
      else if (col === 'E') monthRaw = val;
      else if (col === 'H') smCode = val.trim();
      else if (col === 'I') smName = val.trim();
      else if (col === 'L') txDateRaw = val;
      else if (col === 'M') dueDateRaw = val;
      else if (col === 'N') docNum = val.trim();
      else if (col === 'Q') payTerm = parseInt(val, 10) || 0;
      else if (col === 'T') kecName = val.trim();
      else if (col === 'Z') custCode = val.trim();
      else if (col === 'AA') custName = val.trim();
      else if (col === 'AB') unitType = val.trim() || 'Sales';
      else if (col === 'AC') principal = val.trim() || 'SAVORIA';
      else if (col === 'AD') brand = val.trim() || 'OTHERS';
      else if (col === 'AE') subbrand = val.trim();
      else if (col === 'AG') itemCode = val.trim();
      else if (col === 'AH') itemName = val.trim();
      else if (col === 'AK') cPcsCtn = parseFloat(val) || 1;
      else if (col === 'AL') primaryQty = parseFloat(val) || 0;
      else if (col === 'AM') salesCtn = parseFloat(val) || 0;
      else if (col === 'AN') beforeDisc = parseFloat(val) || 0;
      else if (col === 'AO') discAmt = parseFloat(val) || 0;
      else if (col === 'AP') salesNetto = parseFloat(val) || 0;
      else if (col === 'AQ') vatAmt = parseFloat(val) || 0;
      else if (col === 'AS') salesDpp = parseFloat(val) || 0;
      else if (col === 'AT') returReason = val.trim();
      else if (col === 'AX') creditLimit = parseFloat(val) || 0;
      else if (col === 'BC') isNonOmzet = (val === '1' ? 1 : 0);
      else if (col === 'BL') groupSku = val.trim() || brand;
      else if (col === 'BM') mustHave = val.trim() || 'NONE';
      else if (col === 'BN') salesGroup = val.trim() || 'SAVORIA';
      else if (col === 'BO') isMbg = (val.toUpperCase().includes('MBG') ? 1 : 0);
      else if (col === 'BQ') rayon = val.trim();
      else if (col === 'BS') cluster = val.trim();
      else if (col === 'BT') categorySku = val.trim() || 'OTHERS';
    }

    if (yearVal < 2020) return;
    const monthClean = monthRaw.trim().toLowerCase().slice(0, 3);
    const monthVal = MONTH_MAP[monthClean] || 0;
    if (monthVal === 0) return;

    let smId = 'SAVORIA_OTH';
    let smCanonicalName = smName || 'Savoria (Others)';
    if (SALESMAN_NAME_MAP[smName]) {
      smId = SALESMAN_NAME_MAP[smName].id;
      smCanonicalName = SALESMAN_NAME_MAP[smName].name;
    } else if (salesGroup.toUpperCase() === 'SCM' || salesGroup.toUpperCase() === 'SMC') {
      smId = 'SMC_GARUT';
      smCanonicalName = smName || 'SMC Garut Team';
    } else if (smName.toUpperCase().includes('DSM')) {
      smId = 'DSM_GARUT';
      smCanonicalName = 'DSM GARUT';
    } else if (smCode) {
      smId = smCode;
    }

    if (itemCode && !productsSeen.has(itemCode)) {
      productsSeen.set(itemCode, {
        item_code: itemCode,
        item_name: itemName || itemCode,
        principal: principal || 'SAVORIA',
        category_sku: categorySku,
        brand: brand || 'OTHERS',
        subbrand: subbrand || '',
        group_sku: groupSku || brand,
        conversion_pcs_carton: cPcsCtn,
        must_have_line: mustHave
      });
    }

    if (custCode && !outletsSeen.has(custCode)) {
      outletsSeen.set(custCode, {
        customer_code: custCode,
        customer_name: custName || custCode,
        kecamatan: kecName,
        rayon: rayon,
        cluster: cluster,
        is_mbg: isMbg
      });
    }

    const aggKey = `${yearVal}_${monthVal}_${smId}_${principal}_${brand}_${groupSku}`;
    let entry = agg.get(aggKey);
    if (!entry) {
      entry = {
        year: yearVal,
        month: monthVal,
        salesman_id: smId,
        salesman_name: smCanonicalName,
        sales_group: salesGroup,
        principal: principal,
        brand: brand,
        group_sku: groupSku,
        netCtn: 0,
        grossCtn: 0,
        returCtn: 0,
        netVal: 0,
        dppVal: 0,
        outlets: new Set(),
        invoices: new Set()
      };
      agg.set(aggKey, entry);
    }

    if (!isNonOmzet) {
      entry.netCtn += salesCtn;
      entry.netVal += salesNetto;
      entry.dppVal += salesDpp;

      if (salesCtn > 0) {
        entry.grossCtn += salesCtn;
      } else {
        entry.returCtn += Math.abs(salesCtn);
      }

      if (custCode && salesCtn > 0) {
        entry.outlets.add(custCode);
      }
      if (docNum) {
        entry.invoices.add(docNum);
      }

      if (yearVal === 2026 && custCode && salesCtn > 0) {
        const periodKey = `2026-${String(monthVal).padStart(2, '0')}`;
        if (!dsoOaMonthly.has(periodKey)) dsoOaMonthly.set(periodKey, new Set());
        dsoOaMonthly.get(periodKey).add(custCode);

        const smKey = `${periodKey}_${smId}`;
        if (!smOaMonthly.has(smKey)) smOaMonthly.set(smKey, new Set());
        smOaMonthly.get(smKey).add(custCode);
      }
    }

    if (yearVal === 2026 && docNum && custCode && itemCode) {
      let txDate = parseDate(txDateRaw) || '2026-09-01';
      let dueDate = parseDate(dueDateRaw) || txDate;

      if (!headers2026.has(docNum)) {
        headers2026.set(docNum, [
          docNum, txDate, dueDate, custCode, smId, smId,
          unitType, payTerm, creditLimit, yearVal, monthVal
        ]);
      }

      const lineId = `LN_${docNum}_${lines2026.length + 1}`;
      lines2026.push([
        lineId, docNum, itemCode, primaryQty, salesCtn,
        beforeDisc, discAmt, 0, 0, salesNetto, vatAmt, salesDpp,
        returReason || null, isNonOmzet
      ]);
    }

    if (rowCount % 50000 === 0) {
      console.log(`  Processed ${rowCount.toLocaleString()} rows...`);
    }
  }

  for await (const chunk of sheetStream) {
    buffer += chunk;
    let rowStartIdx;
    while ((rowStartIdx = buffer.indexOf('<row ')) !== -1) {
      const rowEndIdx = buffer.indexOf('</row>', rowStartIdx);
      if (rowEndIdx === -1) {
        buffer = buffer.slice(rowStartIdx);
        break;
      }
      processRow(buffer.slice(rowStartIdx, rowEndIdx + 6));
      buffer = buffer.slice(rowEndIdx + 6);
    }
  }

  console.log(`\nFinished scanning ${rowCount.toLocaleString()} rows.`);
  console.log(`Aggregation groups: ${agg.size.toLocaleString()}`);
  console.log(`2026 Headers: ${headers2026.size.toLocaleString()}, Lines: ${lines2026.length.toLocaleString()}`);
  console.log(`Unique Outlets: ${outletsSeen.size.toLocaleString()}, Products: ${productsSeen.size.toLocaleString()}`);

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');

  // 1. Upsert Products
  console.log('\nUpserting products into dim_product...');
  const stmtProduct = db.raw.prepare(`
    INSERT INTO dim_product (
      item_code, item_name, principal, category_sku, brand, subbrand,
      group_sku, conversion_pcs_carton, must_have_line
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (item_code) DO UPDATE SET
      item_name=EXCLUDED.item_name,
      principal=EXCLUDED.principal,
      brand=EXCLUDED.brand,
      subbrand=COALESCE(EXCLUDED.subbrand, dim_product.subbrand),
      group_sku=COALESCE(EXCLUDED.group_sku, dim_product.group_sku),
      category_sku=COALESCE(EXCLUDED.category_sku, dim_product.category_sku),
      conversion_pcs_carton=COALESCE(EXCLUDED.conversion_pcs_carton, dim_product.conversion_pcs_carton),
      must_have_line=COALESCE(EXCLUDED.must_have_line, dim_product.must_have_line)
  `);

  for (const p of productsSeen.values()) {
    stmtProduct.run(
      p.item_code, p.item_name, p.principal, p.category_sku, p.brand,
      p.subbrand, p.group_sku, p.conversion_pcs_carton, p.must_have_line
    );
  }

  // 2. Upsert Outlets & Kecamatans
  console.log('Upserting outlets, kecamatans, and aliases...');
  const stmtKec = db.raw.prepare(`
    INSERT OR IGNORE INTO dim_kecamatan (kecamatan_id, name) VALUES (?, ?)
  `);

  const stmtOutlet = db.raw.prepare(`
    INSERT INTO dim_outlet (
      outlet_id, canonical_name, kecamatan_id, current_rayon_id, cluster_tier, is_mbg, is_active_cl
    ) VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT (outlet_id) DO UPDATE SET
      canonical_name=COALESCE(EXCLUDED.canonical_name, dim_outlet.canonical_name),
      kecamatan_id=COALESCE(EXCLUDED.kecamatan_id, dim_outlet.kecamatan_id),
      current_rayon_id=COALESCE(EXCLUDED.current_rayon_id, dim_outlet.current_rayon_id),
      cluster_tier=COALESCE(EXCLUDED.cluster_tier, dim_outlet.cluster_tier),
      is_mbg=COALESCE(EXCLUDED.is_mbg, dim_outlet.is_mbg)
  `);

  const stmtAlias = db.raw.prepare(`
    INSERT OR IGNORE INTO outlet_alias (alias_id, outlet_id, source_system, source_customer_code, source_customer_name)
    VALUES (?, ?, 'ERP', ?, ?)
  `);

  for (const o of outletsSeen.values()) {
    let kecId = null;
    if (o.kecamatan) {
      kecId = 'KEC_' + o.kecamatan.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      stmtKec.run(kecId, o.kecamatan);
    }
    stmtOutlet.run(o.customer_code, o.customer_name, kecId, o.rayon || null, o.cluster || 'retail 1', o.is_mbg);
    stmtAlias.run(`AL_${o.customer_code}`, o.customer_code, o.customer_code, o.customer_name);
  }

  // 3. Clear and repopulate agg_monthly_sales_movement
  console.log('Repopulating agg_monthly_sales_movement...');
  db.exec('DELETE FROM agg_monthly_sales_movement;');
  const stmtAgg = db.raw.prepare(`
    INSERT OR REPLACE INTO agg_monthly_sales_movement (
      id, year, month, period_key, salesman_id, salesman_name, sales_group,
      principal, brand, group_sku, net_cartons, gross_cartons, retur_cartons,
      net_value, dpp_value, active_outlets, total_invoices
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const [key, d] of agg.entries()) {
    const periodKey = `${d.year}-${String(d.month).padStart(2, '0')}`;
    const rowId = `${d.year}_${String(d.month).padStart(2, '0')}_${d.salesman_id}_${d.principal.slice(0, 10)}_${d.brand.slice(0, 15)}_${d.group_sku.slice(0, 15)}`.replace(/\s+/g, '_');
    stmtAgg.run(
      rowId, d.year, d.month, periodKey, d.salesman_id, d.salesman_name, d.sales_group,
      d.principal, d.brand, d.group_sku,
      Math.round(d.netCtn * 10000) / 10000,
      Math.round(d.grossCtn * 10000) / 10000,
      Math.round(d.returCtn * 10000) / 10000,
      Math.round(d.netVal * 100) / 100,
      Math.round(d.dppVal * 100) / 100,
      d.outlets.size,
      d.invoices.size
    );
  }

  // 4. Update fact_distinct_active_outlet for 2026
  console.log('Updating fact_distinct_active_outlet for 2026...');
  const stmtDao = db.raw.prepare(`
    INSERT INTO fact_distinct_active_outlet (
      id, year, month, period_key, salesman_id, salesman_name, sales_group, group_sku, distinct_active_outlets
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ALL', ?)
    ON CONFLICT (id) DO UPDATE SET
      distinct_active_outlets=EXCLUDED.distinct_active_outlets
  `);

  for (const [periodKey, oSet] of dsoOaMonthly.entries()) {
    const [yStr, mStr] = periodKey.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const id = `${y}_${periodKey}_DSO_ALL`;
    stmtDao.run(id, y, m, periodKey, 'DSO', 'DSO GARUT', 'SAVORIA', oSet.size);
  }

  for (const [smKey, oSet] of smOaMonthly.entries()) {
    const [periodKey, smId] = smKey.split('_');
    const [yStr, mStr] = periodKey.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const id = `${y}_${periodKey}_${smId}_ALL`;
    const smName = SALESMAN_NAME_MAP[smId] ? SALESMAN_NAME_MAP[smId].name : smId;
    stmtDao.run(id, y, m, periodKey, smId, smName, 'SAVORIA', oSet.size);
  }

  // 5. Ingest 2026 headers & lines
  console.log('Ingesting 2026 fact_sales_header & fact_sales_line...');
  db.exec('DELETE FROM fact_sales_line WHERE document_number IN (SELECT document_number FROM fact_sales_header WHERE period_year = 2026);');
  db.exec('DELETE FROM fact_sales_header WHERE period_year = 2026;');

  const stmtHeader = db.raw.prepare(`
    INSERT INTO fact_sales_header (
      document_number, transaction_date, due_date, outlet_id, invoice_salesman_id,
      current_owner_salesman_id, unit_type, payment_term_days, credit_limit,
      period_year, period_month
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const h of headers2026.values()) {
    stmtHeader.run(...h);
  }

  const stmtLine = db.raw.prepare(`
    INSERT INTO fact_sales_line (
      line_id, document_number, item_code, primary_quantity, carton_quantity,
      sales_before_discount, discount_amount, discount_distributor, discount_principal,
      sales_netto, vat_amount, dpp_amount, return_reason, is_non_omzet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let lineCount = 0;
  for (const l of lines2026) {
    stmtLine.run(...l);
    lineCount++;
  }

  db.exec('COMMIT;');
  db.exec('PRAGMA foreign_keys = ON;');
  console.log(`✓ Ingested ${headers2026.size.toLocaleString()} headers and ${lineCount.toLocaleString()} lines for 2026.`);
}

async function runBiGhiaIngestion() {
  const tStart = Date.now();
  const db = getDb();
  const scratchDir = 'C:\\Users\\DsmGarut\\.gemini\\antigravity\\brain\\864e5b2a-0cad-4e8f-a8ac-23c423e34498\\scratch';
  const uploadDir = 'D:\\monthly tracking\\FILE UPLOAD BI GHIA';

  const stockPath = path.join(uploadDir, 'stock gudang.xlsx');
  const arPath = path.join(uploadDir, 'data piutang.xlsx');

  await ingestStockGudang(db, stockPath);
  await ingestDataPiutang(db, arPath);
  await ingestMasterData(db, scratchDir);

  console.log('\nRunning SQLite WAL Checkpoint & Vacuum...');
  db.exec('PRAGMA wal_checkpoint(FULL);');
  db.exec('PRAGMA optimize;');

  const rootDb = path.resolve(__dirname, '../../../sales_garut.db');
  const backendDb = path.resolve(__dirname, '../../sales_garut.db');
  try {
    if (fs.existsSync(rootDb)) {
      fs.copyFileSync(rootDb, backendDb);
      console.log(`✓ Synchronized ${rootDb} -> ${backendDb}`);
    }
  } catch (err) {
    console.error('Failed to copy db to backend:', err.message);
  }

  const totalTime = ((Date.now() - tStart) / 1000).toFixed(1);
  console.log(`\n======================================================`);
  console.log(`🎉 BI GHIA FILES INGESTION COMPLETED IN ${totalTime}s!`);
  console.log(`======================================================`);

  const sepTotal = db.query(`
    SELECT 
      SUM(net_cartons) as cartons,
      SUM(net_value) as netto,
      SUM(active_outlets) as total_oa
    FROM agg_monthly_sales_movement
    WHERE year = 2026 AND month = 9
  `)[0];
  console.log(`September 2026 Aggregation in DB: ${sepTotal.cartons.toFixed(2)} KTN | Rp ${Math.round(sepTotal.netto).toLocaleString('id-ID')}`);
}

if (require.main === module) {
  runBiGhiaIngestion().catch(console.error);
}

module.exports = { runBiGhiaIngestion };
