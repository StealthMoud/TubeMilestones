import { TubeMilestonesDatabase } from '../db';
import type { Channel } from '../schema';
import {
  AUTHORIZATION_MAX_AGE_MS,
  authorizationCacheStatus,
  clearAuthorizedData,
  ensureMetadata,
  getLatestSnapshot,
  loadSelectedChannelData,
  markAuthorizationVerified,
  saveChannelObservation,
  saveCustomGoal,
  saveManualMetrics,
  setSelectedChannel,
  setThemePreference,
} from './appRepository';

const channel: Channel = {
  channelId: 'channel-1',
  title: 'Northstar Frames',
  thumbnailUrl: 'https://example.com/avatar.jpg',
  publishedAt: '2021-02-03T00:00:00Z',
  subscriberCount: 742,
  subscriberCountPrecision: 'EXACT',
  hiddenSubscriberCount: false,
  viewCount: 48_000,
  videoCount: 23,
  uploadsPlaylistId: 'uploads-1',
  updatedAt: '2026-08-26T12:00:00.000Z',
};

describe('app repository', () => {
  let database: TubeMilestonesDatabase;

  beforeEach(() => {
    database = new TubeMilestonesDatabase(`TubeMilestones-test-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('creates versioned default metadata', async () => {
    await expect(ensureMetadata(database)).resolves.toMatchObject({
      key: 'app',
      schemaVersion: 1,
      themePreference: 'system',
    });
  });

  it('classifies authorized cache age at the 30-day boundary', () => {
    const now = Date.parse('2026-08-26T12:00:00.000Z');
    const base = {
      key: 'app' as const,
      selectedChannelId: null,
      trackingStartedAt: null,
      schemaVersion: 1,
      themePreference: 'system' as const,
    };
    expect(
      authorizationCacheStatus(
        {
          ...base,
          authorizationVerifiedAt: new Date(
            now - AUTHORIZATION_MAX_AGE_MS + 1,
          ).toISOString(),
        },
        now,
      ),
    ).toBe('valid');
    expect(
      authorizationCacheStatus(
        {
          ...base,
          authorizationVerifiedAt: new Date(
            now - AUTHORIZATION_MAX_AGE_MS,
          ).toISOString(),
        },
        now,
      ),
    ).toBe('stale');
  });

  it('stores and loads channel data through the selected channel', async () => {
    await saveChannelObservation(
      channel,
      {
        channelId: channel.channelId,
        observedAt: channel.updatedAt,
        subscriberCount: channel.subscriberCount,
        viewCount: channel.viewCount,
        videoCount: channel.videoCount,
      },
      database,
    );
    await setSelectedChannel(channel.channelId, database);

    const stored = await loadSelectedChannelData(database);
    expect(stored?.channel.title).toBe('Northstar Frames');
    expect(stored?.snapshots).toHaveLength(1);
    expect(await getLatestSnapshot(channel.channelId, database)).toMatchObject({
      subscriberCount: 742,
    });
  });

  it('persists custom goals and validates their target', async () => {
    await saveCustomGoal(
      {
        id: 'goal-1',
        channelId: channel.channelId,
        metric: 'views',
        target: 100_000,
        title: 'First six figures',
        createdAt: channel.updatedAt,
        targetDate: null,
      },
      database,
    );
    await expect(
      saveCustomGoal(
        {
          id: 'goal-invalid',
          channelId: channel.channelId,
          metric: 'views',
          target: 0,
          title: null,
          createdAt: channel.updatedAt,
          targetDate: null,
        },
        database,
      ),
    ).rejects.toThrow(RangeError);
  });

  it('stores only non-negative manual values', async () => {
    await saveManualMetrics(
      {
        channelId: channel.channelId,
        qualifiedPublicWatchHours: 2_840,
        qualifiedShortsViews: null,
        updatedAt: channel.updatedAt,
      },
      database,
    );
    await expect(
      saveManualMetrics(
        {
          channelId: channel.channelId,
          qualifiedPublicWatchHours: -1,
          qualifiedShortsViews: null,
          updatedAt: channel.updatedAt,
        },
        database,
      ),
    ).rejects.toThrow(RangeError);
  });

  it('deletes authorized channel data while retaining appearance', async () => {
    await saveChannelObservation(
      channel,
      {
        channelId: channel.channelId,
        observedAt: channel.updatedAt,
        subscriberCount: channel.subscriberCount,
        viewCount: channel.viewCount,
        videoCount: channel.videoCount,
      },
      database,
    );
    await setSelectedChannel(channel.channelId, database);
    await setThemePreference('dark', database);
    await markAuthorizationVerified(channel.updatedAt, channel.updatedAt, database);

    await clearAuthorizedData(database);

    expect(await database.channels.count()).toBe(0);
    expect(await database.channelSnapshots.count()).toBe(0);
    expect(await database.metadata.get('app')).toMatchObject({
      selectedChannelId: null,
      authorizationVerifiedAt: null,
      themePreference: 'dark',
    });
  });
});
