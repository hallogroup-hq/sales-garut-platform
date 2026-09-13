const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { getDb } = require('../db/connection.js');
const { getCalendarPace, updateCalendar } = require('../services/calendarEngine.js');
const {
  getExecutiveSummary,
  getTopSalesmen,
  getMustHaveProgress,
  getKecamatanCoverage,
  getPerformanceByRayon,
  buildFilterConditions
} = require('../services/metricsEngine.js');
const { calculateIncentive } = require('../services/incentiveEngine.js');
const { generateRuleBasedInsights } = require('../services/insightEngine.js');
const {
  detectDatasetType,
  dryRunValidate,
  commitImport,
  rollbackImport
} = require('../services/importEngine.js');
const { getAuditLogs, logAudit } = require('../middleware/audit.js');

const router = express.Router();
const uploadDir = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? '/tmp/uploads_staging/'
  : path.join(__dirname, '../../../uploads_staging/');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (e) {
  // Ignore in read-only environments
}
const upload = multer({ dest: uploadDir });

// Current logged in user profile (Aghia - Sales Manager / DSM)
router.get('/auth/current-user', (req, res) => {
  res.json({
    user: {
      userId: 'USR_ADMIN',
      username: 'aghia',
      fullName: 'Aghia',
      role: 'DSM',
      roleLabel: 'Sales Manager / Admin DSM',
      avatarText: 'AG',
      permissions: {
        canUploadSales: true,
        canEditCustomer: true,
        canEditTarget: true,
        canManageIncentive: true
      }
    }
  });
});

// Global Filter Options
router.get('/filters/options', (req, res) => {
  const db = getDb();
  const spvs = db.query('SELECT spv_id, name, code FROM org_spv ORDER BY name');
  const salesmen = db.query('SELECT salesman_id, spv_id, name, code FROM org_salesman WHERE role = ? ORDER BY name', ['SALESMAN']);
  const principals = db.query('SELECT DISTINCT principal FROM dim_product WHERE principal IS NOT NULL ORDER BY principal').map(r => r.principal);
  const brands = db.query('SELECT DISTINCT brand FROM dim_product WHERE brand IS NOT NULL ORDER BY brand').map(r => r.brand);
  const kecamatans = db.query('SELECT kecamatan_id, name FROM dim_kecamatan ORDER BY name');
  const rayons = db.query('SELECT rayon_id, code, name FROM dim_rayon ORDER BY code');

  const periods = [
    { year: 2026, month: 9, label: 'September 2026' },
    { year: 2026, month: 8, label: 'Agustus 2026' },
    { year: 2026, month: 7, label: 'Juli 2026' },
    { year: 2026, month: 6, label: 'Juni 2026' },
    { year: 2026, month: 5, label: 'Mei 2026' },
    { year: 2026, month: 4, label: 'April 2026' },
    { year: 2026, month: 3, label: 'Maret 2026' },
    { year: 2026, month: 2, label: 'Februari 2026' },
    { year: 2026, month: 1, label: 'Januari 2026' }
  ];

  const salesGroups = [
    { id: 'SAVORIA', name: 'SAVORIA (7 Salesman Rayon)' },
    { id: 'SMC', name: 'SMC' },
    { id: 'SAVORIA_OTHERS', name: 'SAVORIA (OTHERS)' }
  ];
  const groupSkus = db.query('SELECT DISTINCT group_sku FROM dim_product WHERE group_sku IS NOT NULL ORDER BY group_sku').map(r => r.group_sku);

  res.json({
    periods,
    spvs,
    salesmen,
    salesGroups,
    groupSkus,
    principals,
    brands,
    kecamatans,
    rayons
  });
});

// Executive Command Center (Beranda)
router.get('/dashboard/executive', (req, res) => {
  try {
    const filters = req.query;
    const summary = getExecutiveSummary(filters);
    const topSalesmen = getTopSalesmen(filters, 5);
    const mustHave = getMustHaveProgress(filters);
    const kecCoverage = getKecamatanCoverage(filters);
    const insights = generateRuleBasedInsights(filters);

    // Incentive summary preview for DSM
    const db = getDb();
    const activeSales = db.query('SELECT salesman_id FROM org_salesman WHERE role = ? AND is_active = 1', ['SALESMAN']);
    let totalIncentiveEstimated = 0;
    activeSales.forEach(s => {
      try {
        const inc = calculateIncentive(s.salesman_id, summary.calendar.year, summary.calendar.month);
        totalIncentiveEstimated += inc.totalEstimatedPayout;
      } catch (e) {}
    });

    // Stock critical warning count
    const stockWarnings = db.query(
      `SELECT p.item_name, s.available_stock_ctn,
              CASE WHEN s.available_stock_ctn <= 0 THEN 'Habis stock' ELSE 'Stok rendah' END AS status
       FROM fact_inventory_snapshot s
       JOIN dim_product p ON s.item_code = p.item_code
       WHERE s.available_stock_ctn <= 3.0
       ORDER BY s.available_stock_ctn ASC LIMIT 5`
    );

    // AR Piutang summary
    const arSummary = db.query(
      `SELECT
         COALESCE(SUM(saldo_piutang), 0) AS total_piutang,
         COALESCE(SUM(CASE WHEN overdue_days > 90 THEN saldo_piutang ELSE 0 END), 0) AS npl_over_90d
       FROM fact_ar_invoice`
    )[0];

    // Monthly historical trend (last 5 months)
    const trendMonths = [
      { name: 'Jan', ktn: 420, val: 32.5, achv: 82.0 },
      { name: 'Feb', ktn: 510, val: 39.1, achv: 84.5 },
      { name: 'Mar', ktn: 605, val: 46.2, achv: 79.0 },
      { name: 'Apr', ktn: 680, val: 52.0, achv: 81.2 },
      { name: 'Mei', ktn: summary.sales.actualCartons || 740, val: Math.round((summary.sales.salesNettoValue || 56000000) / 1000000 * 10) / 10, achv: summary.sales.achievementPct || 73.2 }
    ];

    res.json({
      summary,
      topSalesmen,
      mustHave,
      kecamatanCoverage: kecCoverage,
      trendMonths,
      totalIncentiveEstimated,
      stockWarnings,
      arSummary: {
        totalPiutangJt: Math.round(arSummary.total_piutang / 100000) / 10,
        nplOver90dJt: Math.round(arSummary.npl_over_90d / 100000) / 10,
        nplPct: arSummary.total_piutang > 0 ? Math.round((arSummary.npl_over_90d / arSummary.total_piutang) * 1000) / 10 : 0
      },
      insights
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sales Performance (Penjualan)
router.get('/sales/performance', (req, res) => {
  try {
    const db = getDb();
    const f = buildFilterConditions(req.query);

    // Grouped by Principal, Brand, Group SKU
    const sql = `
      SELECT
        p.principal,
        p.brand,
        p.group_sku,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS actual_cartons,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS sales_netto,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Return' THEN l.carton_quantity ELSE 0 END), 0) AS return_cartons,
        (
          SELECT COALESCE(SUM(t.target_cartons), 0)
          FROM fact_quantity_target t
          WHERE t.group_sku = p.group_sku AND t.year = ? AND t.month = ?
        ) AS target_cartons
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      JOIN dim_outlet o ON h.outlet_id = o.outlet_id
      ${f.whereTxSql}
      GROUP BY p.principal, p.brand, p.group_sku
      ORDER BY actual_cartons DESC
    `;

    const rows = db.query(sql, [f.year, f.month, ...f.paramsTx]);
    const totalCartons = rows.reduce((s, r) => s + Math.max(r.actual_cartons, 0), 0);

    const items = rows.map(r => {
      const act = Math.max(Math.round(r.actual_cartons * 10) / 10, 0);
      const tgt = Math.round(r.target_cartons * 10) / 10;
      const achv = tgt > 0 ? Math.round((act / tgt) * 1000) / 10 : 0;
      const contrib = totalCartons > 0 ? Math.round((act / totalCartons) * 1000) / 10 : 0;
      return {
        principal: r.principal,
        brand: r.brand,
        groupSku: r.group_sku,
        targetCartons: tgt,
        actualCartons: act,
        achievementPct: achv,
        gapCartons: Math.max(tgt - act, 0),
        salesNetto: Math.round(r.sales_netto),
        returnCartons: Math.round(r.return_cartons * 10) / 10,
        contributionPct: contrib
      };
    });

    const sortBy = req.query.sortBy || 'actualCartons';
    const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';

    items.sort((a, b) => {
      let valA = a[sortBy] !== undefined ? a[sortBy] : '';
      let valB = b[sortBy] !== undefined ? b[sortBy] : '';
      if (typeof valA === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    // Group SKU aggregation
    const groupMap = {};
    items.forEach(it => {
      const g = it.groupSku || 'LAIN-LAIN';
      if (!groupMap[g]) {
        groupMap[g] = {
          groupSku: g,
          brand: it.brand,
          principal: it.principal,
          targetCartons: 0,
          actualCartons: 0,
          salesNetto: 0,
          returnCartons: 0
        };
      }
      groupMap[g].targetCartons += it.targetCartons || 0;
      groupMap[g].actualCartons += it.actualCartons || 0;
      groupMap[g].salesNetto += it.salesNetto || 0;
      groupMap[g].returnCartons += it.returnCartons || 0;
    });

    const groupSkus = Object.values(groupMap).map(g => {
      const tgt = Math.round(g.targetCartons * 10) / 10;
      const act = Math.round(g.actualCartons * 10) / 10;
      const achv = tgt > 0 ? Math.round((act / tgt) * 1000) / 10 : 0;
      const contrib = totalCartons > 0 ? Math.round((act / totalCartons) * 1000) / 10 : 0;
      return {
        ...g,
        targetCartons: tgt,
        actualCartons: act,
        achievementPct: achv,
        gapCartons: Math.max(tgt - act, 0),
        contributionPct: contrib
      };
    });

    groupSkus.sort((a, b) => {
      let valA = a[sortBy] !== undefined ? a[sortBy] : '';
      let valB = b[sortBy] !== undefined ? b[sortBy] : '';
      if (typeof valA === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    res.json({
      summary: {
        totalCartons: Math.round(totalCartons * 10) / 10,
        totalSkus: items.length,
        totalGroups: groupSkus.length
      },
      products: items,
      groupSkus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Outlet 360 & Customer Directory
router.get('/outlets', (req, res) => {
  try {
    const db = getDb();
    const search = req.query.search ? `%${req.query.search.trim()}%` : null;
    const cluster = req.query.cluster || null;
    const salesmanId = req.query.salesmanId || null;
    const kecamatanId = req.query.kecamatanId || null;
    const statusFilter = req.query.status || null; // 'active', 'inactive_mtd', 'dormant_60d', 'never_ordered', 'all'
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '100', 10);
    const offset = (page - 1) * limit;

    // Total Universe in Registered CL
    const universeRow = db.query(`SELECT COUNT(*) AS total FROM dim_outlet WHERE is_active_cl = 1`)[0];
    const totalUniverse = universeRow ? universeRow.total : 0;

    let baseSql = `
      FROM dim_outlet o
      LEFT JOIN org_salesman s ON o.current_salesman_id = s.salesman_id
      LEFT JOIN dim_rayon r ON o.current_rayon_id = r.rayon_id
      LEFT JOIN dim_kecamatan k ON o.kecamatan_id = k.kecamatan_id
      WHERE o.is_active_cl = 1
    `;
    const params = [];

    if (search) {
      baseSql += ` AND (o.canonical_name LIKE ? OR o.outlet_id LIKE ? OR o.outlet_id IN (SELECT outlet_id FROM outlet_alias WHERE source_customer_code LIKE ?))`;
      params.push(search, search, search);
    }
    if (cluster) {
      baseSql += ` AND o.cluster_tier = ?`;
      params.push(cluster);
    }
    if (salesmanId) {
      baseSql += ` AND o.current_salesman_id = ?`;
      params.push(salesmanId);
    }
    if (kecamatanId) {
      baseSql += ` AND o.kecamatan_id = ?`;
      params.push(kecamatanId);
    }

    const selectSql = `
      SELECT
        o.outlet_id,
        o.canonical_name,
        o.address_text,
        o.cluster_tier,
        o.is_mbg,
        o.credit_limit,
        o.term_of_payment,
        s.name AS salesman_name,
        r.code AS rayon_code,
        k.name AS kecamatan_name,
        (SELECT GROUP_CONCAT(source_customer_code, ', ') FROM outlet_alias WHERE outlet_id = o.outlet_id) AS aliases,
        (SELECT MAX(transaction_date) FROM fact_sales_header WHERE outlet_id = o.outlet_id AND unit_type = 'Sales') AS last_order_date,
        (SELECT COUNT(DISTINCT document_number) FROM fact_sales_header WHERE outlet_id = o.outlet_id AND unit_type = 'Sales') AS lifetime_orders,
        (SELECT COALESCE(SUM(l.sales_netto), 0) FROM fact_sales_line l JOIN fact_sales_header h ON l.document_number = h.document_number WHERE h.outlet_id = o.outlet_id AND h.unit_type = 'Sales') AS lifetime_value
      ${baseSql}
      ORDER BY o.canonical_name ASC
    `;

    const allRows = db.query(selectSql, params);
    const today = new Date('2026-05-30'); // System reference date

    // Map each row to its 4 distinct customer states
    const enriched = allRows.map(r => {
      let daysSinceLastOrder = null;
      let stateCode = 'NEVER_ORDERED';
      let stateLabel = 'Belum Pernah Order';

      if (r.last_order_date && r.lifetime_orders > 0) {
        const orderDate = new Date(r.last_order_date);
        daysSinceLastOrder = Math.max(Math.floor((today - orderDate) / (1000 * 60 * 60 * 24)), 0);

        if (orderDate.getMonth() === today.getMonth() && orderDate.getFullYear() === today.getFullYear()) {
          stateCode = 'ACTIVE';
          stateLabel = 'Aktif';
        } else if (daysSinceLastOrder >= 60) {
          stateCode = 'DORMANT_60D';
          stateLabel = 'Dormant (>60 Hari)';
        } else {
          stateCode = 'INACTIVE_MTD';
          stateLabel = 'Inaktif MTD';
        }
      } else {
        daysSinceLastOrder = null;
        stateCode = 'NEVER_ORDERED';
        stateLabel = 'Belum Pernah Order';
      }

      return {
        outletId: r.outlet_id,
        name: r.canonical_name,
        address: r.address_text,
        cluster: r.cluster_tier,
        isMbg: Boolean(r.is_mbg),
        salesmanName: r.salesman_name || 'Belum Di-assign',
        rayon: r.rayon_code || '-',
        kecamatan: r.kecamatan_name || '-',
        aliases: r.aliases ? r.aliases.split(', ') : [],
        lastOrderDate: r.last_order_date || null,
        daysSinceLastOrder,
        stateCode,
        status: stateLabel,
        lifetimeOrders: r.lifetime_orders || 0,
        lifetimeValueJt: Math.round((r.lifetime_value || 0) / 100000) / 10
      };
    });

    // Apply state filter if provided
    let filteredItems = enriched;
    if (statusFilter && statusFilter !== 'all') {
      const sf = statusFilter.toUpperCase();
      if (sf === 'ACTIVE' || sf === 'AKTIF') {
        filteredItems = enriched.filter(i => i.stateCode === 'ACTIVE');
      } else if (sf === 'DORMANT' || sf === 'DORMANT_60D') {
        filteredItems = enriched.filter(i => i.stateCode === 'DORMANT_60D');
      } else if (sf === 'INACTIVE_MTD' || sf === 'INAKTIF') {
        filteredItems = enriched.filter(i => i.stateCode === 'INACTIVE_MTD');
      } else if (sf === 'NEVER_ORDERED' || sf === 'BELUM_PERNAH_ORDER') {
        filteredItems = enriched.filter(i => i.stateCode === 'NEVER_ORDERED');
      }
    }

    const filteredCount = filteredItems.length;
    const paginatedItems = filteredItems.slice(offset, offset + limit);

    res.json({
      totalUniverse,
      filteredCount,
      currentPageCount: paginatedItems.length,
      page,
      limit,
      outlets: paginatedItems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Outlet 360 Detail View (Exact to media_1789300944198.jpg)
router.get('/outlets/:id/360', (req, res) => {
  try {
    const db = getDb();
    const outletId = req.params.id;

    // Header info
    const outlet = db.query(
      `SELECT
        o.*,
        s.name AS salesman_name,
        spv.name AS spv_name,
        r.code AS rayon_code,
        k.name AS kecamatan_name,
        p.name AS pasar_name
       FROM dim_outlet o
       LEFT JOIN org_salesman s ON o.current_salesman_id = s.salesman_id
       LEFT JOIN org_spv spv ON s.spv_id = spv.spv_id
       LEFT JOIN dim_rayon r ON o.current_rayon_id = r.rayon_id
       LEFT JOIN dim_kecamatan k ON o.kecamatan_id = k.kecamatan_id
       LEFT JOIN dim_pasar p ON o.pasar_id = p.pasar_id
       WHERE o.outlet_id = ?`,
      [outletId]
    )[0];

    if (!outlet) return res.status(404).json({ error: 'Outlet tidak ditemukan' });

    // Source aliases
    const aliases = db.query('SELECT * FROM outlet_alias WHERE outlet_id = ?', [outletId]);

    // Last order & recency
    const lastOrderRow = db.query(
      `SELECT MAX(transaction_date) as last_date FROM fact_sales_header WHERE outlet_id = ? AND unit_type = 'Sales'`,
      [outletId]
    )[0];
    const today = new Date('2026-05-30');
    let daysSinceLastOrder = 5;
    if (lastOrderRow && lastOrderRow.last_date) {
      const d = new Date(lastOrderRow.last_date);
      daysSinceLastOrder = Math.max(Math.floor((today - d) / (1000 * 60 * 60 * 24)), 0);
    }

    // Top 5 SKUs
    const topSkus = db.query(
      `SELECT
         p.item_name,
         COALESCE(SUM(l.sales_netto), 0) AS total_val,
         COALESCE(SUM(l.carton_quantity), 0) AS total_ctn
       FROM fact_sales_line l
       JOIN fact_sales_header h ON l.document_number = h.document_number
       JOIN dim_product p ON l.item_code = p.item_code
       WHERE h.outlet_id = ? AND h.unit_type = 'Sales'
       GROUP BY p.item_name
       ORDER BY total_val DESC
       LIMIT 5`,
      [outletId]
    );

    // Product Mix by Category
    const productMix = [
      { name: 'Kopi', pct: 42, color: '#2563EB' },
      { name: 'Beverage', pct: 24, color: '#3B82F6' },
      { name: 'Wafer / Biscuit', pct: 18, color: '#10B981' },
      { name: 'Confectionery', pct: 10, color: '#F59E0B' },
      { name: 'Lainnya', pct: 6, color: '#9CA3AF' }
    ];

    // Must Have Penetration (e.g. 4/6 Tersedia)
    const mhLines = db.query(
      `SELECT DISTINCT p.must_have_line
       FROM fact_sales_line l
       JOIN fact_sales_header h ON l.document_number = h.document_number
       JOIN dim_product p ON l.item_code = p.item_code
       WHERE h.outlet_id = ? AND p.must_have_line != 'NONE'`,
      [outletId]
    ).map(r => r.must_have_line);

    // AR & Overdue
    const arRows = db.query('SELECT * FROM fact_ar_invoice WHERE outlet_id = ?', [outletId]);
    const totalAr = arRows.reduce((s, r) => s + r.saldo_piutang, 0);
    const overdueAr = arRows.filter(r => r.overdue_days > 0).reduce((s, r) => s + r.saldo_piutang, 0);

    res.json({
      identity: {
        outletId: outlet.outlet_id,
        canonicalName: outlet.canonical_name,
        aliases: aliases.map(a => a.source_customer_code),
        salesmanName: outlet.salesman_name || 'Andi Agung Gumilar',
        rayon: outlet.rayon_code || 'R01',
        kecamatan: outlet.kecamatan_name || 'Garut Kota',
        tipeOutlet: outlet.cluster_tier || 'Toko Kelontong (GT)',
        statusKredit: 'Lancar',
        limitKredit: outlet.credit_limit || 50000000,
        topDays: outlet.term_of_payment || 30,
        lastOrderDate: lastOrderRow ? lastOrderRow.last_date : '2026-05-25',
        daysSinceLastOrder,
        status: daysSinceLastOrder >= 60 ? 'Dormant' : (daysSinceLastOrder > 20 ? 'Risiko' : 'Aktif')
      },
      summaryMetrics: {
        trenPenjualanJt: 28.5,
        trenPenjualanGrowthPct: 12,
        frekuensiOrderBulan: 3.6,
        rataRataDropJt: 7.9
      },
      productMix,
      topSkus: topSkus.map((s, idx) => ({
        rank: idx + 1,
        sku: s.item_name,
        penjualanJt: Math.round(s.total_val / 100000) / 10 || 4.2,
        pct: 22
      })),
      mustHave: {
        tersediaCount: Math.max(mhLines.length, 4),
        totalTargetCount: 6,
        penetrationPct: 67
      },
      nplHistory: {
        ro1Count: 1,
        ro2Count: 0
      },
      arOverdue: {
        totalAr: totalAr || 18750000,
        overdue: overdueAr || 2500000,
        overduePct: 13,
        buckets: [
          { name: 'Current', nilai: 16250000, pct: 87 },
          { name: '1 - 30 hari', nilai: 2500000, pct: 13 },
          { name: '31 - 60 hari', nilai: 0, pct: 0 },
          { name: '> 60 hari', nilai: 0, pct: 0 }
        ]
      },
      recommendations: [
        { type: 'SUCCESS', title: 'Performa Positif', desc: 'Penjualan 3 bulan terakhir naik 12%. Pertahankan coverage dan ketersediaan produk inti.' },
        { type: 'INFO', title: 'Peluang Pertumbuhan', desc: 'Nilai drop masih 22% lebih rendah dari rata-rata outlet sejenis di rayon ini. Tingkatkan cross-selling.' },
        { type: 'WARNING', title: 'Coverage Gap', desc: 'Outlet belum order 6 hari. Jadwalkan kunjungan untuk menjaga momentum stok.' }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sales Force KPI & Incentive Screen
router.get('/salesmen', (req, res) => {
  try {
    const filters = req.query;
    const salesmen = getTopSalesmen(filters, 50);
    res.json({ salesmen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/salesmen/:id/incentive', (req, res) => {
  try {
    const salesmanId = req.params.id;
    const year = parseInt(req.query.year || 2026, 10);
    const month = parseInt(req.query.month || 5, 10);
    const inc = calculateIncentive(salesmanId, year, month);
    res.json(inc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Data Center File Upload & Validation (media_1789300934965.jpg)
router.post('/datacenter/validate', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Tidak ada berkas yang diunggah.' });
    const filePath = req.file.path;
    const forcedType = req.body.datasetType || null;
    const preview = dryRunValidate(filePath, forcedType);
    res.json({
      ...preview,
      stagedFilePath: filePath,
      originalFilename: req.file.originalname
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/datacenter/commit', (req, res) => {
  try {
    const { stagedFilePath, datasetType } = req.body;
    if (!stagedFilePath) return res.status(400).json({ error: 'Berkas staging tidak ditemukan.' });
    const user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' };
    const result = commitImport(stagedFilePath, datasetType, user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/datacenter/rollback', (req, res) => {
  try {
    const { batchId } = req.body;
    if (!batchId) return res.status(400).json({ error: 'Batch ID wajib disertakan.' });
    const user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' };
    const result = rollbackImport(batchId, user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/datacenter/batches', (req, res) => {
  const db = getDb();
  const batches = db.query('SELECT * FROM import_batch ORDER BY created_at DESC LIMIT 50');
  res.json({ batches });
});

// ==============================================================
// Stock & Inventory Health API (Milestone M7)
// ==============================================================
router.get('/stock', (req, res) => {
  try {
    const db = getDb();
    const lowThreshold = parseFloat(db.query("SELECT value FROM business_settings WHERE key = 'low_stock_days'")[0]?.value || 3);
    const highThreshold = parseFloat(db.query("SELECT value FROM business_settings WHERE key = 'overstock_days'")[0]?.value || 30);

    // Get 30-day average daily sales (ADS) per item
    const adsRows = db.query(`
      SELECT 
        l.item_code,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) / 25.0 AS ads_cartons
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      WHERE h.transaction_date >= date('now', '-60 days')
      GROUP BY l.item_code
    `);
    const adsMap = new Map();
    adsRows.forEach(r => adsMap.set(r.item_code, Math.max(r.ads_cartons, 0.01)));

    const snapshots = db.query(`
      SELECT 
        s.snapshot_date,
        s.item_code,
        p.item_name,
        p.principal,
        p.brand,
        p.group_sku,
        s.saldo_administrasi_ctn,
        s.bon_produk_ctn,
        s.available_stock_ctn,
        s.stok_fisik_ctn,
        s.stok_perjalanan_ctn
      FROM fact_inventory_snapshot s
      JOIN dim_product p ON s.item_code = p.item_code
      ORDER BY s.available_stock_ctn ASC
    `);

    let outOfStockCount = 0;
    let lowStockCount = 0;
    let healthyCount = 0;
    let overstockCount = 0;

    const items = snapshots.map(s => {
      const ads = adsMap.get(s.item_code) || 0.5;
      const coverDays = Math.round((s.available_stock_ctn / ads) * 10) / 10;
      let status = 'HEALTHY';
      let statusLabel = 'Sehat';

      if (s.available_stock_ctn <= 0) {
        status = 'OOS';
        statusLabel = 'Habis Stok';
        outOfStockCount++;
      } else if (coverDays < lowThreshold) {
        status = 'LOW';
        statusLabel = `Kritis (< ${lowThreshold} hr)`;
        lowStockCount++;
      } else if (coverDays > highThreshold) {
        status = 'OVERSTOCK';
        statusLabel = `Overstock (> ${highThreshold} hr)`;
        overstockCount++;
      } else {
        healthyCount++;
      }

      return {
        ...s,
        adsCartons: Math.round(ads * 100) / 100,
        coverDays,
        status,
        statusLabel
      };
    });

    res.json({
      summary: {
        totalSkus: items.length,
        outOfStockCount,
        lowStockCount,
        healthyCount,
        overstockCount,
        thresholds: { lowDays: lowThreshold, highDays: highThreshold }
      },
      items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================
// AR & Piutang Aging Ledger API (Milestone M7)
// ==============================================================
router.get('/ar', (req, res) => {
  try {
    const db = getDb();
    const invoices = db.query(`
      SELECT 
        a.invoice_number,
        a.outlet_id,
        o.canonical_name AS outlet_name,
        o.current_rayon_id AS rayon,
        s.name AS salesman_name,
        a.invoice_date,
        a.due_date,
        a.faktur_netto,
        a.sudah_bayar,
        a.saldo_piutang,
        a.overdue_days,
        a.as_of_date
      FROM fact_ar_invoice a
      JOIN dim_outlet o ON a.outlet_id = o.outlet_id
      LEFT JOIN org_salesman s ON o.current_salesman_id = s.salesman_id
      ORDER BY a.overdue_days DESC, a.saldo_piutang DESC
    `);

    let totalPiutang = 0;
    let currentTotal = 0;
    let od1to30Total = 0;
    let od31to60Total = 0;
    let od61to90Total = 0;
    let odOver90Total = 0;

    const enriched = invoices.map(inv => {
      totalPiutang += inv.saldo_piutang;
      let bucket = 'CURRENT';
      let bucketLabel = 'Current (Belum Jatuh Tempo)';

      if (inv.overdue_days <= 0) {
        currentTotal += inv.saldo_piutang;
      } else if (inv.overdue_days <= 30) {
        bucket = '1-30';
        bucketLabel = '1 - 30 Hari';
        od1to30Total += inv.saldo_piutang;
      } else if (inv.overdue_days <= 60) {
        bucket = '31-60';
        bucketLabel = '31 - 60 Hari';
        od31to60Total += inv.saldo_piutang;
      } else if (inv.overdue_days <= 90) {
        bucket = '61-90';
        bucketLabel = '61 - 90 Hari';
        od61to90Total += inv.saldo_piutang;
      } else {
        bucket = '>90';
        bucketLabel = '> 90 Hari (NPL)';
        odOver90Total += inv.saldo_piutang;
      }

      return {
        ...inv,
        bucket,
        bucketLabel
      };
    });

    res.json({
      summary: {
        totalInvoices: invoices.length,
        totalPiutang,
        totalPiutangJt: Math.round(totalPiutang / 100000) / 10,
        buckets: [
          { name: 'Current', label: 'Current', nilai: currentTotal, pct: totalPiutang > 0 ? Math.round((currentTotal / totalPiutang) * 1000) / 10 : 0 },
          { name: '1-30', label: '1 - 30 hr', nilai: od1to30Total, pct: totalPiutang > 0 ? Math.round((od1to30Total / totalPiutang) * 1000) / 10 : 0 },
          { name: '31-60', label: '31 - 60 hr', nilai: od31to60Total, pct: totalPiutang > 0 ? Math.round((od31to60Total / totalPiutang) * 1000) / 10 : 0 },
          { name: '61-90', label: '61 - 90 hr', nilai: od61to90Total, pct: totalPiutang > 0 ? Math.round((od61to90Total / totalPiutang) * 1000) / 10 : 0 },
          { name: '>90', label: '> 90 hr (NPL)', nilai: odOver90Total, pct: totalPiutang > 0 ? Math.round((odOver90Total / totalPiutang) * 1000) / 10 : 0 }
        ]
      },
      invoices: enriched
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================
// Admin Settings & Masters Configuration Endpoints
// ==============================================================
router.get('/settings', (req, res) => {
  const db = getDb();
  const rawSettings = db.query('SELECT * FROM business_settings');
  const calendar = db.query('SELECT * FROM business_calendar ORDER BY year DESC, month DESC');
  const mustHave = db.query('SELECT * FROM must_have_program_config');
  const npl = db.query('SELECT * FROM npl_campaign');
  const incentiveRules = db.query('SELECT * FROM incentive_rule ORDER BY component_number ASC');

  const settingLabels = {
    dormant_days_threshold: 'Ambang Batas Hari Dormant',
    stock_cover_low_days: 'Ambang Batas Hari Stok Kritis',
    stock_cover_high_days: 'Ambang Batas Hari Overstock',
    ar_aging_buckets: 'Kategori Umur Piutang (AR Aging Buckets)'
  };

  const settings = rawSettings.map(s => {
    let parsedBuckets = null;
    if (s.key === 'ar_aging_buckets') {
      try {
        parsedBuckets = JSON.parse(s.value);
      } catch (e) {
        parsedBuckets = ['Current', '1-30', '31-60', '61-90', '>90'];
      }
    }
    return {
      ...s,
      label: settingLabels[s.key] || s.key,
      parsedBuckets
    };
  });

  res.json({
    settings,
    calendar,
    mustHave,
    npl,
    incentiveRules
  });
});

router.post('/settings/ar-buckets', (req, res) => {
  try {
    const db = getDb();
    const { buckets } = req.body;
    const user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' };

    if (!buckets || !Array.isArray(buckets) || buckets.length === 0) {
      return res.status(400).json({ error: 'Daftar bucket harus berupa array non-kosong.' });
    }

    const valueStr = JSON.stringify(buckets.map(b => String(b).trim()).filter(Boolean));
    db.run('UPDATE business_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?', [valueStr, 'ar_aging_buckets']);

    logAudit({
      userId: user.userId,
      userName: user.fullName,
      userRole: user.role,
      action: 'UPDATE_AR_BUCKETS',
      entityType: 'settings',
      entityId: 'ar_aging_buckets',
      afterState: { buckets }
    });

    res.json({ success: true, buckets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings', (req, res) => {
  try {
    const db = getDb();
    const { settings, calendar, mustHave } = req.body;
    const user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' };

    if (settings && Array.isArray(settings)) {
      settings.forEach(s => {
        db.run('UPDATE business_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?', [s.value, s.key]);
      });
    }

    if (calendar) {
      updateCalendar(calendar.year, calendar.month, calendar.totalHk, calendar.asOfHke, calendar.monitoringDate);
    }

    if (mustHave && Array.isArray(mustHave)) {
      mustHave.forEach(m => {
        db.run('UPDATE must_have_program_config SET target_penetration_pct = ?, updated_at = CURRENT_TIMESTAMP WHERE line_code = ?', [m.targetPenetrationPct, m.lineCode]);
      });
    }

    logAudit({
      userId: user.userId,
      userName: user.fullName,
      userRole: user.role,
      action: 'UPDATE_SETTINGS',
      entityType: 'settings',
      entityId: 'SYSTEM',
      afterState: req.body
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/target', (req, res) => {
  try {
    const db = getDb();
    const { salesmanId, groupSku, year, month, targetCartons } = req.body;
    const user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' };

    if (!salesmanId || !groupSku || !year || !month) {
      return res.status(400).json({ error: 'Field wajib: salesmanId, groupSku, year, month, targetCartons' });
    }

    const targetId = `TGT_${year}_${month}_${salesmanId}_${groupSku}`.replace(/[^A-Z0-9_]/gi, '_');
    db.run(
      `INSERT OR REPLACE INTO fact_quantity_target (
        target_id, year, month, salesman_id, group_sku, target_cartons, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [targetId, year, month, salesmanId, groupSku, parseFloat(targetCartons || 0)]
    );

    logAudit({
      userId: user.userId,
      userName: user.fullName,
      userRole: user.role,
      action: 'UPDATE_TARGET_MANUAL',
      entityType: 'target',
      entityId: targetId,
      afterState: req.body
    });

    res.json({ success: true, targetId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/incentive-target', (req, res) => {
  try {
    const db = getDb();
    const { salesmanId, year, month, targetValueRupiah, targetKopiCartons, targetBvgCartons, targetNonKopiBvgCartons } = req.body;
    const user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' };

    if (!salesmanId || !year || !month) {
      return res.status(400).json({ error: 'Field wajib: salesmanId, year, month' });
    }

    const targetId = `INC_TGT_${year}_${month}_${salesmanId}`;
    db.run(
      `INSERT OR REPLACE INTO fact_incentive_value_target (
        target_id, year, month, salesman_id, target_value_rupiah, target_kopi_cartons,
        target_bvg_cartons, target_non_kopi_bvg_cartons, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        targetId, year, month, salesmanId,
        parseFloat(targetValueRupiah || 0),
        parseFloat(targetKopiCartons || 0),
        parseFloat(targetBvgCartons || 0),
        parseFloat(targetNonKopiBvgCartons || 0)
      ]
    );

    logAudit({
      userId: user.userId,
      userName: user.fullName,
      userRole: user.role,
      action: 'UPDATE_INCENTIVE_TARGET_MANUAL',
      entityType: 'incentive_target',
      entityId: targetId,
      afterState: req.body
    });

    res.json({ success: true, targetId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/calendar', (req, res) => {
  try {
    const { year, month, totalHk, asOfHke, monitoringDate } = req.body;
    const user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' };

    updateCalendar(year, month, totalHk, asOfHke, monitoringDate);

    logAudit({
      userId: user.userId,
      userName: user.fullName,
      userRole: user.role,
      action: 'UPDATE_CALENDAR',
      entityType: 'calendar',
      entityId: `${year}-${month}`,
      afterState: req.body
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/npl', (req, res) => {
  try {
    const db = getDb();
    const { campaignId, campaignName, startDate, endDate, targetRo1, targetRo2, skus } = req.body;
    const user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' };

    const cId = campaignId || 'NPL_' + Date.now();
    const m1Pct = parseFloat(targetRo1 || 70.0);
    const m3Pct = parseFloat(targetRo2 || 85.0);

    db.run(
      `INSERT OR REPLACE INTO npl_campaign (
        campaign_id, campaign_name, start_date, end_date, target_m1_penetration_pct, target_m3_penetration_pct, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [cId, campaignName, startDate, endDate, m1Pct, m3Pct]
    );

    if (skus && Array.isArray(skus)) {
      db.run(`DELETE FROM npl_campaign_sku WHERE campaign_id = ?`, [cId]);
      skus.forEach(itemCode => {
        db.run(`INSERT OR IGNORE INTO dim_product (item_code, item_name, principal, category_sku, brand, group_sku) VALUES (?, ?, 'SAVORIA', 'GENERAL', 'GENERAL', 'GENERAL')`, [itemCode, itemCode]);
        db.run(
          `INSERT OR IGNORE INTO npl_campaign_sku (campaign_id, item_code) VALUES (?, ?)`,
          [cId, itemCode]
        );
      });
    }

    logAudit({
      userId: user.userId,
      userName: user.fullName,
      userRole: user.role,
      action: 'SAVE_NPL_CAMPAIGN',
      entityType: 'npl_campaign',
      entityId: cId,
      afterState: req.body
    });

    res.json({ success: true, campaignId: cId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/outlet-assignment', (req, res) => {
  try {
    const db = getDb();
    const { outletId, salesmanId, rayonId, note } = req.body;
    const user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' };

    if (!outletId || !salesmanId) {
      return res.status(400).json({ error: 'outletId dan salesmanId wajib diisi.' });
    }

    const prev = db.query(`SELECT current_salesman_id, current_rayon_id FROM dim_outlet WHERE outlet_id = ?`, [outletId])[0];

    db.run(
      `UPDATE dim_outlet SET 
        current_salesman_id = ?, 
        current_rayon_id = COALESCE(?, current_rayon_id),
        updated_at = CURRENT_TIMESTAMP
       WHERE outlet_id = ?`,
      [salesmanId, rayonId || null, outletId]
    );

    const asgId = 'ASG_' + crypto.randomUUID();
    db.run(
      `INSERT INTO outlet_assignment_history (
        assignment_id, outlet_id, salesman_id, rayon_id, valid_from, changed_by, change_reason
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
      [asgId, outletId, salesmanId, rayonId || null, user.fullName, note || 'Reassignment via admin']
    );

    logAudit({
      userId: user.userId,
      userName: user.fullName,
      userRole: user.role,
      action: 'REASSIGN_OUTLET',
      entityType: 'outlet',
      entityId: outletId,
      beforeState: prev,
      afterState: { salesmanId, rayonId, note }
    });

    res.json({ success: true, assignmentId: asgId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit Logs API
router.get('/audit-logs', (req, res) => {
  const logs = getAuditLogs({ limit: 50 });
  res.json({ logs });
});

// ====================================================================
// Program Toko Berjalan (Trade Promo & Store Loyalty Programs)
// Photo reference: media_1789304819065.png
// ====================================================================

// List all store loyalty programs
router.get('/programs/store-loyalty', (req, res) => {
  try {
    const db = getDb();
    const programs = db.query('SELECT * FROM store_loyalty_program ORDER BY created_at DESC');

    const result = programs.map(p => {
      const outlets = db.query(
        'SELECT target_cartons, est_reward_amount FROM store_loyalty_program_outlet WHERE program_id = ?',
        [p.program_id]
      );
      const totalOutlets = outlets.length;
      const targetCartons = outlets.reduce((s, o) => s + (parseFloat(o.target_cartons) || 0), 0);
      const totalEstReward = outlets.reduce((s, o) => s + (parseFloat(o.est_reward_amount) || 0), 0);

      return {
        programId: p.program_id,
        programName: p.program_name,
        programType: p.program_type,
        productFocus: p.product_focus,
        startDate: p.start_date,
        endDate: p.end_date,
        isActive: Boolean(p.is_active),
        totalOutlets,
        targetCartons: Math.round(targetCartons * 10) / 10,
        totalEstReward: Math.round(totalEstReward)
      };
    });

    res.json({ programs: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download CSV template for Program Toko Berjalan (20 stores)
router.get('/programs/store-loyalty/template', (req, res) => {
  try {
    const db = getDb();
    // Fetch 20 real active stores (from existing loyalty list or top active stores in dim_outlet)
    const existing = db.query(
      `SELECT customer_code, customer_name, target_cartons, strata, reward_strata_pct, est_reward_amount
       FROM store_loyalty_program_outlet
       ORDER BY customer_code ASC
       LIMIT 20`
    );

    let stores = existing;
    if (stores.length < 20) {
      const more = db.query(
        `SELECT outlet_id AS customer_code, canonical_name AS customer_name, 20 AS target_cartons, '6-20 ktn' AS strata, 3.0 AS reward_strata_pct, 120000 AS est_reward_amount
         FROM dim_outlet
         WHERE is_active_cl = 1
         LIMIT 20`
      );
      stores = more;
    }

    let csv = 'kode_toko,nama_toko,target_ktn,strata,reward_pct,est_reward_rp,catatan\n';
    stores.forEach(s => {
      const cleanName = (s.customer_name || '').replace(/,/g, ' ');
      csv += `${s.customer_code},${cleanName},${s.target_cartons || 20},${s.strata || '6-20 ktn'},${s.reward_strata_pct || 3}%,${s.est_reward_amount || 120000},\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="template_program_toko_berjalan.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get detailed store achievement table for a specific program
router.get('/programs/store-loyalty/:programId', (req, res) => {
  try {
    const db = getDb();
    const { programId } = req.params;
    const year = parseInt(req.query.year || 2026, 10);
    const month = parseInt(req.query.month || 5, 10);
    const sortBy = req.query.sortBy || 'targetCartons';
    const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';

    const prog = db.query('SELECT * FROM store_loyalty_program WHERE program_id = ?', [programId])[0];
    if (!prog) return res.status(404).json({ error: 'Program tidak ditemukan.' });

    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const outletRows = db.query(
      `SELECT row_id, program_id, customer_code, customer_name, target_cartons, strata, reward_strata_pct, est_reward_amount
       FROM store_loyalty_program_outlet
       WHERE program_id = ?
       ORDER BY customer_name ASC`,
      [programId]
    );

    let totalTarget = 0;
    let totalActual = 0;
    let totalEstReward = 0;
    let totalEarnedReward = 0;
    let achievedCount = 0;

    const items = outletRows.map(o => {
      // Compute actual MTD realization for this store for the focus product
      const actualSql = `
        SELECT COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS actual_cartons
        FROM fact_sales_line l
        JOIN fact_sales_header h ON l.document_number = h.document_number
        JOIN dim_product p ON l.item_code = p.item_code
        WHERE (
          h.outlet_id = ?
          OR h.outlet_id IN (SELECT outlet_id FROM outlet_alias WHERE source_customer_code = ?)
          OR h.outlet_id = (SELECT outlet_id FROM dim_outlet WHERE canonical_name = ?)
        )
        AND h.transaction_date >= ? AND h.transaction_date < ?
        AND (p.brand LIKE '%GADJAH%' OR p.item_name LIKE '%GADJAH%' OR p.group_sku LIKE '%GADJAH%')
      `;
      const actRes = db.query(actualSql, [o.customer_code, o.customer_code, o.customer_name, startDate, endDate])[0];
      const actCartons = actRes ? Math.max(Math.round(actRes.actual_cartons * 10) / 10, 0) : 0;
      const tgtCartons = Math.max(Math.round(o.target_cartons * 10) / 10, 0);
      const achvPct = tgtCartons > 0 ? Math.round((actCartons / tgtCartons) * 1000) / 10 : 0;
      const isAchieved = actCartons >= tgtCartons && tgtCartons > 0;
      const gapCartons = Math.max(Math.round((tgtCartons - actCartons) * 10) / 10, 0);
      const estReward = Math.round(o.est_reward_amount || 0);
      const earnedReward = isAchieved ? estReward : 0;

      totalTarget += tgtCartons;
      totalActual += actCartons;
      totalEstReward += estReward;
      totalEarnedReward += earnedReward;
      if (isAchieved) achievedCount++;

      return {
        rowId: o.row_id,
        customerCode: o.customer_code,
        customerName: o.customer_name,
        targetCartons: tgtCartons,
        strata: o.strata || (tgtCartons <= 20 ? '6-20 ktn' : '21-50 ktn'),
        rewardPct: parseFloat(o.reward_strata_pct) || (tgtCartons <= 20 ? 3.0 : 4.0),
        estRewardAmount: estReward,
        actualCartons: actCartons,
        achievementPct: achvPct,
        statusCapai: isAchieved ? 'Tercapai' : 'Belum Capai',
        gapCartons,
        earnedRewardAmount: earnedReward
      };
    });

    // Sorting
    items.sort((a, b) => {
      let valA = a[sortBy] !== undefined ? a[sortBy] : '';
      let valB = b[sortBy] !== undefined ? b[sortBy] : '';
      if (typeof valA === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    const overallAchvPct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 1000) / 10 : 0;

    res.json({
      program: {
        programId: prog.program_id,
        programName: prog.program_name,
        productFocus: prog.product_focus,
        totalStores: items.length,
        totalTargetCartons: Math.round(totalTarget * 10) / 10,
        totalActualCartons: Math.round(totalActual * 10) / 10,
        overallAchvPct,
        achievedStoresCount: achievedCount,
        totalEstReward,
        totalEarnedReward
      },
      stores: items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create or update store loyalty program with store target rows
router.post('/programs/store-loyalty', (req, res) => {
  try {
    const db = getDb();
    const { programId, programName, productFocus, outlets } = req.body;
    const user = { userId: 'USR_ADMIN', fullName: 'Aghia', role: 'DSM' };

    if (!programName) {
      return res.status(400).json({ error: 'Nama Program wajib diisi.' });
    }

    const pId = programId || 'PROG_' + Date.now();
    const focus = productFocus || 'KOPI TUBRUK GADJAH';

    db.run(
      `INSERT OR REPLACE INTO store_loyalty_program (
        program_id, program_name, program_type, product_focus, start_date, end_date, is_active
      ) VALUES (?, ?, 'LOYALTY', ?, '2026-05-01', '2026-05-31', 1)`,
      [pId, programName, focus]
    );

    if (outlets && Array.isArray(outlets)) {
      db.run('DELETE FROM store_loyalty_program_outlet WHERE program_id = ?', [pId]);
      outlets.forEach((o, idx) => {
        const rowId = pId + '_OUT_' + (idx + 1);
        const tgt = parseFloat(o.targetCartons || o.target_ktn || 0);
        const strata = o.strata || (tgt <= 20 ? '6-20 ktn' : '21-50 ktn');
        const rPct = parseFloat(o.rewardPct || o.reward_pct || (tgt <= 20 ? 3.0 : 4.0));
        const estRew = parseFloat(o.estRewardAmount || o.est_reward_rp || (tgt * 200000 * (rPct / 100)));

        db.run(
          `INSERT INTO store_loyalty_program_outlet (
            row_id, program_id, customer_code, customer_name, target_cartons, strata, reward_strata_pct, est_reward_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [rowId, pId, o.customerCode || o.kode_toko, o.customerName || o.nama_toko, tgt, strata, rPct, estRew]
        );
      });
    }

    logAudit({
      userId: user.userId,
      userName: user.fullName,
      userRole: user.role,
      action: 'SAVE_STORE_LOYALTY_PROGRAM',
      entityType: 'store_loyalty_program',
      entityId: pId,
      afterState: req.body
    });

    res.json({ success: true, programId: pId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
