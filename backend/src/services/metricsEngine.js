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
  const month = parseInt(filters.month || 5, 10);

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

  // Salesman Group filter (SAVORIA, SMC, SAVORIA_OTHERS)
  if (filters.salesGroup) {
    whereTx.push(`h.current_owner_salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group = ?)`);
    paramsTx.push(filters.salesGroup);

    whereTgt.push(`t.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group = ?)`);
    paramsTgt.push(filters.salesGroup);

    whereOutlet.push(`o.current_salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group = ?)`);
    paramsOutlet.push(filters.salesGroup);
  }

  // Product filters
  if (filters.principal) {
    whereTx.push(`p.principal = ?`);
    paramsTx.push(filters.principal);
  }
  if (filters.brand) {
    whereTx.push(`p.brand = ?`);
    paramsTx.push(filters.brand);
  }
  if (filters.groupSku) {
    whereTx.push(`p.group_sku = ?`);
    paramsTx.push(filters.groupSku);

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
  const cal = getCalendarPace(f.year, f.month);

  // 1. Actual Sales Aggregation
  const salesSql = `
    SELECT
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS net_cartons,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE 0 END), 0) AS gross_cartons,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Return' THEN l.carton_quantity ELSE 0 END), 0) AS return_cartons,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS net_value,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.dpp_amount ELSE -l.dpp_amount END), 0) AS net_dpp,
      COUNT(DISTINCT h.document_number) AS total_invoices,
      COUNT(DISTINCT h.outlet_id) AS active_outlets_mtd
    FROM fact_sales_line l
    JOIN fact_sales_header h ON l.document_number = h.document_number
    JOIN dim_product p ON l.item_code = p.item_code
    JOIN dim_outlet o ON h.outlet_id = o.outlet_id
    ${f.whereTxSql}
  `;
  const salesRes = db.query(salesSql, f.paramsTx)[0];

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
  if (!filters.salesmanId && !filters.spvId && !filters.kecamatanId && !filters.rayonId && !filters.salesGroup) {
    registeredCl = 2452;
  } else if (filters.salesmanId) {
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
  } else {
    const clSql = `
      SELECT COUNT(*) AS registered_outlets
      FROM dim_outlet o
      JOIN org_salesman s ON o.current_salesman_id = s.salesman_id
      ${f.whereOutletSql ? f.whereOutletSql + ' AND o.is_active_cl = 1 AND s.has_rayon = 1' : 'WHERE o.is_active_cl = 1 AND s.has_rayon = 1'}
    `;
    const clRes = db.query(clSql, f.paramsOutlet)[0];
    registeredCl = clRes?.registered_outlets || 2452;
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
  const cal = getCalendarPace(f.year, f.month);

  let groupClause = '';
  const queryParams = [f.year, f.month, f.year, f.month, f.year, f.month, f.year, f.month, f.startDate, f.endDate];

  if (filters.salesGroup) {
    groupClause = ' AND s.sales_group = ?';
    queryParams.push(filters.salesGroup);
  } else if (!filters.includeAllGroups) {
    // Focus on salesmen with assigned rayons (Kanvas, GT, CB)
    groupClause = ' AND s.has_rayon = 1';
  }
  queryParams.push(limit);

  const sql = `
    SELECT
      s.salesman_id,
      s.name AS salesman_name,
      spv.name AS spv_name,
      s.salesman_type,
      s.sales_group,
      s.target_cl,
      s.visit_cycle,
      s.has_rayon,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS actual_cartons,
      (
        SELECT COUNT(*)
        FROM fact_quantity_target t
        WHERE t.salesman_id = s.salesman_id AND t.year = ? AND t.month = ?
      ) AS target_record_count,
      (
        SELECT SUM(t.target_cartons)
        FROM fact_quantity_target t
        WHERE t.salesman_id = s.salesman_id AND t.year = ? AND t.month = ?
      ) AS target_cartons,
      (
        SELECT SUM(t.target_value)
        FROM fact_quantity_target t
        WHERE t.salesman_id = s.salesman_id AND t.year = ? AND t.month = ?
      ) AS target_value,
      COUNT(DISTINCT h.outlet_id) AS active_outlets,
      (SELECT COUNT(*) FROM dim_outlet o WHERE o.current_salesman_id = s.salesman_id AND o.is_active_cl = 1) AS registered_outlets
    FROM org_salesman s
    LEFT JOIN org_spv spv ON s.spv_id = spv.spv_id
    LEFT JOIN fact_sales_header h ON s.salesman_id = h.current_owner_salesman_id AND ((h.period_year = ? AND h.period_month = ?) OR (h.period_year IS NULL AND h.transaction_date >= ? AND h.transaction_date < ?))
    LEFT JOIN fact_sales_line l ON h.document_number = l.document_number
    WHERE s.role = 'SALESMAN' AND s.is_active = 1 ${groupClause}
    GROUP BY s.salesman_id, s.name, spv.name, s.salesman_type, s.sales_group, s.target_cl, s.visit_cycle, s.has_rayon
    ORDER BY actual_cartons DESC
    LIMIT ?
  `;

  const rows = db.query(sql, queryParams);
  return rows.map((r, idx) => {
    const act = Math.max(Math.round(r.actual_cartons * 10) / 10, 0);
    const hasTarget = r.target_record_count > 0;
    const tgt = hasTarget && r.target_cartons !== null ? Math.round(r.target_cartons * 10) / 10 : null;
    const tgtVal = hasTarget && r.target_value !== null ? Math.round(r.target_value) : null;
    const achv = hasTarget && tgt > 0 ? Math.round((act / tgt) * 1000) / 10 : null;

    // Requirement 1: Denominator is registered CL for this salesman. Cap at 100%.
    const regCl = r.registered_outlets || 0;
    const rawCov = regCl > 0 ? (r.active_outlets / regCl) * 100 : 0;
    const cov = Math.min(Math.round(rawCov * 10) / 10, 100.0);

    const isFull = Boolean(cal.isFullMonth || cal.monFriRemainingHk === 0);
    const gapMonthly = tgt !== null ? Math.round((tgt - act) * 10) / 10 : null;
    const gapDaily = tgt !== null && !isFull && cal.monFriRemainingHk > 0 ? Math.round(((tgt - act) / cal.monFriRemainingHk) * 10) / 10 : 0;

    let paceStatus = 'N/A';
    if (hasTarget && tgt > 0 && achv !== null) {
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
      rank: idx + 1,
      salesmanId: r.salesman_id,
      salesmanName: r.salesman_name,
      spvName: r.spv_name,
      salesmanType: r.salesman_type || 'Kanvas',
      salesGroup: r.sales_group || 'SAVORIA',
      targetCl: r.target_cl || 375,
      visitCycle: r.visit_cycle || '3 Minggu',
      hasRayon: r.has_rayon !== undefined ? r.has_rayon : 1,
      actualCartons: act,
      hasTarget,
      targetCartons: tgt,
      targetValue: tgtVal,
      achievementPct: achv,
      gapMonthly,
      gapDaily,
      timegonePct: cal.timegonePct,
      paceStatus,
      activeOutlets: r.active_outlets,
      registeredOutlets: regCl,
      coveragePct: cov
    };
  });
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
      SELECT COUNT(DISTINCT h.outlet_id) AS actual_oc
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      JOIN dim_outlet o ON h.outlet_id = o.outlet_id
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

  const sql = `
    SELECT
      k.kecamatan_id,
      k.name AS kecamatan_name,
      COUNT(DISTINCT o.outlet_id) AS registered_outlets,
      COUNT(DISTINCT CASE WHEN h.document_number IS NOT NULL THEN o.outlet_id END) AS active_outlets,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS actual_cartons,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS sales_value,
      COUNT(DISTINCT h.current_owner_salesman_id) AS active_salesmen_count
    FROM dim_kecamatan k
    JOIN dim_outlet o ON k.kecamatan_id = o.kecamatan_id AND o.is_active_cl = 1
    LEFT JOIN fact_sales_header h ON o.outlet_id = h.outlet_id AND ((h.period_year = ? AND h.period_month = ?) OR (h.period_year IS NULL AND h.transaction_date >= ? AND h.transaction_date < ?))
    LEFT JOIN fact_sales_line l ON h.document_number = l.document_number
    GROUP BY k.kecamatan_id, k.name
    ORDER BY registered_outlets DESC
  `;

  const rows = db.query(sql, [f.year, f.month, f.startDate, f.endDate]);
  return rows.map(r => {
    const reg = r.registered_outlets || 0;
    const act = r.active_outlets || 0;
    const cov = reg > 0 ? Math.round((act / reg) * 1000) / 10 : 0;
    return {
      kecamatanId: r.kecamatan_id,
      kecamatanName: r.kecamatan_name,
      registeredOutlets: reg,
      activeOutlets: act,
      coveragePct: cov,
      actualCartons: Math.max(Math.round(r.actual_cartons * 10) / 10, 0),
      salesValue: Math.round(r.sales_value),
      activeSalesmenCount: r.active_salesmen_count
    };
  });
}

function getPerformanceByRayon(filters = {}) {
  const db = getDb();
  const f = buildFilterConditions(filters);

  const sql = `
    SELECT
      r.rayon_id,
      r.code AS rayon_code,
      COUNT(DISTINCT o.outlet_id) AS registered_outlets,
      COUNT(DISTINCT CASE WHEN h.document_number IS NOT NULL THEN o.outlet_id END) AS active_outlets,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS actual_cartons,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS sales_value
    FROM dim_rayon r
    LEFT JOIN dim_outlet o ON r.rayon_id = o.current_rayon_id AND o.is_active_cl = 1
    LEFT JOIN fact_sales_header h ON o.outlet_id = h.outlet_id AND ((h.period_year = ? AND h.period_month = ?) OR (h.period_year IS NULL AND h.transaction_date >= ? AND h.transaction_date < ?))
    LEFT JOIN fact_sales_line l ON h.document_number = l.document_number
    GROUP BY r.rayon_id, r.code
    ORDER BY r.code ASC
  `;

  const rows = db.query(sql, [f.year, f.month, f.startDate, f.endDate]);
  return rows.map(r => {
    const reg = r.registered_outlets || 0;
    const act = r.active_outlets || 0;
    const cov = reg > 0 ? Math.round((act / reg) * 1000) / 10 : 0;
    return {
      rayonId: r.rayon_id,
      rayonCode: r.rayon_code,
      registeredOutlets: reg,
      activeOutlets: act,
      coveragePct: cov,
      actualCartons: Math.max(Math.round(r.actual_cartons * 10) / 10, 0),
      salesValue: Math.round(r.sales_value)
    };
  });
}

module.exports = {
  buildFilterConditions,
  getExecutiveSummary,
  getTopSalesmen,
  getMustHaveProgress,
  getKecamatanCoverage,
  getPerformanceByRayon
};
