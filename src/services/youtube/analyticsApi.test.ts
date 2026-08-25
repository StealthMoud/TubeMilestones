import {
  buildAnalyticsUrl,
  fetchDailyAnalytics,
  recentReportingRange,
} from './analyticsApi';

describe('YouTube Analytics API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds a controlled channel MINE query', () => {
    const url = buildAnalyticsUrl({
      startDate: '2026-01-01',
      endDate: '2026-08-24',
      dimensions: ['day'],
      sort: 'day',
      metrics: ['views', 'estimatedMinutesWatched'],
    });
    expect(url.origin).toBe('https://youtubeanalytics.googleapis.com');
    expect(url.searchParams.get('ids')).toBe('channel==MINE');
    expect(url.searchParams.get('dimensions')).toBe('day');
    expect(url.searchParams.get('sort')).toBe('day');
  });

  it('creates an inclusive 365-day reporting range without timezone drift', () => {
    expect(recentReportingRange(new Date('2026-08-26T23:30:00.000Z'))).toEqual({
      startDate: '2025-08-27',
      endDate: '2026-08-26',
    });
  });

  it('parses a combined daily response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            columnHeaders: [
              { name: 'day' },
              { name: 'views' },
              { name: 'estimatedMinutesWatched' },
              { name: 'subscribersGained' },
              { name: 'subscribersLost' },
              { name: 'averageViewDuration' },
              { name: 'averageViewPercentage' },
            ],
            rows: [['2026-08-24', 100, 600, 4, 1, 120, 50]],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      fetchDailyAnalytics(
        'token',
        'channel-1',
        { startDate: '2026-08-01', endDate: '2026-08-24' },
        '2026-08-26T12:00:00.000Z',
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        day: '2026-08-24',
        views: 100,
        subscribersGained: 4,
      }),
    ]);
  });
});
