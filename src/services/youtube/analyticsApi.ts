import type { AnalyticsSummary, DailyAnalytics } from '../../domain/models';
import {
  latestAnalyticsDay,
  watchMinutesToHours,
} from '../../domain/analytics/calculations';
import {
  numericAnalyticsValue,
  parseAggregateWatchMinutes,
  parseAnalyticsTable,
  parseDailyAnalytics,
  stringAnalyticsValue,
} from '../../domain/analytics/parser';
import { parseReportingDay, toReportingDay } from '../../domain/metrics/dates';
import { TubeMilestonesError, asTubeMilestonesError } from '../errors';
import { authorizedFetchJson } from '../google/http';

export type YouTubeAnalyticsMetric =
  | 'views'
  | 'estimatedMinutesWatched'
  | 'subscribersGained'
  | 'subscribersLost'
  | 'averageViewDuration'
  | 'averageViewPercentage';

export interface AnalyticsQuery {
  startDate: string;
  endDate: string;
  metrics: readonly YouTubeAnalyticsMetric[];
  dimensions?: readonly ['day'];
  sort?: 'day';
}

const DAILY_METRICS: readonly YouTubeAnalyticsMetric[] = [
  'views',
  'estimatedMinutesWatched',
  'subscribersGained',
  'subscribersLost',
  'averageViewDuration',
  'averageViewPercentage',
];

const CORE_METRICS: readonly YouTubeAnalyticsMetric[] = [
  'views',
  'estimatedMinutesWatched',
  'subscribersGained',
  'subscribersLost',
];

const AVERAGE_METRICS: readonly YouTubeAnalyticsMetric[] = [
  'averageViewDuration',
  'averageViewPercentage',
];

export function buildAnalyticsUrl(query: AnalyticsQuery): URL {
  parseReportingDay(query.startDate);
  parseReportingDay(query.endDate);
  if (query.metrics.length === 0) {
    throw new RangeError('At least one Analytics metric is required.');
  }

  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', query.startDate);
  url.searchParams.set('endDate', query.endDate);
  url.searchParams.set('metrics', query.metrics.join(','));
  if (query.dimensions) url.searchParams.set('dimensions', query.dimensions.join(','));
  if (query.sort) url.searchParams.set('sort', query.sort);
  return url;
}

async function queryAnalytics(
  accessToken: string,
  query: AnalyticsQuery,
  signal?: AbortSignal,
): Promise<unknown> {
  return authorizedFetchJson(buildAnalyticsUrl(query), accessToken, { signal });
}

function isUnsupportedCombination(error: unknown): boolean {
  const typed = asTubeMilestonesError(error);
  const message = typed.message.toLowerCase();
  return (
    typed.status === 400 &&
    (message.includes('combination') ||
      message.includes('incompatible') ||
      message.includes('invalid metric'))
  );
}

function mergeSplitDailyResponses(
  coreInput: unknown,
  averagesInput: unknown,
  channelId: string,
  fetchedAt: string,
): DailyAnalytics[] {
  const core = parseAnalyticsTable(coreInput);
  const averages = parseAnalyticsTable(averagesInput);
  const averagesByDay = new Map(
    averages.rows.map((row) => [stringAnalyticsValue(row, 'day'), row]),
  );

  return core.rows
    .map((row): DailyAnalytics => {
      const day = stringAnalyticsValue(row, 'day');
      const average = averagesByDay.get(day);
      return {
        channelId,
        day,
        views: numericAnalyticsValue(row, 'views'),
        estimatedMinutesWatched: numericAnalyticsValue(row, 'estimatedMinutesWatched'),
        subscribersGained: numericAnalyticsValue(row, 'subscribersGained'),
        subscribersLost: numericAnalyticsValue(row, 'subscribersLost'),
        averageViewDuration: average
          ? numericAnalyticsValue(average, 'averageViewDuration')
          : 0,
        averageViewPercentage: average
          ? numericAnalyticsValue(average, 'averageViewPercentage')
          : 0,
        fetchedAt,
      };
    })
    .sort((left, right) => left.day.localeCompare(right.day));
}

export interface ReportingRange {
  startDate: string;
  endDate: string;
}

export function recentReportingRange(now: Date, days = 365): ReportingRange {
  if (!Number.isInteger(days) || days <= 0) {
    throw new RangeError('Reporting range must be a positive whole number of days.');
  }
  const endDate = toReportingDay(now);
  const end = parseReportingDay(endDate);
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1_000);
  return { startDate: toReportingDay(start), endDate };
}

export async function fetchDailyAnalytics(
  accessToken: string,
  channelId: string,
  range: ReportingRange,
  fetchedAt: string,
  signal?: AbortSignal,
): Promise<DailyAnalytics[]> {
  const base = {
    startDate: range.startDate,
    endDate: range.endDate,
    dimensions: ['day'] as const,
    sort: 'day' as const,
  };

  try {
    const raw = await queryAnalytics(
      accessToken,
      { ...base, metrics: DAILY_METRICS },
      signal,
    );
    return parseDailyAnalytics(raw, channelId, fetchedAt);
  } catch (error) {
    if (!isUnsupportedCombination(error)) throw error;

    try {
      const [core, averages] = await Promise.all([
        queryAnalytics(accessToken, { ...base, metrics: CORE_METRICS }, signal),
        queryAnalytics(accessToken, { ...base, metrics: AVERAGE_METRICS }, signal),
      ]);
      return mergeSplitDailyResponses(core, averages, channelId, fetchedAt);
    } catch (splitError) {
      throw new TubeMilestonesError(
        'ANALYTICS_UNSUPPORTED_COMBINATION',
        'YouTube rejected both the combined and split Analytics queries.',
        { cause: splitError },
      );
    }
  }
}

export async function fetchAggregateAnalytics(
  accessToken: string,
  channelId: string,
  range: ReportingRange,
  availableThrough: string | null,
  fetchedAt: string,
  signal?: AbortSignal,
): Promise<AnalyticsSummary> {
  const raw = await queryAnalytics(
    accessToken,
    {
      ...range,
      metrics: ['estimatedMinutesWatched'],
    },
    signal,
  );

  return {
    channelId,
    requestedStartDate: range.startDate,
    requestedEndDate: range.endDate,
    availableThrough,
    estimatedMinutesWatched: parseAggregateWatchMinutes(raw),
    fetchedAt,
  };
}

export function availableAnalyticsWatchHours(summary: AnalyticsSummary): number {
  return watchMinutesToHours(summary.estimatedMinutesWatched);
}

export function analyticsThrough(rows: readonly DailyAnalytics[]): string | null {
  return latestAnalyticsDay(rows);
}
