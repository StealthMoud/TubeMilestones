import type { Tables } from '../../../supabase/database.types';
import type {
  AnalyticsSummary,
  Channel,
  ChannelSnapshot,
  CustomGoal,
  DailyAnalytics,
  DashboardData,
  ManualMetrics,
  MilestoneState,
} from '../../domain/models';
import { TubeMilestonesError } from '../errors';
import { requireSupabaseClient } from './client';

export type Connection = Tables<'youtube_connections'>;
export type Profile = Tables<'profiles'>;

export interface CloudAccountState {
  profile: Profile;
  connections: Connection[];
  selectedConnection: Connection | null;
  channels: Channel[];
  dashboard: DashboardData | null;
}

export function safeNumericValue(value: string | number, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(number)) {
    throw new TubeMilestonesError(
      'PRECISION_UNSUPPORTED',
      `${field} cannot be represented safely.`,
    );
  }
  return number;
}

function safeDecimalValue(value: string | number, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TubeMilestonesError('PRECISION_UNSUPPORTED', `${field} is invalid.`);
  }
  return number;
}

function safeTargetValue(value: string | number, field: string): number {
  const number = safeDecimalValue(value, field);
  if (number > Number.MAX_SAFE_INTEGER) {
    throw new TubeMilestonesError(
      'PRECISION_UNSUPPORTED',
      `${field} cannot be represented safely.`,
    );
  }
  return number;
}

function mapChannel(row: Tables<'channels'>): Channel {
  return {
    channelId: row.id,
    connectionId: row.connection_id,
    youtubeChannelId: row.youtube_channel_id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at,
    subscriberCount:
      row.subscriber_count === null
        ? null
        : safeNumericValue(row.subscriber_count, 'subscriber count'),
    subscriberCountPrecision: row.subscriber_count_precision,
    hiddenSubscriberCount: row.hidden_subscriber_count,
    viewCount: safeNumericValue(row.view_count, 'view count'),
    videoCount: safeNumericValue(row.video_count, 'video count'),
    uploadsPlaylistId: row.uploads_playlist_id,
    updatedAt: row.last_observed_at,
  };
}

function mapDaily(row: Tables<'analytics_daily'>): DailyAnalytics {
  return {
    channelId: row.channel_id,
    day: row.day,
    views: safeNumericValue(row.views, 'daily views'),
    estimatedMinutesWatched: safeDecimalValue(
      row.estimated_minutes_watched,
      'watch minutes',
    ),
    subscribersGained: safeNumericValue(row.subscribers_gained, 'subscribers gained'),
    subscribersLost: safeNumericValue(row.subscribers_lost, 'subscribers lost'),
    averageViewDuration: safeDecimalValue(row.average_view_duration, 'view duration'),
    averageViewPercentage: safeDecimalValue(
      row.average_view_percentage,
      'view percentage',
    ),
    fetchedAt: row.fetched_at,
  };
}

function mapSnapshot(row: Tables<'channel_snapshots'>): ChannelSnapshot {
  return {
    channelId: row.channel_id,
    observedAt: row.observed_at,
    subscriberCount:
      row.subscriber_count === null
        ? null
        : safeNumericValue(row.subscriber_count, 'snapshot subscribers'),
    viewCount: safeNumericValue(row.view_count, 'snapshot views'),
    videoCount: safeNumericValue(row.video_count, 'snapshot videos'),
  };
}

function mapSummary(row: Tables<'analytics_summary'> | null): AnalyticsSummary | null {
  return row
    ? {
        channelId: row.channel_id,
        requestedStartDate: row.requested_start_date,
        requestedEndDate: row.requested_end_date,
        availableThrough: row.available_through,
        estimatedMinutesWatched: safeDecimalValue(
          row.estimated_minutes_watched,
          'summary watch minutes',
        ),
        fetchedAt: row.fetched_at,
      }
    : null;
}

function mapMilestone(row: Tables<'milestone_states'>): MilestoneState {
  return {
    id: row.id,
    channelId: row.channel_id,
    metric: row.metric,
    target: safeTargetValue(row.target, 'milestone target'),
    status: row.status,
    detectedAt: row.detected_at,
    detectionType: row.detection_type,
    celebrationSeen: row.celebration_seen,
    customGoalId: row.custom_goal_id,
  };
}

function mapGoal(row: Tables<'custom_goals'>): CustomGoal {
  return {
    id: row.id,
    channelId: row.channel_id,
    metric: row.metric,
    target: safeTargetValue(row.target, 'goal target'),
    title: row.title,
    createdAt: row.created_at,
    targetDate: row.target_date,
  };
}

function mapManual(row: Tables<'manual_metrics'> | null): ManualMetrics | null {
  return row
    ? {
        channelId: row.channel_id,
        qualifiedPublicWatchHours:
          row.qualified_public_watch_hours === null
            ? null
            : safeDecimalValue(row.qualified_public_watch_hours, 'manual watch hours'),
        qualifiedShortsViews:
          row.qualified_shorts_views === null
            ? null
            : safeNumericValue(row.qualified_shorts_views, 'manual Shorts views'),
        updatedAt: row.updated_at,
      }
    : null;
}

function assertNoError(error: unknown): void {
  if (error) {
    throw new TubeMilestonesError('SUPABASE_ERROR', 'Cloud data failed.', {
      cause: error,
    });
  }
}

export async function loadCloudDashboard(userId: string): Promise<CloudAccountState> {
  const client = requireSupabaseClient();
  const [profileResult, connectionsResult, channelsResult] = await Promise.all([
    client.from('profiles').select('*').eq('user_id', userId).single(),
    client
      .from('youtube_connections')
      .select('*')
      .eq('user_id', userId)
      .order('connected_at'),
    client.from('channels').select('*').eq('user_id', userId).order('title'),
  ]);
  assertNoError(profileResult.error);
  assertNoError(connectionsResult.error);
  assertNoError(channelsResult.error);
  if (!profileResult.data) {
    throw new TubeMilestonesError('SUPABASE_ERROR', 'Profile data is unavailable.');
  }
  const rows = channelsResult.data ?? [];
  const channels = rows.map(mapChannel);
  const connections = connectionsResult.data ?? [];
  const selectedId = profileResult.data.selected_channel_id;
  const selectedRow = selectedId
    ? rows.find(({ id }) => id === selectedId)
    : rows.length === 1
      ? rows[0]
      : undefined;
  const selectedConnection = selectedRow
    ? (connections.find(({ id }) => id === selectedRow.connection_id) ?? null)
    : null;
  if (
    !selectedRow ||
    !selectedConnection ||
    selectedConnection.status === 'DELETION_PENDING'
  ) {
    return {
      profile: profileResult.data,
      connections,
      selectedConnection,
      channels,
      dashboard: null,
    };
  }

  const [snapshots, daily, summary, milestones, goals, manual] = await Promise.all([
    client
      .from('channel_snapshots')
      .select('*')
      .eq('channel_id', selectedRow.id)
      .order('snapshot_date'),
    client
      .from('analytics_daily')
      .select('*')
      .eq('channel_id', selectedRow.id)
      .order('day'),
    client
      .from('analytics_summary')
      .select('*')
      .eq('channel_id', selectedRow.id)
      .maybeSingle(),
    client.from('milestone_states').select('*').eq('channel_id', selectedRow.id),
    client
      .from('custom_goals')
      .select('*')
      .eq('channel_id', selectedRow.id)
      .order('created_at'),
    client
      .from('manual_metrics')
      .select('*')
      .eq('channel_id', selectedRow.id)
      .maybeSingle(),
  ]);
  [snapshots, daily, summary, milestones, goals, manual].forEach(({ error }) =>
    assertNoError(error),
  );
  const snapshotRows = snapshots.data ?? [];
  return {
    profile: profileResult.data,
    connections,
    selectedConnection,
    channels,
    dashboard: {
      channel: mapChannel(selectedRow),
      snapshots: snapshotRows.map(mapSnapshot),
      analyticsDaily: (daily.data ?? []).map(mapDaily),
      analyticsSummary: mapSummary(summary.data),
      milestoneStates: (milestones.data ?? []).map(mapMilestone),
      customGoals: (goals.data ?? []).map(mapGoal),
      manualMetrics: mapManual(manual.data),
      metadata: {
        key: 'app',
        selectedChannelId: selectedRow.id,
        trackingStartedAt:
          snapshotRows[0]?.observed_at ??
          selectedConnection.connected_at ??
          selectedRow.created_at,
        authorizationVerifiedAt: selectedConnection.last_authorization_verified_at,
        schemaVersion: 2,
        themePreference: profileResult.data.theme,
      },
    },
  };
}
