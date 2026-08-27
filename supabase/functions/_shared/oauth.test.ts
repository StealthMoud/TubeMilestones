// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { pkceChallenge } from './crypto';
import {
  assertOfflineRefreshToken,
  assertRequiredScopes,
  buildYouTubeAuthorizationUrl,
  createOAuthAttempt,
  oauthStartRequestSchema,
  parseGoogleTokenResponse,
  parseOAuthCallback,
  reconnectIdentityMatches,
  REQUIRED_YOUTUBE_SCOPES,
  validateOAuthAttempt,
} from './oauth';

describe('server OAuth security primitives', () => {
  it('creates hashed ten-minute state and an S256 PKCE pair', async () => {
    const now = new Date('2026-08-26T10:00:00.000Z');
    const attempt = await createOAuthAttempt(now);
    expect(attempt.state).not.toBe(attempt.stateHash);
    expect(attempt.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(attempt.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(attempt.codeChallenge).toBe(await pkceChallenge(attempt.codeVerifier));
    expect(Date.parse(attempt.expiresAt) - now.getTime()).toBe(10 * 60 * 1_000);
  });

  it('always opens a consented account chooser with the four Client B scopes', () => {
    const url = buildYouTubeAuthorizationUrl({
      clientId: 'youtube-client-b',
      redirectUri: 'https://project.supabase.co/functions/v1/youtube-oauth-callback',
      state: 'opaque-state',
      codeChallenge: 'pkce-challenge',
    });
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('prompt')).toBe('select_account consent');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(REQUIRED_YOUTUBE_SCOPES);
    expect(url.searchParams.has('login_hint')).toBe(false);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('rejects wrong, expired, and reused state', async () => {
    const attempt = await createOAuthAttempt(new Date('2026-08-26T10:00:00.000Z'));
    const stored = {
      stateHash: attempt.stateHash,
      codeVerifier: attempt.codeVerifier,
      expiresAt: attempt.expiresAt,
      usedAt: null,
      userId: 'f94ad3cf-f52e-4df0-847f-17f9f9b35a92',
    };
    await expect(validateOAuthAttempt('wrong', stored)).rejects.toMatchObject({
      code: 'OAUTH_STATE_INVALID',
    });
    await expect(
      validateOAuthAttempt(attempt.state, stored, new Date('2026-08-26T10:11:00.000Z')),
    ).rejects.toMatchObject({ code: 'OAUTH_STATE_EXPIRED' });
    await expect(
      validateOAuthAttempt(attempt.state, {
        ...stored,
        usedAt: '2026-08-26T10:01:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'OAUTH_STATE_USED' });
  });

  it('detects a PKCE verifier mismatch', async () => {
    const attempt = await createOAuthAttempt();
    expect(
      await pkceChallenge('different-verifier-value-that-is-long-enough-123456789'),
    ).not.toBe(attempt.codeChallenge);
  });

  it('parses callback success, denial, and missing-code states safely', () => {
    expect(
      parseOAuthCallback(new URL('https://callback.test/?code=abc&state=state')),
    ).toEqual({ kind: 'code', code: 'abc', state: 'state' });
    expect(
      parseOAuthCallback(
        new URL('https://callback.test/?error=access_denied&state=state'),
      ),
    ).toEqual({ kind: 'denied', state: 'state' });
    expect(parseOAuthCallback(new URL('https://callback.test/?state=state'))).toEqual({
      kind: 'invalid',
      code: 'OAUTH_CODE_MISSING',
    });
    expect(parseOAuthCallback(new URL('https://callback.test/?code=abc'))).toEqual({
      kind: 'invalid',
      code: 'OAUTH_STATE_INVALID',
    });
  });

  it('requires both exact YouTube scopes and an offline refresh token', () => {
    expect(REQUIRED_YOUTUBE_SCOPES).toEqual([
      'openid',
      'email',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ]);
    expect(() => assertRequiredScopes(REQUIRED_YOUTUBE_SCOPES)).not.toThrow();
    expect(() => assertRequiredScopes([REQUIRED_YOUTUBE_SCOPES[0]])).toThrow(AppError);
    const tokens = parseGoogleTokenResponse({
      access_token: 'access-token-value-long-enough',
      expires_in: 3600,
      scope: REQUIRED_YOUTUBE_SCOPES.join(' '),
    });
    expect(() => assertOfflineRefreshToken(tokens)).toThrow(AppError);
  });

  it('validates explicit add and connection-scoped reconnect intents', () => {
    expect(oauthStartRequestSchema.parse({ intent: 'ADD' })).toEqual({
      intent: 'ADD',
    });
    expect(
      oauthStartRequestSchema.parse({
        intent: 'RECONNECT',
        connectionId: '86d4f90b-5aa1-43b0-9625-6fe933b730af',
      }),
    ).toEqual({
      intent: 'RECONNECT',
      connectionId: '86d4f90b-5aa1-43b0-9625-6fe933b730af',
    });
    expect(() => oauthStartRequestSchema.parse({ intent: 'RECONNECT' })).toThrow();
    expect(() =>
      oauthStartRequestSchema.parse({
        intent: 'ADD',
        connectionId: crypto.randomUUID(),
      }),
    ).toThrow();
  });

  it('rejects the wrong Google identity on reconnect before mutation', () => {
    expect(reconnectIdentityMatches('google-subject-a', 'google-subject-a')).toBe(true);
    expect(reconnectIdentityMatches('google-subject-a', 'google-subject-b')).toBe(
      false,
    );
    expect(reconnectIdentityMatches('legacy:user-id', 'google-subject-a')).toBe(true);
  });

  it('fails reconnect before mutation when Google omits a new refresh token', () => {
    const existingCredential = 'existing-refresh-credential-remains-valid';
    const tokens = parseGoogleTokenResponse({
      access_token: 'access-token-value-long-enough',
      expires_in: 3600,
      scope: REQUIRED_YOUTUBE_SCOPES.join(' '),
    });
    expect(() => assertOfflineRefreshToken(tokens)).toThrow(
      expect.objectContaining({ code: 'YOUTUBE_REAUTH_REQUIRED' }),
    );
    expect(existingCredential).toBe('existing-refresh-credential-remains-valid');
  });
});
