// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { pkceChallenge } from './crypto';
import {
  assertOfflineRefreshToken,
  assertRequiredScopes,
  createOAuthAttempt,
  parseGoogleTokenResponse,
  parseOAuthCallback,
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
    expect(() => assertRequiredScopes(REQUIRED_YOUTUBE_SCOPES)).not.toThrow();
    expect(() => assertRequiredScopes([REQUIRED_YOUTUBE_SCOPES[0]])).toThrow(AppError);
    const tokens = parseGoogleTokenResponse({
      access_token: 'access-token-value-long-enough',
      expires_in: 3600,
      scope: REQUIRED_YOUTUBE_SCOPES.join(' '),
    });
    expect(() => assertOfflineRefreshToken(tokens)).toThrow(AppError);
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
