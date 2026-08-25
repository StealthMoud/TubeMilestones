import {
  numericAnalyticsValue,
  parseAggregateWatchMinutes,
  parseAnalyticsTable,
  parseDailyAnalytics,
} from './parser';

const fetchedAt = '2026-08-26T12:00:00.000Z';

const response = {
  columnHeaders: [
    { name: 'day', dataType: 'STRING' },
    { name: 'views', dataType: 'INTEGER' },
    { name: 'estimatedMinutesWatched', dataType: 'INTEGER' },
    { name: 'subscribersGained', dataType: 'INTEGER' },
    { name: 'subscribersLost', dataType: 'INTEGER' },
    { name: 'averageViewDuration', dataType: 'INTEGER' },
    { name: 'averageViewPercentage', dataType: 'FLOAT' },
  ],
  rows: [['2026-08-24', 1_204, 2_400, 15, 2, 154, 48.2]],
};

describe('analytics response parsing', () => {
  it('maps daily rows by column header', () => {
    expect(parseDailyAnalytics(response, 'channel-1', fetchedAt)).toEqual([
      {
        channelId: 'channel-1',
        day: '2026-08-24',
        views: 1_204,
        estimatedMinutesWatched: 2_400,
        subscribersGained: 15,
        subscribersLost: 2,
        averageViewDuration: 154,
        averageViewPercentage: 48.2,
        fetchedAt,
      },
    ]);
  });

  it('handles reordered columns without changing the result', () => {
    const reordered = {
      columnHeaders: [
        { name: 'views' },
        { name: 'averageViewPercentage' },
        { name: 'day' },
        { name: 'subscribersLost' },
        { name: 'estimatedMinutesWatched' },
        { name: 'averageViewDuration' },
        { name: 'subscribersGained' },
      ],
      rows: [[1_204, 48.2, '2026-08-24', 2, 2_400, 154, 15]],
    };
    const [parsed] = parseDailyAnalytics(reordered, 'channel-1', fetchedAt);
    expect(parsed).toMatchObject({
      day: '2026-08-24',
      views: 1_204,
      subscribersGained: 15,
    });
  });

  it('accepts numeric strings', () => {
    const table = parseAnalyticsTable({
      columnHeaders: [{ name: 'views' }],
      rows: [['42']],
    });
    expect(numericAnalyticsValue(table.rows[0] ?? {}, 'views')).toBe(42);
  });

  it('returns no daily records for missing rows', () => {
    expect(
      parseDailyAnalytics({ ...response, rows: undefined }, 'channel-1', fetchedAt),
    ).toEqual([]);
  });

  it('returns no daily records for empty rows', () => {
    expect(
      parseDailyAnalytics({ ...response, rows: [] }, 'channel-1', fetchedAt),
    ).toEqual([]);
  });

  it('preserves zero metrics', () => {
    const zero = {
      ...response,
      rows: [['2026-08-24', 0, 0, 0, 0, 0, 0]],
    };
    expect(parseDailyAnalytics(zero, 'channel-1', fetchedAt)[0]?.views).toBe(0);
  });

  it('parses aggregate watch minutes by header', () => {
    expect(
      parseAggregateWatchMinutes({
        columnHeaders: [{ name: 'estimatedMinutesWatched' }],
        rows: [[12_345]],
      }),
    ).toBe(12_345);
  });

  it('returns zero for an aggregate response with no rows', () => {
    expect(
      parseAggregateWatchMinutes({
        columnHeaders: [{ name: 'estimatedMinutesWatched' }],
        rows: [],
      }),
    ).toBe(0);
  });

  it('rejects missing required columns', () => {
    expect(() =>
      parseDailyAnalytics(
        {
          columnHeaders: [{ name: 'day' }],
          rows: [['2026-08-24']],
        },
        'channel-1',
        fetchedAt,
      ),
    ).toThrow(/views column/);
  });

  it('rejects malformed API responses', () => {
    expect(() => parseAnalyticsTable({ rows: [] })).toThrow();
    expect(() => parseAnalyticsTable({ columnHeaders: 'day' })).toThrow();
  });
});
