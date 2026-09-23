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

    const metricVal = metric === 'value'
      ? r.total_val
      : metric === 'oa'
        ? r.max_oa
        : r.total_qty;

    entityData[eId].periods[r.period_key] = metricVal;
    entityData[eId].oaByMonth[r.period_key] = r.max_oa;
    entityData[eId].totalQty += r.total_qty;
    entityData[eId].totalVal += r.total_val;
    entityData[eId].totalOa += r.max_oa;

    monthlyTotals[r.period_key] = (monthlyTotals[r.period_key] || 0) + metricVal;
    grandTotalQty += r.total_qty;
    grandTotalVal += r.total_val;
  });

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

  // Calculate OA Average
  const totalMonths = periodKeys.length || 1;
  const sumMonthlyOa = periodKeys.reduce((acc, pk) => {
    // Count unique outlets active in that month
    return acc + (monthlyTotals[pk] && metric === 'oa' ? monthlyTotals[pk] : 0);
  }, 0);
  const avgMonthlyOa = Math.round(sumMonthlyOa / totalMonths);

  // YoY & Full Year Comparison
  const yoyComparison = calculateYoYComparison(db, options);

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
