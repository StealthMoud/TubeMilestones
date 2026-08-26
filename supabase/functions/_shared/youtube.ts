import { z } from 'zod';
import { AppError } from './errors.ts';

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

const thumbnailSchema = z.object({ url: z.url() });
const channelListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      snippet: z.object({
        title: z.string(),
        publishedAt: z.iso.datetime(),
        thumbnails: z
          .object({
            default: thumbnailSchema.optional(),
            medium: thumbnailSchema.optional(),
            high: thumbnailSchema.optional(),
          })
          .optional(),
      }),
      statistics: z.object({
        viewCount: z.string().regex(/^\d+$/u),
        subscriberCount: z.string().regex(/^\d+$/u).optional(),
        hiddenSubscriberCount: z.boolean().default(false),
        videoCount: z.string().regex(/^\d+$/u),
      }),
      contentDetails: z.object({
        relatedPlaylists: z.object({ uploads: z.string().min(1) }),
      }),
    }),
  ),
});

function exactUnsignedInteger(value: string, field: string): string {
  try {
    const integer = BigInt(value);
    if (integer < 0n || integer > POSTGRES_BIGINT_MAX) throw new RangeError(field);
    return integer.toString();
  } catch (error) {
    throw new AppError('YOUTUBE_API_ERROR', {
      cause: error,
      message: `YouTube returned an invalid ${field}.`,
    });
  }
}

function thumbnailUrl(
  thumbnails:
    | {
        default?: { url: string };
        medium?: { url: string };
        high?: { url: string };
      }
    | undefined,
): string {
  return (
    thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? ''
  );
}

export type SubscriberPrecision =
  'EXACT' | 'ROUNDED_THREE_SIGNIFICANT_FIGURES' | 'HIDDEN';

export interface ObservedChannel {
  youtubeChannelId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  subscriberCount: string | null;
  subscriberCountPrecision: SubscriberPrecision;
  hiddenSubscriberCount: boolean;
  viewCount: string;
  videoCount: string;
  uploadsPlaylistId: string;
}

export function parseOwnedChannels(input: unknown): ObservedChannel[] {
  const result = channelListSchema.safeParse(input);
  if (!result.success) {
    throw new AppError('YOUTUBE_API_ERROR', { cause: result.error });
  }
  return result.data.items.map((item) => {
    const hidden = item.statistics.hiddenSubscriberCount;
    const subscriberCount =
      hidden || item.statistics.subscriberCount === undefined
        ? null
        : exactUnsignedInteger(item.statistics.subscriberCount, 'subscriber count');
    const precision: SubscriberPrecision =
      hidden || subscriberCount === null
        ? 'HIDDEN'
        : BigInt(subscriberCount) > 1_000n
          ? 'ROUNDED_THREE_SIGNIFICANT_FIGURES'
          : 'EXACT';
    return {
      youtubeChannelId: item.id,
      title: item.snippet.title,
      thumbnailUrl: thumbnailUrl(item.snippet.thumbnails),
      publishedAt: item.snippet.publishedAt,
      subscriberCount,
      subscriberCountPrecision: precision,
      hiddenSubscriberCount: hidden,
      viewCount: exactUnsignedInteger(item.statistics.viewCount, 'view count'),
      videoCount: exactUnsignedInteger(item.statistics.videoCount, 'video count'),
      uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    };
  });
}

async function youtubeJson(url: URL, accessToken: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new AppError('YOUTUBE_API_ERROR', { cause: error, retryable: true });
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    if (response.status === 401) throw new AppError('YOUTUBE_REAUTH_REQUIRED');
    if (response.status === 429) {
      throw new AppError('YOUTUBE_QUOTA', { retryable: true });
    }
    if (response.status === 403) {
      const serialized = JSON.stringify(body).toLowerCase();
      if (serialized.includes('quota') || serialized.includes('ratelimit')) {
        throw new AppError('YOUTUBE_QUOTA', { retryable: true });
      }
    }
    throw new AppError('YOUTUBE_API_ERROR', {
      cause: { status: response.status, body },
      retryable: response.status >= 500,
    });
  }
  return body;
}

export async function fetchOwnedChannels(
  accessToken: string,
): Promise<ObservedChannel[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet,statistics,contentDetails');
  url.searchParams.set('mine', 'true');
  return parseOwnedChannels(await youtubeJson(url, accessToken));
}

type AnalyticsCell = string | number | null;
const analyticsSchema = z.object({
  columnHeaders: z.array(z.object({ name: z.string().min(1) })),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).optional(),
});

export interface AnalyticsTable {
  columns: string[];
  rows: Array<Record<string, AnalyticsCell>>;
}

export function parseAnalyticsTable(input: unknown): AnalyticsTable {
  const response = analyticsSchema.safeParse(input);
  if (!response.success) {
    throw new AppError('ANALYTICS_UNAVAILABLE', { cause: response.error });
  }
  const columns = response.data.columnHeaders.map(({ name }) => name);
  return {
    columns,
    rows: (response.data.rows ?? []).map((row) =>
      Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])),
    ),
  };
}

function requiredString(row: Record<string, AnalyticsCell>, name: string): string {
  const value = row[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError('ANALYTICS_UNAVAILABLE');
  }
  return value;
}

function exactIntegerCell(row: Record<string, AnalyticsCell>, name: string): string {
  const value = row[name];
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    return exactUnsignedInteger(value, name);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value.toString();
  }
  throw new AppError('ANALYTICS_UNAVAILABLE');
}

function numericCell(row: Record<string, AnalyticsCell>, name: string): string {
  const value = row[name];
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/u.test(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value.toString();
  }
  throw new AppError('ANALYTICS_UNAVAILABLE');
}

const DAILY_COLUMNS = [
  'day',
  'views',
  'estimatedMinutesWatched',
  'subscribersGained',
  'subscribersLost',
  'averageViewDuration',
  'averageViewPercentage',
] as const;

export interface YouTubeDailyAnalytics {
  day: string;
  views: string;
  estimatedMinutesWatched: string;
  subscribersGained: string;
  subscribersLost: string;
  averageViewDuration: string;
  averageViewPercentage: string;
}

export function parseDailyAnalytics(input: unknown): YouTubeDailyAnalytics[] {
  return parseDailyAnalyticsTable(parseAnalyticsTable(input));
}

function parseDailyAnalyticsTable(table: AnalyticsTable): YouTubeDailyAnalytics[] {
  const missing = DAILY_COLUMNS.find((column) => !table.columns.includes(column));
  if (missing) throw new AppError('ANALYTICS_UNAVAILABLE');
  return table.rows
    .map((row) => ({
      day: requiredString(row, 'day'),
      views: exactIntegerCell(row, 'views'),
      estimatedMinutesWatched: numericCell(row, 'estimatedMinutesWatched'),
      subscribersGained: exactIntegerCell(row, 'subscribersGained'),
      subscribersLost: exactIntegerCell(row, 'subscribersLost'),
      averageViewDuration: numericCell(row, 'averageViewDuration'),
      averageViewPercentage: numericCell(row, 'averageViewPercentage'),
    }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

function analyticsUrl(
  startDate: string,
  endDate: string,
  metrics: readonly string[],
  daily: boolean,
  page?: { startIndex: number; maxResults: number },
): URL {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('metrics', metrics.join(','));
  if (daily) {
    url.searchParams.set('dimensions', 'day');
    url.searchParams.set('sort', 'day');
  }
  if (page) {
    url.searchParams.set('startIndex', page.startIndex.toString());
    url.searchParams.set('maxResults', page.maxResults.toString());
  }
  return url;
}

const ANALYTICS_PAGE_SIZE = 200;
const MAX_ANALYTICS_ROWS = 10_000;

async function fetchAnalyticsPages(
  accessToken: string,
  startDate: string,
  endDate: string,
  metrics: readonly string[],
): Promise<AnalyticsTable> {
  const rows: AnalyticsTable['rows'] = [];
  let columns: string[] | null = null;
  for (
    let startIndex = 1;
    startIndex <= MAX_ANALYTICS_ROWS;
    startIndex += ANALYTICS_PAGE_SIZE
  ) {
    const page = parseAnalyticsTable(
      await youtubeJson(
        analyticsUrl(startDate, endDate, metrics, true, {
          startIndex,
          maxResults: ANALYTICS_PAGE_SIZE,
        }),
        accessToken,
      ),
    );
    if (columns === null) {
      columns = page.columns;
    } else if (columns.join('\u0000') !== page.columns.join('\u0000')) {
      throw new AppError('ANALYTICS_UNAVAILABLE');
    }
    rows.push(...page.rows);
    if (page.rows.length < ANALYTICS_PAGE_SIZE) {
      return { columns: columns ?? [], rows };
    }
  }
  throw new AppError('ANALYTICS_UNAVAILABLE', {
    message: 'The Analytics result exceeded the supported history size.',
  });
}

const DAILY_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'subscribersGained',
  'subscribersLost',
  'averageViewDuration',
  'averageViewPercentage',
] as const;

const CORE_DAILY_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'subscribersGained',
  'subscribersLost',
] as const;

const AVERAGE_DAILY_METRICS = ['averageViewDuration', 'averageViewPercentage'] as const;

function isUnsupportedAnalyticsCombination(error: unknown): boolean {
  if (!(error instanceof AppError)) return false;
  const cause = error.cause as { status?: number; body?: unknown } | undefined;
  if (cause?.status !== 400) return false;
  const detail = JSON.stringify(cause.body ?? '').toLowerCase();
  return (
    detail.includes('combination') ||
    detail.includes('incompatible') ||
    detail.includes('invalid metric')
  );
}

function mergeSplitDailyAnalytics(
  core: AnalyticsTable,
  averages: AnalyticsTable,
): YouTubeDailyAnalytics[] {
  const averagesByDay = new Map(
    averages.rows.map((row) => [requiredString(row, 'day'), row]),
  );
  return core.rows
    .map((row) => {
      const day = requiredString(row, 'day');
      const average = averagesByDay.get(day);
      return {
        day,
        views: exactIntegerCell(row, 'views'),
        estimatedMinutesWatched: numericCell(row, 'estimatedMinutesWatched'),
        subscribersGained: exactIntegerCell(row, 'subscribersGained'),
        subscribersLost: exactIntegerCell(row, 'subscribersLost'),
        averageViewDuration: average
          ? numericCell(average, 'averageViewDuration')
          : '0',
        averageViewPercentage: average
          ? numericCell(average, 'averageViewPercentage')
          : '0',
      };
    })
    .sort((left, right) => left.day.localeCompare(right.day));
}

export async function fetchDailyAnalytics(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<YouTubeDailyAnalytics[]> {
  try {
    const table = await fetchAnalyticsPages(
      accessToken,
      startDate,
      endDate,
      DAILY_METRICS,
    );
    return parseDailyAnalyticsTable(table);
  } catch (error) {
    if (!isUnsupportedAnalyticsCombination(error)) throw error;
    try {
      const [core, averages] = await Promise.all([
        fetchAnalyticsPages(accessToken, startDate, endDate, CORE_DAILY_METRICS),
        fetchAnalyticsPages(accessToken, startDate, endDate, AVERAGE_DAILY_METRICS),
      ]);
      return mergeSplitDailyAnalytics(core, averages);
    } catch (splitError) {
      throw new AppError('ANALYTICS_UNAVAILABLE', { cause: splitError });
    }
  }
}

export async function fetchAggregateWatchMinutes(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<string> {
  const table = parseAnalyticsTable(
    await youtubeJson(
      analyticsUrl(startDate, endDate, ['estimatedMinutesWatched'], false),
      accessToken,
    ),
  );
  if (!table.columns.includes('estimatedMinutesWatched')) {
    throw new AppError('ANALYTICS_UNAVAILABLE');
  }
  const row = table.rows[0];
  return row ? numericCell(row, 'estimatedMinutesWatched') : '0';
}
