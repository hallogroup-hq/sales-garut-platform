const test = require('node:test');
const assert = require('node:assert/strict');
const { getSalesMonthCycle, getCalendarPace } = require('../src/services/calendarEngine.js');
const { getExecutiveSummary } = require('../src/services/metricsEngine.js');

test('M12-1: FMCG 4-week vs 5-week Sales Month Cycles in 2026', () => {
  // September 2026 is officially a 5-week cycle (31 Aug 2026 - 2 Oct 2026)
  const sepCycle = getSalesMonthCycle(2026, 9);
  assert.equal(sepCycle.totalWeeks, 5, 'September 2026 has 5 weeks');
  assert.equal(sepCycle.totalHk, 25, 'September 2026 has 25 working days (5 weeks x 5 HK)');
  assert.equal(sepCycle.startDate, '2026-08-31', 'September cycle starts on Monday, 31 August 2026');
  assert.equal(sepCycle.endDate, '2026-10-02', 'September cycle ends on Friday, 2 October 2026');

  // August 2026 is a 4-week cycle (20 HK)
  const augCycle = getSalesMonthCycle(2026, 8);
  assert.equal(augCycle.totalWeeks, 4, 'August 2026 has 4 weeks');
  assert.equal(augCycle.totalHk, 20, 'August 2026 has 20 working days');

  // October 2026 is a 4-week cycle (20 HK)
  const octCycle = getSalesMonthCycle(2026, 10);
  assert.equal(octCycle.totalWeeks, 4, 'October 2026 has 4 weeks');
  assert.equal(octCycle.totalHk, 20, 'October 2026 has 20 working days');
});

test('M12-2: Dynamic Working Days Calculation As of Today (25 September 2026)', () => {
  // As of 25 September 2026 (Friday of Week 4)
  const pace25 = getCalendarPace(2026, 9, '2026-09-25');
  assert.equal(pace25.totalHk, 25, 'Total HK for September is 25 HK');
  assert.equal(pace25.asOfHke, 20, 'As of 25 Sep, 20 working days have elapsed (Weeks 1-4 = 20 HK)');
  assert.equal(pace25.remainingHk, 5, '5 working days remain (Week 5: 28 Sep - 2 Oct)');
  assert.equal(pace25.timegonePct, 80.0, 'Timegone is exactly 80.0% (20/25)');
  assert.equal(pace25.monFriTotalHk, 25);
  assert.equal(pace25.monFriAsOfHke, 20);
  assert.equal(pace25.monFriRemainingHk, 5);
  assert.equal(pace25.isFullMonth, false);
});

test('M12-3: Executive Summary GAP and Timegone Alignment with Sales Cycle', () => {
  const summary = getExecutiveSummary({ year: 2026, month: 9, asOfDate: '2026-09-25' });
  assert.equal(summary.calendar.totalHk, 25);
  assert.equal(summary.calendar.asOfHke, 20);
  assert.equal(summary.calendar.remainingHk, 5);
  assert.equal(summary.calendar.timegonePct, 80.0);

  // Target: 11,723.29 KTN, Actual: 5,432.96 KTN, Remaining: 6,290.33 KTN
  // GAP Daily with 5 remaining HK = 6290.33 / 5 = 1258.07 KTN/hr
  assert.equal(summary.sales.gapMonthlyCartons, 6290.33);
  assert.equal(summary.sales.gapDailyMonFri, 1258.07);
  assert.equal(summary.sales.timegonePct, 80.0);
  assert.equal(summary.sales.achievementPct, 46.3);
});
