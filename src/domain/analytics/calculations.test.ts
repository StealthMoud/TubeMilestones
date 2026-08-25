import type { DailyAnalytics } from '../models';
import {
  latestAnalyticsDay,
  recentMovement,
  summarizeAnalyticsRange,
  watchMinutesToHours,
} from './calculations';

function daily(
  day: string,
  views: number,
  minutes: number,
  gained: number,
  lost: number,
): DailyAnalytics {
  return {
    channelId: 'channel-1',
    day,
    views,
    estimatedMinutesWatched: minutes,
    subscribersGained: gained,
    subscribersLost: lost,
    averageViewDuration: 100,
    averageViewPercentage: 50,
    fetchedAt: '2026-08-26T12:00:00.000Z',
  };
}

const rows = [
  daily('2026-08-21', 100, 60, 4, 1),
  daily('2026-08-22', 200, 120, 5, 2),
  daily('2026-08-23', 300, 180, 6, 1),
  daily('2026-08-24', 400, 240, 8, 3),
];

describe('analytics calculations', () => {
  it('converts watch minutes to hours', () => {
    expect(watchMinutesToHours(2_840)).toBeCloseTo(47.3333);
  });

  it('calculates raw recent movement', () => {
    expect(recentMovement(rows)).toMatchObject({
      views: 1_000,
      estimatedMinutesWatched: 600,
      watchHours: 10,
      subscribersGained: 23,
      subscribersLost: 7,
      netSubscribers: 16,
      availableThrough: '2026-08-24',
    });
  });

  it('finds the last available analytics day independent of input order', () => {
    expect(latestAnalyticsDay([...rows].reverse())).toBe('2026-08-24');
    expect(latestAnalyticsDay([])).toBeNull();
  });

  it('summarizes a range and straightforward previous-period difference', () => {
    const summary = summarizeAnalyticsRange(rows, 2, 'views');
    expect(summary.total).toBe(700);
    expect(summary.previousTotal).toBe(300);
    expect(summary.difference).toBe(400);
    expect(summary.peak).toEqual({ day: '2026-08-24', value: 400 });
  });

  it('omits the previous-period difference when coverage is incomplete', () => {
    const summary = summarizeAnalyticsRange(rows, 3, 'views');
    expect(summary.previousTotal).toBeNull();
    expect(summary.difference).toBeNull();
  });
});
