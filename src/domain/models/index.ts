export type MetricType = 'subscribers' | 'views' | 'uploads' | 'watchHours';

export type AnalyticsMetric = 'views' | 'subscribers' | 'watchHours';

export type MetricSource =
  'YOUTUBE_DATA_API' | 'YOUTUBE_ANALYTICS_API' | 'USER_ENTERED';

export type SubscriberPrecision =
  'EXACT' | 'ROUNDED_THREE_SIGNIFICANT_FIGURES' | 'HIDDEN';

export interface Channel {
  channelId: string;
  youtubeChannelId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  subscriberCount: number | null;
  subscriberCountPrecision: SubscriberPrecision;
  hiddenSubscriberCount: boolean;
  viewCount: number;
  videoCount: number;
  uploadsPlaylistId: string;
  updatedAt: string;
}

export interface ChannelSnapshot {
  id?: number;
  channelId: string;
  observedAt: string;
  subscriberCount: number | null;
  viewCount: number;
  videoCount: number;
}

export interface DailyAnalytics {
  channelId: string;
  day: string;
  views: number;
  estimatedMinutesWatched: number;
  subscribersGained: number;
  subscribersLost: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  fetchedAt: string;
}

export interface AnalyticsSummary {
  channelId: string;
  requestedStartDate: string;
  requestedEndDate: string;
  availableThrough: string | null;
  estimatedMinutesWatched: number;
  fetchedAt: string;
}

export type MilestoneDetectionType =
  'PREEXISTING' | 'TRACKED_CROSSING' | 'USER_CREATED_ALREADY_COMPLETE';

export type MilestoneStatus = 'ACHIEVED' | 'NEXT' | 'FUTURE';

export interface MilestoneDefinition {
  metric: MetricType;
  target: number;
  isCustom?: boolean;
  title?: string;
}

export interface MilestoneState {
  id: string;
  channelId: string;
  metric: MetricType;
  target: number;
  status: MilestoneStatus;
  detectedAt: string | null;
  detectionType: MilestoneDetectionType;
  celebrationSeen: boolean;
  customGoalId?: string | null;
}

export interface CustomGoal {
  id: string;
  channelId: string;
  metric: MetricType;
  target: number;
  title: string | null;
  createdAt: string;
  targetDate: string | null;
}

export interface ManualMetrics {
  channelId: string;
  qualifiedPublicWatchHours: number | null;
  qualifiedShortsViews: number | null;
  updatedAt: string;
}

export type ThemePreference = 'system' | 'dark' | 'light';

export interface AppMetadata {
  key: 'app';
  selectedChannelId: string | null;
  trackingStartedAt: string | null;
  authorizationVerifiedAt: string | null;
  schemaVersion: number;
  themePreference: ThemePreference;
}

export interface RecentMovement {
  views: number;
  estimatedMinutesWatched: number;
  watchHours: number;
  subscribersGained: number;
  subscribersLost: number;
  netSubscribers: number;
  availableThrough: string | null;
}

export interface DashboardData {
  channel: Channel;
  snapshots: ChannelSnapshot[];
  analyticsDaily: DailyAnalytics[];
  analyticsSummary: AnalyticsSummary | null;
  milestoneStates: MilestoneState[];
  customGoals: CustomGoal[];
  manualMetrics: ManualMetrics | null;
  metadata: AppMetadata;
}
