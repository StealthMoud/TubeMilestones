import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { DailyAnalytics, DashboardData } from '../../domain/models';
import { demoScenarioFromLocation } from '../../fixtures/demoData';
import { TubeMilestonesError } from '../../services/errors';
import { safeNumericValue } from '../../services/supabase/dashboardRepository';
import { invokeFunction } from '../../services/supabase/invoke';

export type AnalyticsRange = '7D' | '28D' | '90D' | '365D' | 'ALL';

const rowSchema = z.object({
  day: z.iso.date(),
  views: z.string(),
  estimatedMinutesWatched: z.string(),
  subscribersGained: z.string(),
  subscribersLost: z.string(),
  averageViewDuration: z.string(),
  averageViewPercentage: z.string(),
  fetchedAt: z.iso.datetime(),
});

const historySchema = z.object({
  analytics: z.array(rowSchema),
  snapshots: z.array(z.unknown()),
  requestedStartDate: z.iso.date(),
  requestedEndDate: z.iso.date(),
  sources: z.object({ hotDays: z.number(), archivePeriods: z.number() }),
  partial: z
    .object({ errorCode: z.enum(['R2_UNAVAILABLE', 'ARCHIVE_CORRUPT']) })
    .nullable(),
});

function decimal(value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TubeMilestonesError(
      'PRECISION_UNSUPPORTED',
      'Analytics value is invalid.',
    );
  }
  return number;
}

function mapRows(
  channelId: string,
  input: z.infer<typeof historySchema>,
): DailyAnalytics[] {
  return input.analytics.map((row) => ({
    channelId,
    day: row.day,
    views: safeNumericValue(row.views, 'daily views'),
    estimatedMinutesWatched: decimal(row.estimatedMinutesWatched),
    subscribersGained: safeNumericValue(row.subscribersGained, 'subscribers gained'),
    subscribersLost: safeNumericValue(row.subscribersLost, 'subscribers lost'),
    averageViewDuration: decimal(row.averageViewDuration),
    averageViewPercentage: decimal(row.averageViewPercentage),
    fetchedAt: row.fetchedAt,
  }));
}

function shortRangeRows(data: DashboardData, range: AnalyticsRange): DailyAnalytics[] {
  if (range === 'ALL' || range === '365D') return data.analyticsDaily;
  const days = Number.parseInt(range, 10);
  return data.analyticsDaily.slice(-days);
}

export function useAnalyticsHistory(
  data: DashboardData | null,
  range: AnalyticsRange,
  isDemo: boolean,
) {
  const historical = range === '365D' || range === 'ALL';
  const query = useQuery({
    queryKey: ['analytics-history', data?.channel.channelId, range],
    queryFn: async () => {
      if (!data) throw new TubeMilestonesError('INVALID_REQUEST', 'Channel missing.');
      const raw = await invokeFunction<unknown>('history-query', {
        channelId: data.channel.channelId,
        range,
      });
      const parsed = historySchema.safeParse(raw);
      if (!parsed.success) {
        throw new TubeMilestonesError(
          'SUPABASE_ERROR',
          'History response was invalid.',
          {
            cause: parsed.error,
          },
        );
      }
      return {
        rows: mapRows(data.channel.channelId, parsed.data),
        partial: parsed.data.partial,
      };
    },
    enabled: Boolean(data) && historical && !isDemo,
    staleTime: 5 * 60 * 1_000,
  });

  if (!data) {
    return {
      rows: [] as DailyAnalytics[],
      partial: null,
      isLoading: false,
      error: null,
    };
  }
  if (!historical || isDemo) {
    return {
      rows: shortRangeRows(data, range),
      partial:
        isDemo && demoScenarioFromLocation() === 'archive-partial' && historical
          ? ({ errorCode: 'R2_UNAVAILABLE' } as const)
          : null,
      isLoading: false,
      error: null,
    };
  }
  return {
    rows: query.data?.rows ?? data.analyticsDaily,
    partial: query.data?.partial ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
