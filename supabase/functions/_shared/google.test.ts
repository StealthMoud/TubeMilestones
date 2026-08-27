// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exchangeAuthorizationCode, fetchGoogleConnectionIdentity } from './google';
import { REQUIRED_YOUTUBE_SCOPES } from './oauth';

describe('Google OpenID UserInfo identity', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('allows an authorization-code exchange without a new refresh token', async () => {
    const observeTokenResponse = vi.fn();
    const environment = new Map([
      ['GOOGLE_YOUTUBE_CLIENT_ID', 'youtube-client-id'],
      ['GOOGLE_YOUTUBE_CLIENT_SECRET', 'youtube-client-secret'],
      [
        'GOOGLE_YOUTUBE_REDIRECT_URI',
        'https://project.supabase.co/functions/v1/youtube-oauth-callback',
      ],
    ]);
    vi.stubGlobal('Deno', {
      env: { get: (name: string) => environment.get(name) },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'authorization-access-token-value',
            expires_in: 3600,
            scope: REQUIRED_YOUTUBE_SCOPES.join(' '),
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      exchangeAuthorizationCode(
        'authorization-code',
        'pkce-code-verifier',
        observeTokenResponse,
      ),
    ).resolves.toMatchObject({
      accessToken: 'authorization-access-token-value',
      refreshToken: null,
      scopes: REQUIRED_YOUTUBE_SCOPES,
      tokenType: 'Bearer',
    });
    expect(observeTokenResponse).toHaveBeenCalledWith({
      hasAccessToken: true,
      hasRefreshToken: false,
      expiresIn: 3600,
      scope: REQUIRED_YOUTUBE_SCOPES,
      tokenType: 'Bearer',
    });
    expect(JSON.stringify(observeTokenResponse.mock.calls)).not.toContain(
      'authorization-access-token-value',
    );
  });

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
