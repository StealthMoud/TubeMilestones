// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mergeAnalyticsHistory, requestedStartDate } from './history';
import type { ArchiveAnalyticsRow } from './archive';

function row(day: string, views: string): ArchiveAnalyticsRow {
  return {
    day,
    views,
    estimatedMinutesWatched: '1',
    subscribersGained: '0',
    subscribersLost: '0',
    averageViewDuration: '1',
    averageViewPercentage: '1',
    fetchedAt: '2026-08-26T00:00:00.000Z',
  };
}

describe('hot and cold history merge', () => {
  it('returns a continuous ordered boundary and lets hot rows win duplicates', () => {
    const archived = [row('2026-04-29', '1'), row('2026-04-30', '2')];
    const hot = [row('2026-04-30', '20'), row('2026-05-01', '3')];
    expect(
      mergeAnalyticsHistory(archived, hot).map(({ day, views }) => [day, views]),
    ).toEqual([
      ['2026-04-29', '1'],
      ['2026-04-30', '20'],
      ['2026-05-01', '3'],
    ]);
  });

  it('calculates inclusive 365-day and all-time starts', () => {
    expect(requestedStartDate('365D', '2026-08-26', '2020-01-01')).toBe('2025-08-27');
    expect(requestedStartDate('ALL', '2026-08-26', '2020-01-01')).toBe('2020-01-01');
  });
});
