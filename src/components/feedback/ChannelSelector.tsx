import { useApp } from '../../app/AppProvider';
import { Button } from '../common/Button';
import { BrandMark } from '../common/BrandMark';
import { ChannelAvatar } from '../common/ChannelAvatar';

export function ChannelSelector() {
  const { pendingChannels, chooseChannel } = useApp();
  return (
    <main className="channel-selector">
      <BrandMark size={48} title="TubeMilestones" />
      <div>
        <p className="eyebrow">Choose a channel</p>
        <h1>Which journey should we open?</h1>
        <p>TubeMilestones found more than one channel for this Google account.</p>
      </div>
      <div className="channel-choice-list">
        {pendingChannels.map((channel) => (
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
              <small>{channel.channelId}</small>
            </span>
          </Button>
        ))}
      </div>
    </main>
  );
}
