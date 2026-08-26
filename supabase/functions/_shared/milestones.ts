import type { Tables } from '../../database.types.ts';

type Metric = 'subscribers' | 'views' | 'uploads' | 'watchHours';

export const MILESTONE_TARGETS: Readonly<Record<Metric, readonly number[]>> = {
  subscribers: [
    100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000,
    1_000_000, 2_500_000, 5_000_000, 10_000_000,
  ],
  views: [
    1_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000,
    50_000_000, 100_000_000, 500_000_000, 1_000_000_000,
  ],
  uploads: [1, 10, 25, 50, 100, 250, 500, 1_000],
  watchHours: [100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000],
};

interface ChannelCounts {
  subscriberCount: string | null;
  viewCount: string;
  videoCount: string;
}

export interface MilestoneEvaluationInput {
  userId: string;
  channelId: string;
  previous: ChannelCounts | null;
  current: ChannelCounts;
  previousWatchMinutes: string | number | null;
  currentWatchMinutes: string | number | null;
  observedAt: string;
  existing: Tables<'milestone_states'>[];
  customGoals: Tables<'custom_goals'>[];
}

export interface BackendMilestoneRow {
  id?: string;
  user_id: string;
  channel_id: string;
  metric: Metric;
  target: string;
  status: 'ACHIEVED' | 'NEXT' | 'FUTURE';
  detection_type: 'PREEXISTING' | 'TRACKED_CROSSING' | 'USER_CREATED_ALREADY_COMPLETE';
  detected_at: string | null;
  celebration_seen: boolean;
  custom_goal_id: string | null;
}

function nonWatchValue(counts: ChannelCounts | null, metric: Metric): bigint | null {
  if (!counts) return null;
  if (metric === 'subscribers') {
    return counts.subscriberCount === null ? null : BigInt(counts.subscriberCount);
  }
  if (metric === 'views') return BigInt(counts.viewCount);
  if (metric === 'uploads') return BigInt(counts.videoCount);
  return null;
}

function reached(
  input: MilestoneEvaluationInput,
  metric: Metric,
  target: number,
  previous: boolean,
): boolean | null {
  if (metric === 'watchHours') {
    const raw = previous ? input.previousWatchMinutes : input.currentWatchMinutes;
    if (raw === null) return null;
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes < 0) return null;
    return minutes / 60 >= target;
  }
  const value = nonWatchValue(previous ? input.previous : input.current, metric);
  return value === null ? null : value >= BigInt(target);
}

function existingFor(
  input: MilestoneEvaluationInput,
  metric: Metric,
  target: number,
  customGoalId: string | null,
): Tables<'milestone_states'> | undefined {
  return input.existing.find(
    (state) =>
      state.metric === metric &&
      state.target === target.toString() &&
      state.custom_goal_id === customGoalId,
  );
}

function preserved(state: Tables<'milestone_states'>): BackendMilestoneRow {
  return {
    id: state.id,
    user_id: state.user_id,
    channel_id: state.channel_id,
    metric: state.metric,
    target: state.target,
    status: state.status,
    detection_type: state.detection_type,
    detected_at: state.detected_at,
    celebration_seen: state.celebration_seen,
    custom_goal_id: state.custom_goal_id,
  };
}

export function evaluateBackendMilestones(input: MilestoneEvaluationInput): {
  rows: BackendMilestoneRow[];
  newTrackedCrossings: BackendMilestoneRow[];
} {
  const rows: BackendMilestoneRow[] = [];
  const newTrackedCrossings: BackendMilestoneRow[] = [];

  const evaluate = (
    metric: Metric,
    target: number,
    customGoalId: string | null,
  ): void => {
    const prior = existingFor(input, metric, target, customGoalId);
    const isReached = reached(input, metric, target, false);

    if (prior?.status === 'ACHIEVED') {
      rows.push(preserved(prior));
      return;
    }

    if (isReached !== true) {
      if (customGoalId) {
        rows.push(
          prior
            ? preserved(prior)
            : {
                user_id: input.userId,
                channel_id: input.channelId,
                metric,
                target: target.toString(),
                status: 'NEXT',
                detection_type: 'PREEXISTING',
                detected_at: null,
                celebration_seen: true,
                custom_goal_id: customGoalId,
              },
        );
      }
      return;
    }

    const wasReached = reached(input, metric, target, true);
    const trackedCrossing = prior?.status === 'NEXT' && wasReached === false;
    const detectionType = trackedCrossing
      ? 'TRACKED_CROSSING'
      : customGoalId
        ? 'USER_CREATED_ALREADY_COMPLETE'
        : wasReached === false
          ? 'TRACKED_CROSSING'
          : 'PREEXISTING';
    const row: BackendMilestoneRow = {
      id: prior?.id,
      user_id: input.userId,
      channel_id: input.channelId,
      metric,
      target: target.toString(),
      status: 'ACHIEVED',
      detection_type: detectionType,
      detected_at: detectionType === 'TRACKED_CROSSING' ? input.observedAt : null,
      celebration_seen: detectionType !== 'TRACKED_CROSSING',
      custom_goal_id: customGoalId,
    };
    rows.push(row);
    if (detectionType === 'TRACKED_CROSSING') newTrackedCrossings.push(row);
  };

  (Object.keys(MILESTONE_TARGETS) as Metric[]).forEach((metric) => {
    MILESTONE_TARGETS[metric].forEach((target) => evaluate(metric, target, null));
  });
  input.customGoals.forEach((goal) =>
    evaluate(goal.metric, Number(goal.target), goal.id),
  );

  return { rows, newTrackedCrossings };
}
