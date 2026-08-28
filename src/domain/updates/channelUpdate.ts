import type { ChannelSnapshot } from '../models';

export type ChannelUpdateMetric = 'subscribers' | 'views' | 'uploads';

export interface ChannelUpdateChange {
  metric: ChannelUpdateMetric;
  current: number;
  delta: number;
}

export interface ChannelUpdate {
  channelId: string;
  observedAt: string;
  changes: ChannelUpdateChange[];
}

function timestamp(snapshot: ChannelSnapshot): number {
  return Date.parse(snapshot.observedAt);
}

export function orderedChannelSnapshots(
  snapshots: ChannelSnapshot[],
): ChannelSnapshot[] {
  return snapshots
    .filter((snapshot) => Number.isFinite(timestamp(snapshot)))
    .slice()
    .sort((left, right) => timestamp(left) - timestamp(right));
}

export function buildChannelUpdate(snapshots: ChannelSnapshot[]): ChannelUpdate | null {
  const ordered = orderedChannelSnapshots(snapshots);
  if (ordered.length < 2) return null;

  const previous = ordered.at(-2);
  const latest = ordered.at(-1);
  if (!previous || !latest || previous.channelId !== latest.channelId) return null;

  const changes: ChannelUpdateChange[] = [];
  if (
    previous.subscriberCount !== null &&
    latest.subscriberCount !== null &&
    latest.subscriberCount !== previous.subscriberCount
  ) {
    changes.push({
      metric: 'subscribers',
      current: latest.subscriberCount,
      delta: latest.subscriberCount - previous.subscriberCount,
    });
  }
  if (latest.viewCount !== previous.viewCount) {
    changes.push({
      metric: 'views',
      current: latest.viewCount,
      delta: latest.viewCount - previous.viewCount,
    });
  }
  if (latest.videoCount !== previous.videoCount) {
    changes.push({
      metric: 'uploads',
      current: latest.videoCount,
      delta: latest.videoCount - previous.videoCount,
    });
  }

  return changes.length > 0
    ? {
        channelId: latest.channelId,
        observedAt: latest.observedAt,
        changes,
      }
    : null;
}
