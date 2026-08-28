import { formatDistanceToNowStrict } from 'date-fns';
import { Activity, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react';
import { formatFullNumber } from '../../domain/metrics/format';
import type { DashboardData } from '../../domain/models';
import {
  buildChannelUpdate,
  orderedChannelSnapshots,
  type ChannelUpdate,
  type ChannelUpdateMetric,
} from '../../domain/updates/channelUpdate';
import {
  CHANNEL_UPDATE_VISIBLE_MS,
  readLastSeenSnapshot,
  writeLastSeenSnapshot,
} from './channelUpdateStorage';

const CHANNEL_UPDATE_EXIT_MS = 160;

const METRIC_LABELS: Record<ChannelUpdateMetric, string> = {
  subscribers: 'subscribers',
  views: 'views',
  uploads: 'uploads',
};

function signedNumber(value: number): string {
  const magnitude = formatFullNumber(Math.abs(value));
  return value > 0 ? `+${magnitude}` : `−${magnitude}`;
}

function unseenUpdate(data: DashboardData, observedAt: string): ChannelUpdate | null {
  const lastSeen = readLastSeenSnapshot(data.channel.channelId);
  const latestTime = Date.parse(observedAt);
  const lastSeenTime = lastSeen ? Date.parse(lastSeen) : Number.NaN;
  if (!lastSeen || !Number.isFinite(lastSeenTime) || lastSeenTime >= latestTime) {
    return null;
  }
  return buildChannelUpdate(data.snapshots);
}

function ChannelUpdateCard({
  data,
  observedAt,
}: {
  data: DashboardData;
  observedAt: string;
}) {
  const [update, setUpdate] = useState<ChannelUpdate | null>(() =>
    unseenUpdate(data, observedAt),
  );
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const exitTimer = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    if (exitTimer.current !== null) return;
    setLeaving(true);
    exitTimer.current = window.setTimeout(() => {
      setUpdate(null);
      setLeaving(false);
      exitTimer.current = null;
    }, CHANNEL_UPDATE_EXIT_MS);
  }, []);

  useEffect(() => {
    writeLastSeenSnapshot(data.channel.channelId, observedAt);
  }, [data.channel.channelId, observedAt]);

  useEffect(() => {
    if (!update || paused || leaving) return;
    const timer = window.setTimeout(dismiss, CHANNEL_UPDATE_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [dismiss, leaving, paused, update]);

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  if (!update || update.channelId !== data.channel.channelId) return null;

  const relativeTime = formatDistanceToNowStrict(new Date(update.observedAt), {
    addSuffix: true,
  });
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
  };

  return (
    <aside
      className={`channel-update${leaving ? ' is-leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="New channel update"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={handleBlur}
    >
      <div className="channel-update__header">
        <span className="channel-update__signal" aria-hidden="true">
          <Activity size={16} strokeWidth={2} />
        </span>
        <div>
          <p className="eyebrow">New channel update</p>
          <p className="channel-update__time">Updated {relativeTime}</p>
        </div>
        <button
          className="channel-update__close"
          type="button"
          onClick={dismiss}
          aria-label="Dismiss channel update"
          title="Dismiss channel update"
        >
          <X size={17} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>

      <div className="channel-update__metrics">
        {update.changes.map((change) => (
          <div
            className="channel-update__metric"
            key={change.metric}
            aria-label={`${formatFullNumber(change.current)} ${METRIC_LABELS[change.metric]}, ${signedNumber(change.delta)}`}
          >
            <span className="channel-update__current">
              <strong>{formatFullNumber(change.current)}</strong>{' '}
              {METRIC_LABELS[change.metric]}
            </span>
            <span
              className={`channel-update__delta${change.delta < 0 ? ' is-negative' : ''}`}
            >
              {signedNumber(change.delta)}
            </span>
          </div>
        ))}
      </div>
      <p className="channel-update__context">Since the previous snapshot</p>
    </aside>
  );
}

export function ChannelUpdateToast({ data }: { data: DashboardData }) {
  const latest = orderedChannelSnapshots(data.snapshots).at(-1);
  if (!latest) return null;
  const fingerprint = `${data.channel.channelId}:${latest.observedAt}`;
  return (
    <ChannelUpdateCard key={fingerprint} data={data} observedAt={latest.observedAt} />
  );
}
