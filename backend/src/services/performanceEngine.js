const { getDb } = require('../db/connection.js');
const { getCalendarPace } = require('./calendarEngine.js');
const { getExecutiveSummary, getTopSalesmen, buildFilterConditions } = require('./metricsEngine.js');
const { getMovementAnalytics } = require('./trendEngine.js');

/**
 * Total Performance Analytics Engine
 * Single Source of Truth across:
 * 1. Total DSO Garut (KPIs, monthly target vs actual, and brand/principal mix)
 * 2. By Salesman (Rank, Target, Actual, Achv %, GAP, Registered CL, OA, Coverage %, Pace)
 * 3. By Sub-brand (Volume KTN, Omzet Rp, Share %, Buying Outlets OA, Category)
 */
function getTotalPerformanceSummary(filters = {}) {
  const db = getDb();
  const year = parseInt(filters.year || 2026, 10);
  const month = parseInt(filters.month || 9, 10);
  const asOfDateStr = filters.asOfDate || `${year}-${String(month).padStart(2, '0')}-25`;

  // 1. Executive Summary & KPIs
  const exec = getExecutiveSummary({ ...filters, year, month, asOfDate: asOfDateStr });
  const calendar = exec.calendar;
  const s = exec.sales;
  const c = exec.coverage;

  const kpis = {
    year,
    month,
    calendar,
    targetCartons: s.targetCartons,
    targetValue: s.targetValue,
    actualCartons: s.actualCartons,
    salesNetto: s.salesNettoValue,
    salesDpp: s.salesDppValue,
    achievementPct: s.achievementPct,
    hasTarget: s.hasTarget,
    remainingTarget: s.remainingTarget,
    gapDaily: s.gapDailyMonFri || s.gapDailyPace || 0,
    registeredOutlets: c.registeredOutlets,
    activeOutletsMtd: c.activeOutletsMtd,
    coveragePct: c.coveragePct,
    totalInvoices: s.totalInvoices
  };

  // 2. DSO Monthly Trend & Dual-Axis Timeline
  const movement = getMovementAnalytics({
    ...filters,
    periodRange: filters.periodRange || '2026',
    dimension: 'brand',
    metric: 'qty'
  });

  const dsoMonthly = (movement.dsoMovement?.monthlyTable || []).map(m => ({
    month: m.month,
    monthLabel: m.label,
    periodKey: m.periodKey,
    targetCartons: m.targetCartons,
    actualCartons: m.volumeCartons,
    salesNetto: m.volumeValue,
    activeOutlets: m.activeOutlets,
    achievementPct: m.achvPct,
    momVolPct: m.momVolPct,
    momOaPct: m.momOaPct,
    isCurrentMonth: m.year === year && m.month === month
  }));

  // 3. Performance By Salesman (Complete List)
  const salesmenData = getTopSalesmen({ ...filters, year, month, asOfDate: asOfDateStr }, 50);
  const bySalesman = salesmenData.map(sm => ({
    rank: sm.rank,
    salesmanId: sm.salesmanId,
    salesmanName: sm.salesmanName,
    spvName: sm.spvName || 'N/A',
    salesGroup: sm.salesGroup,
    salesmanType: sm.salesmanType || 'GT',
    targetCartons: sm.targetCartons,
    targetValue: sm.targetValue,
    actualCartons: sm.actualCartons,
    salesNetto: Math.round(sm.actualCartons * (sm.targetCartons > 0 ? (sm.targetValue / sm.targetCartons) : 126000)),
    achievementPct: sm.achievementPct,
    gapCartons: sm.gapMonthly,
    gapDaily: sm.gapDaily,
    registeredOutlets: sm.registeredOutlets,
    activeOutlets: sm.activeOutlets,
    coveragePct: sm.coveragePct,
    paceStatus: sm.paceStatus,
    visitCycle: sm.visitCycle
  }));

  // 4. Performance By Sub-brand (Deep Breakdown)
  const f = buildFilterConditions(filters);
  const subbrandSql = `
    SELECT
      COALESCE(p.subbrand, p.item_name) as subbrand,
      p.brand,
      p.principal,
      p.group_sku,
      COALESCE(SUM(l.carton_quantity), 0) as cartons,
      COALESCE(SUM(l.sales_netto), 0) as sales_netto,
      COALESCE(SUM(l.dpp_amount), 0) as sales_dpp,
      COUNT(DISTINCT CASE WHEN h.unit_type = 'Sales' THEN h.outlet_id END) as active_outlets,
      COUNT(DISTINCT h.document_number) as invoice_count
    FROM fact_sales_header h
    JOIN fact_sales_line l ON h.document_number = l.document_number
    JOIN dim_product p ON l.item_code = p.item_code
    LEFT JOIN dim_outlet o ON h.outlet_id = o.outlet_id
    ${f.whereTx.length > 0 ? `WHERE ${f.whereTx.join(' AND ')}` : ''}
    GROUP BY COALESCE(p.subbrand, p.item_name), p.brand, p.principal, p.group_sku
    ORDER BY cartons DESC
  `;
  const subbrandRows = db.query(subbrandSql, f.paramsTx);

  const totalSubbrandCartons = subbrandRows.reduce((acc, r) => acc + (r.cartons || 0), 0) || 1;

  const bySubbrand = subbrandRows.map((r, idx) => {
    const rawCartons = Math.round((r.cartons || 0) * 100) / 100;
    const rawNetValue = Math.round(r.sales_netto || 0);
    const rawDpp = Math.round(r.sales_dpp || 0);

    // Contribution percentage relative to total subbrand volume
    const contributionPct = Math.round((rawCartons / totalSubbrandCartons) * 1000) / 10;
    const avgPriceCarton = rawCartons > 0 ? Math.round(rawNetValue / rawCartons) : 0;

    return {
      rank: idx + 1,
      subbrand: r.subbrand,
      brand: r.brand || 'N/A',
      principal: r.principal || 'N/A',
      groupSku: r.group_sku || 'N/A',
      actualCartons: rawCartons,
      salesNetto: rawNetValue,
      salesDpp: rawDpp,
      contributionPct,
      activeOutlets: r.active_outlets || 0,
      invoiceCount: r.invoice_count || 0,
      avgPriceCarton
    };
  });

  // 5. Brand & Principal Mix
  const brandMixSql = `
    SELECT
      p.brand,
      p.principal,
      COALESCE(SUM(l.carton_quantity), 0) as cartons,
      COALESCE(SUM(l.sales_netto), 0) as net_value,
      COUNT(DISTINCT CASE WHEN h.unit_type = 'Sales' THEN h.outlet_id END) as active_outlets
    FROM fact_sales_header h
    JOIN fact_sales_line l ON h.document_number = l.document_number
    JOIN dim_product p ON l.item_code = p.item_code
    LEFT JOIN dim_outlet o ON h.outlet_id = o.outlet_id
    ${f.whereTx.length > 0 ? `WHERE ${f.whereTx.join(' AND ')}` : ''}
    GROUP BY p.brand, p.principal
    ORDER BY cartons DESC
  `;
  const brandMixRows = db.query(brandMixSql, f.paramsTx);
  const brandMix = brandMixRows.map(r => ({
    brand: r.brand,
    principal: r.principal,
    actualCartons: Math.round((r.cartons || 0) * 100) / 100,
    salesNetto: Math.round(r.net_value || 0),
    activeOutlets: r.active_outlets || 0,
    contributionPct: totalSubbrandCartons > 0 ? Math.round(((r.cartons || 0) / totalSubbrandCartons) * 1000) / 10 : 0
  }));

  return {
    kpis,
    dsoMonthly,
    bySalesman,
    bySubbrand,
    brandMix,
    dsoMovement: movement.dsoMovement
  };
}

/**
 * Generate CSV export for Total Performance
 */
function exportPerformanceCsv(filters = {}, view = 'dso') {
  const data = getTotalPerformanceSummary(filters);
  const viewType = (view || 'dso').toLowerCase();

  let csvRows = [];
  if (viewType === 'salesman') {
    csvRows.push(['Rank', 'Salesman ID', 'Nama Salesman', 'SPV', 'Tipe', 'Sales Group', 'Target (KTN)', 'Aktual (KTN)', 'Pencapaian (%)', 'GAP (KTN)', 'GAP Harian (KTN)', 'Target CL', 'Outlet Aktif (OA)', 'Coverage (%)', 'Nilai Netto (Rp)', 'Status Pace'].join(','));
    data.bySalesman.forEach(s => {
      csvRows.push([
        s.rank,
        `"${s.salesmanId}"`,
        `"${s.salesmanName}"`,
        `"${s.spvName}"`,
        `"${s.salesmanType}"`,
        `"${s.salesGroup}"`,
        s.targetCartons,
        s.actualCartons,
        s.achievementPct !== null ? s.achievementPct : '',
        s.gapCartons,
        s.gapDaily,
        s.registeredOutlets,
        s.activeOutlets,
        s.coveragePct,
        s.salesNetto,
        s.paceStatus
      ].join(','));
    });
  } else if (viewType === 'subbrand') {
    csvRows.push(['Rank', 'Sub-brand', 'Brand', 'Principal', 'Group SKU', 'Volume (KTN)', 'Omzet Netto (Rp)', 'Kontribusi (%)', 'Outlet Pembeli (OA)', 'Total Faktur', 'Harga Rata-rata/KTN'].join(','));
    data.bySubbrand.forEach(b => {
      csvRows.push([
        b.rank,
        `"${b.subbrand.replace(/"/g, '""')}"`,
        `"${b.brand.replace(/"/g, '""')}"`,
        `"${b.principal.replace(/"/g, '""')}"`,
        `"${b.groupSku.replace(/"/g, '""')}"`,
        b.actualCartons,
        b.salesNetto,
        b.contributionPct,
        b.activeOutlets,
        b.invoiceCount,
        b.avgPriceCarton
      ].join(','));
    });
  } else {
    // Default: Total DSO Monthly Breakdown
    csvRows.push(['Periode', 'Target Volume (KTN)', 'Realisasi Volume (KTN)', 'Pencapaian (%)', 'MoM Volume (%)', 'Outlet Aktif (OA Toko)', 'MoM OA (%)', 'Omzet Netto (Rp)'].join(','));
    data.dsoMonthly.forEach(m => {
      csvRows.push([
        `"${m.monthLabel} 2026"`,
        m.targetCartons,
        m.actualCartons,
        m.achievementPct !== null ? m.achievementPct : '',
        m.momVolPct !== null ? m.momVolPct : '',
        m.activeOutlets,
        m.momOaPct !== null ? m.momOaPct : '',
        m.salesNetto
      ].join(','));
    });
  }

  return csvRows.join('\r\n');
}

module.exports = {
  getTotalPerformanceSummary,
  exportPerformanceCsv
};
