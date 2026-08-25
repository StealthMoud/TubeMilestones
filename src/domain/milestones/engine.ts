import type {
  MilestoneDefinition,
  MilestoneDetectionType,
  SubscriberPrecision,
} from '../models';

export interface EvaluatedMilestone extends MilestoneDefinition {
  detectionType: MilestoneDetectionType;
  detectedAt: string | null;
}

export interface MilestoneEngineInput {
  previousValue: number | null;
  currentValue: number | null;
  milestoneDefinitions: readonly MilestoneDefinition[];
  trackingStartedAt: string;
  observedAt: string;
  precision?: SubscriberPrecision;
  customGoalCreatedAt?: string;
}

export interface MilestoneEngineResult {
  pastMilestones: EvaluatedMilestone[];
  currentMilestone: MilestoneDefinition | null;
  nextMilestone: MilestoneDefinition | null;
  newCrossings: EvaluatedMilestone[];
  progress: number | null;
  remaining: number | null;
  precision: SubscriberPrecision;
}

function assertValue(value: number | null, label: string): void {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new RangeError(`${label} must be null or a finite non-negative number.`);
  }
}

export function normalizeMilestoneDefinitions(
  definitions: readonly MilestoneDefinition[],
): MilestoneDefinition[] {
  const seen = new Set<string>();

  return [...definitions]
    .map((definition) => {
      if (!Number.isFinite(definition.target) || definition.target <= 0) {
        throw new RangeError('Milestone targets must be finite positive numbers.');
      }
      return { ...definition };
    })
    .sort((left, right) => left.target - right.target)
    .filter((definition) => {
      const key = `${definition.metric}:${definition.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function evaluateMilestones({
  previousValue,
  currentValue,
  milestoneDefinitions,
  trackingStartedAt,
  observedAt,
  precision = 'EXACT',
  customGoalCreatedAt,
}: MilestoneEngineInput): MilestoneEngineResult {
  assertValue(previousValue, 'previousValue');
  assertValue(currentValue, 'currentValue');
  if (!trackingStartedAt) {
    throw new RangeError('trackingStartedAt is required.');
  }
  if (!observedAt) {
    throw new RangeError('observedAt is required.');
  }

  const definitions = normalizeMilestoneDefinitions(milestoneDefinitions);
  const unusable = currentValue === null || precision === 'HIDDEN';

  if (unusable) {
    return {
      pastMilestones: [],
      currentMilestone: null,
      nextMilestone: null,
      newCrossings: [],
      progress: null,
      remaining: null,
      precision,
    };
  }

  const isFirstObservation = previousValue === null;
  const pastDefinitions = definitions.filter(
    (definition) => definition.target <= currentValue,
  );
  const currentMilestone = pastDefinitions.at(-1) ?? null;
  const nextMilestone = definitions.find(
    (definition) => definition.target > currentValue,
  );

  const pastMilestones = pastDefinitions.map((definition): EvaluatedMilestone => {
    const alreadyCompleteCustomGoal =
      definition.isCustom && customGoalCreatedAt !== undefined && isFirstObservation;
    const trackedCrossing =
      previousValue !== null &&
      definition.target > previousValue &&
      definition.target <= currentValue;

    if (trackedCrossing) {
      return {
        ...definition,
        detectionType: 'TRACKED_CROSSING',
        detectedAt: observedAt,
      };
    }

    return {
      ...definition,
      detectionType: alreadyCompleteCustomGoal
        ? 'USER_CREATED_ALREADY_COMPLETE'
        : 'PREEXISTING',
      detectedAt: null,
    };
  });

  const newCrossings = isFirstObservation
    ? []
    : pastMilestones.filter(
        (milestone) => milestone.detectionType === 'TRACKED_CROSSING',
      );

  const previousTarget = currentMilestone?.target ?? 0;
  const nextTarget = nextMilestone?.target ?? null;
  const progress =
    nextTarget === null
      ? 1
      : clamp((currentValue - previousTarget) / (nextTarget - previousTarget));

  return {
    pastMilestones,
    currentMilestone,
    nextMilestone: nextMilestone ?? null,
    newCrossings,
    progress,
    remaining: nextTarget === null ? 0 : Math.max(0, nextTarget - currentValue),
    precision,
  };
}

export function trackingReferenceDate(input: MilestoneEngineInput): string {
  return input.customGoalCreatedAt ?? input.trackingStartedAt;
}
