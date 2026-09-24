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
const { getMovementAnalytics, exportMovementCsv } = require('../services/trendEngine.js');
const { getAuditLogs, logAudit } = require('../middleware/audit.js');
const { authenticateUser, getAuthUser, requireSuperAdmin } = require('../middleware/auth.js');
const XLSX = require('xlsx');

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

// User Authentication Endpoints
router.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username dan password wajib diisi.' });
    }
    const user = authenticateUser(username, password);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Username atau password salah.' });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Berhasil keluar.' });
});

// Current logged in user profile (Supports auth headers or fallback to Aghia)
router.get('/auth/current-user', (req, res) => {
  const user = getAuthUser(req);
  res.json({ user });
});

// User Management (Kelola Pengguna Data Center)
router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const rows = db.query(`
      SELECT user_id, username, full_name, role, can_upload_sales, can_edit_customer, can_edit_target, can_manage_incentive, is_active, created_at
      FROM app_user
      ORDER BY role ASC, full_name ASC
    `);
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/password', (req, res) => {
  try {
    const db = getDb();
    const userId = req.params.id;
    const { newPassword } = req.body;
    const caller = getAuthUser(req);

    if (!newPassword || String(newPassword).trim().length === 0) {
      return res.status(400).json({ error: 'Password baru tidak boleh kosong.' });
    }

    if (caller.userId !== userId && caller.role !== 'DSM') {
      return res.status(403).json({ error: 'Akses ditolak: Hanya pengguna bersangkutan atau Super Admin yang dapat mengganti password.' });
    }

    db.run('UPDATE app_user SET password_hash = ? WHERE user_id = ?', [String(newPassword).trim(), userId]);
    res.json({ success: true, message: 'Password berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const { username, password, fullName, role } = req.body;
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ error: 'Semua data pengguna wajib diisi.' });
    }
    const isSuper = role === 'DSM';
    const userId = 'USR_' + crypto.randomUUID().slice(0, 8);
    db.run(`
      INSERT INTO app_user (
        user_id, username, password_hash, full_name, role, can_upload_sales, can_edit_customer, can_edit_target, can_manage_incentive, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [userId, username.trim(), password.trim(), fullName.trim(), role, isSuper ? 1 : 0, isSuper ? 1 : 0, isSuper ? 1 : 0, isSuper ? 1 : 0]);
    res.json({ success: true, message: 'Pengguna baru berhasil ditambahkan.', userId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    { id: 'SCM', name: 'SCM' },
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

    // Monthly historical trend (dynamically query agg_monthly_sales_movement or fallback)
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const currentM = summary.calendar.month;
    const currentY = summary.calendar.year;
    const trendRows = db.query(`
      SELECT 
        m.month, 
        COALESCE(SUM(m.net_cartons), 0) AS ktn, 
        COALESCE(SUM(m.net_value), 0) AS val,
        (SELECT COALESCE(SUM(t.target_cartons), 0) FROM fact_quantity_target t WHERE t.year = ? AND t.month = m.month) AS target_ktn
      FROM agg_monthly_sales_movement m
      WHERE m.year = ? AND m.month <= ?
      GROUP BY m.month
      ORDER BY m.month DESC
      LIMIT 5
    `, [currentY, currentY, currentM]).reverse();

    let trendMonths = [];
    if (trendRows.length > 0) {
      trendMonths = trendRows.map(r => {
        let achv = 85.0;
        if (r.target_ktn > 0) {
          achv = Math.round((r.ktn / r.target_ktn) * 1000) / 10;
        } else if (r.month === currentM && summary.sales.achievementPct !== null) {
          achv = summary.sales.achievementPct;
        }
        return {
          name: monthNames[r.month] || `Bln ${r.month}`,
          ktn: Math.round(r.ktn * 10) / 10,
          val: Math.round(r.val / 100000) / 10,
          achv
        };
      });
    } else {
      trendMonths = [
        { name: 'Jan', ktn: 420, val: 32.5, achv: 82.0 },
        { name: 'Feb', ktn: 510, val: 39.1, achv: 84.5 },
        { name: 'Mar', ktn: 605, val: 46.2, achv: 79.0 },
        { name: 'Apr', ktn: 680, val: 52.0, achv: 81.2 },
        { name: monthNames[currentM] || 'Mei', ktn: summary.sales.actualCartons || 740, val: Math.round((summary.sales.salesNettoValue || 56000000) / 1000000 * 10) / 10, achv: summary.sales.achievementPct || 73.2 }
      ];
    }

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

    // Inventory snapshot data for Stock on Hand & Stock Cover Days
    const stockSnapshotRows = db.query(`
      SELECT 
        p.brand,
        p.group_sku,
        COALESCE(SUM(s.available_stock_ctn), 0) AS stock_on_hand
      FROM fact_inventory_snapshot s
      JOIN dim_product p ON s.item_code = p.item_code
      GROUP BY p.brand, p.group_sku
    `);

    const groupStockMap = {};
    const brandStockMap = {};

    stockSnapshotRows.forEach(sr => {
      const gKey = (sr.group_sku || '').toUpperCase().trim();
      const bKey = (sr.brand || '').toUpperCase().trim();
      groupStockMap[gKey] = (groupStockMap[gKey] || 0) + (sr.stock_on_hand || 0);
      brandStockMap[bKey] = (brandStockMap[bKey] || 0) + (sr.stock_on_hand || 0);
    });

    function getStockInfo(groupSku, brand, targetCartons, actualCartons) {
      const gNorm = (groupSku || '').toUpperCase().trim();
      const bNorm = (brand || '').toUpperCase().trim();
      let stock = 0;
      if (gNorm && groupStockMap[gNorm] !== undefined) {
        stock = groupStockMap[gNorm];
      } else if (bNorm && brandStockMap[bNorm] !== undefined) {
        stock = brandStockMap[bNorm];
      } else {
        for (const [k, v] of Object.entries(groupStockMap)) {
          if ((gNorm && k.includes(gNorm)) || (gNorm && gNorm.includes(k))) {
            stock = v;
            break;
          }
        }
        if (!stock) {
          for (const [k, v] of Object.entries(brandStockMap)) {
            if ((bNorm && k.includes(bNorm)) || (bNorm && bNorm.includes(k))) {
              stock = v;
              break;
            }
          }
        }
      }

      const stockOnHand = Math.round(stock * 10) / 10;
      const dailyRate = targetCartons > 0 ? targetCartons / 25 : (actualCartons > 0 ? actualCartons / 25 : 0);
      const stockCoverDays = dailyRate > 0 ? Math.round((stockOnHand / dailyRate) * 10) / 10 : (stockOnHand > 0 ? 99 : 0);
      return { stockOnHand, stockCoverDays };
    }

    const aggCheck = db.query(
      'SELECT COUNT(*) as c FROM agg_monthly_sales_movement WHERE year = ? AND month = ?',
      [f.year, f.month]
    )[0];
    const useAgg = Boolean(aggCheck && aggCheck.c > 0 && !req.query.kecamatanId && !req.query.rayonId);

    if (useAgg) {
      const whereAgg = ['a.year = ? AND a.month = ?'];
      const paramsAgg = [f.year, f.month];
      const whereAggYtd = ['a.year = ? AND a.month <= ?'];
      const paramsAggYtd = [f.year, f.month];

      const whereTgt = ['t.year = ? AND t.month = ?'];
      const paramsTgt = [f.year, f.month];
      const whereTgtYtd = ['t.year = ? AND t.month <= ?'];
      const paramsTgtYtd = [f.year, f.month];

      if (req.query.salesmanId) {
        whereAgg.push('a.salesman_id = ?');
        paramsAgg.push(req.query.salesmanId);
        whereAggYtd.push('a.salesman_id = ?');
        paramsAggYtd.push(req.query.salesmanId);

        whereTgt.push('t.salesman_id = ?');
        paramsTgt.push(req.query.salesmanId);
        whereTgtYtd.push('t.salesman_id = ?');
        paramsTgtYtd.push(req.query.salesmanId);
      } else if (req.query.spvId) {
        whereAgg.push('a.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE spv_id = ?)');
        paramsAgg.push(req.query.spvId);
        whereAggYtd.push('a.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE spv_id = ?)');
        paramsAggYtd.push(req.query.spvId);

        whereTgt.push('t.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE spv_id = ?)');
        paramsTgt.push(req.query.spvId);
        whereTgtYtd.push('t.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE spv_id = ?)');
        paramsTgtYtd.push(req.query.spvId);
      }

      if (req.query.salesGroup) {
        const isScm = req.query.salesGroup.toUpperCase() === 'SCM' || req.query.salesGroup.toUpperCase() === 'SMC';
        if (isScm) {
          whereAgg.push("a.sales_group IN ('SCM', 'SMC')");
          whereAggYtd.push("a.sales_group IN ('SCM', 'SMC')");
          whereTgt.push("t.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group IN ('SCM', 'SMC'))");
          whereTgtYtd.push("t.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group IN ('SCM', 'SMC'))");
        } else {
          whereAgg.push('a.sales_group = ?');
          paramsAgg.push(req.query.salesGroup);
          whereAggYtd.push('a.sales_group = ?');
          paramsAggYtd.push(req.query.salesGroup);

          whereTgt.push('t.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group = ?)');
          paramsTgt.push(req.query.salesGroup);
          whereTgtYtd.push('t.salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group = ?)');
          paramsTgtYtd.push(req.query.salesGroup);
        }
      }

      if (req.query.principal) {
        whereAgg.push('a.principal = ?');
        paramsAgg.push(req.query.principal);
        whereAggYtd.push('a.principal = ?');
        paramsAggYtd.push(req.query.principal);
      }
      if (req.query.brand) {
        whereAgg.push('a.brand = ?');
        paramsAgg.push(req.query.brand);
        whereAggYtd.push('a.brand = ?');
        paramsAggYtd.push(req.query.brand);
      }
      if (req.query.groupSku) {
        whereAgg.push('a.group_sku = ?');
        paramsAgg.push(req.query.groupSku);
        whereAggYtd.push('a.group_sku = ?');
        paramsAggYtd.push(req.query.groupSku);

        whereTgt.push('UPPER(TRIM(t.group_sku)) = UPPER(TRIM(?))');
        paramsTgt.push(req.query.groupSku);
        whereTgtYtd.push('UPPER(TRIM(t.group_sku)) = UPPER(TRIM(?))');
        paramsTgtYtd.push(req.query.groupSku);
      }

      const actualRows = db.query(`
        SELECT
          a.principal,
          a.brand,
          a.group_sku,
          COALESCE(SUM(a.net_cartons), 0) AS actual_cartons,
          COALESCE(SUM(a.gross_cartons), 0) AS gross_cartons,
          COALESCE(SUM(a.retur_cartons), 0) AS return_cartons,
          COALESCE(SUM(a.net_value), 0) AS sales_netto
        FROM agg_monthly_sales_movement a
        WHERE ${whereAgg.join(' AND ')}
        GROUP BY a.principal, a.brand, a.group_sku
        ORDER BY actual_cartons DESC
      `, paramsAgg);

      const targetRows = db.query(`
        SELECT
          t.group_sku,
          COALESCE(SUM(t.target_cartons), 0) AS target_cartons,
          COALESCE(SUM(t.target_value), 0) AS target_value
        FROM fact_quantity_target t
        WHERE ${whereTgt.join(' AND ')}
        GROUP BY t.group_sku
      `, paramsTgt);

      const ytdActualRows = db.query(`
        SELECT
          a.principal,
          a.brand,
          a.group_sku,
          COALESCE(SUM(a.net_cartons), 0) AS actual_cartons_ytd,
          COALESCE(SUM(a.net_value), 0) AS sales_netto_ytd
        FROM agg_monthly_sales_movement a
        WHERE ${whereAggYtd.join(' AND ')}
        GROUP BY a.principal, a.brand, a.group_sku
      `, paramsAggYtd);

      const ytdTargetRows = db.query(`
        SELECT
          t.group_sku,
          COALESCE(SUM(t.target_cartons), 0) AS target_cartons_ytd,
          COALESCE(SUM(t.target_value), 0) AS target_value_ytd
        FROM fact_quantity_target t
        WHERE ${whereTgtYtd.join(' AND ')}
        GROUP BY t.group_sku
      `, paramsTgtYtd);

      function matchTarget(gSku, bName, tgtList, ktnField, valField) {
        const gNorm = (gSku || '').toUpperCase().trim();
        const bNorm = (bName || '').toUpperCase().trim();

        let match = tgtList.find(t => (t.group_sku || '').toUpperCase().trim() === gNorm);
        if (!match) {
          match = tgtList.find(t => (t.group_sku || '').toUpperCase().trim() === bNorm);
        }
        if (!match) {
          match = tgtList.find(t => {
            const tg = (t.group_sku || '').toUpperCase().trim();
            return (gNorm && tg.includes(gNorm)) || (tg && gNorm.includes(tg)) ||
                   (bNorm && tg.includes(bNorm)) || (tg && bNorm.includes(tg));
          });
        }

        return {
          cartons: match ? Math.round(match[ktnField] * 10) / 10 : 0,
          value: match ? Math.round(match[valField]) : 0
        };
      }

      const totalCartons = Math.max(actualRows.reduce((s, r) => s + r.actual_cartons, 0), 0);
      const totalSalesNetto = Math.max(actualRows.reduce((s, r) => s + r.sales_netto, 0), 0);
      const totalTargetCartons = targetRows.reduce((s, t) => s + (t.target_cartons || 0), 0);
      const totalTargetValue = targetRows.reduce((s, t) => s + (t.target_value || 0), 0);

      const totalCartonsYtd = Math.max(ytdActualRows.reduce((s, yr) => s + yr.actual_cartons_ytd, 0), 0);
      const totalSalesNettoYtd = Math.max(ytdActualRows.reduce((s, yr) => s + yr.sales_netto_ytd, 0), 0);
      const totalTargetCartonsYtd = ytdTargetRows.reduce((s, t) => s + (t.target_cartons_ytd || 0), 0);
      const totalTargetValueYtd = ytdTargetRows.reduce((s, t) => s + (t.target_value_ytd || 0), 0);

      const items = actualRows.map(r => {
        const act = Math.max(Math.round(r.actual_cartons * 10) / 10, 0);
        const tgt = matchTarget(r.group_sku, r.brand, targetRows, 'target_cartons', 'target_value');
        const achv = tgt.cartons > 0 ? Math.round((act / tgt.cartons) * 1000) / 10 : 0;
        const valAchv = tgt.value > 0 ? Math.round((Math.max(r.sales_netto, 0) / tgt.value) * 1000) / 10 : 0;
        const contrib = totalCartons > 0 ? Math.round((act / totalCartons) * 1000) / 10 : 0;
        const stockInfo = getStockInfo(r.group_sku, r.brand, tgt.cartons, act);

        return {
          principal: r.principal,
          brand: r.brand,
          groupSku: r.group_sku,
          targetCartons: tgt.cartons,
          targetValue: tgt.value,
          actualCartons: act,
          achievementPct: achv,
          valueAchievementPct: valAchv,
          gapCartons: Math.max(Math.round((tgt.cartons - act) * 10) / 10, 0),
          gapValue: Math.max(tgt.value - Math.max(r.sales_netto, 0), 0),
          salesNetto: Math.round(r.sales_netto),
          returnCartons: Math.round(r.return_cartons * 10) / 10,
          contributionPct: contrib,
          stockOnHand: stockInfo.stockOnHand,
          stockCoverDays: stockInfo.stockCoverDays
        };
      });

      const groupMap = {};
      items.forEach(it => {
        const g = it.groupSku || 'LAIN-LAIN';
        if (!groupMap[g]) {
          groupMap[g] = {
            groupSku: g,
            brand: it.brand,
            principal: it.principal,
            targetCartons: 0,
            targetValue: 0,
            actualCartons: 0,
            salesNetto: 0,
            returnCartons: 0
          };
        }
        groupMap[g].targetCartons += it.targetCartons || 0;
        groupMap[g].targetValue += it.targetValue || 0;
        groupMap[g].actualCartons += it.actualCartons || 0;
        groupMap[g].salesNetto += it.salesNetto || 0;
        groupMap[g].returnCartons += it.returnCartons || 0;
      });

      const ytdGroupMap = {};
      ytdActualRows.forEach(yr => {
        const gKey = yr.group_sku || 'LAIN-LAIN';
        if (!ytdGroupMap[gKey]) {
          ytdGroupMap[gKey] = {
            actualCartons: 0,
            salesNetto: 0,
            brand: yr.brand,
            principal: yr.principal
          };
        }
        ytdGroupMap[gKey].actualCartons += Math.max(yr.actual_cartons_ytd, 0);
        ytdGroupMap[gKey].salesNetto += Math.max(yr.sales_netto_ytd, 0);
      });

      const groupSkus = Object.values(groupMap).map(g => {
        const tgt = Math.round(g.targetCartons * 10) / 10;
        const tgtVal = Math.round(g.targetValue || 0);
        const act = Math.round(g.actualCartons * 10) / 10;
        const achv = tgt > 0 ? Math.round((act / tgt) * 1000) / 10 : 0;
        const valAchv = tgtVal > 0 ? Math.round((Math.max(g.salesNetto, 0) / tgtVal) * 1000) / 10 : 0;
        const contrib = totalCartons > 0 ? Math.round((act / totalCartons) * 1000) / 10 : 0;
        const stockInfo = getStockInfo(g.groupSku, g.brand, tgt, act);

        const ytdActData = ytdGroupMap[g.groupSku] || { actualCartons: 0, salesNetto: 0 };
        const ytdTgt = matchTarget(g.groupSku, g.brand, ytdTargetRows, 'target_cartons_ytd', 'target_value_ytd');
        const ytdAct = Math.round(ytdActData.actualCartons * 10) / 10;
        const ytdVal = Math.round(ytdActData.salesNetto);
        const ytdAchv = ytdTgt.cartons > 0 ? Math.round((ytdAct / ytdTgt.cartons) * 1000) / 10 : 0;
        const ytdValAchv = ytdTgt.value > 0 ? Math.round((ytdVal / ytdTgt.value) * 1000) / 10 : 0;
        const ytdGapCartons = Math.max(Math.round((ytdTgt.cartons - ytdAct) * 10) / 10, 0);
        const ytdGapValue = Math.max(ytdTgt.value - ytdVal, 0);

        return {
          ...g,
          targetCartons: tgt,
          targetValue: tgtVal,
          actualCartons: act,
          achievementPct: achv,
          valueAchievementPct: valAchv,
          gapCartons: Math.max(Math.round((tgt - act) * 10) / 10, 0),
          gapValue: Math.max(tgtVal - Math.max(g.salesNetto, 0), 0),
          contributionPct: contrib,
          stockOnHand: stockInfo.stockOnHand,
          stockCoverDays: stockInfo.stockCoverDays,
          ytd: {
            asOfMonth: f.month,
            targetCartons: ytdTgt.cartons,
            targetValue: ytdTgt.value,
            actualCartons: ytdAct,
            salesNetto: ytdVal,
            achievementPct: ytdAchv,
            valueAchievementPct: ytdValAchv,
            gapCartons: ytdGapCartons,
            gapValue: ytdGapValue
          }
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

      groupSkus.sort((a, b) => {
        let valA = a[sortBy] !== undefined ? a[sortBy] : '';
        let valB = b[sortBy] !== undefined ? b[sortBy] : '';
        if (typeof valA === 'string') {
          return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortDir === 'asc' ? valA - valB : valB - valA;
      });

      const summary = {
        totalCartons: Math.round(totalCartons * 10) / 10,
        totalSalesNetto: Math.round(totalSalesNetto),
        totalTargetCartons: Math.round(totalTargetCartons * 10) / 10,
        totalTargetValue: Math.round(totalTargetValue),
        totalSkus: items.length,
        totalGroups: groupSkus.length,
        ytd: {
          asOfMonth: f.month,
          targetCartons: Math.round(totalTargetCartonsYtd * 10) / 10,
          targetValue: Math.round(totalTargetValueYtd),
          actualCartons: Math.round(totalCartonsYtd * 10) / 10,
          salesNetto: Math.round(totalSalesNettoYtd),
          achievementPct: totalTargetCartonsYtd > 0 ? Math.round((totalCartonsYtd / totalTargetCartonsYtd) * 1000) / 10 : 0,
          valueAchievementPct: totalTargetValueYtd > 0 ? Math.round((totalSalesNettoYtd / totalTargetValueYtd) * 1000) / 10 : 0,
          gapCartons: Math.max(Math.round((totalTargetCartonsYtd - totalCartonsYtd) * 10) / 10, 0),
          gapValue: Math.max(Math.round(totalTargetValueYtd - totalSalesNettoYtd), 0)
        }
      };

      return res.json({
        summary,
        products: items,
        groupSkus
      });
    }

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
          WHERE (
            t.group_sku = p.group_sku 
            OR UPPER(TRIM(t.group_sku)) = UPPER(TRIM(p.brand))
            OR UPPER(p.brand) LIKE '%' || UPPER(TRIM(t.group_sku)) || '%'
            OR UPPER(t.group_sku) LIKE '%' || UPPER(TRIM(p.brand)) || '%'
            OR (UPPER(p.brand) LIKE '%GADJAH%' AND UPPER(t.group_sku) LIKE '%GADJAH%')
            OR (UPPER(p.brand) LIKE '%MILK LIFE%' AND UPPER(t.group_sku) LIKE '%MILK LIFE%')
          ) AND t.year = ? AND t.month = ?
        ) AS target_cartons,
        (
          SELECT COALESCE(SUM(t.target_value), 0)
          FROM fact_quantity_target t
          WHERE (
            t.group_sku = p.group_sku 
            OR UPPER(TRIM(t.group_sku)) = UPPER(TRIM(p.brand))
            OR UPPER(p.brand) LIKE '%' || UPPER(TRIM(t.group_sku)) || '%'
            OR UPPER(t.group_sku) LIKE '%' || UPPER(TRIM(p.brand)) || '%'
            OR (UPPER(p.brand) LIKE '%GADJAH%' AND UPPER(t.group_sku) LIKE '%GADJAH%')
            OR (UPPER(p.brand) LIKE '%MILK LIFE%' AND UPPER(t.group_sku) LIKE '%MILK LIFE%')
          ) AND t.year = ? AND t.month = ?
        ) AS target_value
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      JOIN dim_outlet o ON h.outlet_id = o.outlet_id
      ${f.whereTxSql}
      GROUP BY p.principal, p.brand, p.group_sku
      ORDER BY actual_cartons DESC
    `;

    const rows = db.query(sql, [f.year, f.month, f.year, f.month, ...f.paramsTx]);
    const totalCartons = rows.reduce((s, r) => s + Math.max(r.actual_cartons, 0), 0);

    const items = rows.map(r => {
      const act = Math.max(Math.round(r.actual_cartons * 10) / 10, 0);
      const tgt = Math.round(r.target_cartons * 10) / 10;
      const tgtVal = Math.round(r.target_value || 0);
      const achv = tgt > 0 ? Math.round((act / tgt) * 1000) / 10 : 0;
      const valAchv = tgtVal > 0 ? Math.round((Math.max(r.sales_netto, 0) / tgtVal) * 1000) / 10 : 0;
      const contrib = totalCartons > 0 ? Math.round((act / totalCartons) * 1000) / 10 : 0;
      const stockInfo = getStockInfo(r.group_sku, r.brand, tgt, act);
      return {
        principal: r.principal,
        brand: r.brand,
        groupSku: r.group_sku,
        targetCartons: tgt,
        targetValue: tgtVal,
        actualCartons: act,
        achievementPct: achv,
        valueAchievementPct: valAchv,
        gapCartons: Math.max(tgt - act, 0),
        gapValue: Math.max(tgtVal - Math.max(r.sales_netto, 0), 0),
        salesNetto: Math.round(r.sales_netto),
        returnCartons: Math.round(r.return_cartons * 10) / 10,
        contributionPct: contrib,
        stockOnHand: stockInfo.stockOnHand,
        stockCoverDays: stockInfo.stockCoverDays
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
          targetValue: 0,
          actualCartons: 0,
          salesNetto: 0,
          returnCartons: 0
        };
      }
      groupMap[g].targetCartons += it.targetCartons || 0;
      groupMap[g].targetValue += it.targetValue || 0;
      groupMap[g].actualCartons += it.actualCartons || 0;
      groupMap[g].salesNetto += it.salesNetto || 0;
      groupMap[g].returnCartons += it.returnCartons || 0;
    });

    // YTD 2026 calculation (cumulative from month 1 to f.month)
    const whereYtd = [`h.period_year = 2026 AND h.period_month <= ?`];
    const paramsYtd = [f.month];

    if (req.query.salesmanId) {
      whereYtd.push(`h.current_owner_salesman_id = ?`);
      paramsYtd.push(req.query.salesmanId);
    } else if (req.query.spvId) {
      whereYtd.push(`h.current_owner_salesman_id IN (SELECT salesman_id FROM org_salesman WHERE spv_id = ?)`);
      paramsYtd.push(req.query.spvId);
    }
    if (req.query.salesGroup) {
      const isScm = req.query.salesGroup.toUpperCase() === 'SCM' || req.query.salesGroup.toUpperCase() === 'SMC';
      if (isScm) {
        whereYtd.push(`h.current_owner_salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group IN ('SCM', 'SMC'))`);
      } else {
        whereYtd.push(`h.current_owner_salesman_id IN (SELECT salesman_id FROM org_salesman WHERE sales_group = ?)`);
        paramsYtd.push(req.query.salesGroup);
      }
    }
    if (req.query.principal) {
      whereYtd.push(`p.principal = ?`);
      paramsYtd.push(req.query.principal);
    }
    if (req.query.brand) {
      whereYtd.push(`p.brand = ?`);
      paramsYtd.push(req.query.brand);
    }
    if (req.query.groupSku) {
      whereYtd.push(`p.group_sku = ?`);
      paramsYtd.push(req.query.groupSku);
    }
    if (req.query.kecamatanId) {
      whereYtd.push(`o.kecamatan_id = ?`);
      paramsYtd.push(req.query.kecamatanId);
    }
    if (req.query.rayonId) {
      whereYtd.push(`o.current_rayon_id = ?`);
      paramsYtd.push(req.query.rayonId);
    }

    const whereYtdSql = 'WHERE ' + whereYtd.join(' AND ');

    const ytdSql = `
      SELECT
        p.principal,
        p.brand,
        p.group_sku,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS actual_cartons_ytd,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS sales_netto_ytd,
        (
          SELECT COALESCE(SUM(t.target_cartons), 0)
          FROM fact_quantity_target t
          WHERE (
            t.group_sku = p.group_sku 
            OR UPPER(TRIM(t.group_sku)) = UPPER(TRIM(p.brand))
            OR UPPER(p.brand) LIKE '%' || UPPER(TRIM(t.group_sku)) || '%'
            OR UPPER(t.group_sku) LIKE '%' || UPPER(TRIM(p.brand)) || '%'
            OR (UPPER(p.brand) LIKE '%GADJAH%' AND UPPER(t.group_sku) LIKE '%GADJAH%')
            OR (UPPER(p.brand) LIKE '%MILK LIFE%' AND UPPER(t.group_sku) LIKE '%MILK LIFE%')
          ) AND t.year = 2026 AND t.month <= ?
        ) AS target_cartons_ytd,
        (
          SELECT COALESCE(SUM(t.target_value), 0)
          FROM fact_quantity_target t
          WHERE (
            t.group_sku = p.group_sku 
            OR UPPER(TRIM(t.group_sku)) = UPPER(TRIM(p.brand))
            OR UPPER(p.brand) LIKE '%' || UPPER(TRIM(t.group_sku)) || '%'
            OR UPPER(t.group_sku) LIKE '%' || UPPER(TRIM(p.brand)) || '%'
            OR (UPPER(p.brand) LIKE '%GADJAH%' AND UPPER(t.group_sku) LIKE '%GADJAH%')
            OR (UPPER(p.brand) LIKE '%MILK LIFE%' AND UPPER(t.group_sku) LIKE '%MILK LIFE%')
          ) AND t.year = 2026 AND t.month <= ?
        ) AS target_value_ytd
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      JOIN dim_outlet o ON h.outlet_id = o.outlet_id
      ${whereYtdSql}
      GROUP BY p.principal, p.brand, p.group_sku
    `;

    const ytdRows = db.query(ytdSql, [f.month, f.month, ...paramsYtd]);
    
    // Map YTD by group_sku
    const ytdGroupMap = {};
    let totalCartonsYtd = 0;
    let totalSalesNettoYtd = 0;
    let totalTargetCartonsYtd = 0;
    let totalTargetValueYtd = 0;

    ytdRows.forEach(yr => {
      const gKey = yr.group_sku || 'LAIN-LAIN';
      if (!ytdGroupMap[gKey]) {
        ytdGroupMap[gKey] = {
          actualCartons: 0,
          salesNetto: 0,
          targetCartons: 0,
          targetValue: 0
        };
      }
      ytdGroupMap[gKey].actualCartons += Math.max(yr.actual_cartons_ytd, 0);
      ytdGroupMap[gKey].salesNetto += Math.max(yr.sales_netto_ytd, 0);
      ytdGroupMap[gKey].targetCartons += yr.target_cartons_ytd || 0;
      ytdGroupMap[gKey].targetValue += yr.target_value_ytd || 0;

      totalCartonsYtd += Math.max(yr.actual_cartons_ytd, 0);
      totalSalesNettoYtd += Math.max(yr.sales_netto_ytd, 0);
      totalTargetCartonsYtd += yr.target_cartons_ytd || 0;
      totalTargetValueYtd += yr.target_value_ytd || 0;
    });

    const groupSkus = Object.values(groupMap).map(g => {
      const tgt = Math.round(g.targetCartons * 10) / 10;
      const tgtVal = Math.round(g.targetValue || 0);
      const act = Math.round(g.actualCartons * 10) / 10;
      const achv = tgt > 0 ? Math.round((act / tgt) * 1000) / 10 : 0;
      const valAchv = tgtVal > 0 ? Math.round((Math.max(g.salesNetto, 0) / tgtVal) * 1000) / 10 : 0;
      const contrib = totalCartons > 0 ? Math.round((act / totalCartons) * 1000) / 10 : 0;

      const ytdData = ytdGroupMap[g.groupSku] || { actualCartons: 0, salesNetto: 0, targetCartons: 0, targetValue: 0 };
      const ytdAct = Math.round(ytdData.actualCartons * 10) / 10;
      const ytdTgt = Math.round(ytdData.targetCartons * 10) / 10;
      const ytdVal = Math.round(ytdData.salesNetto);
      const ytdTgtVal = Math.round(ytdData.targetValue);
      const ytdAchv = ytdTgt > 0 ? Math.round((ytdAct / ytdTgt) * 1000) / 10 : 0;
      const ytdValAchv = ytdTgtVal > 0 ? Math.round((ytdVal / ytdTgtVal) * 1000) / 10 : 0;
      const ytdGapCartons = Math.max(Math.round((ytdTgt - ytdAct) * 10) / 10, 0);
      const ytdGapValue = Math.max(ytdTgtVal - ytdVal, 0);

      const stockInfo = getStockInfo(g.groupSku, g.brand, tgt, act);
      return {
        ...g,
        targetCartons: tgt,
        targetValue: tgtVal,
        actualCartons: act,
        achievementPct: achv,
        valueAchievementPct: valAchv,
        gapCartons: Math.max(tgt - act, 0),
        gapValue: Math.max(tgtVal - Math.max(g.salesNetto, 0), 0),
        contributionPct: contrib,
        stockOnHand: stockInfo.stockOnHand,
        stockCoverDays: stockInfo.stockCoverDays,
        ytd: {
          asOfMonth: f.month,
          targetCartons: ytdTgt,
          targetValue: ytdTgtVal,
          actualCartons: ytdAct,
          salesNetto: ytdVal,
          achievementPct: ytdAchv,
          valueAchievementPct: ytdValAchv,
          gapCartons: ytdGapCartons,
          gapValue: ytdGapValue
        }
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
        totalSalesNetto: Math.round(rows.reduce((s, r) => s + Math.max(r.sales_netto, 0), 0)),
        totalTargetValue: Math.round(groupSkus.reduce((s, g) => s + (g.targetValue || 0), 0)),
        totalSkus: items.length,
        totalGroups: groupSkus.length,
        ytd: {
          asOfMonth: f.month,
          targetCartons: Math.round(totalTargetCartonsYtd * 10) / 10,
          targetValue: Math.round(totalTargetValueYtd),
          actualCartons: Math.round(totalCartonsYtd * 10) / 10,
          salesNetto: Math.round(totalSalesNettoYtd),
          achievementPct: totalTargetCartonsYtd > 0 ? Math.round((totalCartonsYtd / totalTargetCartonsYtd) * 1000) / 10 : 0,
          valueAchievementPct: totalTargetValueYtd > 0 ? Math.round((totalSalesNettoYtd / totalTargetValueYtd) * 1000) / 10 : 0,
          gapCartons: Math.max(Math.round((totalTargetCartonsYtd - totalCartonsYtd) * 10) / 10, 0),
          gapValue: Math.max(Math.round(totalTargetValueYtd - totalSalesNettoYtd), 0)
        }
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

    const pageOutletIds = paginatedItems.map(p => p.outletId);
    if (pageOutletIds.length > 0) {
      const placeholders = pageOutletIds.map(() => '?').join(',');
      const monthlyRows = db.query(`
        SELECT 
          h.outlet_id, 
          h.period_month, 
          COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS ctn
        FROM fact_sales_header h
        JOIN fact_sales_line l ON h.document_number = l.document_number
        WHERE h.period_year = 2026 AND h.period_month <= 9 AND h.outlet_id IN (${placeholders})
        GROUP BY h.outlet_id, h.period_month
      `, pageOutletIds);

      const monthlyMap = {};
      monthlyRows.forEach(mr => {
        if (!monthlyMap[mr.outlet_id]) monthlyMap[mr.outlet_id] = {};
        monthlyMap[mr.outlet_id][mr.period_month] = Math.max(Math.round(mr.ctn * 10) / 10, 0);
      });

      paginatedItems.forEach(item => {
        const m = monthlyMap[item.outletId] || {};
        item.monthlySales = {
          m1: m[1] || 0,
          m2: m[2] || 0,
          m3: m[3] || 0,
          m4: m[4] || 0,
          m5: m[5] || 0,
          m6: m[6] || 0,
          m7: m[7] || 0,
          m8: m[8] || 0,
          m9: m[9] || 0
        };
        const totalYtd = Object.values(item.monthlySales).reduce((a, b) => a + b, 0);
        // Average last 3 months: 1 month before September (m9) is August (m8). L3M = m6, m7, m8
        const avgL3M = Math.round(((item.monthlySales.m6 + item.monthlySales.m7 + item.monthlySales.m8) / 3) * 10) / 10;
        // Average last 6 months: m3, m4, m5, m6, m7, m8
        const avgL6M = Math.round(((item.monthlySales.m3 + item.monthlySales.m4 + item.monthlySales.m5 + item.monthlySales.m6 + item.monthlySales.m7 + item.monthlySales.m8) / 6) * 10) / 10;

        item.totalYtdCartons = Math.round(totalYtd * 10) / 10;
        item.avgLast3Months = avgL3M;
        item.avgLast6Months = avgL6M;
      });
    }

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

    // 1. Outlet sales summary in 2026:
    const salesSummaryRow = db.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS total_cartons,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS total_netto,
        COUNT(DISTINCT h.document_number) AS total_invoices,
        COUNT(DISTINCT h.period_month) AS active_months
      FROM fact_sales_header h
      JOIN fact_sales_line l ON h.document_number = l.document_number
      WHERE h.outlet_id = ? AND h.period_year = 2026
    `, [outletId])[0] || {};

    const totalCartons = Math.max(Math.round((salesSummaryRow.total_cartons || 0) * 10) / 10, 0);
    const totalNetto = Math.max(Math.round(salesSummaryRow.total_netto || 0), 0);
    const totalInvoices = salesSummaryRow.total_invoices || 0;
    const activeMonths = salesSummaryRow.active_months || 1;

    const trenPenjualanJt = Math.round((totalNetto / 1000000) * 10) / 10;
    const frekuensiOrderBulan = Math.round((totalInvoices / Math.max(activeMonths, 1)) * 10) / 10;
    const rataRataDropJt = totalInvoices > 0 ? Math.round((totalNetto / totalInvoices / 1000000) * 10) / 10 : 0;

    // Calculate last 3 months growth (Jun-Aug vs Mar-May)
    const l3mRow = db.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN h.period_month IN (6,7,8) THEN l.sales_netto ELSE 0 END), 0) AS l3m_val,
        COALESCE(SUM(CASE WHEN h.period_month IN (3,4,5) THEN l.sales_netto ELSE 0 END), 0) AS p3m_val
      FROM fact_sales_header h
      JOIN fact_sales_line l ON h.document_number = l.document_number
      WHERE h.outlet_id = ? AND h.period_year = 2026
    `, [outletId])[0] || {};

    const l3mVal = l3mRow.l3m_val || 0;
    const p3mVal = l3mRow.p3m_val || 0;
    const trenPenjualanGrowthPct = p3mVal > 0 ? Math.round(((l3mVal - p3mVal) / p3mVal) * 100) : (l3mVal > 0 ? 100 : 0);

    // 2. Product mix by Brand (real data):
    const brandMixRows = db.query(`
      SELECT 
        p.brand AS name,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS total_val
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      WHERE h.outlet_id = ? AND h.period_year = 2026
      GROUP BY p.brand
      ORDER BY total_val DESC
    `, [outletId]);

    const brandColors = ['#2563EB', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#9CA3AF'];
    const totalBrandVal = brandMixRows.reduce((s, b) => s + Math.max(b.total_val, 0), 0);
    let productMix = brandMixRows.map((b, idx) => ({
      name: b.name || 'Lain-lain',
      pct: totalBrandVal > 0 ? Math.round((Math.max(b.total_val, 0) / totalBrandVal) * 100) : 0,
      color: brandColors[idx % brandColors.length]
    })).slice(0, 5);

    if (productMix.length === 0) {
      productMix = [
        { name: 'Kopi Tubruk Gadjah', pct: 0, color: '#2563EB' },
        { name: 'Milk Life', pct: 0, color: '#3B82F6' },
        { name: 'Deli', pct: 0, color: '#10B981' }
      ];
    }

    // 3. Top SKUs (real data):
    const topSkusRows = db.query(`
      SELECT
        p.item_name,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS total_val,
        COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS total_ctn
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      WHERE h.outlet_id = ? AND h.period_year = 2026
      GROUP BY p.item_name
      ORDER BY total_val DESC
      LIMIT 5
    `, [outletId]);

    const topSkus = topSkusRows.map((s, idx) => ({
      rank: idx + 1,
      sku: s.item_name,
      penjualanJt: Math.round((Math.max(s.total_val, 0) / 1000000) * 10) / 10,
      pct: totalBrandVal > 0 ? Math.round((Math.max(s.total_val, 0) / totalBrandVal) * 100) : 0
    }));

    // 4. Must Have Lines:
    const mhLines = db.query(`
      SELECT DISTINCT p.must_have_line
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      WHERE h.outlet_id = ? AND p.must_have_line != 'NONE' AND p.must_have_line IS NOT NULL AND h.period_year = 2026
    `, [outletId]).map(r => r.must_have_line);

    const tersediaCount = mhLines.length;
    const totalTargetCount = 6;
    const penetrationPct = Math.round((tersediaCount / totalTargetCount) * 100);

    // 5. NPL History (Deli Daily / NPL):
    const nplOrders = db.query(`
      SELECT COUNT(DISTINCT h.document_number) AS ro_count
      FROM fact_sales_line l
      JOIN fact_sales_header h ON l.document_number = h.document_number
      JOIN dim_product p ON l.item_code = p.item_code
      WHERE h.outlet_id = ? AND (p.group_sku LIKE '%NPL%' OR p.item_name LIKE '%DELI%' OR p.item_name LIKE '%NPL%') AND h.period_year = 2026
    `, [outletId])[0]?.ro_count || 0;

    // 6. AR & Overdue:
    const arRows = db.query('SELECT * FROM fact_ar_invoice WHERE outlet_id = ?', [outletId]);
    const totalAr = arRows.reduce((s, r) => s + (r.saldo_piutang || 0), 0);
    const overdueAr = arRows.filter(r => (r.overdue_days || 0) > 0).reduce((s, r) => s + (r.saldo_piutang || 0), 0);
    const overduePct = totalAr > 0 ? Math.round((overdueAr / totalAr) * 100) : 0;

    // 7. Dynamic Recommendations:
    const recommendations = [];
    if (trenPenjualanGrowthPct > 0) {
      recommendations.push({
        type: 'SUCCESS',
        title: 'Performa Positif',
        desc: `Penjualan 3 bulan terakhir bertumbuh +${trenPenjualanGrowthPct}%. Pertahankan coverage rutin dan kontinuitas pengiriman.`
      });
    } else if (totalInvoices === 0) {
      recommendations.push({
        type: 'WARNING',
        title: 'Outlet Belum Transaksi',
        desc: 'Belum ada transaksi di tahun 2026. Lakukan re-aktivasi rute dan kenalkan produk starter pack promo.'
      });
    } else {
      recommendations.push({
        type: 'INFO',
        title: 'Peluang Re-order',
        desc: `Rata-rata drop Rp ${rataRataDropJt} Jt. Optimalkan penawaran bundling untuk meningkatkan omzet per nota.`
      });
    }

    if (penetrationPct < 50) {
      recommendations.push({
        type: 'WARNING',
        title: 'Must Have SKU Belum Lengkap',
        desc: `Penetrasi Must Have baru ${penetrationPct}% (${tersediaCount}/${totalTargetCount}). Tawarkan varian Must Have yang belum masuk toko.`
      });
    } else {
      recommendations.push({
        type: 'SUCCESS',
        title: 'Penetrasi Must Have Unggul',
        desc: `${tersediaCount} dari ${totalTargetCount} item Must Have aktif dibeli (${penetrationPct}%).`
      });
    }

    if (overdueAr > 0) {
      recommendations.push({
        type: 'WARNING',
        title: 'Perhatian Piutang Overdue',
        desc: `Terdapat piutang overdue sebesar Rp ${(overdueAr / 1000000).toFixed(1)} Jt (${overduePct}%). Prioritaskan penagihan sebelum pengiriman berikutnya.`
      });
    }

    res.json({
      identity: {
        outletId: outlet.outlet_id,
        canonicalName: outlet.canonical_name,
        aliases: aliases.map(a => a.source_customer_code),
        salesmanName: outlet.salesman_name || 'Belum Di-assign',
        spvName: outlet.spv_name || '—',
        rayon: outlet.rayon_code || 'R01',
        kecamatan: outlet.kecamatan_name || 'Garut Kota',
        tipeOutlet: outlet.cluster_tier || 'Toko Kelontong (GT)',
        statusKredit: overdueAr > 0 ? 'Perlu Perhatian' : 'Lancar',
        limitKredit: outlet.credit_limit || 50000000,
        topDays: outlet.term_of_payment || 30,
        lastOrderDate: lastOrderRow ? lastOrderRow.last_date : null,
        daysSinceLastOrder,
        status: daysSinceLastOrder === null ? 'Belum Pernah Order' : (daysSinceLastOrder >= 60 ? 'Dormant' : (daysSinceLastOrder > 20 ? 'Inaktif MTD' : 'Aktif'))
      },
      summaryMetrics: {
        trenPenjualanJt,
        trenPenjualanGrowthPct,
        frekuensiOrderBulan,
        rataRataDropJt,
        totalCartons,
        totalInvoices
      },
      productMix,
      topSkus,
      mustHave: {
        tersediaCount,
        totalTargetCount,
        penetrationPct
      },
      nplHistory: {
        ro1Count: nplOrders,
        ro2Count: Math.max(nplOrders - 1, 0)
      },
      arOverdue: {
        totalAr,
        overdue: overdueAr,
        overduePct,
        buckets: [
          { name: 'Current', nilai: Math.max(totalAr - overdueAr, 0), pct: totalAr > 0 ? Math.round((Math.max(totalAr - overdueAr, 0) / totalAr) * 100) : 0 },
          { name: '1 - 30 hari', nilai: overdueAr, pct: overduePct },
          { name: '31 - 60 hari', nilai: 0, pct: 0 },
          { name: '> 60 hari', nilai: 0, pct: 0 }
        ]
      },
      recommendations
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

router.post('/datacenter/commit', requireSuperAdmin, (req, res) => {
  try {
    const { stagedFilePath, datasetType } = req.body;
    if (!stagedFilePath) return res.status(400).json({ error: 'Berkas staging tidak ditemukan.' });
    const user = req.user || getAuthUser(req);
    const result = commitImport(stagedFilePath, datasetType, user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/datacenter/rollback', requireSuperAdmin, (req, res) => {
  try {
    const { batchId } = req.body;
    if (!batchId) return res.status(400).json({ error: 'Batch ID wajib disertakan.' });
    const user = req.user || getAuthUser(req);
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

// Unduh Template Master File Asli
router.get('/datacenter/templates/:type', (req, res) => {
  try {
    const type = String(req.params.type || '').toUpperCase();
    let wb = XLSX.utils.book_new();
    let filename = `Template_${type}.xlsx`;

    if (type === 'AR' || type === 'PIUTANG') {
      filename = 'Template_Master_Piutang_Aktif.xlsx';
      const headers = [
        ['no', 'Kode Outlet', 'Outlet', 'Tgl Posting', 'Tgl Faktur', 'No Faktur', 'Tgl J. Tempo', 'Total Harga', 'Potongan', 'DPP', 'PPN', 'Faktur Netto', 'Sudah Bayar', 'Saldo Piutang', 'TTF', 'No TTF', 'Tgl TTF', 'Tgl Rencana Bayar', 'Notes Tukar Faktur']
      ];
      const sample = [
        [1, '305000020', 'Tk. Contoh Garut', '26/08/2026', '26/08/2026', 'GZYF2608260852151154024', '15/09/2026', 270270, 0, 270270, 0, 270270, 0, 270270, '', '', '', '', '']
      ];
      const ws = XLSX.utils.aoa_to_sheet([...headers, ...sample]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    } else if (type === 'STOCK' || type === 'STOK') {
      filename = 'Template_Master_Stock_Gudang.xlsx';
      const headers = [
        ['Kode', 'Produk', 'SKU', 'Satuan', 'Saldo Stok Administrasi', 'Bon Produk', 'Allocated Stock', 'Available Stock', 'Stok Fisik', 'Stok dalam Perjalanan']
      ];
      const sample = [
        [40399, '5DAYS CHOCOLATE (40 Pcs)', 40399, 'KTN', 10, 0, 0, 10, 10, 0]
      ];
      const ws = XLSX.utils.aoa_to_sheet([...headers, ...sample]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    } else if (type === 'TARGET' || type === 'TARGETS') {
      filename = 'Template_Target_Kuantiti_Sales_2026.xlsx';
      const rows = [
        ['2026', 'PRINCIPAL', 'Sales Name', 'Brand', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
        ['PRIMA TOP BOGA', 'ANDI AGUNG GUMILAR', '5DAYS', 5.7, 5.3, 4.8, 5.7, 2.2, 2.2, 2.3, 2.1, 2.1, 0, 0, 0],
        ['SUMBER KOPI PRIMA', 'ANDI AGUNG GUMILAR', 'KOPI TUBRUK GADJAH', 20.0, 22.0, 25.0, 20.0, 15.0, 18.0, 19.0, 20.0, 22.0, 0, 0, 0]
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    } else if (type === 'CUSTOMER_LIST' || type === 'CL') {
      filename = 'Template_Data_CL_Customer.xlsx';
      const headers = [
        ['Kode Outlet', 'Nama Outlet', 'Alamat Outlet', 'DSO', 'SUB - DSO', 'SALES TYPE', 'Kode Sales', 'Salesman Name', 'Rayon', 'pasar']
      ];
      const sample = [
        ['30522700515', 'TK. CONTOH GARUT', 'kp pasanggrahan rt 01 rw 01', 'GARUT', 'GARUT', 'CANVAS', 305028, 'Mega Nugraha', 'R01', 'non pasar']
      ];
      const ws = XLSX.utils.aoa_to_sheet([...headers, ...sample]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    } else {
      filename = 'Template_Master_Data_Transaksi.xlsx';
      const headers = [
        ['assm', 'DSO', 'Sub-DSO', 'Year', 'MONTH', 'Week', 'Sales Type', 'Salesman Code (Transaction)', 'Salesman (Transaction)', 'Salesman Role (Transaction)', 'Document Number', 'Tanggal', 'Item Code', 'Item', 'Sales Ctn', 'Sales Netto']
      ];
      const sample = [
        ['JABAR', 'Garut All', 'GARUT', 2026, 'Sep', 'W36', 'Team 1', '107075', 'PROMOTOR_FPM - GRT 01', 'MOTORIST', 'DOC20260901001', '2026-09-01', '40399', '5DAYS CHOCOLATE (40 Pcs)', 2, 85000]
      ];
      const ws = XLSX.utils.aoa_to_sheet([...headers, ...sample]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet2');
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

router.post('/settings/ar-buckets', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const { buckets } = req.body;
    const user = req.user || getAuthUser(req);

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
      afterState: buckets
    });

    res.json({ success: true, buckets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const { settings, calendar, mustHave } = req.body;
    const user = req.user || getAuthUser(req);

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

router.post('/settings/target', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const { salesmanId, groupSku, year, month, targetCartons } = req.body;
    const user = req.user || getAuthUser(req);

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

router.post('/settings/incentive-target', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const { salesmanId, year, month, targetValueRupiah, targetKopiCartons, targetBvgCartons, targetNonKopiBvgCartons } = req.body;
    const user = req.user || getAuthUser(req);

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

router.post('/settings/calendar', requireSuperAdmin, (req, res) => {
  try {
    const { year, month, totalHk, asOfHke, monitoringDate } = req.body;
    const user = req.user || getAuthUser(req);

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

router.post('/settings/npl', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const { campaignId, campaignName, startDate, endDate, targetRo1, targetRo2, skus } = req.body;
    const user = req.user || getAuthUser(req);

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

router.post('/settings/outlet-assignment', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const { outletId, salesmanId, rayonId, note } = req.body;
    const user = req.user || getAuthUser(req);

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
        AND ((h.period_year = ? AND h.period_month = ?) OR (h.period_year IS NULL AND h.transaction_date >= ? AND h.transaction_date < ?))
        AND (p.brand LIKE '%GADJAH%' OR p.item_name LIKE '%GADJAH%' OR p.group_sku LIKE '%GADJAH%')
      `;
      const actRes = db.query(actualSql, [o.customer_code, o.customer_code, o.customer_name, year, month, startDate, endDate])[0];
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

// ==========================================
// 10. TREND & MOVEMENT SALES ANALYTICS
// ==========================================
router.get('/analytics/movement', (req, res) => {
  try {
    const data = getMovementAnalytics(req.query);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/movement/export', (req, res) => {
  try {
    const csv = exportMovementCsv(req.query);
    const filename = `sales_movement_${req.query.dimension || 'salesman'}_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 11. PRICELIST & SIMULATION
// ==========================================
router.get('/pricelist', (req, res) => {
  try {
    const db = getDb();
    const { principal, search } = req.query;

    let where = [];
    let params = [];

    if (principal && principal !== 'ALL') {
      where.push('principal = ?');
      params.push(principal);
    }

    if (search) {
      where.push('(item_code LIKE ? OR item_name LIKE ? OR brand LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rawItems = db.query(`
      SELECT *
      FROM dim_pricelist
      ${whereSql}
      ORDER BY principal ASC, item_name ASC
    `, params);

    const items = rawItems.map(it => {
      let marginPct = null;
      if (it.price_carton_inc_ppn > 0) {
        if (it.het_pcs_inc_ppn > 0 && it.pcs_per_ktn > 0) {
          const retailVal = it.het_pcs_inc_ppn * it.pcs_per_ktn;
          marginPct = Math.round(((retailVal - it.price_carton_inc_ppn) / retailVal) * 1000) / 10;
        } else if (it.het_inner_inc_ppn > 0 && it.isi_per_ktn > 0) {
          const retailVal = it.het_inner_inc_ppn * it.isi_per_ktn;
          marginPct = Math.round(((retailVal - it.price_carton_inc_ppn) / retailVal) * 1000) / 10;
        }
      }
      return {
        ...it,
        retail_margin_pct: marginPct
      };
    });

    const principals = db.query(`
      SELECT principal, count(*) as count
      FROM dim_pricelist
      GROUP BY principal
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      total: items.length,
      principals,
      items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pricelist/export', (req, res) => {
  try {
    const db = getDb();
    const { principal, search } = req.query;

    let where = [];
    let params = [];

    if (principal && principal !== 'ALL') {
      where.push('principal = ?');
      params.push(principal);
    }

    if (search) {
      where.push('(item_code LIKE ? OR item_name LIKE ? OR brand LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const items = db.query(`
      SELECT *
      FROM dim_pricelist
      ${whereSql}
      ORDER BY principal ASC, item_name ASC
    `, params);

    const headers = [
      'Principal', 'Item Code', 'Item Description', 'Brand',
      'Isi per Ktn', 'Satuan', 'Pcs per Ktn', 'Pcs per Inner',
      'PL Karton Inc PPN', 'PL Karton Exc PPN',
      'HET Inner Inc PPN', 'HET Inner Exc PPN',
      'HET Pcs Inc PPN', 'HET Pcs Exc PPN',
      'Retail Margin %'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = [headers.join(',')];
    items.forEach(it => {
      let marginPct = '';
      if (it.price_carton_inc_ppn > 0) {
        if (it.het_pcs_inc_ppn > 0 && it.pcs_per_ktn > 0) {
          const retailVal = it.het_pcs_inc_ppn * it.pcs_per_ktn;
          marginPct = (Math.round(((retailVal - it.price_carton_inc_ppn) / retailVal) * 1000) / 10) + '%';
        } else if (it.het_inner_inc_ppn > 0 && it.isi_per_ktn > 0) {
          const retailVal = it.het_inner_inc_ppn * it.isi_per_ktn;
          marginPct = (Math.round(((retailVal - it.price_carton_inc_ppn) / retailVal) * 1000) / 10) + '%';
        }
      }

      rows.push([
        escapeCsv(it.principal),
        escapeCsv(it.item_code),
        escapeCsv(it.item_name),
        escapeCsv(it.brand),
        escapeCsv(it.isi_per_ktn),
        escapeCsv(it.satuan_inner),
        escapeCsv(it.pcs_per_ktn),
        escapeCsv(it.pcs_per_inner),
        escapeCsv(it.price_carton_inc_ppn),
        escapeCsv(it.price_carton_exc_ppn),
        escapeCsv(it.het_inner_inc_ppn),
        escapeCsv(it.het_inner_exc_ppn),
        escapeCsv(it.het_pcs_inc_ppn),
        escapeCsv(it.het_pcs_exc_ppn),
        escapeCsv(marginPct)
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="PRICELIST_GARUT_${Date.now()}.csv"`);
    res.send(rows.join('\r\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
