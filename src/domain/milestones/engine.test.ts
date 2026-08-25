import type { MilestoneDefinition } from '../models';
import { evaluateMilestones, normalizeMilestoneDefinitions } from './engine';

const trackingStartedAt = '2026-08-01T10:00:00.000Z';
const observedAt = '2026-08-26T12:00:00.000Z';

const subscribers: MilestoneDefinition[] = [100, 500, 1_000, 2_500].map((target) => ({
  metric: 'subscribers',
  target,
}));

function evaluate(
  previousValue: number | null,
  currentValue: number | null,
  milestoneDefinitions: MilestoneDefinition[] = subscribers,
) {
  return evaluateMilestones({
    previousValue,
    currentValue,
    milestoneDefinitions,
    trackingStartedAt,
    observedAt,
  });
}

describe('evaluateMilestones', () => {
  it('handles zero', () => {
    const result = evaluate(0, 0);
    expect(result.pastMilestones).toHaveLength(0);
    expect(result.nextMilestone?.target).toBe(100);
    expect(result.progress).toBe(0);
    expect(result.remaining).toBe(100);
  });

  it('calculates progress below the first target', () => {
    const result = evaluate(20, 50);
    expect(result.progress).toBe(0.5);
    expect(result.remaining).toBe(50);
  });

  it('marks an exact milestone achieved and starts the next segment', () => {
    const result = evaluate(99, 100);
    expect(result.currentMilestone?.target).toBe(100);
    expect(result.nextMilestone?.target).toBe(500);
    expect(result.progress).toBe(0);
    expect(result.newCrossings.map(({ target }) => target)).toEqual([100]);
  });

  it('handles one unit above a milestone', () => {
    const result = evaluate(100, 101);
    expect(result.progress).toBeCloseTo(1 / 400);
    expect(result.remaining).toBe(399);
  });

  it('uses exact segment progress between milestones', () => {
    const result = evaluate(700, 750);
    expect(result.currentMilestone?.target).toBe(500);
    expect(result.nextMilestone?.target).toBe(1_000);
    expect(result.progress).toBe(0.5);
    expect(result.remaining).toBe(250);
  });

  it('detects multiple crossings between observations', () => {
    const result = evaluate(90, 550);
    expect(result.newCrossings.map(({ target }) => target)).toEqual([100, 500]);
    expect(
      result.newCrossings.every(({ detectedAt }) => detectedAt === observedAt),
    ).toBe(true);
  });

  it('does not celebrate milestones that predate first tracking', () => {
    const result = evaluate(null, 1_200);
    expect(result.newCrossings).toHaveLength(0);
    expect(result.pastMilestones.map(({ detectionType }) => detectionType)).toEqual([
      'PREEXISTING',
      'PREEXISTING',
      'PREEXISTING',
    ]);
    expect(result.pastMilestones.every(({ detectedAt }) => detectedAt === null)).toBe(
      true,
    );
  });

  it('records a future tracked crossing as first observed', () => {
    const result = evaluate(480, 510);
    expect(result.newCrossings).toEqual([
      expect.objectContaining({
        target: 500,
        detectionType: 'TRACKED_CROSSING',
        detectedAt: observedAt,
      }),
    ]);
  });

  it('marks a custom goal created already complete without celebrating it', () => {
    const result = evaluateMilestones({
      previousValue: null,
      currentValue: 800,
      milestoneDefinitions: [{ metric: 'subscribers', target: 750, isCustom: true }],
      trackingStartedAt,
      observedAt,
      customGoalCreatedAt: observedAt,
    });

    expect(result.pastMilestones[0]?.detectionType).toBe(
      'USER_CREATED_ALREADY_COMPLETE',
    );
    expect(result.newCrossings).toHaveLength(0);
  });

  it('tracks a custom goal crossed after creation', () => {
    const result = evaluateMilestones({
      previousValue: 700,
      currentValue: 800,
      milestoneDefinitions: [{ metric: 'subscribers', target: 750, isCustom: true }],
      trackingStartedAt,
      observedAt,
      customGoalCreatedAt: trackingStartedAt,
    });

    expect(result.newCrossings[0]?.detectionType).toBe('TRACKED_CROSSING');
  });

  it('supports large values without losing the next target', () => {
    const result = evaluate(999_000, 1_230_000, [
      { metric: 'subscribers', target: 1_000_000 },
      { metric: 'subscribers', target: 2_500_000 },
    ]);
    expect(result.currentMilestone?.target).toBe(1_000_000);
    expect(result.nextMilestone?.target).toBe(2_500_000);
  });

  it('passes subscriber rounding precision through to consumers', () => {
    const result = evaluateMilestones({
      previousValue: 12_200,
      currentValue: 12_300,
      milestoneDefinitions: [{ metric: 'subscribers', target: 25_000 }],
      trackingStartedAt,
      observedAt,
      precision: 'ROUNDED_THREE_SIGNIFICANT_FIGURES',
    });
    expect(result.precision).toBe('ROUNDED_THREE_SIGNIFICANT_FIGURES');
  });

  it('does not calculate subscriber milestones when the count is hidden', () => {
    const result = evaluateMilestones({
      previousValue: null,
      currentValue: null,
      milestoneDefinitions: subscribers,
      trackingStartedAt,
      observedAt,
      precision: 'HIDDEN',
    });
    expect(result.nextMilestone).toBeNull();
    expect(result.progress).toBeNull();
    expect(result.remaining).toBeNull();
  });

  it('does not invent crossings when a metric decreases', () => {
    const result = evaluate(520, 490);
    expect(result.newCrossings).toHaveLength(0);
    expect(result.nextMilestone?.target).toBe(500);
  });

  it('returns complete progress beyond the final target', () => {
    const result = evaluate(2_400, 3_000);
    expect(result.nextMilestone).toBeNull();
    expect(result.progress).toBe(1);
    expect(result.remaining).toBe(0);
  });

  it('rejects invalid targets', () => {
    expect(() => evaluate(0, 1, [{ metric: 'subscribers', target: 0 }])).toThrow(
      RangeError,
    );
  });

  it('deduplicates repeated milestone targets', () => {
    const normalized = normalizeMilestoneDefinitions([
      { metric: 'views', target: 1_000 },
      { metric: 'views', target: 1_000 },
      { metric: 'views', target: 10_000 },
    ]);
    expect(normalized.map(({ target }) => target)).toEqual([1_000, 10_000]);
  });

  it('rejects invalid observed values', () => {
    expect(() => evaluate(0, Number.NaN)).toThrow(RangeError);
    expect(() => evaluate(-1, 1)).toThrow(RangeError);
  });
});
