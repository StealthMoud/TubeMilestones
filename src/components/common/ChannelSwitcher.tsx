import { Check, ChevronDown, Plus } from 'lucide-react';
import { useRef } from 'react';
import type { Channel } from '../../domain/models';
import { formatCompactNumber } from '../../domain/metrics/format';
import type { Connection } from '../../services/supabase/dashboardRepository';
import { ChannelAvatar } from './ChannelAvatar';

interface ChannelSwitcherProps {
  selected: Channel;
  channels: Channel[];
  connections: Connection[];
  onSelect(channelId: string): Promise<unknown>;
  onAddAccount(): Promise<void>;
}

export function ChannelSwitcher({
  selected,
  channels,
  connections,
  onSelect,
  onAddAccount,
}: ChannelSwitcherProps) {
  const details = useRef<HTMLDetailsElement>(null);

  const close = () => details.current?.removeAttribute('open');

  return (
    <details className="channel-switcher" ref={details}>
      <summary aria-label={`Current channel: ${selected.title}. Switch channel`}>
        <ChannelAvatar
          title={selected.title}
          src={selected.thumbnailUrl}
          size="small"
        />
        <span>
          <strong>{selected.title}</strong>
          <small>Switch channel</small>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="channel-switcher__menu">
        <div className="channel-switcher__heading">
          <strong>Channels</strong>
          <span>{channels.length} available</span>
        </div>
        <div className="channel-switcher__list">
          {channels.map((channel) => {
            const connection = connections.find(
              ({ id }) => id === channel.connectionId,
            );
            const selectedChannel = channel.channelId === selected.channelId;
            return (
              <button
                key={channel.channelId}
                type="button"
                aria-current={selectedChannel ? 'true' : undefined}
                onClick={() => {
                  close();
                  if (!selectedChannel) void onSelect(channel.channelId);
                }}
              >
                <ChannelAvatar
                  title={channel.title}
                  src={channel.thumbnailUrl}
                  size="small"
                />
                <span>
                  <strong>{channel.title}</strong>
                  <small>
                    {channel.subscriberCount === null
                      ? 'Subscribers hidden'
                      : `${formatCompactNumber(channel.subscriberCount)} subscribers`}
                    {' · '}
                    {connection?.google_email ?? 'Connected Google account'}
                  </small>
                </span>
                {selectedChannel ? <Check size={17} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
        <button
          className="channel-switcher__add"
          type="button"
          onClick={() => {
            close();
            void onAddAccount();
          }}
        >
          <Plus size={17} aria-hidden="true" />
          Add YouTube account
        </button>
      </div>
    </details>
  );
}
