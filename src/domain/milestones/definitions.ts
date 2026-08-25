import type { MetricType, MilestoneDefinition } from '../models';

export const MILESTONE_TARGETS: Readonly<Record<MetricType, readonly number[]>> = {
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

export function definitionsFor(metric: MetricType): MilestoneDefinition[] {
  return MILESTONE_TARGETS[metric].map((target) => ({ metric, target }));
}
