// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { INITIAL_DAILY_BACKFILL_DAYS, initialDailyAnalyticsStart } from './sync';

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = new Date('2026-08-26T12:00:00.000Z');

function publishedDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function inclusiveDays(start: string, end: Date): number {
  return (
    Math.round(
      (Date.parse(end.toISOString().slice(0, 10)) - Date.parse(start)) / DAY_MS,
    ) + 1
  );
}

describe('initial daily Analytics backfill', () => {
  it.each([
    ['30-day', 30],
    ['120-day', 120],
    ['365-day', 365],
    ['2-year', 365 * 2],
    ['10-year', 365 * 10],
  ])('bounds a %s channel to the configured horizon', (_label, ageDays) => {
    const start = initialDailyAnalyticsStart(publishedDaysAgo(ageDays), NOW);
    expect(inclusiveDays(start, NOW)).toBeLessThanOrEqual(INITIAL_DAILY_BACKFILL_DAYS);
    if (ageDays < INITIAL_DAILY_BACKFILL_DAYS) {
      expect(start).toBe(publishedDaysAgo(ageDays).slice(0, 10));
    }
  });

  it('requests only 400 daily rows for a channel published ten years ago', () => {
    const start = initialDailyAnalyticsStart(publishedDaysAgo(365 * 10), NOW);
    expect(inclusiveDays(start, NOW)).toBe(400);
  });

  it('keeps the publication date for a channel newer than the horizon', () => {
    expect(initialDailyAnalyticsStart('2026-08-01T04:00:00.000Z', NOW)).toBe(
      '2026-08-01',
    );
  });
});
