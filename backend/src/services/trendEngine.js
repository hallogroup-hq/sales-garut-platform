const { getDb } = require('../db/connection.js');

const PALETTE = [
  '#2563eb', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#84cc16', // Lime
  '#64748b'  // Slate
];

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function generateTimeline(periodRange = '2026') {
  const periods = [];
  if (periodRange === '2025') {
    for (let m = 1; m <= 12; m++) {
      periods.push({
        key: `2025-${String(m).padStart(2, '0')}`,
        label: `${MONTH_NAMES[m]} '25`,
        year: 2025,
        month: m
      });
    }
  } else if (periodRange === 'all') {
    for (let m = 1; m <= 12; m++) {
      periods.push({
        key: `2025-${String(m).padStart(2, '0')}`,
        label: `${MONTH_NAMES[m]} '25`,
        year: 2025,
        month: m
      });
    }
    for (let m = 1; m <= 9; m++) {
      periods.push({
        key: `2026-${String(m).padStart(2, '0')}`,
        label: `${MONTH_NAMES[m]} '26`,
        year: 2026,
        month: m
      });
    }
  } else {
    // Default: 2026 (Jan - Sep)
    for (let m = 1; m <= 9; m++) {
      periods.push({
        key: `2026-${String(m).padStart(2, '0')}`,
        label: `${MONTH_NAMES[m]} '26`,
        year: 2026,
        month: m
      });
    }
  }
  return periods;
}

function getMovementAnalytics(options = {}) {
  const db = getDb();
  const dimension = options.dimension || 'salesman'; // 'salesman', 'principal', 'brand'
  const metric = options.metric || 'qty'; // 'qty', 'value', 'oa'
  const periodRange = options.periodRange || '2026'; // '2026', 'all', '2025'

  const timeline = generateTimeline(periodRange);
  const periodKeys = timeline.map(p => p.key);

  // Build filters
  let whereClauses = [];
  let params = [];

  if (periodRange === '2026') {
    whereClauses.push('a.year = 2026 AND a.month <= 9');
  } else if (periodRange === '2025') {
    whereClauses.push('a.year = 2025');
  } else {
    whereClauses.push('(a.year = 2025 OR (a.year = 2026 AND a.month <= 9))');
  }

  if (options.spvId) {
    whereClauses.push('s.spv_id = ?');
    params.push(options.spvId);
  }

  if (options.salesGroup) {
    whereClauses.push('a.sales_group = ?');
    params.push(options.salesGroup);
  }

  if (options.salesmanId) {
    whereClauses.push('a.salesman_id = ?');
    params.push(options.salesmanId);
  }

  if (options.principal) {
    whereClauses.push('a.principal = ?');
    params.push(options.principal);
  }

  if (options.brand) {
    whereClauses.push('a.brand = ?');
    params.push(options.brand);
  }

  if (options.subbrand) {
    whereClauses.push('a.group_sku IN (SELECT DISTINCT group_sku FROM dim_product WHERE subbrand = ?)');
    params.push(options.subbrand);
  }

  if (options.groupSku) {
    whereClauses.push('a.group_sku = ?');
    params.push(options.groupSku);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Dimension expression
  let idCol = 'a.salesman_id';
  let nameCol = 'a.salesman_name';

  if (dimension === 'principal') {
    idCol = 'a.principal';
    nameCol = 'a.principal';
  } else if (dimension === 'brand') {
    idCol = 'a.brand';
    nameCol = 'a.brand';
  }

  const sql = `
    SELECT
      ${idCol} AS entity_id,
      ${nameCol} AS entity_name,
      a.period_key,
      a.year,
      a.month,
      COALESCE(SUM(a.net_cartons), 0) AS total_qty,
      COALESCE(SUM(a.net_value), 0) AS total_val,
      COALESCE(SUM(a.dpp_value), 0) AS total_dpp,
      COALESCE(MAX(a.active_outlets), 0) AS max_oa,
      COALESCE(SUM(a.active_outlets), 0) AS sum_oa,
      COALESCE(SUM(a.total_invoices), 0) AS total_inv
    FROM agg_monthly_sales_movement a
    LEFT JOIN org_salesman s ON a.salesman_id = s.salesman_id
    ${whereSql}
    GROUP BY ${idCol}, ${nameCol}, a.period_key, a.year, a.month
    ORDER BY total_qty DESC
  `;

  const rows = db.query(sql, params);

  // Authentic Single-Counted Active Outlets (OA) Calculation from fact_sales_header
  let headerWhere = [];
  let headerParams = [];

  if (periodRange === '2026') {
    headerWhere.push('(COALESCE(h.period_year, CAST(substr(h.transaction_date, 1, 4) AS INT)) = 2026 AND COALESCE(h.period_month, CAST(substr(h.transaction_date, 6, 2) AS INT)) <= 9)');
  } else if (periodRange === '2025') {
    headerWhere.push('COALESCE(h.period_year, CAST(substr(h.transaction_date, 1, 4) AS INT)) = 2025');
  } else {
    headerWhere.push('(COALESCE(h.period_year, CAST(substr(h.transaction_date, 1, 4) AS INT)) = 2025 OR (COALESCE(h.period_year, CAST(substr(h.transaction_date, 1, 4) AS INT)) = 2026 AND COALESCE(h.period_month, CAST(substr(h.transaction_date, 6, 2) AS INT)) <= 9))');
  }

  if (options.spvId) {
    headerWhere.push('s.spv_id = ?');
    headerParams.push(options.spvId);
  }

  if (options.salesGroup) {
    const isScm = options.salesGroup.toUpperCase() === 'SCM' || options.salesGroup.toUpperCase() === 'SMC';
    if (isScm) {
      headerWhere.push("s.sales_group IN ('SCM', 'SMC')");
    } else {
      headerWhere.push('s.sales_group = ?');
      headerParams.push(options.salesGroup);
    }
  }

  if (options.salesmanId) {
    headerWhere.push('h.current_owner_salesman_id = ?');
    headerParams.push(options.salesmanId);
  }

  if (options.principal) {
    headerWhere.push('p.principal = ?');
    headerParams.push(options.principal);
  }

  if (options.brand) {
    headerWhere.push('p.brand = ?');
    headerParams.push(options.brand);
  }

  if (options.subbrand) {
    headerWhere.push('p.subbrand = ?');
    headerParams.push(options.subbrand);
  }

  if (options.groupSku) {
    headerWhere.push('p.group_sku = ?');
    headerParams.push(options.groupSku);
  }

  if (options.rayonId) {
    headerWhere.push('o.current_rayon_id = ?');
    headerParams.push(options.rayonId);
  }

  if (options.kecamatanId) {
    headerWhere.push('o.kecamatan_id = ?');
    headerParams.push(options.kecamatanId);
  }

  const headerWhereSql = headerWhere.length > 0 ? `WHERE ${headerWhere.join(' AND ')}` : '';

  // 1. Branch / overall scope single-counted distinct active outlets per month
  const hasSpecificFilter = Boolean(options.brand || options.principal || options.subbrand || options.groupSku || options.salesmanId || options.spvId || options.salesGroup || options.rayonId || options.kecamatanId);
  const branchOaMap = {};

  if (!hasSpecificFilter) {
    try {
      const dsoOaRows = db.query(`
        SELECT period_key, distinct_active_outlets
        FROM fact_distinct_active_outlet
        WHERE salesman_id = 'DSO' AND group_sku = 'ALL' AND month IS NOT NULL
      `);
      dsoOaRows.forEach(r => {
        branchOaMap[r.period_key] = r.distinct_active_outlets;
      });
    } catch (e) {}
  }

  const branchOaSql = `
    SELECT
      printf('%04d-%02d', COALESCE(h.period_year, CAST(substr(h.transaction_date, 1, 4) AS INT)), COALESCE(h.period_month, CAST(substr(h.transaction_date, 6, 2) AS INT))) AS period_key,
      COUNT(DISTINCT CASE WHEN h.unit_type = 'Sales' THEN h.outlet_id END) AS distinct_oa
    FROM fact_sales_header h
    LEFT JOIN org_salesman s ON h.current_owner_salesman_id = s.salesman_id
    LEFT JOIN fact_sales_line l ON h.document_number = l.document_number
    LEFT JOIN dim_product p ON l.item_code = p.item_code
    LEFT JOIN dim_outlet o ON h.outlet_id = o.outlet_id
    ${headerWhereSql}
    GROUP BY period_key
  `;
  const branchOaRows = db.query(branchOaSql, headerParams);
  branchOaRows.forEach(r => {
    if (hasSpecificFilter || !branchOaMap[r.period_key]) {
      branchOaMap[r.period_key] = r.distinct_oa;
    }
  });

  // 2. Entity-level single-counted distinct active outlets per month
  let entityOaIdCol = 'h.current_owner_salesman_id';
  if (dimension === 'principal') entityOaIdCol = 'p.principal';
  else if (dimension === 'brand') entityOaIdCol = 'p.brand';

  const entityOaMap = {};
  if (dimension !== 'principal' && dimension !== 'brand') {
    try {
      const smOaRows = db.query(`
        SELECT salesman_id, period_key, distinct_active_outlets
        FROM fact_distinct_active_outlet
        WHERE salesman_id != 'DSO' AND group_sku = 'ALL' AND month IS NOT NULL
      `);
      smOaRows.forEach(r => {
        if (!entityOaMap[r.salesman_id]) entityOaMap[r.salesman_id] = {};
        entityOaMap[r.salesman_id][r.period_key] = r.distinct_active_outlets;
      });
    } catch (e) {}
  }

  const entityOaSql = `
    SELECT
      ${entityOaIdCol} AS entity_id,
      printf('%04d-%02d', COALESCE(h.period_year, CAST(substr(h.transaction_date, 1, 4) AS INT)), COALESCE(h.period_month, CAST(substr(h.transaction_date, 6, 2) AS INT))) AS period_key,
      COUNT(DISTINCT CASE WHEN h.unit_type = 'Sales' THEN h.outlet_id END) AS distinct_oa
    FROM fact_sales_header h
    LEFT JOIN org_salesman s ON h.current_owner_salesman_id = s.salesman_id
    LEFT JOIN fact_sales_line l ON h.document_number = l.document_number
    LEFT JOIN dim_product p ON l.item_code = p.item_code
    ${headerWhereSql}
    GROUP BY entity_id, period_key
  `;
  const entityOaRows = db.query(entityOaSql, headerParams);
  entityOaRows.forEach(r => {
    if (!r.entity_id) return;
    if (!entityOaMap[r.entity_id]) entityOaMap[r.entity_id] = {};
    if (!entityOaMap[r.entity_id][r.period_key]) {
      entityOaMap[r.entity_id][r.period_key] = r.distinct_oa;
    }
  });

  // Targets query (for 2026)
  let targetMap = {}; // entity_id -> { month -> target_cartons }
  if (periodRange !== '2025') {
    let tgtSql = '';
    let tgtParams = [];
    if (dimension === 'salesman') {
      tgtSql = `
        SELECT salesman_id AS entity_id, month, SUM(target_cartons) AS tgt
        FROM fact_quantity_target
        WHERE year = 2026
        GROUP BY salesman_id, month
      `;
    } else if (dimension === 'brand') {
      tgtSql = `
        SELECT group_sku AS entity_id, month, SUM(target_cartons) AS tgt
        FROM fact_quantity_target
        WHERE year = 2026
        GROUP BY group_sku, month
      `;
    }

    if (tgtSql) {
      const tgtRows = db.query(tgtSql, tgtParams);
      for (const tr of tgtRows) {
        if (!targetMap[tr.entity_id]) targetMap[tr.entity_id] = {};
        targetMap[tr.entity_id][tr.month] = tr.tgt || 0;
      }
    }
  }

  // Aggregate by entity across periods
  const entityData = {}; // entity_id -> { name, periods: { period_key -> val }, total, targetTotal }
  let grandTotalQty = 0;
  let grandTotalVal = 0;
  const monthlyTotals = {};
  const monthlyTargets = {};

  periodKeys.forEach(pk => {
    monthlyTotals[pk] = 0;
    monthlyTargets[pk] = 0;
  });

  rows.forEach(r => {
    const eId = r.entity_id || 'UNKNOWN';
    const eName = r.entity_name || eId;

    if (!entityData[eId]) {
      entityData[eId] = {
        id: eId,
        name: eName,
        periods: {},
        totalQty: 0,
        totalVal: 0,
        totalOa: 0,
        oaByMonth: {},
        totalTarget: 0
      };
      periodKeys.forEach(pk => {
        entityData[eId].periods[pk] = 0;
        entityData[eId].oaByMonth[pk] = 0;
      });
    }

    const distinctOa = (entityOaMap[eId] && entityOaMap[eId][r.period_key]) ? entityOaMap[eId][r.period_key] : 0;

    const metricVal = metric === 'value'
      ? r.total_val
      : metric === 'oa'
        ? distinctOa
        : r.total_qty;

    entityData[eId].periods[r.period_key] = metricVal;
    entityData[eId].oaByMonth[r.period_key] = distinctOa;
    entityData[eId].totalQty += r.total_qty;
    entityData[eId].totalVal += r.total_val;
    entityData[eId].totalOa += distinctOa;

    if (metric !== 'oa') {
      monthlyTotals[r.period_key] = (monthlyTotals[r.period_key] || 0) + metricVal;
    }
    grandTotalQty += r.total_qty;
    grandTotalVal += r.total_val;
  });

  // Ensure all entities have accurate distinct OA across all timeline periods
  Object.keys(entityData).forEach(eId => {
    let entOaSum = 0;
    periodKeys.forEach(pk => {
      const distinctOa = (entityOaMap[eId] && entityOaMap[eId][pk]) ? entityOaMap[eId][pk] : 0;
      entityData[eId].oaByMonth[pk] = distinctOa;
      if (metric === 'oa') {
        entityData[eId].periods[pk] = distinctOa;
      }
      entOaSum += distinctOa;
    });
    entityData[eId].totalOa = entOaSum;
  });

  // For 'oa' metric, set monthlyTotals directly to the authentic branch single-counted distinct count
  if (metric === 'oa') {
    periodKeys.forEach(pk => {
      monthlyTotals[pk] = branchOaMap[pk] || 0;
    });
  }

  // Calculate targets per entity
  Object.keys(entityData).forEach(eId => {
    timeline.forEach(p => {
      if (p.year === 2026 && targetMap[eId] && targetMap[eId][p.month]) {
        const tgt = targetMap[eId][p.month] || 0;
        entityData[eId].totalTarget += tgt;
        monthlyTargets[p.key] = (monthlyTargets[p.key] || 0) + tgt;
      }
    });
  });

  // Sort entities by total descending
  const sortedEntities = Object.values(entityData).sort((a, b) => {
    const aVal = metric === 'value' ? a.totalVal : metric === 'oa' ? a.totalOa : a.totalQty;
    const bVal = metric === 'value' ? b.totalVal : metric === 'oa' ? b.totalOa : b.totalQty;
    return bVal - aVal;
  });

  // Build chart series (Top 8 + Lainnya)
  const topEntities = sortedEntities.slice(0, 8);
  const otherEntities = sortedEntities.slice(8);

  const chartSeries = topEntities.map((e, idx) => ({
    id: e.id,
    name: e.name,
    color: PALETTE[idx % PALETTE.length],
    data: periodKeys.map(pk => Math.round((e.periods[pk] || 0) * 100) / 100)
  }));

  if (otherEntities.length > 0) {
    const otherData = periodKeys.map(pk => {
      const sum = otherEntities.reduce((acc, e) => acc + (e.periods[pk] || 0), 0);
      return Math.round(sum * 100) / 100;
    });
    chartSeries.push({
      id: 'OTHERS',
      name: `Lainnya (${otherEntities.length})`,
      color: PALETTE[8],
      data: otherData
    });
  }

  // Active Outlets (OA) Series
  const oaSeries = topEntities.map((e, idx) => ({
    id: e.id,
    name: e.name,
    color: PALETTE[idx % PALETTE.length],
    data: periodKeys.map(pk => e.oaByMonth[pk] || 0)
  }));

  // Month-over-Month calculation on latest vs previous month
  const lastKey = periodKeys[periodKeys.length - 1];
  const prevKey = periodKeys.length > 1 ? periodKeys[periodKeys.length - 2] : null;

  const currentMonthVal = monthlyTotals[lastKey] || 0;
  const prevMonthVal = prevKey ? (monthlyTotals[prevKey] || 0) : 0;
  const momGrowthPct = prevMonthVal > 0
    ? Math.round(((currentMonthVal - prevMonthVal) / prevMonthVal) * 1000) / 10
    : 0;

  // Build matrix for data table
  const matrix = sortedEntities.map(e => {
    const primaryTotal = metric === 'value' ? e.totalVal : metric === 'oa' ? e.totalOa : e.totalQty;
    const lastVal = e.periods[lastKey] || 0;
    const prevVal = prevKey ? (e.periods[prevKey] || 0) : 0;
    const momPct = prevVal > 0 ? Math.round(((lastVal - prevVal) / prevVal) * 1000) / 10 : null;
    const achvPct = e.totalTarget > 0 ? Math.round((e.totalQty / e.totalTarget) * 1000) / 10 : null;

    const rowPeriods = {};
    periodKeys.forEach(pk => {
      rowPeriods[pk] = Math.round((e.periods[pk] || 0) * 100) / 100;
    });

    return {
      id: e.id,
      name: e.name,
      periods: rowPeriods,
      total: Math.round(primaryTotal * 100) / 100,
      totalQty: Math.round(e.totalQty * 100) / 100,
      totalVal: Math.round(e.totalVal),
      targetCartons: Math.round(e.totalTarget * 100) / 100,
      achvPct,
      momPct
    };
  });

  // Calculate OA Average: Single-counted distinct active outlets per month
  const totalMonths = periodKeys.length || 1;
  const sumMonthlyOa = periodKeys.reduce((acc, pk) => {
    return acc + (branchOaMap[pk] || 0);
  }, 0);
  const avgMonthlyOa = Math.round(sumMonthlyOa / totalMonths);

  // YoY & Full Year Comparison
  const yoyComparison = calculateYoYComparison(db, options);

  // Dedicated Total DSO Movement (Volume KTN, Net Value, OA, Target, MoM)
  const dsoMonthlyQty = {};
  const dsoMonthlyVal = {};
  periodKeys.forEach(pk => {
    dsoMonthlyQty[pk] = 0;
    dsoMonthlyVal[pk] = 0;
  });

  rows.forEach(r => {
    if (r.period_key && dsoMonthlyQty[r.period_key] !== undefined) {
      dsoMonthlyQty[r.period_key] += r.total_qty;
      dsoMonthlyVal[r.period_key] += r.total_val;
    }
  });

  // Query branch targets for 2026
  const branchTargetMap = {};
  if (periodRange !== '2025') {
    let btWhere = ['t.year = 2026'];
    let btParams = [];
    let btJoin = '';

    if (options.spvId) {
      btJoin = 'LEFT JOIN org_salesman s ON t.salesman_id = s.salesman_id';
      btWhere.push('s.spv_id = ?');
      btParams.push(options.spvId);
    }
    if (options.salesGroup) {
      if (!btJoin) btJoin = 'LEFT JOIN org_salesman s ON t.salesman_id = s.salesman_id';
      const isScm = options.salesGroup.toUpperCase() === 'SCM' || options.salesGroup.toUpperCase() === 'SMC';
      if (isScm) {
        btWhere.push("s.sales_group IN ('SCM', 'SMC')");
      } else {
        btWhere.push('s.sales_group = ?');
        btParams.push(options.salesGroup);
      }
    }
    if (options.salesmanId) {
      btWhere.push('t.salesman_id = ?');
      btParams.push(options.salesmanId);
    }
    if (options.groupSku) {
      btWhere.push('t.group_sku = ?');
      btParams.push(options.groupSku);
    } else if (options.brand) {
      btWhere.push('t.group_sku IN (SELECT DISTINCT group_sku FROM dim_product WHERE brand = ?)');
      btParams.push(options.brand);
    } else if (options.principal) {
      btWhere.push('t.group_sku IN (SELECT DISTINCT group_sku FROM dim_product WHERE principal = ?)');
      btParams.push(options.principal);
    } else if (options.subbrand) {
      btWhere.push('t.group_sku IN (SELECT DISTINCT group_sku FROM dim_product WHERE subbrand = ?)');
      btParams.push(options.subbrand);
    }

    const btSql = `
      SELECT t.month, SUM(t.target_cartons) as tgt
      FROM fact_quantity_target t
      ${btJoin}
      WHERE ${btWhere.join(' AND ')}
      GROUP BY t.month
    `;
    const btRows = db.query(btSql, btParams);
    btRows.forEach(r => {
      branchTargetMap[r.month] = r.tgt || 0;
    });
  }

  let prevDsoVol = null;
  let prevDsoOa = null;
  const dsoMonthlyTable = timeline.map(t => {
    const pk = t.key;
    const vol = Math.round((dsoMonthlyQty[pk] || 0) * 100) / 100;
    const val = Math.round(dsoMonthlyVal[pk] || 0);
    const oa = branchOaMap[pk] || 0;
    const tgt = (t.year === 2026 && branchTargetMap[t.month]) ? Math.round(branchTargetMap[t.month] * 100) / 100 : 0;
    const achvPct = tgt > 0 ? Math.round((vol / tgt) * 1000) / 10 : null;

    let momVolPct = null;
    if (prevDsoVol !== null && prevDsoVol > 0) {
      momVolPct = Math.round(((vol - prevDsoVol) / prevDsoVol) * 1000) / 10;
    }
    let momOaPct = null;
    if (prevDsoOa !== null && prevDsoOa > 0) {
      momOaPct = Math.round(((oa - prevDsoOa) / prevDsoOa) * 1000) / 10;
    }

    prevDsoVol = vol;
    prevDsoOa = oa;

    return {
      periodKey: pk,
      label: t.label,
      year: t.year,
      month: t.month,
      volumeCartons: vol,
      volumeValue: val,
      activeOutlets: oa,
      targetCartons: tgt,
      achvPct,
      momVolPct,
      momOaPct
    };
  });

  const totalDsoVolume = Math.round(grandTotalQty * 100) / 100;
  const totalDsoTarget = Math.round(dsoMonthlyTable.reduce((acc, m) => acc + (m.targetCartons || 0), 0) * 100) / 100;
  const overallDsoAchvPct = totalDsoTarget > 0 ? Math.round((totalDsoVolume / totalDsoTarget) * 1000) / 10 : null;
  const totalDsoValue = Math.round(grandTotalVal);

  const dsoMovement = {
    labels: timeline.map(t => t.label),
    volumeSeries: dsoMonthlyTable.map(m => m.volumeCartons),
    oaSeries: dsoMonthlyTable.map(m => m.activeOutlets),
    targetSeries: dsoMonthlyTable.map(m => m.targetCartons),
    monthlyTable: dsoMonthlyTable,
    totals: {
      totalVolume: totalDsoVolume,
      totalTarget: totalDsoTarget,
      achvPct: overallDsoAchvPct,
      avgOa: avgMonthlyOa,
      totalValue: totalDsoValue
    }
  };

  return {
    dimension,
    metric,
    periodRange,
    timeline,
    summary: {
      totalQty: Math.round(grandTotalQty * 100) / 100,
      totalValue: Math.round(grandTotalVal),
      avgMonthlyOa,
      currentMonthVal: Math.round(currentMonthVal * 100) / 100,
      prevMonthVal: Math.round(prevMonthVal * 100) / 100,
      momGrowthPct
    },
    dsoMovement,
    yearOverYearComparison: yoyComparison,
    chart: {
      labels: timeline.map(t => t.label),
      series: chartSeries,
      monthlyTotals: periodKeys.map(pk => Math.round((monthlyTotals[pk] || 0) * 100) / 100),
      monthlyTargets: periodKeys.map(pk => Math.round((monthlyTargets[pk] || 0) * 100) / 100)
    },
    oaChart: {
      labels: timeline.map(t => t.label),
      series: oaSeries
    },
    matrix
  };
}

function calculateYoYComparison(db, options = {}) {
  let whereClauses = [];
  let params = [];

  if (options.spvId) {
    whereClauses.push('s.spv_id = ?');
    params.push(options.spvId);
  }
  if (options.salesGroup) {
    whereClauses.push('a.sales_group = ?');
    params.push(options.salesGroup);
  }
  if (options.salesmanId) {
    whereClauses.push('a.salesman_id = ?');
    params.push(options.salesmanId);
  }
  if (options.principal) {
    whereClauses.push('a.principal = ?');
    params.push(options.principal);
  }
  if (options.brand) {
    whereClauses.push('a.brand = ?');
    params.push(options.brand);
  }

  const extraWhere = whereClauses.length > 0 ? ' AND ' + whereClauses.join(' AND ') : '';

  // Determine latest 2026 month or selected month
  const maxMRow = db.query(
    `SELECT MAX(a.month) as max_m FROM agg_monthly_sales_movement a LEFT JOIN org_salesman s ON a.salesman_id = s.salesman_id WHERE a.year = 2026 ${extraWhere}`,
    params
  )[0];
  const asOfMonth = options.month ? parseInt(options.month, 10) : (maxMRow?.max_m || 9);

  // 1. Full Year 2025
  const fy2025 = db.query(
    `SELECT COALESCE(SUM(a.net_cartons), 0) as qty, COALESCE(SUM(a.net_value), 0) as val 
     FROM agg_monthly_sales_movement a 
     LEFT JOIN org_salesman s ON a.salesman_id = s.salesman_id 
     WHERE a.year = 2025 ${extraWhere}`,
    params
  )[0];

  // 2. YTD 2026 (Month 1..asOfMonth)
  const ytd2026 = db.query(
    `SELECT COALESCE(SUM(a.net_cartons), 0) as qty, COALESCE(SUM(a.net_value), 0) as val 
     FROM agg_monthly_sales_movement a 
     LEFT JOIN org_salesman s ON a.salesman_id = s.salesman_id 
     WHERE a.year = 2026 AND a.month <= ? ${extraWhere}`,
    [asOfMonth, ...params]
  )[0];

  // 3. YTD 2025 (Month 1..asOfMonth)
  const ytd2025 = db.query(
    `SELECT COALESCE(SUM(a.net_cartons), 0) as qty, COALESCE(SUM(a.net_value), 0) as val 
     FROM agg_monthly_sales_movement a 
     LEFT JOIN org_salesman s ON a.salesman_id = s.salesman_id 
     WHERE a.year = 2025 AND a.month <= ? ${extraWhere}`,
    [asOfMonth, ...params]
  )[0];

  const fy2025Qty = Math.round((fy2025?.qty || 0) * 100) / 100;
  const fy2025Val = Math.round(fy2025?.val || 0);
  const ytd2026Qty = Math.round((ytd2026?.qty || 0) * 100) / 100;
  const ytd2026Val = Math.round(ytd2026?.val || 0);
  const ytd2025Qty = Math.round((ytd2025?.qty || 0) * 100) / 100;
  const ytd2025Val = Math.round(ytd2025?.val || 0);

  // Full Year 2025 vs YTD 2026
  const gapFyQty = Math.round((ytd2026Qty - fy2025Qty) * 100) / 100;
  const gapFyVal = Math.round(ytd2026Val - fy2025Val);
  const pctAchievedFyQty = fy2025Qty > 0 ? Math.round((ytd2026Qty / fy2025Qty) * 1000) / 10 : 0;
  const pctAchievedFyVal = fy2025Val > 0 ? Math.round((ytd2026Val / fy2025Val) * 1000) / 10 : 0;
  const gapPctFyQty = fy2025Qty > 0 ? Math.round((gapFyQty / fy2025Qty) * 1000) / 10 : 0;
  const gapPctFyVal = fy2025Val > 0 ? Math.round((gapFyVal / fy2025Val) * 1000) / 10 : 0;

  // YTD 2025 vs YTD 2026 (Apple-to-Apple)
  const diffQty = Math.round((ytd2026Qty - ytd2025Qty) * 100) / 100;
  const diffVal = Math.round(ytd2026Val - ytd2025Val);
  const growthQtyPct = ytd2025Qty > 0 ? Math.round((diffQty / ytd2025Qty) * 1000) / 10 : 0;
  const growthValPct = ytd2025Val > 0 ? Math.round((diffVal / ytd2025Val) * 1000) / 10 : 0;

  return {
    asOfMonth,
    fullYear2025VsYtd2026: {
      fy2025Qty,
      fy2025Val,
      totalQty2025: fy2025Qty,
      totalValue2025: fy2025Val,
      ytd2026Qty,
      ytd2026Val,
      totalQtyYtd2026: ytd2026Qty,
      totalValueYtd2026: ytd2026Val,
      pctAchievedQty: pctAchievedFyQty,
      achievedPctQty: pctAchievedFyQty,
      pctAchievedVal: pctAchievedFyVal,
      achievedPctVal: pctAchievedFyVal,
      gapQty: gapFyQty,
      gapVal: gapFyVal,
      gapValue: gapFyVal,
      gapPctQty: gapPctFyQty,
      gapPctVal: gapPctFyVal
    },
    ytd2025VsYtd2026: {
      asOfMonth,
      ytdMonths: asOfMonth,
      ytd2025Qty,
      ytd2025Val,
      totalQtyYtd2025: ytd2025Qty,
      totalValueYtd2025: ytd2025Val,
      ytd2026Qty,
      ytd2026Val,
      totalQtyYtd2026: ytd2026Qty,
      totalValueYtd2026: ytd2026Val,
      diffQty,
      diffVal,
      diffValue: diffVal,
      growthQtyPct,
      growthPctQty: growthQtyPct,
      growthValPct,
      growthPctValue: growthValPct,
      positionQty: diffQty >= 0 ? 'SURPLUS' : 'DEFICIT',
      positionVal: diffVal >= 0 ? 'SURPLUS' : 'DEFICIT'
    }
  };
}

function exportMovementCsv(options = {}) {
  const data = getMovementAnalytics(options);
  const headerCols = ['No', data.dimension.toUpperCase()];
  data.timeline.forEach(t => headerCols.push(t.label));
  headerCols.push('TOTAL', 'TARGET 2026', 'ACHV %', 'MoM %');

  const rows = [headerCols.join(',')];

  data.matrix.forEach((row, idx) => {
    const line = [
      idx + 1,
      `"${(row.name || '').replace(/"/g, '""')}"`
    ];
    data.timeline.forEach(t => {
      line.push(row.periods[t.key] || 0);
    });
    line.push(
      row.total,
      row.targetCartons || '-',
      row.achvPct !== null ? `${row.achvPct}%` : '-',
      row.momPct !== null ? `${row.momPct}%` : '-'
    );
    rows.push(line.join(','));
  });

  return rows.join('\n');
}

module.exports = {
  getMovementAnalytics,
  exportMovementCsv,
  generateTimeline,
  calculateYoYComparison
};
