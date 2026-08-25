import { fetchOwnedChannels } from './dataApi';

describe('YouTube Data API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests owned channel data with a bearer header, never a token query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'channel-1',
              snippet: {
                title: 'Northstar Frames',
                publishedAt: '2021-02-03T00:00:00Z',
                thumbnails: {
                  high: { url: 'https://example.com/avatar.jpg' },
                },
              },
              statistics: {
                subscriberCount: '12300',
                hiddenSubscriberCount: false,
                viewCount: '1800000',
                videoCount: '86',
              },
              contentDetails: { relatedPlaylists: { uploads: 'uploads-1' } },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const channels = await fetchOwnedChannels(
      'secret-access-token',
      '2026-08-26T12:00:00.000Z',
    );

    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.searchParams.get('part')).toBe('snippet,statistics,contentDetails');
    expect(url.searchParams.get('mine')).toBe('true');
    expect(url.toString()).not.toContain('secret-access-token');
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer secret-access-token',
    });
    expect(channels[0]).toMatchObject({
      subscriberCount: 12_300,
      subscriberCountPrecision: 'ROUNDED_THREE_SIGNIFICANT_FIGURES',
      viewCount: 1_800_000,
    });
  });

  it('models a hidden subscriber channel without false progress data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'hidden',
                snippet: {
                  title: 'Private Signals',
                  publishedAt: '2026-01-01T00:00:00Z',
                  thumbnails: {},
                },
                statistics: {
                  hiddenSubscriberCount: true,
                  viewCount: '50',
                  videoCount: '1',
                },
                contentDetails: { relatedPlaylists: { uploads: 'uploads-hidden' } },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    expect(
      (await fetchOwnedChannels('token', '2026-08-26T12:00:00.000Z'))[0],
    ).toMatchObject({
      subscriberCount: null,
      subscriberCountPrecision: 'HIDDEN',
    });
  });

  it('rejects malformed external data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [{ id: 'broken' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      fetchOwnedChannels('token', '2026-08-26T12:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });
});
