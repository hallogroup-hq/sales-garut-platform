const { getDb } = require('../db/connection.js');
const { getExecutiveSummary, getMustHaveProgress } = require('./metricsEngine.js');

function generateRuleBasedInsights(filters = {}) {
  const db = getDb();
  const summary = getExecutiveSummary(filters);
  const insights = [];

  // 1. Pace Insight
  const achv = summary.sales.achievementPct;
  const timeRate = summary.calendar.timeRatePct;
  if (achv < timeRate) {
    const gapPct = Math.round((timeRate - achv) * 10) / 10;
    insights.push({
      id: 'INS_PACE_BEHIND',
      type: 'BEHIND_PACE',
      level: 'WARNING',
      title: 'Pencapaian Tertinggal dari Laju Waktu (Pace)',
      message: `Pencapaian penjualan baru ${achv}% sedangkan waktu kerja telah berjalan ${timeRate}% (selisih -${gapPct}%). Diperlukan laju ${summary.sales.gapDailyPace} KTN/hari untuk mengejar target.`,
      metricValue: `${achv}% vs ${timeRate}%`,
      actionUrl: '/penjualan',
      actionLabel: 'Lihat Analisis Penjualan'
    });
  } else {
    insights.push({
      id: 'INS_PACE_AHEAD',
      type: 'AHEAD_PACE',
      level: 'SUCCESS',
      title: 'Laju Penjualan Sesuai Rencana (On Track)',
      message: `Pencapaian penjualan mencapai ${achv}%, melampaui waktu kerja yang berjalan ${timeRate}%. Proyeksi akhir bulan (LE) mencapai ${summary.sales.latestEstimateAchvPct}%.`,
      metricValue: `${achv}% vs ${timeRate}%`,
      actionUrl: '/penjualan',
      actionLabel: 'Periksa Detail'
    });
  }

  // 2. Must Have Penetration Gap Insights
  const mhProgress = getMustHaveProgress(filters);
  mhProgress.forEach(mh => {
    if (mh.penetrationPct < mh.targetPenetrationPct) {
      insights.push({
        id: `INS_MH_${mh.lineCode}`,
        type: 'MUST_HAVE_GAP',
        level: 'INFO',
        title: `Peluang Penetrasi ${mh.lineName}`,
        message: `Penetrasi lini ${mh.lineCode} saat ini ${mh.penetrationPct}% (Target ${mh.targetPenetrationPct}%). Dibutuhkan penambahan ${mh.gapOc} outlet lagi untuk memenuhi kuota.`,
        metricValue: `${mh.actualOc} / ${mh.targetOc} Outlet`,
        actionUrl: '/program-produk/must-have',
        actionLabel: 'Buka Daftar Outlet Gap'
      });
    }
  });

  // 3. Dormant Outlet Risk Insight
  const dormantCount = summary.coverage.dormant60dOutlets;
  if (dormantCount > 0) {
    insights.push({
      id: 'INS_DORMANT_ALERT',
      type: 'DORMANCY',
      level: 'DANGER',
      title: 'Perhatian Outlet Dormant (>= 60 Hari)',
      message: `Terdapat ${dormantCount} outlet terdaftar yang tidak melakukan transaksi selama 60 hari berturut-turut. Segera lakukan kunjungan reaktivasi.`,
      metricValue: `${dormantCount} Outlet`,
      actionUrl: '/outlet-360?filter=dormant',
      actionLabel: 'Lihat Outlet Dormant'
    });
  }

  // 4. Stock Risk Insight (Habis / Rendah)
  const stockRisks = db.query(
    `SELECT p.item_name, s.available_stock_ctn
     FROM fact_inventory_snapshot s
     JOIN dim_product p ON s.item_code = p.item_code
     WHERE s.available_stock_ctn <= 3.0
     ORDER BY s.available_stock_ctn ASC
     LIMIT 3`
  );
  if (stockRisks.length > 0) {
    const itemsStr = stockRisks.map(r => `${r.item_name} (${r.available_stock_ctn} KTN)`).join(', ');
    insights.push({
      id: 'INS_STOCK_RISK',
      type: 'STOCK_RISK',
      level: 'WARNING',
      title: 'Peringatan Stok Rendah / Kritis di Gudang',
      message: `Terdapat SKU dengan stok di bawah batas aman: ${itemsStr}. Segera koordinasikan replenishment.`,
      metricValue: `${stockRisks.length} SKU Kritis`,
      actionUrl: '/stock-piutang',
      actionLabel: 'Cek Ketersediaan Stok'
    });
  }

  // 5. Overdue AR Risk Insight
  const arRisk = db.query(
    `SELECT COUNT(*) as overdue_count, COALESCE(SUM(saldo_piutang), 0) as overdue_value
     FROM fact_ar_invoice
     WHERE overdue_days > 30`
  )[0];
  if (arRisk && arRisk.overdue_count > 0) {
    const formattedVal = (arRisk.overdue_value / 1000000).toFixed(1);
    insights.push({
      id: 'INS_AR_OVERDUE',
      type: 'AR_RISK',
      level: 'DANGER',
      title: 'Risiko Piutang Macet (> 30 Hari)',
      message: `Terdapat ${arRisk.overdue_count} faktur dengan keterlambatan > 30 hari senilai total Rp ${formattedVal} Jt. Fokuskan penagihan pada outlet terkait.`,
      metricValue: `Rp ${formattedVal} Jt`,
      actionUrl: '/stock-piutang?tab=ar',
      actionLabel: 'Daftar Piutang Menunggak'
    });
  }

  return insights;
}

module.exports = {
  generateRuleBasedInsights
};
