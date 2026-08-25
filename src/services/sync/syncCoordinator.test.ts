import { TubeMilestonesDatabase } from '../../db/db';
import type { AnalyticsSummary, Channel, DailyAnalytics } from '../../domain/models';
import { TubeMilestonesError } from '../errors';
import { synchronizeTubeMilestones, type SyncDependencies } from './syncCoordinator';

const observedAt = '2026-08-26T12:00:00.000Z';

function channel(
  channelId = 'channel-1',
  subscriberCount = 742,
  viewCount = 48_000,
  videoCount = 23,
): Channel {
  return {
    channelId,
    title: `Channel ${channelId}`,
    thumbnailUrl: 'https://example.com/avatar.jpg',
    publishedAt: '2021-02-03T00:00:00Z',
    subscriberCount,
    subscriberCountPrecision:
      subscriberCount > 1_000 ? 'ROUNDED_THREE_SIGNIFICANT_FIGURES' : 'EXACT',
    hiddenSubscriberCount: false,
    viewCount,
    videoCount,
    uploadsPlaylistId: `uploads-${channelId}`,
    updatedAt: observedAt,
  };
}

function summary(channelId = 'channel-1'): AnalyticsSummary {
  return {
    channelId,
    requestedStartDate: '2021-02-03',
    requestedEndDate: '2026-08-26',
    availableThrough: '2026-08-24',
    estimatedMinutesWatched: 12_000,
    fetchedAt: observedAt,
  };
}

function daily(channelId = 'channel-1'): DailyAnalytics[] {
  return [
    {
      channelId,
      day: '2026-08-24',
      views: 100,
      estimatedMinutesWatched: 600,
      subscribersGained: 4,
      subscribersLost: 1,
      averageViewDuration: 120,
      averageViewPercentage: 50,
      fetchedAt: observedAt,
    },
  ];
}

describe('sync coordinator', () => {
  let database: TubeMilestonesDatabase;

  beforeEach(() => {
    database = new TubeMilestonesDatabase(`TubeMilestones-sync-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  function dependencies(
    channels: Channel[],
    overrides: Partial<SyncDependencies> = {},
  ): Partial<SyncDependencies> {
    const fetchChannels: SyncDependencies['fetchChannels'] = async () => channels;
    const fetchDaily: SyncDependencies['fetchDaily'] = async (_token, channelId) =>
      daily(channelId);
    const fetchAggregate: SyncDependencies['fetchAggregate'] = async (
      _token,
      channelId,
      range,
      availableThrough,
      fetchedAt,
    ) => ({
      ...summary(channelId),
      requestedStartDate: range.startDate,
      requestedEndDate: range.endDate,
      availableThrough,
      fetchedAt,
    });

    return {
      database,
      now: () => new Date(observedAt),
      fetchChannels,
      fetchDaily,
      fetchAggregate,
      ...overrides,
    };
  }

  it('stores first-sync achievements as pre-existing with no celebration', async () => {
    const result = await synchronizeTubeMilestones(
      'memory-only-token',
      {},
      dependencies([channel()]),
    );

    expect(result.kind).toBe('READY');
    if (result.kind !== 'READY') return;
    expect(result.newMilestones).toHaveLength(0);
    expect(
      result.data.milestoneStates
        .filter(({ metric }) => metric === 'subscribers')
        .map(({ target }) => target)
        .sort((left, right) => left - right),
    ).toEqual([100, 500]);
    expect(
      result.data.milestoneStates.every(
        ({ detectionType, detectedAt }) =>
          detectionType === 'PREEXISTING' && detectedAt === null,
      ),
    ).toBe(true);
    expect(result.data.metadata.authorizationVerifiedAt).toBe(observedAt);
  });

  it('records every milestone crossed between stored observations', async () => {
    let current = channel('channel-1', 90, 900, 0);
    const fetchChannels: SyncDependencies['fetchChannels'] = async () => [current];
    const services = dependencies([current], { fetchChannels });

    await synchronizeTubeMilestones('token', {}, services);
    current = channel('channel-1', 550, 12_000, 12);
    const result = await synchronizeTubeMilestones('token', {}, services);

    expect(result.kind).toBe('READY');
    if (result.kind !== 'READY') return;
    expect(
      result.newMilestones.map(({ metric, target }) => `${metric}:${target}`).sort(),
    ).toEqual(
      [
        'subscribers:100',
        'subscribers:500',
        'uploads:1',
        'uploads:10',
        'views:1000',
        'views:10000',
      ].sort(),
    );
    expect(
      result.newMilestones.every(({ detectedAt }) => detectedAt === observedAt),
    ).toBe(true);
  });

  it('keeps channel milestones available when Analytics fails', async () => {
    const fetchDaily: SyncDependencies['fetchDaily'] = async () => {
      throw new TubeMilestonesError(
        'NETWORK_UNAVAILABLE',
        'Analytics network unavailable.',
      );
    };
    const result = await synchronizeTubeMilestones(
      'token',
      {},
      dependencies([channel()], { fetchDaily }),
    );

    expect(result.kind).toBe('READY');
    if (result.kind !== 'READY') return;
    expect(result.data.channel.subscriberCount).toBe(742);
    expect(result.data.analyticsDaily).toEqual([]);
    expect(result.data.analyticsSummary?.estimatedMinutesWatched).toBe(12_000);
    expect(result.warnings.map(({ code }) => code)).toContain('NETWORK_UNAVAILABLE');
  });

  it('returns a selector when more than one owned channel is available', async () => {
    const result = await synchronizeTubeMilestones(
      'token',
      {},
      dependencies([channel('one'), channel('two')]),
    );
    expect(result).toMatchObject({
      kind: 'CHANNEL_SELECTION_REQUIRED',
      channels: [{ channelId: 'one' }, { channelId: 'two' }],
    });
  });

  it('returns a typed no-channel error', async () => {
    await expect(
      synchronizeTubeMilestones('token', {}, dependencies([])),
    ).rejects.toMatchObject({ code: 'NO_CHANNEL' });
  });
});
