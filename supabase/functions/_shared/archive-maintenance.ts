import type { Tables } from '../../database.types.ts';
import type { DatabaseClient } from './auth.ts';
import {
  decryptArchive,
  encryptArchive,
  verifyArchiveChecksum,
  verifyArchiveRowCounts,
  type ArchiveAnalyticsRow,
  type ArchivePayload,
  type ArchiveSnapshotRow,
} from './archive.ts';
import { optionalEnv, requiredEnv } from './env.ts';
import { AppError } from './errors.ts';
import { archiveObjectKey, isR2Configured, R2Store } from './r2.ts';

export const HOT_RETENTION_DAYS = 120;
const MAX_MONTHS_PER_RUN = 12;

export function manifestNeedsArchive(status: string | null | undefined): boolean {
  return status !== 'READY';
}

function monthBounds(period: string): { start: string; end: string } {
  const [yearText, monthText] = period.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function retentionBoundary(now: Date): string {
  const boundary = new Date(now);
  boundary.setUTCDate(boundary.getUTCDate() - HOT_RETENTION_DAYS);
  return boundary.toISOString().slice(0, 10);
}

function eligiblePeriod(day: string, now: Date): string | null {
  const period = day.slice(0, 7);
  const { end } = monthBounds(period);
  return end < retentionBoundary(now) ? period : null;
}

export function eligibleArchivePeriods(
  analyticsDays: string[],
  snapshotDays: string[],
  now: Date,
): string[] {
  return [
    ...new Set(
      [...analyticsDays, ...snapshotDays]
        .map((day) => eligiblePeriod(day, now))
        .filter((period): period is string => period !== null),
    ),
  ].sort();
}

function archiveAnalytics(row: Tables<'analytics_daily'>): ArchiveAnalyticsRow {
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

function archiveSnapshot(row: Tables<'channel_snapshots'>): ArchiveSnapshotRow {
  return {
    snapshotDate: row.snapshot_date,
    observedAt: row.observed_at,
    subscriberCount: row.subscriber_count,
    viewCount: row.view_count,
    videoCount: row.video_count,
  };
}

function masterKey(version: number): string {
  return requiredEnv(`ARCHIVE_MASTER_KEY_V${version}`);
}

async function markManifestError(
  admin: DatabaseClient,
  manifestId: string | undefined,
  code: string,
): Promise<void> {
  if (!manifestId) return;
  await admin
    .from('archive_manifests')
    .update({ status: 'ERROR', last_error_code: code })
    .eq('id', manifestId);
}

export async function archiveEligibleMonths(
  admin: DatabaseClient,
  userId: string,
  channelId: string,
  now = new Date(),
): Promise<{ archived: string[]; configuration: 'ready' | 'missing' }> {
  if (!isR2Configured() || !optionalEnv('ARCHIVE_MASTER_KEY_V1')) {
    return { archived: [], configuration: 'missing' };
  }

  const [analyticsCandidates, snapshotCandidates] = await Promise.all([
    admin
      .from('analytics_daily')
      .select('day')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .lt('day', retentionBoundary(now))
      .order('day'),
    admin
      .from('channel_snapshots')
      .select('snapshot_date')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .lt('snapshot_date', retentionBoundary(now))
      .order('snapshot_date'),
  ]);
  if (analyticsCandidates.error || snapshotCandidates.error) {
    throw new AppError('SUPABASE_ERROR', {
      cause: analyticsCandidates.error ?? snapshotCandidates.error,
    });
  }

  const periods = eligibleArchivePeriods(
    (analyticsCandidates.data ?? []).map((row) => row.day),
    (snapshotCandidates.data ?? []).map((row) => row.snapshot_date),
    now,
  ).slice(0, MAX_MONTHS_PER_RUN);
  const r2 = new R2Store();
  const archived: string[] = [];

  for (const period of periods) {
    const bounds = monthBounds(period);
    const { data: existing } = await admin
      .from('archive_manifests')
      .select('*')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .eq('period_start', bounds.start)
      .eq('period_end', bounds.end)
      .maybeSingle();
    if (!manifestNeedsArchive(existing?.status)) continue;

    let manifestId = existing?.id;
    try {
      const [
        { data: analytics, error: analyticsError },
        { data: snapshots, error: snapshotsError },
      ] = await Promise.all([
        admin
          .from('analytics_daily')
          .select('*')
          .eq('user_id', userId)
          .eq('channel_id', channelId)
          .gte('day', bounds.start)
          .lte('day', bounds.end)
          .order('day'),
        admin
          .from('channel_snapshots')
          .select('*')
          .eq('user_id', userId)
          .eq('channel_id', channelId)
          .gte('snapshot_date', bounds.start)
          .lte('snapshot_date', bounds.end)
          .order('snapshot_date'),
      ]);
      if (analyticsError || snapshotsError) {
        throw new AppError('SUPABASE_ERROR', {
          cause: analyticsError ?? snapshotsError,
        });
      }
      if ((analytics?.length ?? 0) === 0 && (snapshots?.length ?? 0) === 0) continue;

      const payload: ArchivePayload = {
        schemaVersion: 1,
        period,
        analytics: (analytics ?? []).map(archiveAnalytics),
        snapshots: (snapshots ?? []).map(archiveSnapshot),
      };
      const encrypted = await encryptArchive(payload, userId, masterKey(1), 1);
      const objectKey = archiveObjectKey(userId, channelId, period);
      const { data: manifest, error: manifestError } = await admin
        .from('archive_manifests')
        .upsert(
          {
            id: manifestId,
            user_id: userId,
            channel_id: channelId,
            period_start: bounds.start,
            period_end: bounds.end,
            object_key: objectKey,
            format_version: encrypted.formatVersion,
            key_version: encrypted.keyVersion,
            analytics_row_count: payload.analytics.length,
            snapshot_row_count: payload.snapshots.length,
            compressed_size_bytes: encrypted.compressedSize.toString(),
            encrypted_size_bytes: encrypted.encryptedSize.toString(),
            sha256: encrypted.sha256,
            status: 'WRITING',
            last_error_code: null,
          },
          { onConflict: 'user_id,channel_id,period_start,period_end' },
        )
        .select('id')
        .single();
      if (manifestError) throw new AppError('SUPABASE_ERROR', { cause: manifestError });
      manifestId = manifest.id;

      await r2.put(objectKey, encrypted.bytes, encrypted.sha256);
      await admin
        .from('archive_manifests')
        .update({ status: 'UPLOADED' })
        .eq('id', manifestId);
      const head = await r2.head(objectKey);
      if (head.size !== encrypted.encryptedSize || head.sha256 !== encrypted.sha256) {
        throw new AppError('ARCHIVE_CORRUPT');
      }
      const downloaded = await r2.get(objectKey);
      await verifyArchiveChecksum(downloaded.bytes, encrypted.sha256);
      const verified = await decryptArchive(downloaded.bytes, userId, masterKey);
      verifyArchiveRowCounts(
        verified,
        payload.analytics.length,
        payload.snapshots.length,
      );
      await admin
        .from('archive_manifests')
        .update({
          status: 'READY',
          archived_at: now.toISOString(),
          verified_at: now.toISOString(),
        })
        .eq('id', manifestId);

      // Cross-storage safety: deletion happens only after upload, readback, checksum,
      // decrypt, parse, and row-count verification all succeed.
      const [analyticsDelete, snapshotsDelete] = await Promise.all([
        admin
          .from('analytics_daily')
          .delete()
          .eq('user_id', userId)
          .eq('channel_id', channelId)
          .gte('day', bounds.start)
          .lte('day', bounds.end),
        admin
          .from('channel_snapshots')
          .delete()
          .eq('user_id', userId)
          .eq('channel_id', channelId)
          .gte('snapshot_date', bounds.start)
          .lte('snapshot_date', bounds.end),
      ]);
      if (analyticsDelete.error || snapshotsDelete.error) {
        // READY plus duplicate hot data is recoverable; hot rows win on reads.
        archived.push(period);
        continue;
      }
      archived.push(period);
    } catch (error) {
      await markManifestError(
        admin,
        manifestId,
        error instanceof AppError ? error.code : 'SUPABASE_ERROR',
      );
      // Retain every hot row and let a later foreground sync retry maintenance.
    }
  }
  return { archived, configuration: 'ready' };
}
