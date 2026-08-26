import type { Tables } from '../../database.types.ts';
import type { DatabaseClient } from './auth.ts';
import {
  decryptArchive,
  verifyArchiveChecksum,
  verifyArchiveRowCounts,
  type ArchiveAnalyticsRow,
  type ArchiveSnapshotRow,
} from './archive.ts';
import { requiredEnv } from './env.ts';
import { AppError, type ErrorCode } from './errors.ts';
import {
  mergeAnalyticsHistory,
  mergeSnapshotHistory,
  requestedStartDate,
} from './history.ts';
import { isR2Configured, R2Store } from './r2.ts';

export type HistoryRange = '7D' | '28D' | '90D' | '365D' | 'ALL';

function hotAnalytics(row: Tables<'analytics_daily'>): ArchiveAnalyticsRow {
  return {
    day: row.day,
    views: row.views,
    estimatedMinutesWatched: String(row.estimated_minutes_watched),
    subscribersGained: row.subscribers_gained,
    subscribersLost: row.subscribers_lost,
    averageViewDuration: String(row.average_view_duration),
    averageViewPercentage: String(row.average_view_percentage),
    fetchedAt: row.fetched_at,
  };
}

function hotSnapshot(row: Tables<'channel_snapshots'>): ArchiveSnapshotRow {
  return {
    snapshotDate: row.snapshot_date,
    observedAt: row.observed_at,
    subscriberCount: row.subscriber_count,
    viewCount: row.view_count,
    videoCount: row.video_count,
  };
}

function archiveKey(version: number): string {
  return requiredEnv(`ARCHIVE_MASTER_KEY_V${version}`);
}

export interface UnifiedHistory {
  analytics: ArchiveAnalyticsRow[];
  snapshots: ArchiveSnapshotRow[];
  requestedStartDate: string;
  requestedEndDate: string;
  sources: { hotDays: number; archivePeriods: number };
  partial: null | {
    errorCode: Extract<ErrorCode, 'R2_UNAVAILABLE' | 'ARCHIVE_CORRUPT'>;
  };
}

export async function loadUnifiedHistory(
  admin: DatabaseClient,
  userId: string,
  channelId: string,
  range: HistoryRange,
  now = new Date(),
): Promise<UnifiedHistory> {
  const { data: channel, error: channelError } = await admin
    .from('channels')
    .select('id, published_at')
    .eq('id', channelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (channelError) throw new AppError('SUPABASE_ERROR', { cause: channelError });
  if (!channel) throw new AppError('FORBIDDEN');

  const endDate = now.toISOString().slice(0, 10);
  const startDate = requestedStartDate(
    range,
    endDate,
    channel.published_at.slice(0, 10),
  );
  const [
    { data: hotRows, error: hotError },
    { data: hotSnapshots, error: snapshotError },
  ] = await Promise.all([
    admin
      .from('analytics_daily')
      .select('*')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .gte('day', startDate)
      .lte('day', endDate)
      .order('day'),
    admin
      .from('channel_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .gte('snapshot_date', startDate)
      .lte('snapshot_date', endDate)
      .order('snapshot_date'),
  ]);
  if (hotError || snapshotError) {
    throw new AppError('SUPABASE_ERROR', { cause: hotError ?? snapshotError });
  }
  const hotAnalyticsRows = (hotRows ?? []).map(hotAnalytics);
  const hotSnapshotRows = (hotSnapshots ?? []).map(hotSnapshot);

  if (range !== '365D' && range !== 'ALL') {
    return {
      analytics: hotAnalyticsRows,
      snapshots: hotSnapshotRows,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      sources: { hotDays: hotAnalyticsRows.length, archivePeriods: 0 },
      partial: null,
    };
  }

  const { data: manifests, error: manifestError } = await admin
    .from('archive_manifests')
    .select('*')
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .eq('status', 'READY')
    .lte('period_start', endDate)
    .gte('period_end', startDate)
    .order('period_start');
  if (manifestError) throw new AppError('SUPABASE_ERROR', { cause: manifestError });
  if ((manifests?.length ?? 0) === 0) {
    return {
      analytics: hotAnalyticsRows,
      snapshots: hotSnapshotRows,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      sources: { hotDays: hotAnalyticsRows.length, archivePeriods: 0 },
      partial: null,
    };
  }

  const archivedAnalytics: ArchiveAnalyticsRow[] = [];
  const archivedSnapshots: ArchiveSnapshotRow[] = [];
  let partial: UnifiedHistory['partial'] = null;
  let loadedPeriods = 0;

  if (!isR2Configured()) {
    partial = { errorCode: 'R2_UNAVAILABLE' };
  } else {
    const r2 = new R2Store();
    for (const manifest of manifests ?? []) {
      try {
        if (!manifest.sha256) throw new AppError('ARCHIVE_CORRUPT');
        const object = await r2.get(manifest.object_key);
        await verifyArchiveChecksum(object.bytes, manifest.sha256);
        const payload = await decryptArchive(object.bytes, userId, archiveKey);
        verifyArchiveRowCounts(
          payload,
          manifest.analytics_row_count,
          manifest.snapshot_row_count,
        );
        archivedAnalytics.push(...payload.analytics);
        archivedSnapshots.push(...payload.snapshots);
        loadedPeriods += 1;
      } catch (error) {
        partial = {
          errorCode:
            error instanceof AppError && error.code === 'ARCHIVE_CORRUPT'
              ? 'ARCHIVE_CORRUPT'
              : 'R2_UNAVAILABLE',
        };
        break;
      }
    }
  }

  return {
    analytics: mergeAnalyticsHistory(archivedAnalytics, hotAnalyticsRows).filter(
      (row) => row.day >= startDate && row.day <= endDate,
    ),
    snapshots: mergeSnapshotHistory(archivedSnapshots, hotSnapshotRows).filter(
      (row) => row.snapshotDate >= startDate && row.snapshotDate <= endDate,
    ),
    requestedStartDate: startDate,
    requestedEndDate: endDate,
    sources: { hotDays: hotAnalyticsRows.length, archivePeriods: loadedPeriods },
    partial,
  };
}
