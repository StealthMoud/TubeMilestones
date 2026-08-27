// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGoogleConnectionIdentity } from './google';

describe('Google OpenID UserInfo identity', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('derives the immutable subject and a verified display email server-side', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          sub: 'google-subject-123',
          email: 'youtube-owner@example.com',
          email_verified: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchGoogleConnectionIdentity('server-access-token-value'),
    ).resolves.toEqual({
      subject: 'google-subject-123',
      email: 'youtube-owner@example.com',
      emailVerified: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openidconnect.googleapis.com/v1/userinfo',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer server-access-token-value',
        }),
      }),
    );
  });

  it('never stores an unverified email as connection identity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            sub: 'google-subject-456',
            email: 'unverified@example.com',
            email_verified: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      fetchGoogleConnectionIdentity('server-access-token-value'),
    ).resolves.toEqual({
      subject: 'google-subject-456',
      email: null,
      emailVerified: false,
    });
  });

  it('fails closed on malformed identity responses and provider errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ email: 'missing-sub@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      fetchGoogleConnectionIdentity('server-access-token-value'),
    ).rejects.toMatchObject({ code: 'GOOGLE_IDENTITY_FAILED' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      fetchGoogleConnectionIdentity('server-access-token-value'),
    ).rejects.toMatchObject({ code: 'GOOGLE_IDENTITY_FAILED', retryable: true });
  });
});
