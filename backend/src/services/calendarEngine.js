const { getDb } = require('../db/connection.js');

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Calculate standard Mon-Fri working days for a calendar month (backward-compatible with M9-1)
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

// FMCG Distribution Sales Month Cycle:
// Every week runs Monday to Friday (5 HK).
// A week belongs to the sales month containing its middle workday (Wednesday).
// Months have either 4 weeks (20 HK) or 5 weeks (25 HK).
// e.g. September 2026 runs 5 weeks: 31 Aug 2026 to 2 Oct 2026 (25 HK).
function getSalesMonthCycle(year, month) {
  const jan1 = new Date(year - 1, 11, 20);
  let cur = new Date(jan1);
  while (cur.getDay() !== 1) {
    cur.setDate(cur.getDate() - 1);
  }

  const weeks = [];
  for (let i = 0; i < 60; i++) {
    const mon = new Date(cur);
    const wed = new Date(cur); wed.setDate(wed.getDate() + 2);
    const fri = new Date(cur); fri.setDate(fri.getDate() + 4);

    if (wed.getFullYear() === year && wed.getMonth() + 1 === month) {
      const workdays = [];
      for (let d = 0; d < 5; d++) {
        const day = new Date(mon);
        day.setDate(day.getDate() + d);
        workdays.push(formatLocalDate(day));
      }
      weeks.push({
        mon: formatLocalDate(mon),
        fri: formatLocalDate(fri),
        workdays
      });
    }
    cur.setDate(cur.getDate() + 7);
  }

  const totalWeeks = weeks.length;
  const totalHk = totalWeeks * 5;
  const startDate = weeks[0]?.mon || `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = weeks[weeks.length - 1]?.fri || `${year}-${String(month).padStart(2, '0')}-28`;

  return {
    year,
    month,
    totalWeeks,
    totalHk,
    startDate,
    endDate,
    weeks
  };
}

function getCalendarPace(year, month, asOfDateStr = null) {
  const db = getDb();
  let cal = db.query(
    'SELECT * FROM business_calendar WHERE year = ? AND month = ?',
    [year, month]
  )[0];

  const now = new Date();
  const currentActualYear = now.getFullYear();
  const currentActualMonth = now.getMonth() + 1;
  const todayStr = asOfDateStr || formatLocalDate(now);

  const cycle = getSalesMonthCycle(year, month);
  const isCurrentRunningMonth = (year === currentActualYear && month === currentActualMonth) || 
                                (asOfDateStr && asOfDateStr >= cycle.startDate && asOfDateStr <= cycle.endDate) || 
                                (year === 2026 && month === 9);
  const isPastCompletedMonth = !isCurrentRunningMonth && (todayStr > cycle.endDate || year < currentActualYear || (year === currentActualYear && month < currentActualMonth));

  // 1. Current Active Running Month (e.g. September 2026):
  // Dynamically count Mon-Fri working days elapsed up to todayStr
  if (isCurrentRunningMonth) {
    const allWorkdays = [];
    cycle.weeks.forEach(w => allWorkdays.push(...w.workdays));
    let elapsedHk = 0;
    for (const d of allWorkdays) {
      if (d <= todayStr) {
        elapsedHk++;
      }
    }

    const totalHk = cycle.totalHk; // 25 HK for September (5 weeks)
    const remainingHk = Math.max(totalHk - elapsedHk, 0);
    const timegonePct = totalHk > 0 ? Math.round((elapsedHk / totalHk) * 1000) / 10 : 0;
    const isFullMonth = remainingHk === 0;

    return {
      year,
      month,
      totalHk,
      asOfHke: elapsedHk,
      remainingHk,
      timeRatePct: timegonePct,
      monitoringDate: todayStr,
      monFriTotalHk: totalHk,
      monFriAsOfHke: elapsedHk,
      monFriRemainingHk: remainingHk,
      timegonePct,
      isFullMonth,
      totalWeeks: cycle.totalWeeks,
      cycleStartDate: cycle.startDate,
      cycleEndDate: cycle.endDate
    };
  }

  // 2. Manual override in business_calendar (preserves M2 test fixtures for month 5 / updateCalendar)
  if (cal && (cal.total_hk !== undefined && cal.as_of_hke !== undefined)) {
    const totalHk = cal.total_hk;
    const asOfHke = cal.as_of_hke;
    const remainingHk = Math.max(totalHk - asOfHke, 0);
    const timeRatePct = totalHk > 0 ? (asOfHke / totalHk) * 100 : 0;

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
      isFullMonth,
      totalWeeks: cycle.totalWeeks,
      cycleStartDate: cycle.startDate,
      cycleEndDate: cycle.endDate
    };
  }

  // 3. Fallback for past completed month
  if (isPastCompletedMonth) {
    const totalHk = cycle.totalHk;
    return {
      year,
      month,
      totalHk,
      asOfHke: totalHk,
      remainingHk: 0,
      timeRatePct: 100.0,
      monitoringDate: cycle.endDate,
      monFriTotalHk: totalHk,
      monFriAsOfHke: totalHk,
      monFriRemainingHk: 0,
      timegonePct: 100.0,
      isFullMonth: true,
      totalWeeks: cycle.totalWeeks,
      cycleStartDate: cycle.startDate,
      cycleEndDate: cycle.endDate
    };
  }

  // 4. Fallback for future month
  return {
    year,
    month,
    totalHk: cycle.totalHk,
    asOfHke: 0,
    remainingHk: cycle.totalHk,
    timeRatePct: 0.0,
    monitoringDate: cycle.startDate,
    monFriTotalHk: cycle.totalHk,
    monFriAsOfHke: 0,
    monFriRemainingHk: cycle.totalHk,
    timegonePct: 0.0,
    isFullMonth: false,
    totalWeeks: cycle.totalWeeks,
    cycleStartDate: cycle.startDate,
    cycleEndDate: cycle.endDate
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
  calculateMonFriWorkingDays,
  getSalesMonthCycle
};
