const { getDb, initSchema } = require('./connection.js');

/**
 * Rewrites SQLite-specific syntax to PostgreSQL-compatible syntax.
 * - INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
 * - INSERT OR REPLACE → INSERT ... ON CONFLICT DO UPDATE SET (excluded cols)
 */
function pgSql(sql) {
  // INSERT OR IGNORE → ON CONFLICT DO NOTHING
  sql = sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/gi, (_, tbl, cols) => {
    return `INSERT INTO ${tbl} (${cols}) VALUES`;
  });
  // INSERT OR REPLACE → ON CONFLICT ON CONSTRAINT ... DO UPDATE (simplified: use DO NOTHING; seed is idempotent)
  sql = sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/gi, (_, tbl, cols) => {
    return `INSERT INTO ${tbl} (${cols}) VALUES`;
  });
  return sql;
}

function toIgnore(sql) {
  return sql + ' ON CONFLICT DO NOTHING';
}

async function seedInitialDataAsync(db) {
  console.log('Seeding initial organizational hierarchy...');
  // 1. District & Sub-DSO
  await db.run(toIgnore(pgSql("INSERT OR IGNORE INTO org_district (district_id, name) VALUES ('DIST_GARUT', 'Garut All')")));
  await db.run(toIgnore(pgSql("INSERT OR IGNORE INTO org_sub_dso (sub_dso_id, district_id, name) VALUES ('SUBDSO_GARUT', 'DIST_GARUT', 'GARUT')")));

  // 2. SPV
  await db.run(toIgnore(pgSql("INSERT OR IGNORE INTO org_spv (spv_id, sub_dso_id, name, code) VALUES ('SPV_NOPAN', 'SUBDSO_GARUT', 'Nopan', 'NOPAN')")));
  await db.run(toIgnore(pgSql("INSERT OR IGNORE INTO org_spv (spv_id, sub_dso_id, name, code) VALUES ('SPV_TRI_H', 'SUBDSO_GARUT', 'Tri H.', 'TRI H.')")));

  // 3. Core Salesmen
  const salesmen = [
    { id: '107075', spv: 'SPV_NOPAN', name: 'Muhamad Fikri Hambali', code: '107075', type: 'GT', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15 },
    { id: '305028', spv: 'SPV_NOPAN', name: 'Mulyana', code: '305028', type: 'CB', group: 'SAVORIA', target_cl: 200, cycle: '2 Minggu', has_rayon: 1, max_r: 10 },
    { id: '305030', spv: 'SPV_NOPAN', name: 'Ibna Faizal Rahman', code: '305030', type: 'Kanvas', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15 },
    { id: '305031', spv: 'SPV_NOPAN', name: 'Risan Setiawan', code: '305031', type: 'Kanvas', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15 },
    { id: '305029', spv: 'SPV_TRI_H', name: 'Mega Nugraha', code: '305029', type: 'Kanvas', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15 },
    { id: '305032', spv: 'SPV_TRI_H', name: 'ANDI AGUNG GUMILAR', code: '305032', type: 'Kanvas', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15 },
    { id: '305033', spv: 'SPV_TRI_H', name: 'Muhammad Zulfa Akbar', code: '305033', type: 'Kanvas', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15, role: 'SALESMAN' },
    { id: 'SMC_GARUT', spv: null, name: 'SMC Garut Team', code: 'SMC01', type: 'OTHER', group: 'SMC', target_cl: 0, cycle: 'N/A', has_rayon: 0, max_r: 0, role: 'SALESMAN' },
    { id: 'SAVORIA_OTH', spv: null, name: 'Savoria (Others)', code: 'OTH01', type: 'OTHER', group: 'SAVORIA_OTHERS', target_cl: 0, cycle: 'N/A', has_rayon: 0, max_r: 0, role: 'SALESMAN' },
    { id: 'DSM_GARUT', spv: null, name: 'DSM GARUT', code: 'DSM', type: 'MANAGEMENT', group: 'SAVORIA', target_cl: 0, cycle: 'N/A', has_rayon: 0, max_r: 0, role: 'DSM' }
  ];

  for (const s of salesmen) {
    await db.run(
      `INSERT INTO org_salesman (
        salesman_id, spv_id, name, code, role, salesman_type, sales_division, sales_group, target_cl, visit_cycle, has_rayon, max_rayon, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, 'Canvas', ?, ?, ?, ?, ?, 1) ON CONFLICT (salesman_id) DO UPDATE SET
        name=EXCLUDED.name, salesman_type=EXCLUDED.salesman_type, sales_group=EXCLUDED.sales_group,
        target_cl=EXCLUDED.target_cl, has_rayon=EXCLUDED.has_rayon, max_rayon=EXCLUDED.max_rayon`,
      [s.id, s.spv, s.name, s.code, s.role || 'SALESMAN', s.type || 'Kanvas', s.group || 'SAVORIA', s.target_cl || 375, s.cycle || '3 Minggu', s.has_rayon !== undefined ? s.has_rayon : 1, s.max_r || 15]
    );
  }

  // 4. Rayons R01 - R15
  console.log('Seeding Rayons R01-R15...');
  for (let i = 1; i <= 15; i++) {
    const code = 'R' + String(i).padStart(2, '0');
    await db.run(
      `INSERT INTO dim_rayon (rayon_id, code, name) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
      [code, code, 'Rayon ' + code]
    );
  }

  // 5. Must Have Program Config
  console.log('Seeding Must Have targets...');
  const mustHaves = [
    { code: 'KTG', name: 'Kopi Tubruk Gadjah', pct: 45.0 },
    { code: 'DELI', name: 'Deli Stick Wafer', pct: 45.0 },
    { code: 'RTD', name: 'Ready To Drink (Gadjah RTD)', pct: 30.0 },
    { code: 'FOX', name: 'Fox Mints / Confectionery', pct: 35.0 },
    { code: 'UHT', name: 'Milklife UHT Kids', pct: 40.0 }
  ];
  for (const m of mustHaves) {
    await db.run(
      `INSERT INTO must_have_program_config (line_code, line_name, target_penetration_pct, is_active) VALUES (?, ?, ?, 1) ON CONFLICT DO NOTHING`,
      [m.code, m.name, m.pct]
    );
  }

  // 6. NPL Campaigns
  console.log('Seeding NPL campaigns...');
  await db.run(
    `INSERT INTO npl_campaign (campaign_id, campaign_name, start_date, target_m1_penetration_pct, target_m3_penetration_pct, is_active) VALUES (?, ?, '2026-01-01', 70.0, 85.0, 1) ON CONFLICT DO NOTHING`,
    ['DELI_NPL', 'Deli Wafer Roll NPL Campaign']
  );
  await db.run(
    `INSERT INTO npl_campaign (campaign_id, campaign_name, start_date, target_m1_penetration_pct, target_m3_penetration_pct, is_active) VALUES (?, ?, '2026-03-01', 70.0, 85.0, 1) ON CONFLICT DO NOTHING`,
    ['GADJAH_RTD', 'Kopi Tubruk Gadjah RTD Launch']
  );

  // 7. Incentive Rules
  console.log('Seeding Incentive Rules...');
  const rules = [
    { id: 'COMP_1_KOPI', num: 1, name: 'Realisasi vs Target Qty - Kopi', mangkok: 300000, min: 80, max: 150, type: 'PROPORTIONAL_CAPPED' },
    { id: 'COMP_2_BEVERAGE', num: 2, name: 'Realisasi vs Target Qty - Beverage', mangkok: 200000, min: 40, max: 150, type: 'PROPORTIONAL_CAPPED' },
    { id: 'COMP_3_NON_KOPI_BVG', num: 3, name: 'Realisasi vs Target Qty - Non Kopi & Non Bvg', mangkok: 200000, min: 85, max: 150, type: 'PROPORTIONAL_CAPPED' },
    { id: 'COMP_4_VALUE_ALL', num: 4, name: 'Realisasi vs Target Value - All', mangkok: 600000, min: 80, max: 150, type: 'PROPORTIONAL_CAPPED' },
    { id: 'COMP_5_MUST_HAVE', num: 5, name: 'OC Must Have SKU', mangkok: 750000, min: 25, max: 25, type: 'BINARY_FULL' },
    { id: 'COMP_6_AR_PERFORMANCE', num: 6, name: 'AR Performance', mangkok: 200000, min: 70, max: 100, type: 'FORMULA_TBD' }
  ];
  for (const r of rules) {
    await db.run(
      `INSERT INTO incentive_rule (rule_id, component_number, component_name, mangkok_amount, min_achievement_pct, max_achievement_pct, payout_rule_type, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT DO NOTHING`,
      [r.id, r.num, r.name, r.mangkok, r.min, r.max, r.type]
    );
  }

  // 8. Business Calendar
  console.log('Seeding Business Calendar...');
  await db.run(`INSERT INTO business_calendar (year, month, total_hk, as_of_hke, monitoring_date) VALUES (2026, 5, 25, 8, '2026-05-30') ON CONFLICT DO NOTHING`);
  await db.run(`INSERT INTO business_calendar (year, month, total_hk, as_of_hke, monitoring_date) VALUES (2026, 9, 25, 8, '2026-09-08') ON CONFLICT DO NOTHING`);

  // 9. Business Settings
  console.log('Seeding Business Settings...');
  const settings = [
    { key: 'dormant_days_threshold', val: '60', desc: 'Ambang batas hari tanpa order untuk status Dormant (default 60 hari)' },
    { key: 'stock_cover_low_days', val: '3', desc: 'Batas hari cover stok kritis / rendah' },
    { key: 'stock_cover_high_days', val: '30', desc: 'Batas hari cover overstock' },
    { key: 'ar_aging_buckets', val: JSON.stringify(['Current', '1-14', '15-30', '>30']), desc: 'Pengelompokan umur piutang (Aging Buckets)' }
  ];
  for (const set of settings) {
    await db.run(
      `INSERT INTO business_settings (key, value, description) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
      [set.key, set.val, set.desc]
    );
  }

  // 10. App Users
  console.log('Seeding App Users...');
  const users = [
    { id: 'USR_ADMIN', username: 'admin', pass: 'admin123', name: 'District Sales Manager (DSM)', role: 'DSM', spv: null, sales: null, upload: 1, edit_c: 1, edit_t: 1, inc: 1 },
    { id: 'USR_NOPAN', username: 'spv_nopan', pass: 'spv123', name: 'Nopan (SPV Team 1)', role: 'SPV', spv: 'SPV_NOPAN', sales: null, upload: 1, edit_c: 1, edit_t: 0, inc: 0 },
    { id: 'USR_TRI', username: 'spv_tri', pass: 'spv123', name: 'Tri H. (SPV Team 2)', role: 'SPV', spv: 'SPV_TRI_H', sales: null, upload: 1, edit_c: 1, edit_t: 0, inc: 0 },
    { id: 'USR_FIKRI', username: 'sales_fikri', pass: 'sales123', name: 'Muhamad Fikri Hambali', role: 'SALESMAN', spv: 'SPV_NOPAN', sales: '107075', upload: 0, edit_c: 0, edit_t: 0, inc: 0 },
    { id: 'USR_ZULFA', username: 'sales_zulfa', pass: 'sales123', name: 'Muhammad Zulfa Akbar', role: 'SALESMAN', spv: 'SPV_TRI_H', sales: '305033', upload: 0, edit_c: 0, edit_t: 0, inc: 0 }
  ];
  for (const u of users) {
    await db.run(
      `INSERT INTO app_user (user_id, username, password_hash, full_name, role, scope_spv_id, scope_salesman_id, can_upload_sales, can_edit_customer, can_edit_target, can_manage_incentive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      [u.id, u.username, u.pass, u.name, u.role, u.spv, u.sales, u.upload, u.edit_c, u.edit_t, u.inc]
    );
  }

  // 11. Store Loyalty Programs
  console.log('Seeding Store Loyalty Programs...');
  await db.run(
    `INSERT INTO store_loyalty_program (program_id, program_name, program_type, product_focus, start_date, end_date, is_active)
     VALUES ('PROG_KTG_LOYALTY', 'Loyalty Kopi Tubruk Gadjah', 'LOYALTY', 'KOPI TUBRUK GADJAH', '2026-05-01', '2026-05-31', 1) ON CONFLICT DO NOTHING`
  );

  const sampleStores = [
    { code: '305000534', name: 'Anugrah ( Wanaraja )', tgt: 9.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 19043 },
    { code: '305000086', name: 'Engkun', tgt: 12.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 25391 },
    { code: '305000101', name: 'Ibu, Tk', tgt: 6.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 12696 },
    { code: 'G3050BF250418152156868', name: 'IMATR', tgt: 10.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 21159 },
    { code: '305000465', name: 'SAPUTRA DRP', tgt: 18.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 38087 },
    { code: '30539200118', name: 'SERBA JAYA', tgt: 7.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 14812 },
    { code: '30538500366', name: 'TK AWO', tgt: 20.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 42319 },
    { code: '30522700375', name: 'TK PRIMA JAYA', tgt: 9.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 19043 },
    { code: '30522700510', name: 'TK. KHARISMA  DRP', tgt: 6.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 12696 },
    { code: '30522700082', name: 'TK.EKA BERKAH DRP', tgt: 37.0, strata: '21-50 ktn', rewardPct: 2.50, estReward: 156579 },
    { code: '30538500089', name: 'Vini', tgt: 23.0, strata: '21-50 ktn', rewardPct: 2.50, estReward: 97333 },
    { code: '30522700078', name: 'TK. BERKAH JAYA', tgt: 15.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 31739 },
    { code: '30522700105', name: 'TK. HIDAYAH', tgt: 8.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 16928 },
    { code: '30522700142', name: 'TK. REZEKI', tgt: 10.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 21159 },
    { code: '30522700201', name: 'TK. MAKMUR', tgt: 25.0, strata: '21-50 ktn', rewardPct: 2.50, estReward: 105796 },
    { code: '30522700255', name: 'TK. BINTANG', tgt: 30.0, strata: '21-50 ktn', rewardPct: 2.50, estReward: 126955 },
    { code: '30522700311', name: 'TK. SUKASENANG', tgt: 12.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 25391 },
    { code: '30522700420', name: 'TK. SINAR GARUT', tgt: 40.0, strata: '21-50 ktn', rewardPct: 2.50, estReward: 169274 },
    { code: '30522700488', name: 'TK. CAHAYA ABADI', tgt: 14.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 29623 },
    { code: '30522700550', name: 'TK. SURYA GEMILANG', tgt: 55.0, strata: '> 50 ktn', rewardPct: 3.00, estReward: 279300 }
  ];

  for (const s of sampleStores) {
    await db.run(
      `INSERT INTO store_loyalty_program_outlet (
        row_id, program_id, customer_code, customer_name, target_cartons, strata, reward_strata_pct, est_reward_amount
      ) VALUES (?, 'PROG_KTG_LOYALTY', ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      ['ROW_' + s.code, s.code, s.name, s.tgt, s.strata, s.rewardPct, s.estReward]
    );
  }

  console.log('Seeding completed successfully!');
}

function seedInitialData() {
  const db = getDb();

  if (db.type === 'postgres') {
    // Postgres: async path — initSchema returns a promise
    return initSchema().then(() => seedInitialDataAsync(db)).catch(err => {
      console.error('Postgres seed error:', err);
    });
  }

  // SQLite: sync path — use original INSERT OR IGNORE / INSERT OR REPLACE directly
  initSchema();
  console.log('Seeding initial organizational hierarchy...');
  db.run("INSERT OR IGNORE INTO org_district (district_id, name) VALUES ('DIST_GARUT', 'Garut All')");
  db.run("INSERT OR IGNORE INTO org_sub_dso (sub_dso_id, district_id, name) VALUES ('SUBDSO_GARUT', 'DIST_GARUT', 'GARUT')");
  db.run("INSERT OR IGNORE INTO org_spv (spv_id, sub_dso_id, name, code) VALUES ('SPV_NOPAN', 'SUBDSO_GARUT', 'Nopan', 'NOPAN')");
  db.run("INSERT OR IGNORE INTO org_spv (spv_id, sub_dso_id, name, code) VALUES ('SPV_TRI_H', 'SUBDSO_GARUT', 'Tri H.', 'TRI H.')");

  const salesmen = [
    { id: '107075', spv: 'SPV_NOPAN', name: 'Muhamad Fikri Hambali', code: '107075', type: 'GT', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15 },
    { id: '305028', spv: 'SPV_NOPAN', name: 'Mulyana', code: '305028', type: 'CB', group: 'SAVORIA', target_cl: 200, cycle: '2 Minggu', has_rayon: 1, max_r: 10 },
    { id: '305030', spv: 'SPV_NOPAN', name: 'Ibna Faizal Rahman', code: '305030', type: 'Kanvas', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15 },
    { id: '305031', spv: 'SPV_NOPAN', name: 'Risan Setiawan', code: '305031', type: 'Kanvas', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15 },
    { id: '305029', spv: 'SPV_TRI_H', name: 'Mega Nugraha', code: '305029', type: 'Kanvas', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15 },
    { id: '305032', spv: 'SPV_TRI_H', name: 'ANDI AGUNG GUMILAR', code: '305032', type: 'Kanvas', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15 },
    { id: '305033', spv: 'SPV_TRI_H', name: 'Muhammad Zulfa Akbar', code: '305033', type: 'Kanvas', group: 'SAVORIA', target_cl: 375, cycle: '3 Minggu', has_rayon: 1, max_r: 15 },
    { id: 'SMC_GARUT', spv: null, name: 'SMC Garut Team', code: 'SMC01', type: 'OTHER', group: 'SMC', target_cl: 0, cycle: 'N/A', has_rayon: 0, max_r: 0, role: 'SALESMAN' },
    { id: 'SAVORIA_OTH', spv: null, name: 'Savoria (Others)', code: 'OTH01', type: 'OTHER', group: 'SAVORIA_OTHERS', target_cl: 0, cycle: 'N/A', has_rayon: 0, max_r: 0, role: 'SALESMAN' },
    { id: 'DSM_GARUT', spv: null, name: 'DSM GARUT', code: 'DSM', type: 'MANAGEMENT', group: 'SAVORIA', target_cl: 0, cycle: 'N/A', has_rayon: 0, max_r: 0, role: 'DSM' }
  ];
  for (const s of salesmen) {
    db.run(
      `INSERT OR REPLACE INTO org_salesman (
        salesman_id, spv_id, name, code, role, salesman_type, sales_division, sales_group, target_cl, visit_cycle, has_rayon, max_rayon, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, 'Canvas', ?, ?, ?, ?, ?, 1)`,
      [s.id, s.spv, s.name, s.code, s.role || 'SALESMAN', s.type || 'Kanvas', s.group || 'SAVORIA', s.target_cl || 375, s.cycle || '3 Minggu', s.has_rayon !== undefined ? s.has_rayon : 1, s.max_r || 15]
    );
  }

  for (let i = 1; i <= 15; i++) {
    const code = 'R' + String(i).padStart(2, '0');
    db.run("INSERT OR IGNORE INTO dim_rayon (rayon_id, code, name) VALUES (?, ?, ?)", [code, code, 'Rayon ' + code]);
  }

  const mustHaves = [
    { code: 'KTG', name: 'Kopi Tubruk Gadjah', pct: 45.0 },
    { code: 'DELI', name: 'Deli Stick Wafer', pct: 45.0 },
    { code: 'RTD', name: 'Ready To Drink (Gadjah RTD)', pct: 30.0 },
    { code: 'FOX', name: 'Fox Mints / Confectionery', pct: 35.0 },
    { code: 'UHT', name: 'Milklife UHT Kids', pct: 40.0 }
  ];
  for (const m of mustHaves) {
    db.run("INSERT OR IGNORE INTO must_have_program_config (line_code, line_name, target_penetration_pct, is_active) VALUES (?, ?, ?, 1)", [m.code, m.name, m.pct]);
  }

  db.run("INSERT OR IGNORE INTO npl_campaign (campaign_id, campaign_name, start_date, target_m1_penetration_pct, target_m3_penetration_pct, is_active) VALUES (?, ?, '2026-01-01', 70.0, 85.0, 1)", ['DELI_NPL', 'Deli Wafer Roll NPL Campaign']);
  db.run("INSERT OR IGNORE INTO npl_campaign (campaign_id, campaign_name, start_date, target_m1_penetration_pct, target_m3_penetration_pct, is_active) VALUES (?, ?, '2026-03-01', 70.0, 85.0, 1)", ['GADJAH_RTD', 'Kopi Tubruk Gadjah RTD Launch']);

  const rules = [
    { id: 'COMP_1_KOPI', num: 1, name: 'Realisasi vs Target Qty - Kopi', mangkok: 300000, min: 80, max: 150, type: 'PROPORTIONAL_CAPPED' },
    { id: 'COMP_2_BEVERAGE', num: 2, name: 'Realisasi vs Target Qty - Beverage', mangkok: 200000, min: 40, max: 150, type: 'PROPORTIONAL_CAPPED' },
    { id: 'COMP_3_NON_KOPI_BVG', num: 3, name: 'Realisasi vs Target Qty - Non Kopi & Non Bvg', mangkok: 200000, min: 85, max: 150, type: 'PROPORTIONAL_CAPPED' },
    { id: 'COMP_4_VALUE_ALL', num: 4, name: 'Realisasi vs Target Value - All', mangkok: 600000, min: 80, max: 150, type: 'PROPORTIONAL_CAPPED' },
    { id: 'COMP_5_MUST_HAVE', num: 5, name: 'OC Must Have SKU', mangkok: 750000, min: 25, max: 25, type: 'BINARY_FULL' },
    { id: 'COMP_6_AR_PERFORMANCE', num: 6, name: 'AR Performance', mangkok: 200000, min: 70, max: 100, type: 'FORMULA_TBD' }
  ];
  for (const r of rules) {
    db.run("INSERT OR IGNORE INTO incentive_rule (rule_id, component_number, component_name, mangkok_amount, min_achievement_pct, max_achievement_pct, payout_rule_type, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)", [r.id, r.num, r.name, r.mangkok, r.min, r.max, r.type]);
  }

  db.run("INSERT OR IGNORE INTO business_calendar (year, month, total_hk, as_of_hke, monitoring_date) VALUES (2026, 5, 25, 8, '2026-05-30')");
  db.run("INSERT OR IGNORE INTO business_calendar (year, month, total_hk, as_of_hke, monitoring_date) VALUES (2026, 9, 25, 8, '2026-09-08')");

  const settings = [
    { key: 'dormant_days_threshold', val: '60', desc: 'Ambang batas hari tanpa order untuk status Dormant (default 60 hari)' },
    { key: 'stock_cover_low_days', val: '3', desc: 'Batas hari cover stok kritis / rendah' },
    { key: 'stock_cover_high_days', val: '30', desc: 'Batas hari cover overstock' },
    { key: 'ar_aging_buckets', val: JSON.stringify(['Current', '1-14', '15-30', '>30']), desc: 'Pengelompokan umur piutang (Aging Buckets)' }
  ];
  for (const set of settings) {
    db.run("INSERT OR IGNORE INTO business_settings (key, value, description) VALUES (?, ?, ?)", [set.key, set.val, set.desc]);
  }

  const users = [
    { id: 'USR_ADMIN', username: 'admin', pass: 'admin123', name: 'District Sales Manager (DSM)', role: 'DSM', spv: null, sales: null, upload: 1, edit_c: 1, edit_t: 1, inc: 1 },
    { id: 'USR_NOPAN', username: 'spv_nopan', pass: 'spv123', name: 'Nopan (SPV Team 1)', role: 'SPV', spv: 'SPV_NOPAN', sales: null, upload: 1, edit_c: 1, edit_t: 0, inc: 0 },
    { id: 'USR_TRI', username: 'spv_tri', pass: 'spv123', name: 'Tri H. (SPV Team 2)', role: 'SPV', spv: 'SPV_TRI_H', sales: null, upload: 1, edit_c: 1, edit_t: 0, inc: 0 },
    { id: 'USR_FIKRI', username: 'sales_fikri', pass: 'sales123', name: 'Muhamad Fikri Hambali', role: 'SALESMAN', spv: 'SPV_NOPAN', sales: '107075', upload: 0, edit_c: 0, edit_t: 0, inc: 0 },
    { id: 'USR_ZULFA', username: 'sales_zulfa', pass: 'sales123', name: 'Muhammad Zulfa Akbar', role: 'SALESMAN', spv: 'SPV_TRI_H', sales: '305033', upload: 0, edit_c: 0, edit_t: 0, inc: 0 }
  ];
  for (const u of users) {
    db.run("INSERT OR IGNORE INTO app_user (user_id, username, password_hash, full_name, role, scope_spv_id, scope_salesman_id, can_upload_sales, can_edit_customer, can_edit_target, can_manage_incentive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [u.id, u.username, u.pass, u.name, u.role, u.spv, u.sales, u.upload, u.edit_c, u.edit_t, u.inc]);
  }

  db.run(`INSERT OR IGNORE INTO store_loyalty_program (program_id, program_name, program_type, product_focus, start_date, end_date, is_active)
     VALUES ('PROG_KTG_LOYALTY', 'Loyalty Kopi Tubruk Gadjah', 'LOYALTY', 'KOPI TUBRUK GADJAH', '2026-05-01', '2026-05-31', 1)`);

  const sampleStores = [
    { code: '305000534', name: 'Anugrah ( Wanaraja )', tgt: 9.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 19043 },
    { code: '305000086', name: 'Engkun', tgt: 12.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 25391 },
    { code: '305000101', name: 'Ibu, Tk', tgt: 6.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 12696 },
    { code: 'G3050BF250418152156868', name: 'IMATR', tgt: 10.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 21159 },
    { code: '305000465', name: 'SAPUTRA DRP', tgt: 18.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 38087 },
    { code: '30539200118', name: 'SERBA JAYA', tgt: 7.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 14812 },
    { code: '30538500366', name: 'TK AWO', tgt: 20.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 42319 },
    { code: '30522700375', name: 'TK PRIMA JAYA', tgt: 9.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 19043 },
    { code: '30522700510', name: 'TK. KHARISMA  DRP', tgt: 6.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 12696 },
    { code: '30522700082', name: 'TK.EKA BERKAH DRP', tgt: 37.0, strata: '21-50 ktn', rewardPct: 2.50, estReward: 156579 },
    { code: '30538500089', name: 'Vini', tgt: 23.0, strata: '21-50 ktn', rewardPct: 2.50, estReward: 97333 },
    { code: '30522700078', name: 'TK. BERKAH JAYA', tgt: 15.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 31739 },
    { code: '30522700105', name: 'TK. HIDAYAH', tgt: 8.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 16928 },
    { code: '30522700142', name: 'TK. REZEKI', tgt: 10.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 21159 },
    { code: '30522700201', name: 'TK. MAKMUR', tgt: 25.0, strata: '21-50 ktn', rewardPct: 2.50, estReward: 105796 },
    { code: '30522700255', name: 'TK. BINTANG', tgt: 30.0, strata: '21-50 ktn', rewardPct: 2.50, estReward: 126955 },
    { code: '30522700311', name: 'TK. SUKASENANG', tgt: 12.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 25391 },
    { code: '30522700420', name: 'TK. SINAR GARUT', tgt: 40.0, strata: '21-50 ktn', rewardPct: 2.50, estReward: 169274 },
    { code: '30522700488', name: 'TK. CAHAYA ABADI', tgt: 14.0, strata: '6-20 ktn', rewardPct: 1.25, estReward: 29623 },
    { code: '30522700550', name: 'TK. SURYA GEMILANG', tgt: 55.0, strata: '> 50 ktn', rewardPct: 3.00, estReward: 279300 }
  ];
  for (const s of sampleStores) {
    db.run(
      `INSERT OR IGNORE INTO store_loyalty_program_outlet (
        row_id, program_id, customer_code, customer_name, target_cartons, strata, reward_strata_pct, est_reward_amount
      ) VALUES (?, 'PROG_KTG_LOYALTY', ?, ?, ?, ?, ?, ?)`,
      ['ROW_' + s.code, s.code, s.name, s.tgt, s.strata, s.rewardPct, s.estReward]
    );
  }

  console.log('Seeding completed successfully!');
}

if (require.main === module) {
  seedInitialData();
}

module.exports = { seedInitialData };
