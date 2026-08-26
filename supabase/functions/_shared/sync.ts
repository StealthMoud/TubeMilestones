import { z } from 'zod';
import type { Tables } from '../../database.types.ts';
import type { DatabaseClient } from './auth.ts';
import { archiveEligibleMonths } from './archive-maintenance.ts';
import { AppError, asAppError, type ErrorCode } from './errors.ts';
import { refreshGoogleAccessToken } from './google.ts';
import { evaluateBackendMilestones } from './milestones.ts';
import {
  fetchAggregateWatchMinutes,
  fetchDailyAnalytics,
  fetchOwnedChannels,
  type ObservedChannel,
} from './youtube.ts';

export const syncRequestSchema = z.object({
  channelId: z.uuid().nullable().optional(),
  manual: z.boolean().default(true),
});

export const INITIAL_DAILY_BACKFILL_DAYS = 400;

export interface SafeSyncResponse {
  kind: 'READY' | 'CHANNEL_SELECTION_REQUIRED';
  selectedChannelId: string | null;
  channels: Array<{ id: string; title: string; thumbnailUrl: string }>;
  warnings: ErrorCode[];
  newMilestoneIds: string[];
  archive: { archivedPeriods: string[]; configuration: 'ready' | 'missing' };
}

function toDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function recentStart(now: Date, days: number): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return toDate(date);
}

export function initialDailyAnalyticsStart(
  channelPublishedAt: string,
  now: Date,
): string {
  const publishedDate = channelPublishedAt.slice(0, 10);
  const horizon = recentStart(now, INITIAL_DAILY_BACKFILL_DAYS);
  return publishedDate > horizon ? publishedDate : horizon;
}

function observedToInsert(
  userId: string,
  observedAt: string,
  channel: ObservedChannel,
) {
  return {
    user_id: userId,
    youtube_channel_id: channel.youtubeChannelId,
    title: channel.title,
    thumbnail_url: channel.thumbnailUrl,
    published_at: channel.publishedAt,
    subscriber_count: channel.subscriberCount,
    subscriber_count_precision: channel.subscriberCountPrecision,
    hidden_subscriber_count: channel.hiddenSubscriberCount,
    view_count: channel.viewCount,
    video_count: channel.videoCount,
    uploads_playlist_id: channel.uploadsPlaylistId,
    last_observed_at: observedAt,
  };
}

function channelCounts(channel: Tables<'channels'> | ObservedChannel) {
  if ('youtube_channel_id' in channel) {
    return {
      subscriberCount: channel.subscriber_count,
      viewCount: channel.view_count,
      videoCount: channel.video_count,
    };
  }
  return {
    subscriberCount: channel.subscriberCount,
    viewCount: channel.viewCount,
    videoCount: channel.videoCount,
  };
}

async function finishSync(
  admin: DatabaseClient,
  userId: string,
  errorCode: string | null,
): Promise<void> {
  const result = await admin.rpc('finish_youtube_sync', {
    p_user_id: userId,
    p_error_code: errorCode,
  });
  if (result.error) throw new AppError('SUPABASE_ERROR', { cause: result.error });
}

export async function synchronizeUser(
  admin: DatabaseClient,
  userId: string,
  rawInput: unknown,
  now = new Date(),
): Promise<SafeSyncResponse> {
  const input = syncRequestSchema.parse(rawInput);
  const claim = await admin.rpc('claim_youtube_sync', {
    p_user_id: userId,
    p_manual: input.manual,
  });
  if (claim.error) throw new AppError('SUPABASE_ERROR', { cause: claim.error });
  if (claim.data !== 'CLAIMED') {
    throw new AppError(claim.data as ErrorCode);
  }

  try {
    const [{ data: connection, error: connectionError }, credential] =
      await Promise.all([
        admin.from('youtube_connections').select('*').eq('user_id', userId).single(),
        admin.rpc('read_youtube_refresh_token', { p_user_id: userId }),
      ]);
    if (connectionError || credential.error) {
      throw new AppError('SUPABASE_ERROR', {
        cause: connectionError ?? credential.error,
      });
    }
    if (!connection || !credential.data) throw new AppError('YOUTUBE_NOT_CONNECTED');

    const tokens = await refreshGoogleAccessToken(
      credential.data,
      connection.granted_scopes,
    );
    if (tokens.refreshToken) {
      const rotation = await admin.rpc('store_youtube_refresh_token', {
        p_user_id: userId,
        p_refresh_token: tokens.refreshToken,
      });
      if (rotation.error)
        throw new AppError('SUPABASE_ERROR', { cause: rotation.error });
    }
    const authorizationUpdate = await admin
      .from('youtube_connections')
      .update({
        last_authorization_verified_at: now.toISOString(),
        last_verification_attempt_at: now.toISOString(),
        verification_retry_count: 0,
        granted_scopes: tokens.scopes,
      })
      .eq('user_id', userId);
    if (authorizationUpdate.error) {
      throw new AppError('SUPABASE_ERROR', { cause: authorizationUpdate.error });
    }

    const { data: previousChannels, error: previousError } = await admin
      .from('channels')
      .select('*')
      .eq('user_id', userId);
    if (previousError) throw new AppError('SUPABASE_ERROR', { cause: previousError });

    const observedChannels = await fetchOwnedChannels(tokens.accessToken);
    if (observedChannels.length === 0) throw new AppError('YOUTUBE_API_ERROR');
    const { data: storedChannels, error: upsertError } = await admin
      .from('channels')
      .upsert(
        observedChannels.map((channel) =>
          observedToInsert(userId, now.toISOString(), channel),
        ),
        { onConflict: 'user_id,youtube_channel_id' },
      )
      .select('*');
    if (upsertError) throw new AppError('SUPABASE_ERROR', { cause: upsertError });

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (profileError) throw new AppError('SUPABASE_ERROR', { cause: profileError });
    const requestedId = input.channelId ?? profile.selected_channel_id;
    const selected = requestedId
      ? (storedChannels ?? []).find((channel) => channel.id === requestedId)
      : storedChannels?.length === 1
        ? storedChannels[0]
        : undefined;
    if (requestedId && !selected) throw new AppError('FORBIDDEN');
    const safeChannels = (storedChannels ?? []).map((channel) => ({
      id: channel.id,
      title: channel.title,
      thumbnailUrl: channel.thumbnail_url,
    }));
    if (!selected) {
      await finishSync(admin, userId, null);
      return {
        kind: 'CHANNEL_SELECTION_REQUIRED',
        selectedChannelId: null,
        channels: safeChannels,
        warnings: [],
        newMilestoneIds: [],
        archive: { archivedPeriods: [], configuration: 'ready' },
      };
    }

    const previous = (previousChannels ?? []).find(
      (channel) => channel.youtube_channel_id === selected.youtube_channel_id,
    );
    const selectedObserved = observedChannels.find(
      (channel) => channel.youtubeChannelId === selected.youtube_channel_id,
    );
    if (!selectedObserved) throw new AppError('YOUTUBE_API_ERROR');

    const profileUpdate = await admin
      .from('profiles')
      .update({ selected_channel_id: selected.id })
      .eq('user_id', userId);
    if (profileUpdate.error)
      throw new AppError('SUPABASE_ERROR', { cause: profileUpdate.error });

    const snapshot = await admin.from('channel_snapshots').upsert(
      {
        user_id: userId,
        channel_id: selected.id,
        snapshot_date: toDate(now),
        observed_at: now.toISOString(),
        subscriber_count: selected.subscriber_count,
        view_count: selected.view_count,
        video_count: selected.video_count,
      },
      { onConflict: 'user_id,channel_id,snapshot_date' },
    );
    if (snapshot.error) throw new AppError('SUPABASE_ERROR', { cause: snapshot.error });

    const [{ data: existingDaily, error: dailyLookupError }, previousSummaryResult] =
      await Promise.all([
        admin
          .from('analytics_daily')
          .select('day')
          .eq('user_id', userId)
          .eq('channel_id', selected.id)
          .limit(1),
        admin
          .from('analytics_summary')
          .select('*')
          .eq('user_id', userId)
          .eq('channel_id', selected.id)
          .maybeSingle(),
      ]);
    if (dailyLookupError || previousSummaryResult.error) {
      throw new AppError('SUPABASE_ERROR', {
        cause: dailyLookupError ?? previousSummaryResult.error,
      });
    }
    const endDate = toDate(now);
    const dailyStart =
      (existingDaily?.length ?? 0) === 0
        ? initialDailyAnalyticsStart(selected.published_at, now)
        : recentStart(now, 120);

    const [dailyResult, aggregateResult] = await Promise.allSettled([
      fetchDailyAnalytics(tokens.accessToken, dailyStart, endDate),
      fetchAggregateWatchMinutes(
        tokens.accessToken,
        selected.published_at.slice(0, 10),
        endDate,
      ),
    ]);
    const warnings: ErrorCode[] = [];
    if (dailyResult.status === 'fulfilled' && dailyResult.value.length > 0) {
      const dailyUpsert = await admin.from('analytics_daily').upsert(
        dailyResult.value.map((row) => ({
          user_id: userId,
          channel_id: selected.id,
          day: row.day,
          views: row.views,
          estimated_minutes_watched: row.estimatedMinutesWatched,
          subscribers_gained: row.subscribersGained,
          subscribers_lost: row.subscribersLost,
          average_view_duration: row.averageViewDuration,
          average_view_percentage: row.averageViewPercentage,
          fetched_at: now.toISOString(),
        })),
        { onConflict: 'user_id,channel_id,day' },
      );
      if (dailyUpsert.error) {
        throw new AppError('SUPABASE_ERROR', { cause: dailyUpsert.error });
      }
    } else {
      warnings.push('ANALYTICS_UNAVAILABLE');
    }

    let currentWatchMinutes: string | number | null =
      previousSummaryResult.data?.estimated_minutes_watched ?? null;
    if (aggregateResult.status === 'fulfilled') {
      currentWatchMinutes = aggregateResult.value;
      const summary = await admin.from('analytics_summary').upsert({
        user_id: userId,
        channel_id: selected.id,
        requested_start_date: selected.published_at.slice(0, 10),
        requested_end_date: endDate,
        available_through:
          dailyResult.status === 'fulfilled'
            ? (dailyResult.value.at(-1)?.day ?? null)
            : (previousSummaryResult.data?.available_through ?? null),
        estimated_minutes_watched: aggregateResult.value,
        fetched_at: now.toISOString(),
      });
      if (summary.error) throw new AppError('SUPABASE_ERROR', { cause: summary.error });
    } else if (!warnings.includes('ANALYTICS_UNAVAILABLE')) {
      warnings.push('ANALYTICS_UNAVAILABLE');
    }

    const [
      { data: existingMilestones, error: milestonesError },
      { data: goals, error: goalsError },
    ] = await Promise.all([
      admin
        .from('milestone_states')
        .select('*')
        .eq('user_id', userId)
        .eq('channel_id', selected.id),
      admin
        .from('custom_goals')
        .select('*')
        .eq('user_id', userId)
        .eq('channel_id', selected.id),
    ]);
    if (milestonesError || goalsError) {
      throw new AppError('SUPABASE_ERROR', { cause: milestonesError ?? goalsError });
    }
    const evaluation = evaluateBackendMilestones({
      userId,
      channelId: selected.id,
      previous: previous ? channelCounts(previous) : null,
      current: channelCounts(selectedObserved),
      previousWatchMinutes:
        previousSummaryResult.data?.estimated_minutes_watched ?? null,
      currentWatchMinutes,
      observedAt: now.toISOString(),
      existing: existingMilestones ?? [],
      customGoals: goals ?? [],
    });
    const updates = evaluation.rows.filter((row) => row.id);
    const inserts = evaluation.rows.filter((row) => !row.id);
    if (updates.length > 0) {
      const updated = await admin.from('milestone_states').upsert(updates);
      if (updated.error) throw new AppError('SUPABASE_ERROR', { cause: updated.error });
    }
    if (inserts.length > 0) {
      const inserted = await admin.from('milestone_states').insert(inserts);
      if (inserted.error)
        throw new AppError('SUPABASE_ERROR', { cause: inserted.error });
    }

    const archiveResult = await archiveEligibleMonths(admin, userId, selected.id, now);
    await finishSync(admin, userId, null);
    return {
      kind: 'READY',
      selectedChannelId: selected.id,
      channels: safeChannels,
      warnings,
      newMilestoneIds: evaluation.newTrackedCrossings
        .map((row) => row.id)
        .filter((id): id is string => Boolean(id)),
      archive: {
        archivedPeriods: archiveResult.archived,
        configuration: archiveResult.configuration,
      },
    };
  } catch (error) {
    const typed = asAppError(error, 'SUPABASE_ERROR');
    await finishSync(admin, userId, typed.code).catch(() => undefined);
    throw typed;
  }
}
