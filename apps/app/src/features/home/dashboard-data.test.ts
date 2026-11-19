import { describe, expect, it } from 'vitest';
import {
  chartHours,
  parseDashboardSummary,
  parseDashboardTrends,
  trendPercent,
} from './dashboard-data';

describe('parseDashboardSummary', () => {
  it('reads the numbers, and leaves out what the staff member may not see', () => {
    const summary = parseDashboardSummary({
      checkins_today: 12,
      inside_now: 4,
      hourly: Array.from({ length: 24 }, (_, hour) => (hour === 9 ? 12 : 0)),
      active_members: 310,
      takings_today: '125000.00',
    });
    expect(summary.checkinsToday).toBe(12);
    expect(summary.hourly?.[9]).toBe(12);
    expect(summary.takingsToday).toBe(125000);
    expect(summary.owedNow).toBeNull();
    expect(summary.spaToday).toBeNull();
    expect(parseDashboardSummary(null).activeMembers).toBeNull();
    expect(parseDashboardSummary({ hourly: [1, 2] }).hourly).toBeNull();
  });
});

describe('chartHours', () => {
  it('shows 06:00 to 22:00, widened to the hours that had visits', () => {
    const quiet = Array.from({ length: 24 }, () => 0);
    expect(chartHours(quiet)).toEqual(Array.from({ length: 17 }, (_, index) => 6 + index));
    const early = quiet.map((_, hour) => (hour === 4 || hour === 23 ? 1 : 0));
    expect(chartHours(early)[0]).toBe(4);
    expect(chartHours(early).at(-1)).toBe(23);
  });
});

describe('parseDashboardTrends', () => {
  it('reads seven days, today last, and leaves out what the staff member may not see', () => {
    const trends = parseDashboardTrends({
      checkins_yesterday: 9,
      checkins_week: [1, 2, 3, 4, 5, 6, 7],
      takings_week: ['0', '1000.00', 0, 0, 0, 0, '2500.50'],
      classes_today: 3,
      class_places: 40,
      class_taken: '12',
    });
    expect(trends.checkinsYesterday).toBe(9);
    expect(trends.checkinsWeek?.at(-1)).toBe(7);
    expect(trends.takingsWeek?.at(-1)).toBe(2500.5);
    expect(trends.classTaken).toBe(12);
    expect(trends.takingsYesterday).toBeNull();
    expect(trends.ptToday).toBeNull();
    expect(parseDashboardTrends({ checkins_week: [1, 2] }).checkinsWeek).toBeNull();
    expect(parseDashboardTrends('nonsense').classesToday).toBeNull();
  });
});

describe('trendPercent', () => {
  it('compares today with yesterday up to the same time', () => {
    expect(trendPercent(112, 100)).toBe(12);
    expect(trendPercent(46, 50)).toBe(-8);
    expect(trendPercent(5, 5)).toBe(0);
  });

  it('shows nothing when there is nothing to compare with', () => {
    expect(trendPercent(10, 0)).toBeNull();
    expect(trendPercent(null, 4)).toBeNull();
    expect(trendPercent(3, null)).toBeNull();
  });
});
