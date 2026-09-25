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
  await db.run(`INSERT INTO business_calendar (year, month, total_hk, as_of_hke, monitoring_date) VALUES (2026, 9, 25, 20, '2026-09-25') ON CONFLICT DO UPDATE SET total_hk=25, as_of_hke=20, monitoring_date='2026-09-25'`);

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
  db.run("INSERT OR REPLACE INTO business_calendar (year, month, total_hk, as_of_hke, monitoring_date) VALUES (2026, 9, 25, 20, '2026-09-25')");

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
    { id: 'USR_AGHIA', username: 'Aghia Anggala', pass: '12345', name: 'Aghia Anggala', role: 'DSM', spv: null, sales: null, upload: 1, edit_c: 1, edit_t: 1, inc: 1 },
    { id: 'USR_AGHIA_ALIAS', username: 'aghia', pass: '12345', name: 'Aghia Anggala', role: 'DSM', spv: null, sales: null, upload: 1, edit_c: 1, edit_t: 1, inc: 1 },
    { id: 'USR_SPV_GEN', username: 'Supervisor', pass: '12345', name: 'Supervisor Garut', role: 'SPV', spv: 'SPV_NOPAN', sales: null, upload: 0, edit_c: 0, edit_t: 0, inc: 0 },
    { id: 'USR_SPV_ALIAS', username: 'spv', pass: '12345', name: 'Supervisor Garut', role: 'SPV', spv: 'SPV_NOPAN', sales: null, upload: 0, edit_c: 0, edit_t: 0, inc: 0 },
    { id: 'USR_SALES_GEN', username: 'Salesman', pass: '12345', name: 'Salesman / Others', role: 'SALESMAN', spv: null, sales: '107075', upload: 0, edit_c: 0, edit_t: 0, inc: 0 },
    { id: 'USR_SALES_ALIAS', username: 'salesman', pass: '12345', name: 'Salesman / Others', role: 'SALESMAN', spv: null, sales: '107075', upload: 0, edit_c: 0, edit_t: 0, inc: 0 },
    { id: 'USR_ADMIN', username: 'admin', pass: 'admin123', name: 'District Sales Manager (DSM)', role: 'DSM', spv: null, sales: null, upload: 1, edit_c: 1, edit_t: 1, inc: 1 },
    { id: 'USR_NOPAN', username: 'spv_nopan', pass: 'spv123', name: 'Nopan (SPV Team 1)', role: 'SPV', spv: 'SPV_NOPAN', sales: null, upload: 1, edit_c: 1, edit_t: 0, inc: 0 },
    { id: 'USR_TRI', username: 'spv_tri', pass: 'spv123', name: 'Tri H. (SPV Team 2)', role: 'SPV', spv: 'SPV_TRI_H', sales: null, upload: 1, edit_c: 1, edit_t: 0, inc: 0 },
    { id: 'USR_FIKRI', username: 'sales_fikri', pass: 'sales123', name: 'Muhamad Fikri Hambali', role: 'SALESMAN', spv: 'SPV_NOPAN', sales: '107075', upload: 0, edit_c: 0, edit_t: 0, inc: 0 },
    { id: 'USR_ZULFA', username: 'sales_zulfa', pass: 'sales123', name: 'Muhammad Zulfa Akbar', role: 'SALESMAN', spv: 'SPV_TRI_H', sales: '305033', upload: 0, edit_c: 0, edit_t: 0, inc: 0 }
  ];
  for (const u of users) {
    db.run("INSERT OR REPLACE INTO app_user (user_id, username, password_hash, full_name, role, scope_spv_id, scope_salesman_id, can_upload_sales, can_edit_customer, can_edit_target, can_manage_incentive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [u.id, u.username, u.pass, u.name, u.role, u.spv, u.sales, u.upload, u.edit_c, u.edit_t, u.inc]);
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

  // Seed fact_distinct_active_outlet if empty
  try {
    const fdaoCount = db.query('SELECT COUNT(*) AS c FROM fact_distinct_active_outlet')[0];
    if (!fdaoCount || fdaoCount.c === 0) {
      console.log('Seeding fact_distinct_active_outlet...');
      const data2026Salesmen = [
        { id: '305032', name: 'ANDI AGUNG GUMILAR', months: { 1: 244, 2: 249, 3: 182, 4: 208, 5: 285, 6: 280, 7: 266, 8: 258, 9: 157 }, ytd: 407 },
        { id: '305030', name: 'Ibna Faizal Rahman', months: { 1: 267, 2: 259, 3: 212, 4: 274, 5: 281, 6: 277, 7: 292, 8: 234, 9: 164 }, ytd: 404 },
        { id: '305029', name: 'Mega Nugraha', months: { 1: 290, 2: 258, 3: 185, 4: 241, 5: 261, 6: 282, 7: 241, 8: 211, 9: 154 }, ytd: 381 },
        { id: '107075', name: 'Muhamad Fikri Hambali', months: { 1: 329, 2: 308, 3: 190, 4: 249, 5: 318, 6: 306, 7: 330, 8: 262, 9: 190 }, ytd: 440 },
        { id: '305033', name: 'Muhammad Zulfa Akbar', months: { 1: 273, 2: 252, 3: 178, 4: 248, 5: 248, 6: 293, 7: 259, 8: 181, 9: 139 }, ytd: 414 },
        { id: '305028', name: 'Mulyana', months: { 1: 174, 2: 162, 3: 158, 4: 158, 5: 169, 6: 179, 7: 173, 8: 145, 9: 126 }, ytd: 219 },
        { id: '305031', name: 'Risan Setiawan', months: { 1: 249, 2: 239, 3: 179, 4: 273, 5: 284, 6: 278, 7: 320, 8: 241, 9: 149 }, ytd: 412 }
      ];
      const data2026Dso = {
        months: { 1: 1826, 2: 1727, 3: 1284, 4: 1651, 5: 1844, 6: 1895, 7: 1881, 8: 1532, 9: 1079 },
        ytd: 2621
      };
      const data2025Salesmen = [
        { id: '305032', name: 'ANDI AGUNG GUMILAR', months: { 1: 351, 2: 302, 3: 352, 4: 260, 5: 216, 6: 215, 7: 234, 8: 233, 9: 250, 10: 226, 11: 232, 12: 250 }, ytd: 504 },
        { id: '305030', name: 'Ibna Faizal Rahman', months: { 1: 356, 2: 356, 3: 354, 4: 312, 5: 308, 6: 251, 7: 269, 8: 270, 9: 303, 10: 231, 11: 246, 12: 265 }, ytd: 520 },
        { id: '305029', name: 'Mega Nugraha', months: { 1: 344, 2: 332, 3: 318, 4: 253, 5: 265, 6: 241, 7: 238, 8: 255, 9: 289, 10: 204, 11: 217, 12: 255 }, ytd: 498 },
        { id: '107075', name: 'Muhamad Fikri Hambali', months: { 1: 392, 2: 392, 3: 388, 4: 368, 5: 379, 6: 307, 7: 300, 8: 309, 9: 306, 10: 282, 11: 296, 12: 291 }, ytd: 560 },
        { id: '305033', name: 'Muhammad Zulfa Akbar', months: { 1: 330, 2: 352, 3: 297, 4: 259, 5: 248, 6: 231, 7: 231, 8: 232, 9: 257, 10: 98, 11: 192, 12: 275 }, ytd: 512 },
        { id: '305028', name: 'Mulyana', months: { 1: 191, 2: 184, 3: 180, 4: 155, 5: 169, 6: 151, 7: 165, 8: 169, 9: 177, 10: 146, 11: 172, 12: 173 }, ytd: 280 },
        { id: '305031', name: 'Risan Setiawan', months: { 1: 357, 2: 346, 3: 346, 4: 273, 5: 287, 6: 195, 7: 300, 8: 259, 9: 288, 10: 198, 11: 236, 12: 245 }, ytd: 515 }
      ];
      const data2025Dso = {
        months: { 1: 3283, 2: 3048, 3: 2620, 4: 2425, 5: 3404, 6: 2589, 7: 3420, 8: 2276, 9: 2494, 10: 3317, 11: 3438, 12: 2735 },
        ytd: 7802
      };

      const insertStmtSql = `
        INSERT OR IGNORE INTO fact_distinct_active_outlet 
        (id, year, month, period_key, salesman_id, salesman_name, sales_group, group_sku, distinct_active_outlets)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      data2026Salesmen.forEach(sm => {
        for (const [m, oa] of Object.entries(sm.months)) {
          const monthNum = parseInt(m, 10);
          const periodKey = `2026-${String(monthNum).padStart(2, '0')}`;
          db.run(insertStmtSql, [`2026_${periodKey}_${sm.id}_ALL`, 2026, monthNum, periodKey, sm.id, sm.name, 'SAVORIA', 'ALL', oa]);
        }
        db.run(insertStmtSql, [`2026_YTD_${sm.id}_ALL`, 2026, null, '2026-YTD', sm.id, sm.name, 'SAVORIA', 'ALL', sm.ytd]);
      });

      for (const [m, oa] of Object.entries(data2026Dso.months)) {
        const monthNum = parseInt(m, 10);
        const periodKey = `2026-${String(monthNum).padStart(2, '0')}`;
        db.run(insertStmtSql, [`2026_${periodKey}_DSO_ALL`, 2026, monthNum, periodKey, 'DSO', 'DSO GARUT', 'SAVORIA', 'ALL', oa]);
      }
      db.run(insertStmtSql, ['2026_YTD_DSO_ALL', 2026, null, '2026-YTD', 'DSO', 'DSO GARUT', 'SAVORIA', 'ALL', data2026Dso.ytd]);

      data2025Salesmen.forEach(sm => {
        for (const [m, oa] of Object.entries(sm.months)) {
          const monthNum = parseInt(m, 10);
          const periodKey = `2025-${String(monthNum).padStart(2, '0')}`;
          db.run(insertStmtSql, [`2025_${periodKey}_${sm.id}_ALL`, 2025, monthNum, periodKey, sm.id, sm.name, 'SAVORIA', 'ALL', oa]);
        }
        db.run(insertStmtSql, [`2025_YTD_${sm.id}_ALL`, 2025, null, '2025-YTD', sm.id, sm.name, 'SAVORIA', 'ALL', sm.ytd]);
      });

      for (const [m, oa] of Object.entries(data2025Dso.months)) {
        const monthNum = parseInt(m, 10);
        const periodKey = `2025-${String(monthNum).padStart(2, '0')}`;
        db.run(insertStmtSql, [`2025_${periodKey}_DSO_ALL`, 2025, monthNum, periodKey, 'DSO', 'DSO GARUT', 'SAVORIA', 'ALL', oa]);
      }
      db.run(insertStmtSql, ['2025_YTD_DSO_ALL', 2025, null, '2025-YTD', 'DSO', 'DSO GARUT', 'SAVORIA', 'ALL', data2025Dso.ytd]);
    }
  } catch (err) {
    console.warn('Notice seeding fact_distinct_active_outlet:', err.message);
  }

  // Seed dim_pricelist from PRICELIST.xlsx if empty
  try {
    const plCount = db.query('SELECT count(*) as c FROM dim_pricelist')[0]?.c || 0;
    if (plCount === 0) {
      const fs = require('fs');
      const path = require('path');
      const xlsx = require('xlsx');

      let plPath = path.resolve(__dirname, '../../../PRICELIST.xlsx');
      if (!fs.existsSync(plPath)) {
        plPath = path.resolve(__dirname, '../../PRICELIST.xlsx');
      }
      if (!fs.existsSync(plPath) && fs.existsSync('D:\\Downloads\\PRICELIST.xlsx')) {
        plPath = 'D:\\Downloads\\PRICELIST.xlsx';
      }

      if (fs.existsSync(plPath)) {
        const wb = xlsx.readFile(plPath);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        const insertPricelistSql = `
          INSERT OR REPLACE INTO dim_pricelist (
            item_code, item_name, principal, brand, group_sku,
            isi_per_ktn, satuan_inner, pcs_per_ktn, pcs_per_inner,
            price_carton_inc_ppn, price_carton_exc_ppn,
            het_inner_inc_ppn, het_inner_exc_ppn,
            het_pcs_inc_ppn, het_pcs_exc_ppn,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `;

        for (let i = 4; i < data.length; i++) {
          const r = data[i];
          if (!r || !r[1]) continue;

          const principal = String(r[0] || '').trim();
          const itemCode = String(r[1]).trim();
          const itemName = String(r[2] || itemCode).trim();
          const isiPerKtn = parseFloat(r[3]) || null;
          const satInner = r[4] ? String(r[4]).trim() : null;
          const pcsPerKtn = parseFloat(r[5]) || (isiPerKtn && r[7] ? isiPerKtn * parseFloat(r[7]) : null);
          const pcsPerInner = parseFloat(r[7]) || null;

          const priceKtnInc = parseFloat(r[9]) || null;
          const priceKtnExc = parseFloat(r[10]) || null;
          const hetInnerInc = parseFloat(r[11]) || null;
          const hetInnerExc = parseFloat(r[12]) || null;
          const hetPcsInc = parseFloat(r[13]) || null;
          const hetPcsExc = parseFloat(r[14]) || null;

          let brand = 'GENERAL';
          let groupSku = 'GENERAL';
          const n = itemName.toUpperCase();
          if (n.startsWith('CAF')) { brand = 'CAFFINO'; groupSku = 'CAFFINO'; }
          else if (n.startsWith('5DAYS')) { brand = '5DAYS'; groupSku = '5DAYS'; }
          else if (n.includes('ESL') || n.includes('MILKLIFE') || n.includes('UHT')) { brand = 'MILKLIFE'; groupSku = 'MILKLIFE'; }
          else if (n.includes("FOX'S") || n.includes('FOXS') || n.includes("FOX’S")) { brand = "FOX'S"; groupSku = "FOX'S"; }
          else if (n.includes('GADJAH') || n.includes('KTG')) { brand = 'KOPI TUBRUK GADJAH'; groupSku = 'GADJAH'; }
          else if (n.includes('DELI')) { brand = 'DELI'; groupSku = 'DELI'; }
          else if (n.includes('SARIMELATI') || n.includes('SARIWANGI') || principal === 'UNILEVER INDONESIA') { brand = 'SARIWANGI'; groupSku = 'TEA'; }

          db.run(insertPricelistSql, [
            itemCode, itemName, principal, brand, groupSku,
            isiPerKtn, satInner, pcsPerKtn, pcsPerInner,
            priceKtnInc, priceKtnExc,
            hetInnerInc, hetInnerExc,
            hetPcsInc, hetPcsExc
          ]);
        }
      }
    }
  } catch (err) {
    console.warn('Notice seeding dim_pricelist:', err.message);
  }

  console.log('Seeding completed successfully!');
}

if (require.main === module) {
  seedInitialData();
}

module.exports = { seedInitialData };
