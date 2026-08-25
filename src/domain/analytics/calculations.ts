import type { AnalyticsMetric, DailyAnalytics, RecentMovement } from '../models';

export function watchMinutesToHours(minutes: number): number {
  return minutes / 60;
}

export function analyticsMetricValue(
  row: DailyAnalytics,
  metric: AnalyticsMetric,
): number {
  switch (metric) {
    case 'views':
      return row.views;
    case 'subscribers':
      return row.subscribersGained - row.subscribersLost;
    case 'watchHours':
      return watchMinutesToHours(row.estimatedMinutesWatched);
  }
}

export function recentMovement(rows: readonly DailyAnalytics[]): RecentMovement {
  const totals = rows.reduce(
    (result, row) => ({
      views: result.views + row.views,
      estimatedMinutesWatched:
        result.estimatedMinutesWatched + row.estimatedMinutesWatched,
      subscribersGained: result.subscribersGained + row.subscribersGained,
      subscribersLost: result.subscribersLost + row.subscribersLost,
    }),
    {
      views: 0,
      estimatedMinutesWatched: 0,
      subscribersGained: 0,
      subscribersLost: 0,
    },
  );

  return {
    ...totals,
    watchHours: watchMinutesToHours(totals.estimatedMinutesWatched),
    netSubscribers: totals.subscribersGained - totals.subscribersLost,
    availableThrough: rows.at(-1)?.day ?? null,
  };
}

export function latestAnalyticsDay(rows: readonly DailyAnalytics[]): string | null {
  return (
    [...rows].sort((left, right) => left.day.localeCompare(right.day)).at(-1)?.day ??
    null
  );
}

export interface RangeSummary {
  current: DailyAnalytics[];
  previous: DailyAnalytics[];
  total: number;
  previousTotal: number | null;
  difference: number | null;
  peak: { day: string; value: number } | null;
}

export function summarizeAnalyticsRange(
  rows: readonly DailyAnalytics[],
  days: number,
  metric: AnalyticsMetric,
): RangeSummary {
  if (!Number.isInteger(days) || days <= 0) {
    throw new RangeError('Analytics range must be a positive whole number of days.');
  }

  const sorted = [...rows].sort((left, right) => left.day.localeCompare(right.day));
  const current = sorted.slice(-days);
  const previous = sorted.slice(Math.max(0, sorted.length - days * 2), -days);
  const total = current.reduce(
    (sum, row) => sum + analyticsMetricValue(row, metric),
    0,
  );
  const previousTotal =
    previous.length === days
      ? previous.reduce((sum, row) => sum + analyticsMetricValue(row, metric), 0)
      : null;
  const peak = current.reduce<RangeSummary['peak']>((result, row) => {
    const value = analyticsMetricValue(row, metric);
    return !result || value > result.value ? { day: row.day, value } : result;
  }, null);

  return {
    current,
    previous,
    total,
    previousTotal,
    difference: previousTotal === null ? null : total - previousTotal,
    peak,
  };
}
