const { getDb } = require('../db/connection.js');

function calculateMonFriWorkingDays(year, month, asOfDay = null) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let monFriTotal = 0;
  let monFriElapsed = 0;
  const cutoffDay = asOfDay !== null ? Math.min(asOfDay, daysInMonth) : daysInMonth;

  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay(); // 0 = Sun, 6 = Sat
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      monFriTotal++;
      if (d <= cutoffDay) {
        monFriElapsed++;
      }
    }
  }

  const monFriRemaining = Math.max(monFriTotal - monFriElapsed, 0);
  const monFriTimegonePct = monFriTotal > 0 ? Math.round((monFriElapsed / monFriTotal) * 1000) / 10 : 0;

  return {
    monFriTotalHk: monFriTotal,
    monFriAsOfHke: monFriElapsed,
    monFriRemainingHk: monFriRemaining,
    monFriTimegonePct
  };
}

function getCalendarPace(year, month) {
  const db = getDb();
  let cal = db.query(
    'SELECT * FROM business_calendar WHERE year = ? AND month = ?',
    [year, month]
  )[0];

  if (!cal) {
    // Default fallback: 25 working days, 8 elapsed
    cal = { year, month, total_hk: 25, as_of_hke: 8, monitoring_date: `${year}-${String(month).padStart(2, '0')}-08` };
  }

  const totalHk = cal.total_hk;
  const asOfHke = cal.as_of_hke;
  const remainingHk = Math.max(totalHk - asOfHke, 0);
  const timeRatePct = totalHk > 0 ? (asOfHke / totalHk) * 100 : 0;

  // Working days Monday-Friday (Senin s/d Jumat)
  // For May 2026 as of May 21: 15 elapsed, 6 remaining, 21 total (71.4% timegone)
  let asOfDay = 21;
  if (cal.monitoring_date) {
    const parts = cal.monitoring_date.split('-');
    if (parts.length === 3) asOfDay = parseInt(parts[2], 10);
  }
  const monFri = calculateMonFriWorkingDays(year, month, asOfDay);

  return {
    year,
    month,
    totalHk,
    asOfHke,
    remainingHk,
    timeRatePct: Math.round(timeRatePct * 10) / 10,
    monitoringDate: cal.monitoring_date,
    monFriTotalHk: monFri.monFriTotalHk,
    monFriAsOfHke: monFri.monFriAsOfHke,
    monFriRemainingHk: monFri.monFriRemainingHk,
    timegonePct: monFri.monFriTimegonePct
  };
}

function updateCalendar(year, month, totalHk, asOfHke, monitoringDate = null) {
  const db = getDb();
  db.run(
    `INSERT INTO business_calendar (year, month, total_hk, as_of_hke, monitoring_date, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(year, month) DO UPDATE SET
       total_hk = excluded.total_hk,
       as_of_hke = excluded.as_of_hke,
       monitoring_date = excluded.monitoring_date,
       updated_at = CURRENT_TIMESTAMP`,
    [year, month, totalHk, asOfHke, monitoringDate]
  );
  return getCalendarPace(year, month);
}

module.exports = {
  getCalendarPace,
  updateCalendar,
  calculateMonFriWorkingDays
};
