// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDailyAnalytics,
  parseDailyAnalytics,
  parseOwnedChannels,
} from './youtube';

describe('trusted YouTube parsers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves hidden and rounded subscriber semantics with exact integer strings', () => {
    const channels = parseOwnedChannels({
      items: [
        {
          id: 'channel-1',
          snippet: { title: 'Syntax Sphere', publishedAt: '2025-01-01T00:00:00.000Z' },
          statistics: {
            viewCount: '9007199254740992',
            subscriberCount: '1250',
            hiddenSubscriberCount: false,
            videoCount: '45',
          },
          contentDetails: { relatedPlaylists: { uploads: 'uploads-1' } },
        },
        {
          id: 'channel-2',
          snippet: { title: 'Hidden', publishedAt: '2025-01-01T00:00:00.000Z' },
          statistics: {
            viewCount: '10',
            hiddenSubscriberCount: true,
            videoCount: '1',
          },
          contentDetails: { relatedPlaylists: { uploads: 'uploads-2' } },
        },
      ],
    });
    expect(channels[0]).toMatchObject({
      viewCount: '9007199254740992',
      subscriberCountPrecision: 'ROUNDED_THREE_SIGNIFICANT_FIGURES',
    });
    expect(channels[1]).toMatchObject({
      subscriberCount: null,
      subscriberCountPrecision: 'HIDDEN',
    });
  });

  it('maps Analytics values by header rather than column position', () => {
    const rows = parseDailyAnalytics({
      columnHeaders: [
        { name: 'views' },
        { name: 'day' },
        { name: 'subscribersLost' },
        { name: 'estimatedMinutesWatched' },
        { name: 'averageViewPercentage' },
        { name: 'subscribersGained' },
        { name: 'averageViewDuration' },
      ],
      rows: [[42, '2026-08-24', 1, 75.5, 62.3, 4, 88.2]],
    });
    expect(rows[0]).toEqual({
      day: '2026-08-24',
      views: '42',
      estimatedMinutesWatched: '75.5',
      subscribersGained: '4',
      subscribersLost: '1',
      averageViewDuration: '88.2',
      averageViewPercentage: '62.3',
    });
  });

  it('falls back to split daily queries when Google rejects the metric combination', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: 'Invalid metric combination' } }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            columnHeaders: [
              { name: 'subscribersLost' },
              { name: 'day' },
              { name: 'views' },
              { name: 'subscribersGained' },
              { name: 'estimatedMinutesWatched' },
            ],
            rows: [[1, '2026-08-24', 100, 4, 600]],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            columnHeaders: [
              { name: 'averageViewPercentage' },
              { name: 'day' },
              { name: 'averageViewDuration' },
            ],
            rows: [[50, '2026-08-24', 120]],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchDailyAnalytics('server-token', '2026-08-01', '2026-08-24'),
    ).resolves.toEqual([
      {
        day: '2026-08-24',
        views: '100',
        estimatedMinutesWatched: '600',
        subscribersGained: '4',
        subscribersLost: '1',
        averageViewDuration: '120',
        averageViewPercentage: '50',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('paginates daily reports so initial history is not silently truncated', async () => {
    const headers = [
      { name: 'day' },
      { name: 'views' },
      { name: 'estimatedMinutesWatched' },
      { name: 'subscribersGained' },
      { name: 'subscribersLost' },
      { name: 'averageViewDuration' },
      { name: 'averageViewPercentage' },
    ];
    const dailyRow = (index: number) => {
      const date = new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
      return [date, index, index * 2, 1, 0, 60, 50];
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            columnHeaders: headers,
            rows: Array.from({ length: 200 }, (_, index) => dailyRow(index)),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ columnHeaders: headers, rows: [dailyRow(200)] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchDailyAnalytics(
      'server-token',
      '2025-01-01',
      '2025-07-20',
    );

    expect(result).toHaveLength(201);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get('startIndex'),
    ).toBe('1');
    expect(
      new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get('startIndex'),
    ).toBe('201');
  });
});
