import type {
  AnalyticsSummary,
  Channel,
  CustomGoal,
  DailyAnalytics,
  DashboardData,
  MetricType,
  MilestoneState,
} from '../domain/models';
import { definitionsFor } from '../domain/milestones/definitions';
import { parseReportingDay, toReportingDay } from '../domain/metrics/dates';

export type DemoFixtureName =
  'small' | 'growing' | 'large' | 'hidden' | 'no-analytics' | 'new';

export type DemoScenarioName =
  | 'unconnected'
  | 'reauth'
  | 'deletion-pending'
  | 'api-error'
  | 'archive'
  | 'archive-partial'
  | 'auth'
  | 'password-recovery';

const DEMO_NOW = '2026-08-25T18:00:00.000Z';
const ANALYTICS_THROUGH = '2026-08-24';

interface FixtureDefinition {
  title: string;
  subscriberCount: number | null;
  hiddenSubscriberCount?: boolean;
  viewCount: number;
  videoCount: number;
  analytics?: boolean;
  analyticsDays?: number;
  analyticsScale?: number;
}

const FIXTURES: Record<DemoFixtureName, FixtureDefinition> = {
  small: {
    title: 'Northstar Frames',
    subscriberCount: 742,
    viewCount: 48_200,
    videoCount: 23,
    analytics: true,
    analyticsScale: 1,
  },
  growing: {
    title: 'Fieldcraft Cinema',
    subscriberCount: 12_300,
    viewCount: 1_823_400,
    videoCount: 86,
    analytics: true,
    analyticsScale: 12,
  },
  large: {
    title: 'Atlas Cut',
    subscriberCount: 1_230_000,
    viewCount: 186_400_000,
    videoCount: 462,
    analytics: true,
    analyticsScale: 140,
  },
  hidden: {
    title: 'Private Signals',
    subscriberCount: null,
    hiddenSubscriberCount: true,
    viewCount: 18_420,
    videoCount: 14,
    analytics: true,
    analyticsScale: 0.7,
  },
  'no-analytics': {
    title: 'Quiet Aperture',
    subscriberCount: 318,
    viewCount: 9_840,
    videoCount: 12,
    analytics: false,
  },
  new: {
    title: 'First Light Journal',
    subscriberCount: 12,
    viewCount: 830,
    videoCount: 3,
    analytics: true,
    analyticsDays: 21,
    analyticsScale: 0.16,
  },
};

function reportingDayBefore(day: string, offset: number): string {
  const base = parseReportingDay(day);
  return toReportingDay(new Date(base.getTime() - offset * 24 * 60 * 60 * 1_000));
}

function createDailyAnalytics(
  channelId: string,
  days: number,
  scale: number,
): DailyAnalytics[] {
  return Array.from({ length: days }, (_, index) => {
    const reverseIndex = days - index - 1;
    const rhythm = Math.sin(index / 9) * 22 + Math.cos(index / 17) * 11;
    const views = Math.max(0, Math.round((96 + index * 0.18 + rhythm) * scale));
    const gained = Math.max(0, Math.round((1.8 + (index % 11) / 8) * scale ** 0.5));
    const lost = index % 13 === 0 ? Math.max(0, Math.round(scale ** 0.45)) : 0;
    return {
      channelId,
      day: reportingDayBefore(ANALYTICS_THROUGH, reverseIndex),
      views,
      estimatedMinutesWatched: Math.round(views * (2.2 + (index % 7) / 10)),
      subscribersGained: gained,
      subscribersLost: lost,
      averageViewDuration: 132 + (index % 23),
      averageViewPercentage: 43 + (index % 14) * 0.6,
      fetchedAt: DEMO_NOW,
    };
  });
}

function valueForMetric(
  channel: Channel,
  summary: AnalyticsSummary | null,
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
      return summary ? summary.estimatedMinutesWatched / 60 : null;
  }
}

function createMilestoneStates(
  channel: Channel,
  summary: AnalyticsSummary | null,
): MilestoneState[] {
  return (['subscribers', 'views', 'uploads', 'watchHours'] as const).flatMap(
    (metric) => {
      const value = valueForMetric(channel, summary, metric);
      if (value === null) return [];
      const achieved = definitionsFor(metric).filter(({ target }) => target <= value);
      return achieved.map((definition, index) => {
        const tracked = index === achieved.length - 1 && achieved.length > 1;
        return {
          id: `${channel.channelId}:${metric}:${definition.target}`,
          channelId: channel.channelId,
          metric,
          target: definition.target,
          status: 'ACHIEVED',
          detectedAt: tracked ? '2026-07-12T09:30:00.000Z' : null,
          detectionType: tracked ? 'TRACKED_CROSSING' : 'PREEXISTING',
          celebrationSeen: true,
        } satisfies MilestoneState;
      });
    },
  );
}

export function createDemoDashboard(name: DemoFixtureName = 'small'): DashboardData {
  const fixture = FIXTURES[name];
  const channelId = `demo-${name}`;
  const hidden = fixture.hiddenSubscriberCount ?? false;
  const channel: Channel = {
    channelId,
    connectionId: `demo-connection-${name}`,
    youtubeChannelId: `youtube-${channelId}`,
    title: fixture.title,
    thumbnailUrl: '',
    publishedAt: '2021-02-03T00:00:00Z',
    subscriberCount: fixture.subscriberCount,
    subscriberCountPrecision: hidden
      ? 'HIDDEN'
      : (fixture.subscriberCount ?? 0) > 1_000
        ? 'ROUNDED_THREE_SIGNIFICANT_FIGURES'
        : 'EXACT',
    hiddenSubscriberCount: hidden,
    viewCount: fixture.viewCount,
    videoCount: fixture.videoCount,
    uploadsPlaylistId: `uploads-${channelId}`,
    updatedAt: DEMO_NOW,
  };
  const analyticsDaily = fixture.analytics
    ? createDailyAnalytics(
        channelId,
        fixture.analyticsDays ?? 365,
        fixture.analyticsScale ?? 1,
      )
    : [];
  const estimatedMinutesWatched = analyticsDaily.reduce(
    (sum, row) => sum + row.estimatedMinutesWatched,
    0,
  );
  const analyticsSummary: AnalyticsSummary | null = fixture.analytics
    ? {
        channelId,
        requestedStartDate: '2021-02-03',
        requestedEndDate: '2026-08-26',
        availableThrough: analyticsDaily.at(-1)?.day ?? null,
        estimatedMinutesWatched,
        fetchedAt: DEMO_NOW,
      }
    : null;
  const customGoals: CustomGoal[] = [
    {
      id: `goal-${name}-1`,
      channelId,
      metric: 'views',
      target: fixture.viewCount < 100_000 ? 100_000 : fixture.viewCount * 2,
      title: 'Next view chapter',
      createdAt: '2026-08-10T10:00:00.000Z',
      targetDate: '2026-12-31',
    },
  ];

  return {
    channel,
    snapshots: [
      {
        id: 1,
        channelId,
        observedAt: '2026-07-12T09:30:00.000Z',
        subscriberCount:
          channel.subscriberCount === null
            ? null
            : Math.max(0, channel.subscriberCount - 83),
        viewCount: Math.max(
          0,
          channel.viewCount - Math.round(14_251 * (fixture.analyticsScale ?? 1)),
        ),
        videoCount: Math.max(0, channel.videoCount - 2),
      },
      {
        id: 2,
        channelId,
        observedAt: DEMO_NOW,
        subscriberCount: channel.subscriberCount,
        viewCount: channel.viewCount,
        videoCount: channel.videoCount,
      },
    ],
    analyticsDaily,
    analyticsSummary,
    milestoneStates: createMilestoneStates(channel, analyticsSummary),
    customGoals,
    manualMetrics: {
      channelId,
      qualifiedPublicWatchHours: name === 'small' ? 2_840 : null,
      qualifiedShortsViews: null,
      updatedAt: DEMO_NOW,
    },
    metadata: {
      key: 'app',
      selectedChannelId: channelId,
      trackingStartedAt: '2026-05-04T10:00:00.000Z',
      authorizationVerifiedAt: DEMO_NOW,
      schemaVersion: 1,
      themePreference: 'system',
    },
  };
}

export function demoFixtureFromLocation(): DemoFixtureName | null {
  const query = window.location.hash.split('?')[1];
  if (!query) return null;
  const candidate = new URLSearchParams(query).get('demo');
  return candidate && candidate in FIXTURES
    ? (candidate as DemoFixtureName)
    : candidate === '1'
      ? 'small'
      : null;
}

export function demoScenarioFromLocation(): DemoScenarioName | null {
  const query = window.location.hash.split('?')[1];
  if (!query) return null;
  const candidate = new URLSearchParams(query).get('demo');
  return [
    'unconnected',
    'reauth',
    'deletion-pending',
    'api-error',
    'archive',
    'archive-partial',
    'auth',
    'password-recovery',
  ].includes(candidate ?? '')
    ? (candidate as DemoScenarioName)
    : null;
}

export function isDemoModeAllowed(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true';
}
