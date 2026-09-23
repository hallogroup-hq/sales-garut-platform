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

  const isPastCompletedMonth = year < 2026 || (year === 2026 && month < 9);

  if (!cal) {
    if (isPastCompletedMonth) {
      // Completed month fallback: full month working days
      const daysInMonth = new Date(year, month, 0).getDate();
      const monFri = calculateMonFriWorkingDays(year, month, daysInMonth);
      cal = {
        year,
        month,
        total_hk: monFri.monFriTotalHk,
        as_of_hke: monFri.monFriTotalHk,
        monitoring_date: `${year}-${String(month).padStart(2, '0')}-${daysInMonth}`
      };
    } else {
      // Current active / future month fallback
      cal = { year, month, total_hk: 25, as_of_hke: 8, monitoring_date: `${year}-${String(month).padStart(2, '0')}-08` };
    }
  }

  const totalHk = cal.total_hk;
  const asOfHke = cal.as_of_hke;
  const remainingHk = Math.max(totalHk - asOfHke, 0);
  const timeRatePct = totalHk > 0 ? (asOfHke / totalHk) * 100 : 0;

  // Working days Monday-Friday (Senin s/d Jumat)
  let asOfDay = 21;
  if (cal.monitoring_date) {
    const parts = cal.monitoring_date.split('-');
    if (parts.length === 3) asOfDay = parseInt(parts[2], 10);
  }
  const monFri = calculateMonFriWorkingDays(year, month, asOfDay);

  const isFullMonth = Boolean(isPastCompletedMonth || remainingHk === 0 || monFri.monFriRemainingHk === 0);

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
    timegonePct: monFri.monFriTimegonePct,
    isFullMonth
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
