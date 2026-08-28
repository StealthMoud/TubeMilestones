import type { ChannelSnapshot } from '../models';
import { buildChannelUpdate, orderedChannelSnapshots } from './channelUpdate';

const PREVIOUS: ChannelSnapshot = {
  channelId: 'channel-1',
  observedAt: '2026-08-26T08:00:00.000Z',
  subscriberCount: 659,
  viewCount: 33_949,
  videoCount: 21,
};

const LATEST: ChannelSnapshot = {
  channelId: 'channel-1',
  observedAt: '2026-08-27T16:00:00.000Z',
  subscriberCount: 742,
  viewCount: 48_200,
  videoCount: 23,
};

describe('channel snapshot updates', () => {
  it('derives current values and signed changes from the newest two snapshots', () => {
    expect(buildChannelUpdate([LATEST, PREVIOUS])).toEqual({
      channelId: 'channel-1',
      observedAt: LATEST.observedAt,
      changes: [
        { metric: 'subscribers', current: 742, delta: 83 },
        { metric: 'views', current: 48_200, delta: 14_251 },
        { metric: 'uploads', current: 23, delta: 2 },
      ],
    });
  });

  it('keeps decreases and omits unchanged values', () => {
    expect(
      buildChannelUpdate([
        PREVIOUS,
        {
          ...LATEST,
          subscriberCount: 658,
          viewCount: PREVIOUS.viewCount,
          videoCount: PREVIOUS.videoCount,
        },
      ]),
    ).toEqual({
      channelId: 'channel-1',
      observedAt: LATEST.observedAt,
      changes: [{ metric: 'subscribers', current: 658, delta: -1 }],
    });
  });

  it('does not invent subscriber movement for a hidden count', () => {
    expect(
      buildChannelUpdate([
        { ...PREVIOUS, subscriberCount: null },
        { ...LATEST, subscriberCount: null },
      ])?.changes,
    ).toEqual([
      { metric: 'views', current: 48_200, delta: 14_251 },
      { metric: 'uploads', current: 23, delta: 2 },
    ]);
  });

  it('requires two valid same-channel snapshots and at least one real change', () => {
    expect(buildChannelUpdate([LATEST])).toBeNull();
    expect(buildChannelUpdate([PREVIOUS, { ...LATEST, ...PREVIOUS }])).toBeNull();
    expect(
      buildChannelUpdate([PREVIOUS, { ...LATEST, channelId: 'channel-2' }]),
    ).toBeNull();
  });

  it('orders valid snapshots without mutating the source array', () => {
    const invalid = { ...LATEST, observedAt: 'not-a-date' };
    const source = [LATEST, invalid, PREVIOUS];
    expect(orderedChannelSnapshots(source)).toEqual([PREVIOUS, LATEST]);
    expect(source).toEqual([LATEST, invalid, PREVIOUS]);
  });
});
