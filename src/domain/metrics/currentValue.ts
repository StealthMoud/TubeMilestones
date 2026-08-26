import type { AnalyticsSummary, Channel, MetricType } from '../models';
import { watchMinutesToHours } from '../analytics/calculations';

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
