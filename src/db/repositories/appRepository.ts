import type { ThemePreference } from '../../domain/models';
import type {
  AnalyticsSummary,
  AppMetadata,
  Channel,
  ChannelSnapshot,
  CustomGoal,
  DailyAnalytics,
  ManualMetrics,
  MilestoneState,
} from '../schema';
import { db, type TubeMilestonesDatabase } from '../db';

const DAY_MS = 24 * 60 * 60 * 1_000;
export const AUTHORIZATION_MAX_AGE_MS = 30 * DAY_MS;

export const DEFAULT_METADATA: AppMetadata = {
  key: 'app',
  selectedChannelId: null,
  trackingStartedAt: null,
  authorizationVerifiedAt: null,
  schemaVersion: 1,
  themePreference: 'system',
};

export type AuthorizationCacheStatus = 'none' | 'valid' | 'stale';

export async function ensureMetadata(
  database: TubeMilestonesDatabase = db,
): Promise<AppMetadata> {
  const existing = await database.metadata.get('app');
  if (existing) return existing;
  await database.metadata.put(DEFAULT_METADATA);
  return { ...DEFAULT_METADATA };
}

export function authorizationCacheStatus(
  metadata: AppMetadata,
  now = Date.now(),
): AuthorizationCacheStatus {
  if (!metadata.authorizationVerifiedAt) return 'none';
  const verifiedAt = Date.parse(metadata.authorizationVerifiedAt);
  if (!Number.isFinite(verifiedAt)) return 'stale';
  return now - verifiedAt < AUTHORIZATION_MAX_AGE_MS ? 'valid' : 'stale';
}

export async function setSelectedChannel(
  channelId: string | null,
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  const metadata = await ensureMetadata(database);
  await database.metadata.put({ ...metadata, selectedChannelId: channelId });
}

export async function setThemePreference(
  themePreference: ThemePreference,
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  const metadata = await ensureMetadata(database);
  await database.metadata.put({ ...metadata, themePreference });
}

export async function markAuthorizationVerified(
  verifiedAt: string,
  trackingStartedAt: string,
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  const metadata = await ensureMetadata(database);
  await database.metadata.put({
    ...metadata,
    authorizationVerifiedAt: verifiedAt,
    trackingStartedAt: metadata.trackingStartedAt ?? trackingStartedAt,
  });
}

export async function saveChannels(
  channels: readonly Channel[],
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  await database.channels.bulkPut([...channels]);
}

export async function getLatestSnapshot(
  channelId: string,
  database: TubeMilestonesDatabase = db,
): Promise<ChannelSnapshot | null> {
  const snapshots = await database.channelSnapshots
    .where('channelId')
    .equals(channelId)
    .sortBy('observedAt');
  return snapshots.at(-1) ?? null;
}

export async function saveChannelObservation(
  channel: Channel,
  snapshot: ChannelSnapshot,
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  await database.transaction(
    'rw',
    database.channels,
    database.channelSnapshots,
    async () => {
      await database.channels.put(channel);
      await database.channelSnapshots.add(snapshot);
    },
  );
}

export async function saveAnalytics(
  daily: readonly DailyAnalytics[],
  summary: AnalyticsSummary | null,
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  await database.transaction(
    'rw',
    database.analyticsDaily,
    database.analyticsSummary,
    async () => {
      if (daily.length > 0) await database.analyticsDaily.bulkPut([...daily]);
      if (summary) await database.analyticsSummary.put(summary);
    },
  );
}

export async function saveMilestoneStates(
  states: readonly MilestoneState[],
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  if (states.length === 0) return;
  await database.milestoneStates.bulkPut([...states]);
}

export async function markCelebrationSeen(
  id: string,
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  await database.milestoneStates.update(id, { celebrationSeen: true });
}

export async function saveCustomGoal(
  goal: CustomGoal,
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  if (!Number.isFinite(goal.target) || goal.target <= 0) {
    throw new RangeError('Custom goal target must be a finite positive number.');
  }
  await database.customGoals.put(goal);
}

export async function deleteCustomGoal(
  goalId: string,
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  await database.customGoals.delete(goalId);
}

export async function saveManualMetrics(
  metrics: ManualMetrics,
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  const values = [metrics.qualifiedPublicWatchHours, metrics.qualifiedShortsViews];
  if (
    values.some((value) => value !== null && (!Number.isFinite(value) || value < 0))
  ) {
    throw new RangeError('Manual metrics must be finite non-negative numbers.');
  }
  await database.manualMetrics.put(metrics);
}

export interface StoredChannelData {
  channel: Channel;
  snapshots: ChannelSnapshot[];
  analyticsDaily: DailyAnalytics[];
  analyticsSummary: AnalyticsSummary | null;
  milestoneStates: MilestoneState[];
  customGoals: CustomGoal[];
  manualMetrics: ManualMetrics | null;
  metadata: AppMetadata;
}

export async function loadSelectedChannelData(
  database: TubeMilestonesDatabase = db,
): Promise<StoredChannelData | null> {
  const metadata = await ensureMetadata(database);
  const channelId = metadata.selectedChannelId;
  if (!channelId) return null;
  const channel = await database.channels.get(channelId);
  if (!channel) return null;

  const [
    snapshots,
    analyticsDaily,
    analyticsSummary,
    milestoneStates,
    customGoals,
    manualMetrics,
  ] = await Promise.all([
    database.channelSnapshots.where('channelId').equals(channelId).sortBy('observedAt'),
    database.analyticsDaily.where('channelId').equals(channelId).sortBy('day'),
    database.analyticsSummary.get(channelId),
    database.milestoneStates.where('channelId').equals(channelId).toArray(),
    database.customGoals.where('channelId').equals(channelId).sortBy('createdAt'),
    database.manualMetrics.get(channelId),
  ]);

  return {
    channel,
    snapshots,
    analyticsDaily,
    analyticsSummary: analyticsSummary ?? null,
    milestoneStates,
    customGoals,
    manualMetrics: manualMetrics ?? null,
    metadata,
  };
}

export async function loadChannels(
  database: TubeMilestonesDatabase = db,
): Promise<Channel[]> {
  return database.channels.orderBy('title').toArray();
}

export async function clearAuthorizedData(
  database: TubeMilestonesDatabase = db,
): Promise<void> {
  const metadata = await ensureMetadata(database);
  await database.transaction(
    'rw',
    [
      database.channels,
      database.channelSnapshots,
      database.analyticsDaily,
      database.analyticsSummary,
      database.milestoneStates,
      database.customGoals,
      database.manualMetrics,
      database.metadata,
    ],
    async () => {
      await Promise.all([
        database.channels.clear(),
        database.channelSnapshots.clear(),
        database.analyticsDaily.clear(),
        database.analyticsSummary.clear(),
        database.milestoneStates.clear(),
        database.customGoals.clear(),
        database.manualMetrics.clear(),
      ]);
      await database.metadata.put({
        ...DEFAULT_METADATA,
        themePreference: metadata.themePreference,
      });
    },
  );
}
