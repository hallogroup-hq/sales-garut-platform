const { getDb } = require('../db/connection.js');

function calculateIncentive(salesmanId, year, month) {
  const db = getDb();

  // 1. Fetch salesman & SPV info
  const salesman = db.query(
    'SELECT s.*, spv.name as spv_name FROM org_salesman s LEFT JOIN org_spv spv ON s.spv_id = spv.spv_id WHERE s.salesman_id = ?',
    [salesmanId]
  )[0];

  if (!salesman) {
    throw new Error(`Salesman ID ${salesmanId} tidak ditemukan.`);
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  // 2. Fetch sales actuals grouped by incentive group (KOPI, BEVERAGE, NON_KOPI_NON_BVG)
  const salesByGroupSql = `
    SELECT
      p.incentive_group,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.carton_quantity ELSE -l.carton_quantity END), 0) AS actual_cartons,
      COALESCE(SUM(CASE WHEN h.unit_type = 'Sales' THEN l.sales_netto ELSE -l.sales_netto END), 0) AS actual_value
    FROM fact_sales_line l
    JOIN fact_sales_header h ON l.document_number = h.document_number
    JOIN dim_product p ON l.item_code = p.item_code
    WHERE h.current_owner_salesman_id = ? AND h.transaction_date >= ? AND h.transaction_date < ?
    GROUP BY p.incentive_group
  `;
  const salesGroupRows = db.query(salesByGroupSql, [salesmanId, startDate, endDate]);

  const actuals = {
    KOPI: 0,
    BEVERAGE: 0,
    NON_KOPI_NON_BVG: 0,
    VALUE_ALL: 0
  };

  salesGroupRows.forEach(r => {
    const grp = r.incentive_group || 'NON_KOPI_NON_BVG';
    const ctn = Math.max(r.actual_cartons, 0);
    actuals[grp] = (actuals[grp] || 0) + ctn;
    actuals.VALUE_ALL += Math.max(r.actual_value, 0);
  });

  // 3. Fetch quantity targets grouped by incentive category
  const targetRows = db.query(
    `SELECT
       COALESCE(p.incentive_group, 'NON_KOPI_NON_BVG') AS incentive_group,
       COALESCE(SUM(t.target_cartons), 0) AS target_cartons
     FROM fact_quantity_target t
     LEFT JOIN dim_product p ON t.group_sku = p.group_sku
     WHERE t.salesman_id = ? AND t.year = ? AND t.month = ?
     GROUP BY p.incentive_group`,
    [salesmanId, year, month]
  );

  const targets = {
    KOPI: 0,
    BEVERAGE: 0,
    NON_KOPI_NON_BVG: 0
  };

  targetRows.forEach(r => {
    const grp = r.incentive_group || 'NON_KOPI_NON_BVG';
    targets[grp] = (targets[grp] || 0) + r.target_cartons;
  });

  // 4. Fetch Incentive Value Target
  const valTargetRow = db.query(
    'SELECT target_value FROM fact_incentive_value_target WHERE salesman_id = ? AND year = ? AND month = ?',
    [salesmanId, year, month]
  )[0];
  const valueTarget = valTargetRow ? valTargetRow.target_value : 50000000; // Default estimate if not uploaded

  // 5. Fetch OC Must Have SKU actual & target
  const clRes = db.query(
    'SELECT COUNT(*) AS registered_cl FROM dim_outlet WHERE current_salesman_id = ? AND is_active_cl = 1',
    [salesmanId]
  )[0];
  const registeredCl = clRes ? clRes.registered_cl : 0;

  const mustHaveOcRes = db.query(
    `SELECT COUNT(DISTINCT h.outlet_id) AS must_have_oc
     FROM fact_sales_line l
     JOIN fact_sales_header h ON l.document_number = h.document_number
     JOIN dim_product p ON l.item_code = p.item_code
     WHERE h.current_owner_salesman_id = ? AND h.transaction_date >= ? AND h.transaction_date < ?
       AND p.must_have_line != 'NONE'`,
    [salesmanId, startDate, endDate]
  )[0];
  const mustHaveOc = mustHaveOcRes ? mustHaveOcRes.must_have_oc : 0;
  const mustHaveAchvPct = registeredCl > 0 ? (mustHaveOc / registeredCl) * 100 : 0;

  // 6. Calculate Components 1 - 6
  const components = [];

  // Comp 1: Qty Kopi (Mangkok Rp300k, Min 80%, Max 150%)
  const actKopi = actuals.KOPI;
  const tgtKopi = targets.KOPI > 0 ? targets.KOPI : 100;
  const achvKopi = tgtKopi > 0 ? (actKopi / tgtKopi) * 100 : 0;
  let payoutKopi = 0;
  let noteKopi = '';
  if (achvKopi < 80) {
    payoutKopi = 0;
    const gapMin = Math.round(tgtKopi * 0.8 - actKopi);
    noteKopi = `Butuh ${gapMin} KTN Kopi lagi untuk mencapai batas minimal 80%.`;
  } else {
    const cappedAchv = Math.min(achvKopi, 150);
    payoutKopi = Math.round(300000 * (cappedAchv / 100));
    noteKopi = achvKopi >= 150 ? 'Pencapaian maksimal (150%) tercapai!' : 'Memenuhi syarat insentif proporsional.';
  }
  components.push({
    num: 1,
    name: 'Kopi (Qty)',
    mangkok: 300000,
    minPct: 80,
    maxPct: 150,
    target: tgtKopi,
    actual: actKopi,
    achievementPct: Math.round(achvKopi * 10) / 10,
    payout: payoutKopi,
    status: achvKopi >= 80 ? 'QUALIFIED' : 'BELOW_MINIMUM',
    note: noteKopi
  });

  // Comp 2: Qty Beverage (Mangkok Rp200k, Min 40%, Max 150%)
  const actBev = actuals.BEVERAGE;
  const tgtBev = targets.BEVERAGE > 0 ? targets.BEVERAGE : 80;
  const achvBev = tgtBev > 0 ? (actBev / tgtBev) * 100 : 0;
  let payoutBev = 0;
  let noteBev = '';
  if (achvBev < 40) {
    payoutBev = 0;
    const gapMin = Math.round(tgtBev * 0.4 - actBev);
    noteBev = `Butuh ${gapMin} KTN Beverage lagi untuk batas minimal 40%.`;
  } else {
    const cappedAchv = Math.min(achvBev, 150);
    payoutBev = Math.round(200000 * (cappedAchv / 100));
    noteBev = achvBev >= 150 ? 'Pencapaian maksimal (150%) tercapai!' : 'Memenuhi syarat insentif proporsional.';
  }
  components.push({
    num: 2,
    name: 'Beverage (Qty)',
    mangkok: 200000,
    minPct: 40,
    maxPct: 150,
    target: tgtBev,
    actual: actBev,
    achievementPct: Math.round(achvBev * 10) / 10,
    payout: payoutBev,
    status: achvBev >= 40 ? 'QUALIFIED' : 'BELOW_MINIMUM',
    note: noteBev
  });

  // Comp 3: Qty Non Kopi & Non Bvg (Mangkok Rp200k, Min 85%, Max 150%)
  const actNon = actuals.NON_KOPI_NON_BVG;
  const tgtNon = targets.NON_KOPI_NON_BVG > 0 ? targets.NON_KOPI_NON_BVG : 80;
  const achvNon = tgtNon > 0 ? (actNon / tgtNon) * 100 : 0;
  let payoutNon = 0;
  let noteNon = '';
  if (achvNon < 85) {
    payoutNon = 0;
    const gapMin = Math.round(tgtNon * 0.85 - actNon);
    noteNon = `Butuh ${gapMin} KTN Non Kopi & Non Bvg lagi untuk batas minimal 85%.`;
  } else {
    const cappedAchv = Math.min(achvNon, 150);
    payoutNon = Math.round(200000 * (cappedAchv / 100));
    noteNon = achvNon >= 150 ? 'Pencapaian maksimal (150%) tercapai!' : 'Memenuhi syarat insentif proporsional.';
  }
  components.push({
    num: 3,
    name: 'Non Kopi & Non Bvg (Qty)',
    mangkok: 200000,
    minPct: 85,
    maxPct: 150,
    target: tgtNon,
    actual: actNon,
    achievementPct: Math.round(achvNon * 10) / 10,
    payout: payoutNon,
    status: achvNon >= 85 ? 'QUALIFIED' : 'BELOW_MINIMUM',
    note: noteNon
  });

  // Comp 4: Value All (Mangkok Rp600k, Min 80%, Max 150%)
  const actVal = actuals.VALUE_ALL;
  const tgtVal = valueTarget;
  const achvVal = tgtVal > 0 ? (actVal / tgtVal) * 100 : 0;
  let payoutVal = 0;
  let noteVal = '';
  if (achvVal < 80) {
    payoutVal = 0;
    const gapMin = Math.round(tgtVal * 0.8 - actVal);
    noteVal = `Kurang Rp ${gapMin.toLocaleString('id-ID')} untuk mencapai batas 80%.`;
  } else {
    const cappedAchv = Math.min(achvVal, 150);
    payoutVal = Math.round(600000 * (cappedAchv / 100));
    noteVal = achvVal >= 150 ? 'Pencapaian maksimal (150%) tercapai!' : 'Memenuhi syarat insentif proporsional.';
  }
  components.push({
    num: 4,
    name: 'Value - All (Rp)',
    mangkok: 600000,
    minPct: 80,
    maxPct: 150,
    target: tgtVal,
    actual: actVal,
    achievementPct: Math.round(achvVal * 10) / 10,
    payout: payoutVal,
    status: achvVal >= 80 ? 'QUALIFIED' : 'BELOW_MINIMUM',
    note: noteVal
  });

  // Comp 5: OC Must Have SKU (Mangkok Rp750k, Min 25%, Binary Full Payout)
  const actMh = mustHaveOc;
  const tgtMh = Math.round(registeredCl * 0.25);
  const achvMh = registeredCl > 0 ? (actMh / registeredCl) * 100 : 0;
  let payoutMh = 0;
  let noteMh = '';
  if (achvMh >= 25) {
    payoutMh = 750000;
    noteMh = `Ambang batas 25% tercapai (${Math.round(achvMh * 10) / 10}%). Full payout Rp 750.000 cair!`;
  } else {
    payoutMh = 0;
    const gapMh = Math.max(tgtMh - actMh, 0);
    noteMh = `Penetrasi ${Math.round(achvMh * 10) / 10}%. Butuh ${gapMh} outlet Must Have lagi agar insentif Rp 750.000 cair penuh.`;
  }
  components.push({
    num: 5,
    name: 'OC Must Have SKU',
    mangkok: 750000,
    minPct: 25,
    maxPct: 25,
    target: tgtMh,
    actual: actMh,
    achievementPct: Math.round(achvMh * 10) / 10,
    payout: payoutMh,
    status: achvMh >= 25 ? 'QUALIFIED' : 'BELOW_MINIMUM',
    note: noteMh
  });

  // Comp 6: AR Performance (Mangkok Rp200k, Min 70%, Max 100% - TBD)
  components.push({
    num: 6,
    name: 'AR Performance (%)',
    mangkok: 200000,
    minPct: 70,
    maxPct: 100,
    target: 0,
    actual: 0,
    achievementPct: 0,
    payout: 0,
    status: 'TBD',
    note: 'Formula performa AR belum dikonfigurasi manajemen (TBD).'
  });

  const totalEstimatedPayout = components.reduce((sum, c) => sum + c.payout, 0);
  const totalBaseMangkok = components.reduce((sum, c) => sum + c.mangkok, 0); // 2,250,000

  return {
    salesmanId,
    salesmanName: salesman.name,
    spvName: salesman.spv_name,
    year,
    month,
    totalEstimatedPayout,
    totalBaseMangkok,
    payoutPercentage: Math.round((totalEstimatedPayout / totalBaseMangkok) * 1000) / 10,
    components
  };
}

module.exports = {
  calculateIncentive
};
