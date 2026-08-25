import { z } from 'zod';
import type { DailyAnalytics } from '../models';

const cellSchema = z.union([z.string(), z.number(), z.null()]);

export const analyticsResponseSchema = z.object({
  columnHeaders: z.array(
    z.object({
      name: z.string().min(1),
      columnType: z.string().optional(),
      dataType: z.string().optional(),
    }),
  ),
  rows: z.array(z.array(cellSchema)).optional(),
});

export interface AnalyticsTable {
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
}

export function parseAnalyticsTable(input: unknown): AnalyticsTable {
  const response = analyticsResponseSchema.parse(input);
  const columns = response.columnHeaders.map((header) => header.name);
  const columnIndexes = new Map(columns.map((name, index) => [name, index]));

  const rows = (response.rows ?? []).map((row) => {
    const result: Record<string, string | number | null> = {};
    for (const [name, index] of columnIndexes.entries()) {
      result[name] = row[index] ?? null;
    }
    return result;
  });

  return { columns, rows };
}

function requiredString(
  row: Record<string, string | number | null>,
  name: string,
): string {
  const value = row[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Analytics response is missing a valid ${name} value.`);
  }
  return value;
}

function requiredNumber(
  row: Record<string, string | number | null>,
  name: string,
): number {
  const value = row[name];
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError(`Analytics response is missing a valid ${name} value.`);
  }
  return numeric;
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

export function parseDailyAnalytics(
  input: unknown,
  channelId: string,
  fetchedAt: string,
): DailyAnalytics[] {
  const table = parseAnalyticsTable(input);
  const missingColumn = DAILY_COLUMNS.find((column) => !table.columns.includes(column));
  if (missingColumn) {
    throw new TypeError(`Analytics response is missing the ${missingColumn} column.`);
  }

  return table.rows.map((row) => ({
    channelId,
    day: requiredString(row, 'day'),
    views: requiredNumber(row, 'views'),
    estimatedMinutesWatched: requiredNumber(row, 'estimatedMinutesWatched'),
    subscribersGained: requiredNumber(row, 'subscribersGained'),
    subscribersLost: requiredNumber(row, 'subscribersLost'),
    averageViewDuration: requiredNumber(row, 'averageViewDuration'),
    averageViewPercentage: requiredNumber(row, 'averageViewPercentage'),
    fetchedAt,
  }));
}

export function parseAggregateWatchMinutes(input: unknown): number {
  const table = parseAnalyticsTable(input);
  if (!table.columns.includes('estimatedMinutesWatched')) {
    throw new TypeError(
      'Analytics response is missing the estimatedMinutesWatched column.',
    );
  }
  const firstRow = table.rows[0];
  if (!firstRow) return 0;
  return requiredNumber(firstRow, 'estimatedMinutesWatched');
}

export function numericAnalyticsValue(
  row: Record<string, string | number | null>,
  name: string,
): number {
  return requiredNumber(row, name);
}

export function stringAnalyticsValue(
  row: Record<string, string | number | null>,
  name: string,
): string {
  return requiredString(row, name);
}
