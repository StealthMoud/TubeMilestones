import Dexie, { type Table } from 'dexie';
import type {
  AnalyticsSummary,
  AppMetadata,
  Channel,
  ChannelSnapshot,
  CustomGoal,
  DailyAnalytics,
  ManualMetrics,
  MilestoneState,
} from './schema';
import { DATABASE_NAME } from './schema';

export class TubeMilestonesDatabase extends Dexie {
  channels!: Table<Channel, string>;
  channelSnapshots!: Table<ChannelSnapshot, number>;
  analyticsDaily!: Table<DailyAnalytics, [string, string]>;
  analyticsSummary!: Table<AnalyticsSummary, string>;
  milestoneStates!: Table<MilestoneState, string>;
  customGoals!: Table<CustomGoal, string>;
  manualMetrics!: Table<ManualMetrics, string>;
  metadata!: Table<AppMetadata, 'app'>;

  constructor(name = DATABASE_NAME) {
    super(name);

    this.version(1).stores({
      channels: '&channelId, updatedAt',
      channelSnapshots: '++id, channelId, observedAt, [channelId+observedAt]',
      analyticsDaily: '&[channelId+day], channelId, day, fetchedAt',
      analyticsSummary: '&channelId, fetchedAt',
      milestoneStates: '&id, channelId, metric, target, [channelId+metric]',
      customGoals: '&id, channelId, metric, createdAt',
      manualMetrics: '&channelId, updatedAt',
      metadata: '&key',
    });
  }
}

export const db = new TubeMilestonesDatabase();
