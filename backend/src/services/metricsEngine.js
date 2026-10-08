const { getDb } = require('../db/connection.js');
const { getCalendarPace } = require('./calendarEngine.js');

function buildFilterConditions(filters = {}) {
  const whereTx = [];
  const whereTgt = [];
  const whereOutlet = [];
  const paramsTx = [];
  const paramsTgt = [];
  const paramsOutlet = [];

  const year = parseInt(filters.year || 2026, 10);
  const month = parseInt(filters.month || 9, 10);

  // Month & Year filter for transactions
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  whereTx.push(`((h.period_year = ? AND h.period_month = ?) OR (h.period_year IS NULL AND h.transaction_date >= ? AND h.transaction_date < ?))`);
  paramsTx.push(year, month, startDate, endDate);

  whereTgt.push(`t.year = ? AND t.month = ?`);
  paramsTgt.push(year, month);

  // Salesman filter (management view uses current owner)
  if (filters.salesmanId) {
    whereTx.push(`h.current_owner_salesman_id = ?`);
    paramsTx.push(filters.salesmanId);

    whereTgt.push(`t.salesman_id = ?`);
    paramsTgt.push(filters.salesmanId);

    whereOutlet.push(`o.current_salesman_id = ?`);
    paramsOutlet.push(filters.salesmanId);
  } else if (filters.spvId) {
    // Filter by SPV team
    whereTx.push(`h.current_owner_salesman_id IN (SELECT salesman_id FROM org_salesman WHERE spv_id = ?)`);
    paramsTx.push(filters.spvId);

    whereTgt.push(`t.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE spv_id = ?)`);
    paramsTgt.push(filters.spvId);

    whereOutlet.push(`o.current_salesman_id IN (SELECT salesman_id FROM org_salesman WHERE spv_id = ?)`);
    paramsOutlet.push(filters.spvId);
  }

  // Salesman Group filter (SAVORIA, SCM, SAVORIA_OTHERS)
  if (filters.salesGroup) {
    const isScm = filters.salesGroup.toUpperCase() === 'SCM' || filters.salesGroup.toUpperCase() === 'SMC';
    if (isScm) {
      whereTx.push(`h.current_owner_salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group IN ('SCM', 'SMC'))`);
      whereTgt.push(`t.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group IN ('SCM', 'SMC'))`);
      whereOutlet.push(`o.current_salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group IN ('SCM', 'SMC'))`);
    } else {
      whereTx.push(`h.current_owner_salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group = ?)`);
      paramsTx.push(filters.salesGroup);

      whereTgt.push(`t.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group = ?)`);
      paramsTgt.push(filters.salesGroup);

      whereOutlet.push(`o.current_salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group = ?)`);
      paramsOutlet.push(filters.salesGroup);
    }
  }

  // Product filters
  if (filters.principal) {
    whereTx.push(`p.principal = ?`);
    paramsTx.push(filters.principal);
    if (!filters.groupSku && !filters.brand && !filters.subbrand) {
      whereTgt.push(`t.group_sku IN (SELECT DISTINCT group_sku FROM dim_product WHERE principal = ?)`);
      paramsTgt.push(filters.principal);
    }
  }
  if (filters.brand) {
    whereTx.push(`p.brand = ?`);
    paramsTx.push(filters.brand);
    if (!filters.groupSku && !filters.subbrand) {
      whereTgt.push(`t.group_sku IN (SELECT DISTINCT group_sku FROM dim_product WHERE brand = ?)`);
      paramsTgt.push(filters.brand);
    }
  }
  if (filters.subbrand) {
    whereTx.push(`p.subbrand = ?`);
    paramsTx.push(filters.subbrand);
    if (!filters.groupSku) {
      whereTgt.push(`t.group_sku IN (SELECT DISTINCT group_sku FROM dim_product WHERE subbrand = ?)`);
      paramsTgt.push(filters.subbrand);
    }
  }
  if (filters.groupSku) {
    whereTx.push(`(p.group_sku = ? OR UPPER(p.group_sku) = UPPER(?) OR p.subbrand LIKE ? OR p.item_name LIKE ?)`);
    paramsTx.push(filters.groupSku, filters.groupSku, `%${filters.groupSku}%`, `%${filters.groupSku}%`);

    whereTgt.push(`t.group_sku = ?`);
    paramsTgt.push(filters.groupSku);
  }

  // Geographic filters
  if (filters.kecamatanId) {
    whereTx.push(`o.kecamatan_id = ?`);
    paramsTx.push(filters.kecamatanId);

    whereOutlet.push(`o.kecamatan_id = ?`);
    paramsOutlet.push(filters.kecamatanId);
  }
  if (filters.rayonId) {
    whereTx.push(`o.current_rayon_id = ?`);
    paramsTx.push(filters.rayonId);

    whereOutlet.push(`o.current_rayon_id = ?`);
    paramsOutlet.push(filters.rayonId);
  }

  return {
    year,
    month,
    startDate,
    endDate,
    whereTx,
    whereTgt,
    whereOutlet,
    whereTxSql: whereTx.length ? 'WHERE ' + whereTx.join(' AND ') : '',
    paramsTx,
    whereTgtSql: whereTgt.length ? 'WHERE ' + whereTgt.join(' AND ') : '',
    paramsTgt,
    whereOutletSql: whereOutlet.length ? 'WHERE ' + whereOutlet.join(' AND ') : '',
    paramsOutlet
  };
}

function getExecutiveSummary(filters = {}) {
  const db = getDb();
  const f = buildFilterConditions(filters);
  const cal = getCalendarPace(f.year, f.month, filters.asOfDate);

  // 1. Actual Sales Aggregation
  const aggCheck = db.query(
    'SELECT COUNT(*) as c FROM agg_monthly_sales_movement WHERE year = ? AND month = ?',
    [f.year, f.month]
  )[0];
  const useAgg = Boolean(aggCheck && aggCheck.c > 0 && !filters.kecamatanId && !filters.rayonId && !filters.subbrand);

  let salesRes;
  if (useAgg) {
    const whereAgg = ['a.year = ? AND a.month = ?'];
    const paramsAgg = [f.year, f.month];
    if (filters.salesmanId) {
      whereAgg.push('a.salesman_id = ?');
      paramsAgg.push(filters.salesmanId);
    } else if (filters.spvId) {
      whereAgg.push('a.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE spv_id = ?)');
      paramsAgg.push(filters.spvId);
    }
    if (filters.salesGroup) {
      const isScm = filters.salesGroup.toUpperCase() === 'SCM' || filters.salesGroup.toUpperCase() === 'SMC';
      if (isScm) {
        whereAgg.push(`a.sales_group IN ('SCM', 'SMC')`);
      } else {
        whereAgg.push('a.sales_group = ?');
        paramsAgg.push(filters.salesGroup);
      }
    }
    if (filters.principal) {
      whereAgg.push('a.principal = ?');
      paramsAgg.push(filters.principal);
    }
    if (filters.brand) {
      whereAgg.push('a.brand = ?');
      paramsAgg.push(filters.brand);
    }
    if (filters.groupSku) {
      whereAgg.push('(a.group_sku = ? OR a.group_sku LIKE ?)');
      paramsAgg.push(filters.groupSku, `%${filters.groupSku}%`);
    }
    const whereAggSql = 'WHERE ' + whereAgg.join(' AND ');

    const activeOutletRow = db.query(`
      SELECT COUNT(DISTINCT CASE WHEN h.unit_type = 'Sales' AND l.carton_quantity > 0 AND l.is_non_omzet = 0 THEN COALESCE(a.outlet_id, h.outlet_id) END) AS active_outlets_mtd
      FROM fact_sales_header h
      LEFT JOIN outlet_alias a ON h.outlet_id = a.source_customer_code
      JOIN dim_outlet o ON COALESCE(a.outlet_id, h.outlet_id) = o.outlet_id
      LEFT JOIN fact_sales_line l ON h.document_number = l.document_number
      LEFT JOIN dim_product p ON l.item_code = p.item_code
      ${f.whereTxSql}
    `, f.paramsTx)[0];
    const activeOutletsMtd = activeOutletRow ? activeOutletRow.active_outlets_mtd : 0;

    const baseAgg = db.query(`
      SELECT
        COALESCE(SUM(a.net_cartons), 0) AS net_cartons,
        COALESCE(SUM(a.gross_cartons), 0) AS gross_cartons,
        COALESCE(SUM(a.retur_cartons), 0) AS return_cartons,
        COALESCE(SUM(a.net_value), 0) AS net_value,
        COALESCE(SUM(a.dpp_value), 0) AS net_dpp,
        COALESCE(SUM(a.total_invoices), 0) AS total_invoices
      FROM agg_monthly_sales_movement a
      ${whereAggSql}
    `, paramsAgg)[0];

    salesRes = {
      ...baseAgg,
      active_outlets_mtd: activeOutletsMtd
    };
  } else {
    const salesSql = `
      SELECT
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS net_cartons,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE 0 END), 0) AS gross_cartons,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Return' THEN l.carton_quantity ELSE 0 END), 0) AS return_cartons,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS net_value,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.dpp_amount ELSE -l.dpp_amount END), 0) AS net_dpp,
        COUNT(DISTINCT h.document_number) AS total_invoices,
        COUNT(DISTINCT CASE WHEN h.unit_type = 'Sales' AND l.carton_quantity > 0 AND l.is_non_omzet = 0 THEN COALESCE(a.outlet_id, h.outlet_id) END) AS active_outlets_mtd
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      LEFT JOIN outlet_alias a ON h.outlet_id = a.source_customer_code
      JOIN dim_outlet o ON COALESCE(a.outlet_id, h.outlet_id) = o.outlet_id
      ${f.whereTxSql}
    `;
    salesRes = db.query(salesSql, f.paramsTx)[0];
  }

  // 2. Target Aggregation (Requirement 2: Missing Target vs Zero Target)
  const targetSql = `
    SELECT 
      COUNT(*) AS target_count,
      SUM(t.target_cartons) AS target_cartons,
      SUM(t.target_value) AS target_value
    FROM fact_quantity_target t
    ${f.whereTgtSql}
  `;
  const targetRes = db.query(targetSql, f.paramsTgt)[0];

  const actualKtn = Math.max(Math.round(salesRes.net_cartons * 100) / 100, 0);
  const hasTarget = Boolean(targetRes && targetRes.target_count > 0);
  const targetKtn = hasTarget && targetRes.target_cartons !== null ? Math.round(targetRes.target_cartons * 100) / 100 : null;
  const targetVal = hasTarget && targetRes.target_value !== null ? Math.round(targetRes.target_value) : null;

  let achvPct = null;
  let remainingTarget = null;
  let gapDaily = null;
  let leAchvPct = null;

  const isFullMonth = Boolean(cal.isFullMonth || cal.remainingHk === 0 || cal.monFriRemainingHk === 0);
  const leCartons = isFullMonth ? actualKtn : (cal.asOfHke > 0 ? Math.round(((actualKtn / cal.asOfHke) * cal.totalHk) * 100) / 100 : 0);

  if (hasTarget && targetKtn !== null) {
    if (targetKtn > 0) {
      achvPct = Math.round((actualKtn / targetKtn) * 1000) / 10;
      remainingTarget = Math.max(Math.round((targetKtn - actualKtn) * 100) / 100, 0);
      gapDaily = (!isFullMonth && cal.remainingHk > 0) ? Math.round((remainingTarget / cal.remainingHk) * 100) / 100 : 0;
      leAchvPct = isFullMonth ? achvPct : Math.round((leCartons / targetKtn) * 1000) / 10;
    } else {
      achvPct = 0;
      remainingTarget = 0;
      gapDaily = 0;
      leAchvPct = 0;
    }
  }

  const returnRatio = salesRes.gross_cartons > 0 ? (salesRes.return_cartons / salesRes.gross_cartons) * 100 : 0;

  // 3. Registered Universe & Coverage (Requirement: Registered CL denominator reflects operational CL on Rayon: ~2,452 outlets)
  let registeredCl = 0;
  if (filters.salesmanId) {
    const sInfo = db.query('SELECT target_cl, has_rayon FROM org_salesman WHERE salesman_id = ?', [filters.salesmanId])[0];
    if (sInfo && sInfo.target_cl > 0) {
      registeredCl = sInfo.target_cl;
    } else {
      const clSql = `
        SELECT COUNT(*) AS registered_outlets
        FROM dim_outlet o
        JOIN org_salesman s ON o.current_salesman_id = s.salesman_id
        ${f.whereOutletSql ? f.whereOutletSql + ' AND o.is_active_cl = 1 AND s.has_rayon = 1' : 'WHERE o.is_active_cl = 1 AND s.has_rayon = 1'}
      `;
      const clRes = db.query(clSql, f.paramsOutlet)[0];
      registeredCl = clRes?.registered_outlets || 375;
    }
  } else if (filters.rayonId || filters.kecamatanId) {
    const clSql = `
      SELECT COUNT(*) AS registered_outlets
      FROM dim_outlet o
      JOIN org_salesman s ON o.current_salesman_id = s.salesman_id
      ${f.whereOutletSql ? f.whereOutletSql + ' AND o.is_active_cl = 1 AND s.has_rayon = 1' : 'WHERE o.is_active_cl = 1 AND s.has_rayon = 1'}
    `;
    const clRes = db.query(clSql, f.paramsOutlet)[0];
    registeredCl = clRes?.registered_outlets || 2452;
  } else if (filters.spvId) {
    const clSql = `
      SELECT COUNT(*) AS registered_outlets
      FROM dim_outlet o
      JOIN org_salesman s ON o.current_salesman_id = s.salesman_id
      WHERE o.is_active_cl = 1 AND s.spv_id = ?
    `;
    const clRes = db.query(clSql, [filters.spvId])[0];
    registeredCl = clRes?.registered_outlets || 2452;
  } else if (filters.salesGroup) {
    const isScm = filters.salesGroup.toUpperCase() === 'SCM' || filters.salesGroup.toUpperCase() === 'SMC';
    const clSql = isScm
      ? `SELECT COUNT(*) AS registered_outlets FROM dim_outlet o JOIN org_salesman s ON o.current_salesman_id = s.salesman_id WHERE o.is_active_cl = 1 AND s.sales_group IN ('SCM', 'SMC')`
      : `SELECT COUNT(*) AS registered_outlets FROM dim_outlet o JOIN org_salesman s ON o.current_salesman_id = s.salesman_id WHERE o.is_active_cl = 1 AND s.sales_group = ?`;
    const clRes = db.query(clSql, isScm ? [] : [filters.salesGroup])[0];
    registeredCl = clRes?.registered_outlets || (isScm ? 375 : 2452);
  } else {
    // For overall or product filters on DSO: always use total master customer on Rayon (~2,452 CL)
    registeredCl = 2452;
  }
  const activeOc = salesRes.active_outlets_mtd || 0;
  const rawCoverage = registeredCl > 0 ? (activeOc / registeredCl) * 100 : 0;
  const coveragePct = Math.min(Math.round(rawCoverage * 10) / 10, 100.0);

  // 4. Customer States (Requirement 4: 4 Distinct States — Active, Inactive MTD, Dormant 60D, Never Ordered)
  const refDate = cal.monitoringDate || f.endDate;
  const dormancyThreshold = 60;

  const isPg = db.type === 'postgres';
  const diffExpr = isPg ? `(CAST(? AS DATE) - CAST(last_order_date AS DATE))` : `(julianday(?) - julianday(last_order_date))`;

  const outletDormancySql = `
    WITH OutletOrders AS (
      SELECT
        o.outlet_id,
        MAX(h.transaction_date) AS last_order_date,
        COUNT(CASE WHEN ((h.period_year = ? AND h.period_month = ?) OR (h.period_year IS NULL AND h.transaction_date >= ? AND h.transaction_date < ?)) THEN 1 END) AS orders_in_month
      FROM dim_outlet o
      LEFT JOIN fact_sales_header h ON o.outlet_id = h.outlet_id AND h.unit_type = 'Sales'
      ${f.whereOutletSql}
      GROUP BY o.outlet_id
    )
    SELECT
      COUNT(CASE WHEN last_order_date IS NULL THEN 1 END) AS never_ordered,
      COUNT(CASE WHEN orders_in_month > 0 THEN 1 END) AS active_mtd,
      COUNT(CASE 
        WHEN last_order_date IS NOT NULL 
          AND orders_in_month = 0 
          AND ${diffExpr} >= ? 
        THEN 1 
      END) AS dormant_60d,
      COUNT(CASE 
        WHEN last_order_date IS NOT NULL 
          AND orders_in_month = 0 
          AND ${diffExpr} < ? 
        THEN 1 
      END) AS inactive_mtd
    FROM OutletOrders
  `;
  const dormRes = db.query(outletDormancySql, [f.year, f.month, f.startDate, f.endDate, refDate, dormancyThreshold, refDate, dormancyThreshold])[0];

  const gapMonthly = targetKtn !== null ? Math.max(Math.round((targetKtn - actualKtn) * 100) / 100, 0) : null;
  const gapDailyMonFri = (targetKtn !== null && !isFullMonth && cal.monFriRemainingHk > 0) ? Math.round((gapMonthly / cal.monFriRemainingHk) * 100) / 100 : 0;

  return {
    calendar: cal,
    sales: {
      hasTarget,
      isFullMonth,
      targetCartons: targetKtn,
      targetValue: targetVal,
      actualCartons: actualKtn,
      achievementPct: achvPct,
      remainingTarget: remainingTarget,
      gapDailyPace: gapDaily,
      gapMonthlyCartons: gapMonthly,
      gapDailyMonFri: gapDailyMonFri,
      timegonePct: cal.timegonePct,
      latestEstimateCartons: leCartons,
      latestEstimateAchvPct: leAchvPct,
      salesNettoValue: Math.round(salesRes.net_value),
      salesDppValue: Math.round(salesRes.net_dpp),
      returnCartons: Math.round(salesRes.return_cartons * 100) / 100,
      returnRatioPct: Math.round(returnRatio * 10) / 10,
      totalInvoices: salesRes.total_invoices
    },
    coverage: {
      registeredOutlets: registeredCl,
      activeOutletsMtd: activeOc,
      coveragePct,
      neverOrderedOutlets: dormRes ? dormRes.never_ordered || 0 : 0,
      dormant60dOutlets: dormRes ? dormRes.dormant_60d || 0 : 0,
      inactiveMtdOutlets: dormRes ? dormRes.inactive_mtd || 0 : 0
    }
  };
}

function getTopSalesmen(filters = {}, limit = 50) {
  const db = getDb();
  const f = buildFilterConditions(filters);
  const cal = getCalendarPace(f.year, f.month, filters.asOfDate);

  let salesmanFilterClauses = ["(s.role = 'SALESMAN' OR s.salesman_id = 'DSM_GARUT')", "s.is_active = 1"];
  const salesmanFilterParams = [];

  if (filters.salesmanId) {
    salesmanFilterClauses.push("s.salesman_id = ?");
    salesmanFilterParams.push(filters.salesmanId);
  } else if (filters.spvId) {
    salesmanFilterClauses.push("s.spv_id = ?");
    salesmanFilterParams.push(filters.spvId);
  }

  if (filters.salesGroup) {
    const isScm = filters.salesGroup.toUpperCase() === 'SCM' || filters.salesGroup.toUpperCase() === 'SMC';
    if (isScm) {
      salesmanFilterClauses.push("s.sales_group IN ('SCM', 'SMC')");
    } else {
      salesmanFilterClauses.push("s.sales_group = ?");
      salesmanFilterParams.push(filters.salesGroup);
    }
  } else if (!filters.includeAllGroups && limit <= 20 && !filters.salesmanId && !filters.spvId) {
    salesmanFilterClauses.push("s.has_rayon = 1");
  }

  const salesmanWhereSql = "WHERE " + salesmanFilterClauses.join(" AND ");

  const salesmen = db.query(`
    SELECT s.salesman_id, s.name AS salesman_name, spv.name AS spv_name, s.salesman_type, s.sales_group, s.target_cl, s.visit_cycle, s.has_rayon
    FROM org_salesman s
    LEFT JOIN org_spv spv ON s.spv_id = spv.spv_id
    ${salesmanWhereSql}
  `, salesmanFilterParams);

  if (!salesmen.length) return [];

  // Actual sales & value
  let txMap = new Map();
  const hasSpecificFilter = Boolean(filters.brand || filters.principal || filters.subbrand || filters.groupSku || filters.kecamatanId || filters.rayonId);
  const aggCheck = db.query(
    'SELECT COUNT(*) as c FROM agg_monthly_sales_movement WHERE year = ? AND month = ?',
    [f.year, f.month]
  )[0];
  const useAgg = Boolean(aggCheck && aggCheck.c > 0 && !hasSpecificFilter);

  if (useAgg) {
    const aggSql = `
      SELECT
        s.salesman_id,
        COALESCE(SUM(a.net_cartons), 0) AS actual_cartons,
        COALESCE(SUM(a.net_value), 0) AS sales_value
      FROM org_salesman s
      LEFT JOIN agg_monthly_sales_movement a ON (
        a.salesman_id = s.salesman_id
        OR (s.salesman_id = 'SAVORIA_OTH' AND a.sales_group LIKE '%Others%' AND a.salesman_id NOT IN (SELECT salesman_id FROM org_salesman WHERE salesman_id != 'SAVORIA_OTH'))
        OR (s.salesman_id = 'SMC_GARUT' AND a.sales_group IN ('SCM', 'SMC'))
      ) AND a.year = ? AND a.month = ?
      ${salesmanWhereSql}
      GROUP BY s.salesman_id
    `;
    const aggRows = db.query(aggSql, [f.year, f.month, ...salesmanFilterParams]);
    aggRows.forEach(r => { txMap.set(r.salesman_id, r); });
  } else {
    const txSql = `
      SELECT
        h.current_owner_salesman_id AS salesman_id,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS actual_cartons,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS sales_value
      FROM fact_sales_header h
      JOIN fact_sales_line l ON h.document_number = l.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      LEFT JOIN outlet_alias a ON h.outlet_id = a.source_customer_code
      JOIN dim_outlet o ON COALESCE(a.outlet_id, h.outlet_id) = o.outlet_id
      ${f.whereTxSql}
      GROUP BY h.current_owner_salesman_id
    `;
    const txRows = db.query(txSql, f.paramsTx);
    txRows.forEach(r => { txMap.set(r.salesman_id, r); });
  }

  // Active outlets (always single counted from transactions matching filters)
  const oaSql = `
    SELECT
      h.current_owner_salesman_id AS salesman_id,
      COUNT(DISTINCT CASE WHEN h.unit_type = 'Sales' AND l.carton_quantity > 0 AND l.is_non_omzet = 0 THEN COALESCE(a.outlet_id, h.outlet_id) END) AS active_outlets
    FROM fact_sales_header h
    JOIN fact_sales_line l ON h.document_number = l.document_number
    JOIN dim_product p ON l.item_code = p.item_code
    LEFT JOIN outlet_alias a ON h.outlet_id = a.source_customer_code
    JOIN dim_outlet o ON COALESCE(a.outlet_id, h.outlet_id) = o.outlet_id
    ${f.whereTxSql}
    GROUP BY h.current_owner_salesman_id
  `;
  const oaRows = db.query(oaSql, f.paramsTx);
  const oaMap = new Map();
  oaRows.forEach(r => { oaMap.set(r.salesman_id, r.active_outlets); });

  const tgtSql = `
    SELECT
      t.salesman_id,
      COUNT(*) AS target_record_count,
      SUM(t.target_cartons) AS target_cartons,
      SUM(t.target_value) AS target_value
    FROM fact_quantity_target t
    ${f.whereTgtSql}
    GROUP BY t.salesman_id
  `;
  const tgtRows = db.query(tgtSql, f.paramsTgt);
  const tgtMap = new Map();
  tgtRows.forEach(r => { tgtMap.set(r.salesman_id, r); });

  const combined = salesmen.map(s => {
    const tx = txMap.get(s.salesman_id) || {};
    const tgt = tgtMap.get(s.salesman_id) || {};

    const act = Math.max(Math.round((tx.actual_cartons || 0) * 10) / 10, 0);
    const hasTarget = (tgt.target_record_count || 0) > 0;
    const targetCartons = hasTarget && tgt.target_cartons !== null ? Math.round(tgt.target_cartons * 10) / 10 : null;
    const targetValue = hasTarget && tgt.target_value !== null ? Math.round(tgt.target_value) : null;
    const achv = hasTarget && targetCartons > 0 ? Math.round((act / targetCartons) * 1000) / 10 : null;

    const registeredOutlets = s.target_cl || (s.salesman_id === '305028' ? 200 : 375);
    const activeOutlets = oaMap.get(s.salesman_id) || 0;
    const rawCov = registeredOutlets > 0 ? (activeOutlets / registeredOutlets) * 100 : 0;
    const coveragePct = Math.min(Math.round(rawCov * 10) / 10, 100.0);

    const isFull = Boolean(cal.isFullMonth || cal.monFriRemainingHk === 0);
    const gapMonthly = targetCartons !== null ? Math.round((targetCartons - act) * 10) / 10 : null;
    const gapDaily = targetCartons !== null && !isFull && cal.monFriRemainingHk > 0 ? Math.round(((targetCartons - act) / cal.monFriRemainingHk) * 10) / 10 : 0;

    let paceStatus = 'N/A';
    if (hasTarget && targetCartons > 0 && achv !== null) {
      if (isFull) {
        paceStatus = achv >= 100 ? 'ACHIEVED' : (achv >= 85 ? 'NEAR_TARGET' : 'MISSED_TARGET');
      } else if (achv >= cal.timegonePct) {
        paceStatus = 'ON_PACE';
      } else if (achv >= cal.timegonePct - 15) {
        paceStatus = 'NEEDS_ATTENTION';
      } else {
        paceStatus = 'BEHIND_PACE';
      }
    }

    return {
      salesmanId: s.salesman_id,
      salesmanName: s.salesman_name,
      spvName: s.spv_name || 'N/A',
      salesmanType: s.salesman_type || 'Kanvas',
      salesGroup: s.sales_group || 'SAVORIA',
      targetCl: s.target_cl || 375,
      visitCycle: s.visit_cycle || '3 Minggu',
      hasRayon: s.has_rayon !== undefined ? s.has_rayon : 1,
      actualCartons: act,
      salesValue: Math.round(tx.sales_value || 0),
      hasTarget,
      targetCartons,
      targetValue,
      achievementPct: achv,
      gapMonthly,
      gapDaily,
      timegonePct: cal.timegonePct,
      paceStatus,
      activeOutlets,
      registeredOutlets,
      coveragePct
    };
  });

  combined.sort((a, b) => b.actualCartons - a.actualCartons);

  return combined.slice(0, limit).map((r, idx) => ({
    rank: idx + 1,
    ...r
  }));
}

function getMustHaveProgress(filters = {}) {
  const db = getDb();
  const f = buildFilterConditions(filters);

  const configs = db.query('SELECT * FROM must_have_program_config WHERE is_active = 1');
  const clRes = db.query(`SELECT COUNT(*) AS cnt FROM dim_outlet o ${f.whereOutletSql ? f.whereOutletSql + ' AND o.is_active_cl = 1' : 'WHERE o.is_active_cl = 1'}`, f.paramsOutlet)[0];
  const registeredCl = clRes.cnt || 0;

  return configs.map(cfg => {
    const targetPenetrationPct = cfg.target_penetration_pct;
    const targetOc = Math.round((registeredCl * targetPenetrationPct) / 100);

    const actualSql = `
      SELECT COUNT(DISTINCT COALESCE(a.outlet_id, h.outlet_id)) AS actual_oc
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      LEFT JOIN outlet_alias a ON h.outlet_id = a.source_customer_code
      JOIN dim_outlet o ON COALESCE(a.outlet_id, h.outlet_id) = o.outlet_id
      ${f.whereTxSql ? f.whereTxSql + ' AND p.must_have_line = ?' : 'WHERE p.must_have_line = ?'}
    `;
    const actualRes = db.query(actualSql, [...f.paramsTx, cfg.line_code])[0];
    const actualOc = actualRes ? actualRes.actual_oc : 0;

    // Requirement 5: 4 distinct, unambiguous metrics
    // A. Actual Penetration: Actual OC / Full Registered CL
    const actualPenetrationPct = registeredCl > 0 ? Math.round((actualOc / registeredCl) * 1000) / 10 : 0;
    // D. Progress to Target: Actual OC / Target Outlet Count
    const progressToTargetPct = targetOc > 0 ? Math.round((actualOc / targetOc) * 1000) / 10 : 0;
    const gapOc = Math.max(targetOc - actualOc, 0);

    return {
      lineCode: cfg.line_code,
      lineName: cfg.line_name,
      registeredCl,
      registeredUniverse: registeredCl,
      actualOc,
      actualPenetrationPct,
      targetPenetrationPct,
      targetOc,
      progressToTargetPct,
      achievementPct: progressToTargetPct,
      gapOc
    };
  });
}

function getKecamatanCoverage(filters = {}) {
  const db = getDb();
  const f = buildFilterConditions(filters);

  // 1. Transactions aggregated by kecamatan respecting f.whereTxSql
  const txSql = `
    SELECT
      o.kecamatan_id,
      COUNT(DISTINCT CASE WHEN h.unit_type = 'Sales' AND l.carton_quantity > 0 AND l.is_non_omzet = 0 THEN COALESCE(a.outlet_id, h.outlet_id) END) AS active_outlets,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS actual_cartons,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS sales_value,
      COUNT(DISTINCT h.current_owner_salesman_id) AS active_salesmen_count
    FROM fact_sales_header h
    JOIN fact_sales_line l ON h.document_number = l.document_number
    JOIN dim_product p ON l.item_code = p.item_code
    LEFT JOIN outlet_alias a ON h.outlet_id = a.source_customer_code
    JOIN dim_outlet o ON COALESCE(a.outlet_id, h.outlet_id) = o.outlet_id
    ${f.whereTxSql}
    GROUP BY o.kecamatan_id
  `;
  const txRows = db.query(txSql, f.paramsTx);
  const txMap = new Map();
  txRows.forEach(r => { if (r.kecamatan_id) txMap.set(r.kecamatan_id, r); });

  // 2. Dim kecamatan with registered counts
  let kecWhere = ['o.is_active_cl = 1'];
  let kecParams = [];
  if (filters.kecamatanId) {
    kecWhere.push('k.kecamatan_id = ?');
    kecParams.push(filters.kecamatanId);
  }
  const kecSql = `
    SELECT k.kecamatan_id, k.name AS kecamatan_name, COUNT(DISTINCT o.outlet_id) AS registered_outlets
    FROM dim_kecamatan k
    JOIN dim_outlet o ON k.kecamatan_id = o.kecamatan_id
    WHERE ${kecWhere.join(' AND ')}
    GROUP BY k.kecamatan_id, k.name
    ORDER BY registered_outlets DESC
  `;
  const kecRows = db.query(kecSql, kecParams);

  return kecRows.map(k => {
    const tx = txMap.get(k.kecamatan_id) || {};
    const reg = k.registered_outlets || 0;
    const act = tx.active_outlets || 0;
    const cov = reg > 0 ? Math.min(Math.round((act / reg) * 1000) / 10, 100.0) : 0;
    return {
      kecamatanId: k.kecamatan_id,
      kecamatanName: k.kecamatan_name,
      registeredOutlets: reg,
      activeOutlets: act,
      coveragePct: cov,
      actualCartons: Math.max(Math.round((tx.actual_cartons || 0) * 10) / 10, 0),
      salesValue: Math.round(tx.sales_value || 0),
      activeSalesmenCount: tx.active_salesmen_count || 0
    };
  });
}

function getPerformanceByRayon(filters = {}) {
  const db = getDb();
  const f = buildFilterConditions(filters);

  // 1. Transactions aggregated by rayon respecting f.whereTxSql
  const txSql = `
    SELECT
      o.current_rayon_id AS rayon_id,
      COUNT(DISTINCT CASE WHEN h.unit_type = 'Sales' AND l.carton_quantity > 0 AND l.is_non_omzet = 0 THEN COALESCE(a.outlet_id, h.outlet_id) END) AS active_outlets,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS actual_cartons,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS sales_value
    FROM fact_sales_header h
    JOIN fact_sales_line l ON h.document_number = l.document_number
    JOIN dim_product p ON l.item_code = p.item_code
    LEFT JOIN outlet_alias a ON h.outlet_id = a.source_customer_code
    JOIN dim_outlet o ON COALESCE(a.outlet_id, h.outlet_id) = o.outlet_id
    ${f.whereTxSql}
    GROUP BY o.current_rayon_id
  `;
  const txRows = db.query(txSql, f.paramsTx);
  const txMap = new Map();
  txRows.forEach(r => { if (r.rayon_id) txMap.set(r.rayon_id, r); });

  // 2. Dim rayon with registered counts
  let rayonWhere = ['o.is_active_cl = 1'];
  let rayonParams = [];
  if (filters.rayonId) {
    rayonWhere.push('r.rayon_id = ?');
    rayonParams.push(filters.rayonId);
  }
  const rayonSql = `
    SELECT r.rayon_id, r.code AS rayon_code, COUNT(DISTINCT o.outlet_id) AS registered_outlets
    FROM dim_rayon r
    LEFT JOIN dim_outlet o ON r.rayon_id = o.current_rayon_id
    WHERE ${rayonWhere.join(' AND ')}
    GROUP BY r.rayon_id, r.code
    ORDER BY r.code ASC
  `;
  const rayonRows = db.query(rayonSql, rayonParams);

  return rayonRows.map(r => {
    const tx = txMap.get(r.rayon_id) || {};
    const reg = r.registered_outlets || 0;
    const act = tx.active_outlets || 0;
    const cov = reg > 0 ? Math.min(Math.round((act / reg) * 1000) / 10, 100.0) : 0;
    return {
      rayonId: r.rayon_id,
      rayonCode: r.rayon_code,
      registeredOutlets: reg,
      activeOutlets: act,
      coveragePct: cov,
      actualCartons: Math.max(Math.round((tx.actual_cartons || 0) * 10) / 10, 0),
      salesValue: Math.round(tx.sales_value || 0)
    };
  });
}

function getMonthlyTrend(filters = {}, limit = 5) {
  const db = getDb();
  const currentY = parseInt(filters.year || 2026, 10);
  const currentM = parseInt(filters.month || 9, 10);
  const startM = Math.max(1, currentM - limit + 1);
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  const fAll = buildFilterConditions({ ...filters, year: currentY, month: currentM });
  const whereTxRange = [
    `((h.period_year = ? AND h.period_month >= ? AND h.period_month <= ?) OR (h.period_year IS NULL AND h.transaction_date >= ? AND h.transaction_date < ?))`
  ];
  const startMStr = String(startM).padStart(2, '0');
  const endNextM = currentM === 12 ? 1 : currentM + 1;
  const endNextY = currentM === 12 ? currentY + 1 : currentY;
  const startDate = `${currentY}-${startMStr}-01`;
  const endDate = `${endNextY}-${String(endNextM).padStart(2, '0')}-01`;
  const paramsTxRange = [currentY, startM, currentM, startDate, endDate];

  for (let i = 1; i < fAll.whereTx.length; i++) {
    whereTxRange.push(fAll.whereTx[i]);
  }
  for (let i = 4; i < fAll.paramsTx.length; i++) {
    paramsTxRange.push(fAll.paramsTx[i]);
  }

  const txSql = `
    SELECT
      COALESCE(h.period_month, CAST(substr(h.transaction_date, 6, 2) AS INT)) AS month,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS ktn,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS val,
      COUNT(DISTINCT CASE WHEN h.unit_type = 'Sales' AND l.carton_quantity > 0 AND l.is_non_omzet = 0 THEN COALESCE(a.outlet_id, h.outlet_id) END) AS oc
    FROM fact_sales_header h
    JOIN fact_sales_line l ON h.document_number = l.document_number
    JOIN dim_product p ON l.item_code = p.item_code
    LEFT JOIN outlet_alias a ON h.outlet_id = a.source_customer_code
    JOIN dim_outlet o ON COALESCE(a.outlet_id, h.outlet_id) = o.outlet_id
    WHERE ${whereTxRange.join(' AND ')}
    GROUP BY month
    ORDER BY month ASC
  `;

  const rows = db.query(txSql, paramsTxRange);

  const tgtMap = new Map();
  const whereTgtRange = [`t.year = ? AND t.month >= ? AND t.month <= ?`];
  const paramsTgtRange = [currentY, startM, currentM];
  for (let i = 1; i < fAll.whereTgt.length; i++) {
    whereTgtRange.push(fAll.whereTgt[i]);
  }
  for (let i = 2; i < fAll.paramsTgt.length; i++) {
    paramsTgtRange.push(fAll.paramsTgt[i]);
  }
  const tgtSql = `
    SELECT t.month, SUM(t.target_cartons) AS target_ktn
    FROM fact_quantity_target t
    WHERE ${whereTgtRange.join(' AND ')}
    GROUP BY t.month
  `;
  const tgtRows = db.query(tgtSql, paramsTgtRange);
  tgtRows.forEach(t => tgtMap.set(t.month, t.target_ktn));

  const rowMap = new Map();
  rows.forEach(r => rowMap.set(r.month, r));

  const result = [];
  for (let m = startM; m <= currentM; m++) {
    const r = rowMap.get(m) || {};
    const ktn = Math.max(Math.round((r.ktn || 0) * 10) / 10, 0);
    const val = Math.round((r.val || 0) / 100000) / 10;
    const oc = r.oc || 0;
    const targetKtn = tgtMap.get(m) || 0;
    const achv = targetKtn > 0 ? Math.round((ktn / targetKtn) * 1000) / 10 : null;

    result.push({
      month: m,
      name: monthNames[m] || `Bln ${m}`,
      ktn,
      val,
      oc,
      targetKtn: Math.round(targetKtn * 10) / 10,
      achv
    });
  }

  return result;
}

module.exports = {
  buildFilterConditions,
  getExecutiveSummary,
  getTopSalesmen,
  getMustHaveProgress,
  getKecamatanCoverage,
  getPerformanceByRayon,
  getMonthlyTrend
};
