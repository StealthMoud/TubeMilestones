import type {
  AnalyticsSummary,
  Channel,
  ChannelSnapshot,
  CustomGoal,
  DashboardData,
  MetricType,
  MilestoneState,
} from '../../domain/models';
import { watchMinutesToHours } from '../../domain/analytics/calculations';
import { definitionsFor } from '../../domain/milestones/definitions';
import { evaluateMilestones } from '../../domain/milestones/engine';
import { db, type TubeMilestonesDatabase } from '../../db/db';
import {
  getLatestSnapshot,
  loadSelectedChannelData,
  markAuthorizationVerified,
  saveAnalytics,
  saveChannelObservation,
  saveChannels,
  saveMilestoneStates,
  setSelectedChannel,
} from '../../db/repositories/appRepository';
import { TubeMilestonesError, asTubeMilestonesError } from '../errors';
import {
  analyticsThrough,
  fetchAggregateAnalytics,
  fetchDailyAnalytics,
  recentReportingRange,
  type ReportingRange,
} from '../youtube/analyticsApi';
import { fetchOwnedChannels } from '../youtube/dataApi';

export type SyncStage =
  'CONNECTING' | 'CHANNEL' | 'ANALYTICS' | 'MILESTONES' | 'COMPLETE';

export interface SyncDependencies {
  database: TubeMilestonesDatabase;
  now: () => Date;
  fetchChannels: typeof fetchOwnedChannels;
  fetchDaily: typeof fetchDailyAnalytics;
  fetchAggregate: typeof fetchAggregateAnalytics;
}

export interface SyncOptions {
  selectedChannelId?: string | null;
  signal?: AbortSignal;
  onStage?: (stage: SyncStage) => void;
}

export type SyncResult =
  | {
      kind: 'CHANNEL_SELECTION_REQUIRED';
      channels: Channel[];
    }
  | {
      kind: 'READY';
      data: DashboardData;
      warnings: TubeMilestonesError[];
      newMilestones: MilestoneState[];
    };

const DEFAULT_DEPENDENCIES: SyncDependencies = {
  database: db,
  now: () => new Date(),
  fetchChannels: fetchOwnedChannels,
  fetchDaily: fetchDailyAnalytics,
  fetchAggregate: fetchAggregateAnalytics,
};

export function channelMetricValue(
  channel: Channel,
  analyticsSummary: AnalyticsSummary | null,
  metric: MetricType,
): number | null {
  switch (metric) {
    case 'subscribers':
      return channel.subscriberCount;
    case 'views':
      return channel.viewCount;
    case 'uploads':
      return channel.videoCount;
    case 'watchHours':
      return analyticsSummary
        ? watchMinutesToHours(analyticsSummary.estimatedMinutesWatched)
        : null;
  }
}

function previousMetricValue(
  snapshot: ChannelSnapshot | null,
  summary: AnalyticsSummary | null,
  metric: MetricType,
): number | null {
  if (metric === 'watchHours') {
    return summary ? watchMinutesToHours(summary.estimatedMinutesWatched) : null;
  }
  if (!snapshot) return null;
  switch (metric) {
    case 'subscribers':
      return snapshot.subscriberCount;
    case 'views':
      return snapshot.viewCount;
    case 'uploads':
      return snapshot.videoCount;
  }
}

function milestoneId(
  channelId: string,
  metric: MetricType,
  target: number,
  customGoalId?: string,
): string {
  return customGoalId
    ? `${channelId}:custom:${customGoalId}`
    : `${channelId}:${metric}:${target}`;
}

interface MilestoneBuildInput {
  channel: Channel;
  previousSnapshot: ChannelSnapshot | null;
  previousSummary: AnalyticsSummary | null;
  currentSummary: AnalyticsSummary | null;
  existingStates: MilestoneState[];
  customGoals: CustomGoal[];
  trackingStartedAt: string;
  observedAt: string;
}

function buildMilestoneStates(input: MilestoneBuildInput): {
  states: MilestoneState[];
  newMilestones: MilestoneState[];
} {
  const existing = new Map(input.existingStates.map((state) => [state.id, state]));
  const states: MilestoneState[] = [];
  const newMilestones: MilestoneState[] = [];

  const evaluateMetric = (metric: MetricType, customGoal?: CustomGoal): void => {
    const currentValue = channelMetricValue(
      input.channel,
      input.currentSummary,
      metric,
    );
    const precision =
      metric === 'subscribers' ? input.channel.subscriberCountPrecision : 'EXACT';
    const definitions = customGoal
      ? [
          {
            metric,
            target: customGoal.target,
            isCustom: true,
            title: customGoal.title ?? undefined,
          },
        ]
      : definitionsFor(metric);
    const id = customGoal
      ? milestoneId(input.channel.channelId, metric, customGoal.target, customGoal.id)
      : null;
    const existingCustomState = id ? existing.get(id) : undefined;
    const previousValue = customGoal
      ? existingCustomState?.status === 'NEXT'
        ? previousMetricValue(input.previousSnapshot, input.previousSummary, metric)
        : null
      : previousMetricValue(input.previousSnapshot, input.previousSummary, metric);

    const result = evaluateMilestones({
      previousValue,
      currentValue,
      milestoneDefinitions: definitions,
      trackingStartedAt: input.trackingStartedAt,
      observedAt: input.observedAt,
      precision,
      customGoalCreatedAt: customGoal?.createdAt,
    });

    for (const milestone of result.pastMilestones) {
      const stateId = milestoneId(
        input.channel.channelId,
        milestone.metric,
        milestone.target,
        customGoal?.id,
      );
      const prior = existing.get(stateId);
      if (prior?.status === 'ACHIEVED') {
        states.push(prior);
        continue;
      }

      const state: MilestoneState = {
        id: stateId,
        channelId: input.channel.channelId,
        metric: milestone.metric,
        target: milestone.target,
        status: 'ACHIEVED',
        detectedAt: milestone.detectedAt,
        detectionType: milestone.detectionType,
        celebrationSeen: milestone.detectionType !== 'TRACKED_CROSSING',
      };
      states.push(state);
      if (milestone.detectionType === 'TRACKED_CROSSING') newMilestones.push(state);
    }

    if (customGoal && result.pastMilestones.length === 0) {
      const pendingId = milestoneId(
        input.channel.channelId,
        customGoal.metric,
        customGoal.target,
        customGoal.id,
      );
      states.push(
        existing.get(pendingId) ?? {
          id: pendingId,
          channelId: input.channel.channelId,
          metric: customGoal.metric,
          target: customGoal.target,
          status: 'NEXT',
          detectedAt: null,
          detectionType: 'PREEXISTING',
          celebrationSeen: true,
        },
      );
    }
  };

  (['subscribers', 'views', 'uploads', 'watchHours'] as const).forEach((metric) =>
    evaluateMetric(metric),
  );
  input.customGoals.forEach((goal) => evaluateMetric(goal.metric, goal));

  return {
    states: [...new Map(states.map((state) => [state.id, state])).values()],
    newMilestones,
  };
}

export async function synchronizeTubeMilestones(
  accessToken: string,
  options: SyncOptions = {},
  dependencies: Partial<SyncDependencies> = {},
): Promise<SyncResult> {
  const services = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const observedAt = services.now().toISOString();
  const database = services.database;
  options.onStage?.('CONNECTING');

  options.onStage?.('CHANNEL');
  const channels = await services.fetchChannels(
    accessToken,
    observedAt,
    options.signal,
  );
  if (channels.length === 0) {
    throw new TubeMilestonesError(
      'NO_CHANNEL',
      'No YouTube channel was returned for this account.',
    );
  }
  await saveChannels(channels, database);

  const metadata = await database.metadata.get('app');
  const requestedId = options.selectedChannelId ?? metadata?.selectedChannelId;
  const selected = requestedId
    ? channels.find(({ channelId }) => channelId === requestedId)
    : channels.length === 1
      ? channels[0]
      : undefined;

  if (!selected) {
    return { kind: 'CHANNEL_SELECTION_REQUIRED', channels };
  }

  const [previousSnapshot, previousSummary, existingStates, customGoals] =
    await Promise.all([
      getLatestSnapshot(selected.channelId, database),
      database.analyticsSummary.get(selected.channelId),
      database.milestoneStates.where('channelId').equals(selected.channelId).toArray(),
      database.customGoals.where('channelId').equals(selected.channelId).toArray(),
    ]);

  await saveChannelObservation(
    selected,
    {
      channelId: selected.channelId,
      observedAt,
      subscriberCount: selected.subscriberCount,
      viewCount: selected.viewCount,
      videoCount: selected.videoCount,
    },
    database,
  );
  await setSelectedChannel(selected.channelId, database);
  await markAuthorizationVerified(observedAt, observedAt, database);

  options.onStage?.('ANALYTICS');
  const recentRange = recentReportingRange(services.now(), 365);
  const publishedDate = selected.publishedAt.slice(0, 10);
  const aggregateRange: ReportingRange = {
    startDate: publishedDate,
    endDate: recentRange.endDate,
  };

  const [dailyResult, aggregateResult] = await Promise.allSettled([
    services.fetchDaily(
      accessToken,
      selected.channelId,
      recentRange,
      observedAt,
      options.signal,
    ),
    services.fetchAggregate(
      accessToken,
      selected.channelId,
      aggregateRange,
      null,
      observedAt,
      options.signal,
    ),
  ]);

  const warnings: TubeMilestonesError[] = [];
  const daily = dailyResult.status === 'fulfilled' ? dailyResult.value : [];
  if (dailyResult.status === 'rejected') {
    warnings.push(asTubeMilestonesError(dailyResult.reason));
  } else if (daily.length === 0) {
    warnings.push(
      new TubeMilestonesError('ANALYTICS_EMPTY', 'YouTube returned no Analytics rows.'),
    );
  }

  let summary = aggregateResult.status === 'fulfilled' ? aggregateResult.value : null;
  if (aggregateResult.status === 'rejected') {
    warnings.push(asTubeMilestonesError(aggregateResult.reason));
  }
  if (summary) summary = { ...summary, availableThrough: analyticsThrough(daily) };
  await saveAnalytics(daily, summary, database);

  options.onStage?.('MILESTONES');
  const milestoneBuild = buildMilestoneStates({
    channel: selected,
    previousSnapshot,
    previousSummary: previousSummary ?? null,
    currentSummary: summary ?? previousSummary ?? null,
    existingStates,
    customGoals,
    trackingStartedAt: metadata?.trackingStartedAt ?? observedAt,
    observedAt,
  });
  await saveMilestoneStates(milestoneBuild.states, database);

  const stored = await loadSelectedChannelData(database);
  if (!stored) {
    throw new TubeMilestonesError(
      'API_ERROR',
      'Synchronized channel data could not be loaded from IndexedDB.',
    );
  }

  options.onStage?.('COMPLETE');
  return {
    kind: 'READY',
    data: stored,
    warnings,
    newMilestones: milestoneBuild.newMilestones,
  };
}
