import { describe, expect, it } from 'vitest';
import { chartHours, parseDashboardSummary } from './dashboard-data';

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
