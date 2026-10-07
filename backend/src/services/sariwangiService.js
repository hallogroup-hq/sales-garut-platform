/**
 * SARIWANGI DEDICATED ANALYTICS SERVICE — Sales Garut Platform
 * 
 * Provides end-to-end analytics specifically for Unilever / SariWangi products:
 * 1. Summary KPIs: Total Volume (Ktn), Total Netto (Rp), Total OA, Total OC, Dropsize (ktn/OC), Omzet/OC.
 * 2. Dropsize distribution per OC (< 0.5 ktn, 0.5 - 1.0 ktn, > 1.0 ktn, and >= 6 ktn promo GT).
 * 3. Outlets Table with all SKU volume breakdown and human-friendly recency (days, 1 week, > 1 week, > 2 week).
 * 4. Kabupaten Garut geographic distribution across all 42 kecamatans.
 * 5. Strata promo adoption for the 6 Selected SKUs GT and upsell pipeline.
 * 6. Salesman leaderboard & Rayon breakdown for SariWangi.
 */

const {
  SARIWANGI_SELECTED_SKUS,
  SARIWANGI_REGULER_TIERS,
  SARIWANGI_SELECTED_TIERS,
  isSariwangiSelectedSku,
  getDiscountForQty
} = require('./discountStrata.js');

function formatRecency(daysAgo) {
  if (daysAgo <= 0) return { label: '0 days lalu', badge: 'emerald', key: 'days' };
  if (daysAgo < 7) return { label: `${daysAgo} days lalu`, badge: 'emerald', key: 'days' };
  if (daysAgo < 14) return { label: '1 week lalu', badge: 'blue', key: '1week' };
  if (daysAgo < 21) return { label: '> 1 week lalu', badge: 'amber', key: 'gt1week' };
  return { label: '> 2 week lalu', badge: 'rose', key: 'gt2week' };
}

function getDropsizeBracket(cartons) {
  const c = parseFloat(cartons) || 0;
  if (c < 0.5) return { key: 'under_half', label: '< 1/2 Karton', badge: 'slate' };
  if (c <= 1.0) return { key: 'half_to_one', label: '1/2 - 1 Karton', badge: 'sky' };
  if (c < 6.0) return { key: 'one_to_six', label: '1 - 6 Karton', badge: 'indigo' };
  return { key: 'ge_six', label: '≥ 6 Karton (Promo GT)', badge: 'emerald' };
}

function calculateStrataDiscount(totalCartons, hasSelectedSku) {
  const q = parseFloat(totalCartons) || 0;
  // Regular tier
  let regDisc = 0;
  if (q >= 11) regDisc = 1.25;
  else if (q >= 6) regDisc = 1.00;
  else if (q >= 1) regDisc = 0.75;

  // Selected SKU promo tier
  let selDisc = 0;
  if (hasSelectedSku) {
    if (q >= 100) selDisc = 7.00;
    else if (q >= 50) selDisc = 5.00;
    else if (q >= 20) selDisc = 3.00;
    else if (q >= 6) selDisc = 2.00;
  }

  const totalDisc = Math.round((regDisc + selDisc) * 100) / 100;

  // Next upsell suggestion
  let upsellTip = null;
  if (hasSelectedSku) {
    if (q < 6 && q >= 3) {
      upsellTip = `+${(6 - q).toFixed(1)} ktn ke Promo 2% (+1% Reguler = 3%)`;
    } else if (q < 20 && q >= 15) {
      upsellTip = `+${(20 - q).toFixed(1)} ktn ke Promo 3% (+1.25% Reguler = 4.25%)`;
    } else if (q < 50 && q >= 40) {
      upsellTip = `+${(50 - q).toFixed(1)} ktn ke Promo 5% (+1.25% Reguler = 6.25%)`;
    }
  } else {
    if (q < 1) {
      upsellTip = `+${(1 - q).toFixed(1)} ktn ke Diskon Reguler 0.75%`;
    } else if (q < 6 && q >= 4) {
      upsellTip = `+${(6 - q).toFixed(1)} ktn ke Reguler 1.00%`;
    } else if (q < 11 && q >= 8) {
      upsellTip = `+${(11 - q).toFixed(1)} ktn ke Reguler Maks 1.25%`;
    }
  }

  return { regDisc, selDisc, totalDisc, upsellTip };
}

function getSariwangiAnalytics(db, filters = {}) {
  const sqlite = db.raw || db;
  const {
    salesman = '',
    rayon = '',
    kecamatan = '',
    skuType = 'ALL', // 'ALL', 'SELECTED', 'REGULER'
    period = '', // e.g. '2026-09' or empty for all 2026
    search = ''
  } = filters;

  // Base conditions for SariWangi products
  // Product is SariWangi / Unilever
  const isSelectedCodeSql = SARIWANGI_SELECTED_SKUS.map(s => `'${s}'`).join(',');
  const isSelectedSuffixSql = SARIWANGI_SELECTED_SKUS.map(s => `'${s}U'`).join(',');

  // Build WHERE conditions
  const whereClauses = [
    "(p.principal LIKE '%UNILEVER%' OR p.brand LIKE '%SARI%' OR p.item_name LIKE '%SARIWANGI%' OR p.item_name LIKE '%SARIMURNI%')",
    "l.is_non_omzet = 0"
  ];
  const params = [];

  if (skuType === 'TB288') {
    whereClauses.push("(p.item_code LIKE '%68143147%' OR p.item_name LIKE '%SARIWANGI ASLI RL TB 288%')");
  } else if (skuType === 'TB48') {
    whereClauses.push("(p.item_code LIKE '%68143151%' OR p.item_name LIKE '%SARIWANGI ASLI RL TB 48X%')");
  } else if (skuType === 'SELECTED') {
    whereClauses.push(`(p.item_code IN (${isSelectedCodeSql}, ${isSelectedSuffixSql}) OR p.item_name LIKE '%SARIWANGI ASLI RL TB 48X%' OR p.item_name LIKE '%SARIWANGI ASLI RL TB 288X%' OR p.item_name LIKE '%SARIWANGI MELATI RL TB 48X%' OR p.item_name LIKE '%SARIMURNI RL TB 48X%' OR p.item_name LIKE '%SARIMURNI RL RB 180X%' OR p.item_name LIKE '%SARIMURNI RL RB 48X%')`);
  } else if (skuType === 'REGULER') {
    whereClauses.push(`NOT (p.item_code IN (${isSelectedCodeSql}, ${isSelectedSuffixSql}) OR p.item_name LIKE '%SARIWANGI ASLI RL TB 48X%' OR p.item_name LIKE '%SARIWANGI ASLI RL TB 288X%' OR p.item_name LIKE '%SARIWANGI MELATI RL TB 48X%' OR p.item_name LIKE '%SARIMURNI RL TB 48X%' OR p.item_name LIKE '%SARIMURNI RL RB 180X%' OR p.item_name LIKE '%SARIMURNI RL RB 48X%')`);
  }

  if (period && period !== 'ALL') {
    const pParts = period.split('-');
    if (pParts.length === 2) {
      whereClauses.push("(h.period_year = ? AND h.period_month = ?)");
      params.push(parseInt(pParts[0], 10), parseInt(pParts[1], 10));
    } else {
      whereClauses.push("h.transaction_date LIKE ?");
      params.push(`${period}%`);
    }
  }

  if (salesman) {
    whereClauses.push("(h.invoice_salesman_id = ? OR UPPER(s.name) = UPPER(?) OR h.current_owner_salesman_id = ?)");
    params.push(salesman, salesman, salesman);
  }

  if (rayon) {
    whereClauses.push("(UPPER(r.name) = UPPER(?) OR UPPER(r.code) = UPPER(?) OR r.rayon_id = ?)");
    params.push(rayon, rayon, rayon);
  }

  if (kecamatan) {
    whereClauses.push("(UPPER(k.name) = UPPER(?) OR UPPER(k.kecamatan_id) = UPPER(?) OR UPPER(o.kecamatan_id) = UPPER(?))");
    params.push(kecamatan, kecamatan, kecamatan);
  }

  if (search) {
    whereClauses.push("(o.canonical_name LIKE ? OR h.outlet_id LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // 1. Determine dataset's max date for recency baseline
  const maxDateRow = sqlite.prepare(`
    SELECT MAX(h.transaction_date) as max_date 
    FROM fact_sales_line l
    JOIN fact_sales_header h ON l.document_number = h.document_number
    JOIN dim_product p ON l.item_code = p.item_code
    WHERE p.principal LIKE '%UNILEVER%' OR p.brand LIKE '%SARI%' OR p.item_name LIKE '%SARIWANGI%' OR p.item_name LIKE '%SARIMURNI%'
  `).get();
  const maxDateStr = maxDateRow?.max_date || '2026-10-02';
  const maxDateTime = new Date(maxDateStr).getTime();

  // 2. Fetch all qualifying transaction lines with relevant dimensions
  const query = `
    SELECT 
      l.line_id,
      l.document_number,
      l.item_code,
      p.item_name,
      p.brand,
      p.subbrand,
      p.group_sku,
      l.carton_quantity,
      l.sales_netto,
      h.transaction_date,
      h.outlet_id,
      COALESCE(o.canonical_name, h.outlet_id) as outlet_name,
      COALESCE(k.name, 'Lainnya') as kecamatan_name,
      k.kecamatan_id,
      COALESCE(r.name, 'Rayon Umum') as rayon_name,
      r.rayon_id,
      h.invoice_salesman_id,
      COALESCE(s.name, h.invoice_salesman_id, 'Salesman Umum') as salesman_name
    FROM fact_sales_line l
    JOIN fact_sales_header h ON l.document_number = h.document_number
    JOIN dim_product p ON l.item_code = p.item_code
    LEFT JOIN dim_outlet o ON h.outlet_id = o.outlet_id
    LEFT JOIN dim_kecamatan k ON o.kecamatan_id = k.kecamatan_id
    LEFT JOIN dim_rayon r ON o.current_rayon_id = r.rayon_id
    LEFT JOIN org_salesman s ON h.invoice_salesman_id = s.salesman_id
    ${whereSql}
  `;

  const lines = sqlite.prepare(query).all(...params);

  // 3. Aggregate data across multiple analytical cuts
  let totalCartons = 0;
  let totalNetto = 0;
  const uniqueOutlets = new Set();
  const uniqueInvoices = new Set();
  const ordersMap = new Map(); // docNum -> { cartons, netto, outlet_id, date, skus: Set }
  const outletMap = new Map(); // outlet_id -> { outlet_name, kecamatan, rayon, salesman, cartons, netto, orders: Set, skus: Map, lastDate }
  const kecMap = new Map();    // kecamatan -> { name, cartons, netto, outlets: Set, orders: Set, salesmen: Map, skus: Map }
  const smMap = new Map();     // salesman -> { id, name, cartons, netto, outlets: Set, orders: Set, selectedCartons }
  const skuMap = new Map();    // item_code -> { item_code, item_name, is_selected, cartons, netto, outlets: Set, orders: Set }

  let selectedCartonsTotal = 0;
  let selectedNettoTotal = 0;
  const selectedOutletsSet = new Set();

  for (const row of lines) {
    const ctn = parseFloat(row.carton_quantity) || 0;
    const net = parseFloat(row.sales_netto) || 0;
    const isSelected = isSariwangiSelectedSku({ item_code: row.item_code, item_name: row.item_name });

    totalCartons += ctn;
    totalNetto += net;
    uniqueOutlets.add(row.outlet_id);
    uniqueInvoices.add(row.document_number);

    if (isSelected) {
      selectedCartonsTotal += ctn;
      selectedNettoTotal += net;
      selectedOutletsSet.add(row.outlet_id);
    }

    // Per-order (OC) aggregation
    let ord = ordersMap.get(row.document_number);
    if (!ord) {
      ord = {
        document_number: row.document_number,
        outlet_id: row.outlet_id,
        transaction_date: row.transaction_date,
        salesman_name: row.salesman_name,
        kecamatan_name: row.kecamatan_name,
        cartons: 0,
        netto: 0,
        selectedCartons: 0,
        hasSelected: false
      };
      ordersMap.set(row.document_number, ord);
    }
    ord.cartons += ctn;
    ord.netto += net;
    if (isSelected) {
      ord.selectedCartons += ctn;
      ord.hasSelected = true;
    }

    // Per-outlet aggregation
    let out = outletMap.get(row.outlet_id);
    if (!out) {
      out = {
        outlet_id: row.outlet_id,
        outlet_name: row.outlet_name,
        kecamatan: row.kecamatan_name,
        rayon: row.rayon_name,
        salesman_name: row.salesman_name,
        cartons: 0,
        netto: 0,
        orderCount: new Set(),
        skus: new Map(),
        lastOrderDate: row.transaction_date,
        hasSelectedSku: false
      };
      outletMap.set(row.outlet_id, out);
    }
    out.cartons += ctn;
    out.netto += net;
    out.orderCount.add(row.document_number);
    if (isSelected) out.hasSelectedSku = true;
    if (!out.lastOrderDate || row.transaction_date > out.lastOrderDate) {
      out.lastOrderDate = row.transaction_date;
    }

    // Accumulate SKU inside outlet
    let skuEntry = out.skus.get(row.item_code);
    if (!skuEntry) {
      skuEntry = {
        item_code: row.item_code,
        item_name: row.item_name,
        is_selected: isSelected,
        cartons: 0,
        netto: 0
      };
      out.skus.set(row.item_code, skuEntry);
    }
    skuEntry.cartons += ctn;
    skuEntry.netto += net;

    // Per-kecamatan aggregation
    let kec = kecMap.get(row.kecamatan_name);
    if (!kec) {
      kec = {
        name: row.kecamatan_name,
        cartons: 0,
        netto: 0,
        outlets: new Set(),
        orders: new Set(),
        salesmen: new Map(),
        skus: new Map()
      };
      kecMap.set(row.kecamatan_name, kec);
    }
    kec.cartons += ctn;
    kec.netto += net;
    kec.outlets.add(row.outlet_id);
    kec.orders.add(row.document_number);
    kec.salesmen.set(row.salesman_name, (kec.salesmen.get(row.salesman_name) || 0) + ctn);
    kec.skus.set(row.item_name, (kec.skus.get(row.item_name) || 0) + ctn);

    // Per-salesman aggregation
    let sm = smMap.get(row.salesman_name);
    if (!sm) {
      sm = {
        salesman_id: row.invoice_salesman_id,
        salesman_name: row.salesman_name,
        cartons: 0,
        netto: 0,
        outlets: new Set(),
        orders: new Set(),
        selectedCartons: 0
      };
      smMap.set(row.salesman_name, sm);
    }
    sm.cartons += ctn;
    sm.netto += net;
    sm.outlets.add(row.outlet_id);
    sm.orders.add(row.document_number);
    if (isSelected) sm.selectedCartons += ctn;

    // Per-SKU performance
    let sp = skuMap.get(row.item_code);
    if (!sp) {
      sp = {
        item_code: row.item_code,
        item_name: row.item_name,
        is_selected: isSelected,
        cartons: 0,
        netto: 0,
        outlets: new Set(),
        orders: new Set()
      };
      skuMap.set(row.item_code, sp);
    }
    sp.cartons += ctn;
    sp.netto += net;
    sp.outlets.add(row.outlet_id);
    sp.orders.add(row.document_number);
  }

  const totalOA = uniqueOutlets.size;
  const totalOC = uniqueInvoices.size;
  const avgDropsizeCtn = totalOC > 0 ? Math.round((totalCartons / totalOC) * 1000) / 1000 : 0;
  const avgOmzetPerOC = totalOC > 0 ? Math.round(totalNetto / totalOC) : 0;

  // 4. Compute Dropsize Brackets per OC
  const brackets = {
    under_half: {
      key: 'under_half',
      label: '< 1/2 Karton',
      range: '0 – 0.49 Ktn',
      count: 0,
      pctOrders: 0,
      cartons: 0,
      pctCartons: 0,
      netto: 0,
      pctNetto: 0,
      avgNettoPerOC: 0,
      avgCartonsPerOC: 0,
      badgeColor: 'amber'
    },
    half_to_one: {
      key: 'half_to_one',
      label: '1/2 – 1 Karton',
      range: '0.50 – 1.00 Ktn',
      count: 0,
      pctOrders: 0,
      cartons: 0,
      pctCartons: 0,
      netto: 0,
      pctNetto: 0,
      avgNettoPerOC: 0,
      avgCartonsPerOC: 0,
      badgeColor: 'sky'
    },
    over_one: {
      key: 'over_one',
      label: '> 1 Karton',
      range: '> 1.00 Ktn',
      count: 0,
      pctOrders: 0,
      cartons: 0,
      pctCartons: 0,
      netto: 0,
      pctNetto: 0,
      avgNettoPerOC: 0,
      avgCartonsPerOC: 0,
      badgeColor: 'emerald'
    },
    strata_promo_tier: {
      key: 'strata_promo_tier',
      label: '≥ 6 Karton (Promo GT)',
      range: '≥ 6.00 Ktn',
      count: 0,
      pctOrders: 0,
      cartons: 0,
      pctCartons: 0,
      netto: 0,
      pctNetto: 0,
      avgNettoPerOC: 0,
      avgCartonsPerOC: 0,
      badgeColor: 'purple'
    }
  };

  // Strata Promo GT Adoption counts
  const promoTiers = {
    tier0: { label: '< 6 ktn (0%)', count: 0, cartons: 0, netto: 0 },
    tier1: { label: '6 – 19 ktn (2%)', count: 0, cartons: 0, netto: 0 },
    tier2: { label: '20 – 49 ktn (3%)', count: 0, cartons: 0, netto: 0 },
    tier3: { label: '50 – 99 ktn (5%)', count: 0, cartons: 0, netto: 0 },
    tier4: { label: '≥ 100 ktn (7%)', count: 0, cartons: 0, netto: 0 }
  };

  for (const ord of ordersMap.values()) {
    const c = ord.cartons;
    const n = ord.netto;

    if (c < 0.5) {
      brackets.under_half.count++;
      brackets.under_half.cartons += c;
      brackets.under_half.netto += n;
    } else if (c <= 1.0) {
      brackets.half_to_one.count++;
      brackets.half_to_one.cartons += c;
      brackets.half_to_one.netto += n;
    } else {
      brackets.over_one.count++;
      brackets.over_one.cartons += c;
      brackets.over_one.netto += n;
    }

    if (c >= 6.0) {
      brackets.strata_promo_tier.count++;
      brackets.strata_promo_tier.cartons += c;
      brackets.strata_promo_tier.netto += n;
    }

    // Check strata promo tier for selected SKU orders
    if (ord.hasSelected) {
      const sc = ord.selectedCartons;
      if (sc >= 100) {
        promoTiers.tier4.count++;
        promoTiers.tier4.cartons += sc;
        promoTiers.tier4.netto += n;
      } else if (sc >= 50) {
        promoTiers.tier3.count++;
        promoTiers.tier3.cartons += sc;
        promoTiers.tier3.netto += n;
      } else if (sc >= 20) {
        promoTiers.tier2.count++;
        promoTiers.tier2.cartons += sc;
        promoTiers.tier2.netto += n;
      } else if (sc >= 6) {
        promoTiers.tier1.count++;
        promoTiers.tier1.cartons += sc;
        promoTiers.tier1.netto += n;
      } else {
        promoTiers.tier0.count++;
        promoTiers.tier0.cartons += sc;
        promoTiers.tier0.netto += n;
      }
    }
  }

  // Calculate percentages and averages for brackets
  for (const key of Object.keys(brackets)) {
    const b = brackets[key];
    b.pctOrders = totalOC > 0 ? Math.round((b.count / totalOC) * 1000) / 10 : 0;
    b.pctCartons = totalCartons > 0 ? Math.round((b.cartons / totalCartons) * 1000) / 10 : 0;
    b.pctNetto = totalNetto > 0 ? Math.round((b.netto / totalNetto) * 1000) / 10 : 0;
    b.avgNettoPerOC = b.count > 0 ? Math.round(b.netto / b.count) : 0;
    b.avgCartonsPerOC = b.count > 0 ? Math.round((b.cartons / b.count) * 100) / 100 : 0;
    b.cartons = Math.round(b.cartons * 100) / 100;
    b.netto = Math.round(b.netto);
  }

  // 5. Build Formatted Outlets Table List
  const outletsList = [];
  const upsellOpportunities = [];

  for (const out of outletMap.values()) {
    const orderCount = out.orderCount.size;
    const avgDropsize = orderCount > 0 ? Math.round((out.cartons / orderCount) * 100) / 100 : 0;

    // Recency calculation
    const orderDate = new Date(out.lastOrderDate);
    const diffMs = maxDateTime - orderDate.getTime();
    const daysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const recency = formatRecency(daysAgo);

    // Dropsize bracket
    const dropsizeBracket = getDropsizeBracket(out.cartons);

    // Strata discount & upsell tip
    const strataInfo = calculateStrataDiscount(out.cartons, out.hasSelectedSku);

    // Format SKU list
    const skuList = Array.from(out.skus.values()).map(s => ({
      item_code: s.item_code,
      item_name: s.item_name,
      is_selected: s.is_selected,
      cartons: Math.round(s.cartons * 100) / 100,
      netto: Math.round(s.netto)
    })).sort((a, b) => b.cartons - a.cartons);

    const outletRecord = {
      outlet_id: out.outlet_id,
      outlet_name: out.outlet_name,
      kecamatan: out.kecamatan,
      rayon: out.rayon,
      salesman_name: out.salesman_name,
      total_cartons: Math.round(out.cartons * 100) / 100,
      total_netto: Math.round(out.netto),
      order_count: orderCount,
      avg_dropsize: avgDropsize,
      last_order_date: out.lastOrderDate,
      days_ago: daysAgo,
      recency_label: recency.label,
      recency_badge: recency.badge,
      recency_key: recency.key,
      dropsize_bracket: dropsizeBracket.label,
      dropsize_badge: dropsizeBracket.badge,
      has_selected_sku: out.hasSelectedSku,
      strata: strataInfo,
      skus: skuList,
      primary_sku_text: skuList.slice(0, 2).map(s => `${s.item_name.replace('SARIWANGI ', '').replace('SARIMURNI ', '')} (${s.cartons} ktn)`).join(', ')
    };

    outletsList.push(outletRecord);

    // Check for upsell opportunity (close to 6 ktn or 20 ktn)
    if (out.hasSelectedSku && out.cartons >= 3.5 && out.cartons < 6.0) {
      upsellOpportunities.push({
        outlet_id: out.outlet_id,
        outlet_name: out.outlet_name,
        kecamatan: out.kecamatan,
        salesman_name: out.salesman_name,
        current_cartons: Math.round(out.cartons * 100) / 100,
        gap_to_promo: Math.round((6.0 - out.cartons) * 100) / 100,
        target_tier: 'Promo 2% (+ 1% Reguler = 3%)',
        potential_disc: '3.00%'
      });
    } else if (out.hasSelectedSku && out.cartons >= 15.0 && out.cartons < 20.0) {
      upsellOpportunities.push({
        outlet_id: out.outlet_id,
        outlet_name: out.outlet_name,
        kecamatan: out.kecamatan,
        salesman_name: out.salesman_name,
        current_cartons: Math.round(out.cartons * 100) / 100,
        gap_to_promo: Math.round((20.0 - out.cartons) * 100) / 100,
        target_tier: 'Promo 3% (+ 1.25% Reguler = 4.25%)',
        potential_disc: '4.25%'
      });
    }
  }

  // Sort outlets by total cartons descending
  outletsList.sort((a, b) => b.total_cartons - a.total_cartons);
  upsellOpportunities.sort((a, b) => a.gap_to_promo - b.gap_to_promo);

  // 6. Geographic Distribution per Kecamatan (42 Garut Kecamatans)
  // Retrieve registered outlets count per kecamatan from dim_outlet
  const registeredKecRows = sqlite.prepare(`
    SELECT k.name as kecamatan_name, COUNT(o.outlet_id) as registered_count
    FROM dim_kecamatan k
    LEFT JOIN dim_outlet o ON k.kecamatan_id = o.kecamatan_id
    GROUP BY k.name
  `).all();
  const regKecMap = new Map();
  registeredKecRows.forEach(r => regKecMap.set(r.kecamatan_name, r.registered_count || 0));

  const kecamatanDistribution = [];
  for (const [kName, kData] of kecMap.entries()) {
    const regCount = regKecMap.get(kName) || kData.outlets.size;
    const actCount = kData.outlets.size;
    const covPct = regCount > 0 ? Math.round((actCount / regCount) * 1000) / 10 : 0;
    const avgDropsize = kData.orders.size > 0 ? Math.round((kData.cartons / kData.orders.size) * 100) / 100 : 0;

    // Determine top salesman in this kecamatan
    let topSm = 'Tidak Ada';
    let topSmVol = 0;
    for (const [sm, vol] of kData.salesmen.entries()) {
      if (vol > topSmVol) {
        topSm = sm;
        topSmVol = vol;
      }
    }

    // Determine top SKU in this kecamatan
    let topSku = 'Tidak Ada';
    let topSkuVol = 0;
    for (const [sku, vol] of kData.skus.entries()) {
      if (vol > topSkuVol) {
        topSku = sku;
        topSkuVol = vol;
      }
    }

    kecamatanDistribution.push({
      kecamatan_name: kName,
      active_outlets: actCount,
      registered_outlets: regCount,
      coverage_pct: covPct,
      total_cartons: Math.round(kData.cartons * 100) / 100,
      total_netto: Math.round(kData.netto),
      order_count: kData.orders.size,
      avg_dropsize: avgDropsize,
      top_salesman: topSm,
      top_sku: topSku
    });
  }
  kecamatanDistribution.sort((a, b) => b.total_cartons - a.total_cartons);

  // 7. Salesman Leaderboard for SariWangi
  const salesmanLeaderboard = Array.from(smMap.values()).map(sm => {
    const orderCount = sm.orders.size;
    const avgDropsize = orderCount > 0 ? Math.round((sm.cartons / orderCount) * 100) / 100 : 0;
    const selectedPct = sm.cartons > 0 ? Math.round((sm.selectedCartons / sm.cartons) * 1000) / 10 : 0;
    return {
      salesman_id: sm.salesman_id,
      salesman_name: sm.salesman_name,
      total_cartons: Math.round(sm.cartons * 100) / 100,
      total_netto: Math.round(sm.netto),
      outlet_count: sm.outlets.size,
      order_count: orderCount,
      avg_dropsize: avgDropsize,
      selected_cartons: Math.round(sm.selectedCartons * 100) / 100,
      selected_pct: selectedPct
    };
  }).sort((a, b) => b.total_cartons - a.total_cartons);

  // 8. Individual SKU Rankings
  const skuRankings = Array.from(skuMap.values()).map(s => {
    return {
      item_code: s.item_code,
      item_name: s.item_name,
      is_selected: s.is_selected,
      total_cartons: Math.round(s.cartons * 100) / 100,
      total_netto: Math.round(s.netto),
      outlet_count: s.outlets.size,
      order_count: s.orders.size
    };
  }).sort((a, b) => b.total_cartons - a.total_cartons);

  // 9. Distinct filter values for frontend dropdowns
  const filterOptions = {
    salesmen: sqlite.prepare(`
      SELECT DISTINCT COALESCE(s.name, h.invoice_salesman_id) as name, h.invoice_salesman_id as id
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      LEFT JOIN org_salesman s ON h.invoice_salesman_id = s.salesman_id
      WHERE (p.principal LIKE '%UNILEVER%' OR p.brand LIKE '%SARI%' OR p.item_name LIKE '%SARIWANGI%' OR p.item_name LIKE '%SARIMURNI%')
        AND h.invoice_salesman_id IS NOT NULL
      ORDER BY name ASC
    `).all().map(r => ({ id: r.id, name: r.name || r.id })),

    rayons: sqlite.prepare(`
      SELECT DISTINCT r.name, r.rayon_id
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      LEFT JOIN dim_outlet o ON h.outlet_id = o.outlet_id
      LEFT JOIN dim_rayon r ON o.current_rayon_id = r.rayon_id
      WHERE (p.principal LIKE '%UNILEVER%' OR p.brand LIKE '%SARI%' OR p.item_name LIKE '%SARIWANGI%' OR p.item_name LIKE '%SARIMURNI%')
        AND r.name IS NOT NULL
      ORDER BY r.name ASC
    `).all().map(r => ({ id: r.rayon_id, name: r.name })),

    kecamatans: sqlite.prepare(`
      SELECT DISTINCT k.name, k.kecamatan_id
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      LEFT JOIN dim_outlet o ON h.outlet_id = o.outlet_id
      LEFT JOIN dim_kecamatan k ON o.kecamatan_id = k.kecamatan_id
      WHERE (p.principal LIKE '%UNILEVER%' OR p.brand LIKE '%SARI%' OR p.item_name LIKE '%SARIWANGI%' OR p.item_name LIKE '%SARIMURNI%')
        AND k.name IS NOT NULL
      ORDER BY k.name ASC
    `).all().map(r => ({ id: r.kecamatan_id, name: r.name })),

    latestDate: maxDateStr,

    periods: [
      { id: '', name: 'Semua Periode (Kumulatif)' },
      { id: '2026-10', name: 'Oktober 2026' },
      { id: '2026-09', name: 'September 2026' },
      { id: '2026-08', name: 'Agustus 2026' }
    ],

    skuOptions: [
      { id: 'ALL', name: 'Semua SKU SariWangi (Rp 156.6M | 651.5 Ktn)' },
      { id: 'TB288', name: '⭐ SARIWANGI ASLI RL TB 288 (Hero SKU: Rp 91.8M | 392 Ktn)' },
      { id: 'TB48', name: 'SARIWANGI ASLI RL TB 48X25 (Rp 57.2M | 213 Ktn)' },
      { id: 'SELECTED', name: '6 Selected SKU GT (Promo Strata: Rp 149.2M | 605 Ktn)' },
      { id: 'REGULER', name: 'SKU Reguler Lainnya (Rp 7.4M | 46 Ktn)' }
    ]
  };

  return {
    summary: {
      totalCartons: Math.round(totalCartons * 100) / 100,
      totalNetto: Math.round(totalNetto),
      totalOA,
      totalOC,
      avgDropsizeCtn,
      avgOmzetPerOC,
      selectedSkuCartons: Math.round(selectedCartonsTotal * 100) / 100,
      selectedSkuNetto: Math.round(selectedNettoTotal),
      selectedSkuOA: selectedOutletsSet.size,
      selectedSkuCartonPct: totalCartons > 0 ? Math.round((selectedCartonsTotal / totalCartons) * 1000) / 10 : 0,
      selectedSkuOAPct: totalOA > 0 ? Math.round((selectedOutletsSet.size / totalOA) * 1000) / 10 : 0
    },
    dropsizeBrackets: brackets,
    promoTiers,
    upsellOpportunities,
    kecamatanDistribution,
    salesmanLeaderboard,
    skuRankings,
    outlets: outletsList,
    totalOutletsCount: outletsList.length,
    filterOptions
  };
}

module.exports = {
  getSariwangiAnalytics,
  formatRecency,
  getDropsizeBracket,
  calculateStrataDiscount
};
