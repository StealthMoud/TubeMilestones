import { useTubeMilestones } from '../../hooks/useTubeMilestones';
import { formatCompactNumber } from '../../domain/metrics/format';
import { Button } from '../common/Button';
import { BrandMark } from '../common/BrandMark';
import { ChannelAvatar } from '../common/ChannelAvatar';

export function ChannelSelector() {
  const { connections, pendingChannels, chooseChannel, addYouTubeAccount } =
    useTubeMilestones();
  return (
    <main className="channel-selector">
      <BrandMark size={48} title="TubeMilestones" />
      <div>
        <p className="eyebrow">Choose a channel</p>
        <h1>Which journey should we open?</h1>
        <p>
          Choose from every channel available through your connected YouTube accounts.
        </p>
      </div>
      <div className="channel-choice-list">
        {pendingChannels.map((channel) => {
          const account = connections.find(({ id }) => id === channel.connectionId);
          return (
            <Button
              key={channel.channelId}
              variant="secondary"
              className="channel-choice"
              onClick={() => void chooseChannel(channel.channelId)}
            >
              <ChannelAvatar
                title={channel.title}
                src={channel.thumbnailUrl}
                size="small"
              />
              <span className="channel-choice__text">
                <strong>{channel.title}</strong>
                <small>
                  {channel.subscriberCount === null
                    ? 'Subscribers hidden'
                    : `${formatCompactNumber(channel.subscriberCount)} subscribers`}
                  {' · '}
                  {account?.google_email ?? 'Connected Google account'}
                </small>
              </span>
            </Button>
          );
        })}
      </div>
      <Button variant="quiet" onClick={() => void addYouTubeAccount()}>
        Add another YouTube account
      </Button>
    </main>
  );
}
