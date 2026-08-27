// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AppError } from './errors';
import {
  processYouTubeOAuthAuthorization,
  type OAuthCallbackDependencies,
  type OAuthConnectionAttempt,
  type OAuthConnectionCompletionInput,
  type ReconnectTarget,
} from './oauth-callback';
import { REQUIRED_YOUTUBE_SCOPES, type GoogleTokenSet } from './oauth';
import type { GoogleConnectionIdentity } from './google';
import type { ObservedChannel } from './youtube';

const USER_ID = '60000000-0000-4000-8000-000000000001';
const CONNECTION_A = '61000000-0000-4000-8000-000000000001';
const CONNECTION_B = '61000000-0000-4000-8000-000000000002';
const OLD_TOKEN_A = 'existing-refresh-token-account-a';
const OLD_TOKEN_B = 'existing-refresh-token-account-b';
const NEW_TOKEN = 'new-refresh-token-account-a-value';
const ACCESS_TOKEN = 'current-access-token-value';
const REFRESHED_ACCESS_TOKEN = 'refreshed-access-token-value';
const SCOPES = [...REQUIRED_YOUTUBE_SCOPES];

const CHANNEL: ObservedChannel = {
  youtubeChannelId: 'youtube-channel-a',
  title: 'Channel A',
  thumbnailUrl: 'https://example.test/channel-a.png',
  publishedAt: '2020-01-01T00:00:00Z',
  subscriberCount: '100',
  subscriberCountPrecision: 'EXACT',
  hiddenSubscriberCount: false,
  viewCount: '1000',
  videoCount: '10',
  uploadsPlaylistId: 'uploads-a',
};

function tokenSet(refreshToken: string | null): GoogleTokenSet {
  return {
    accessToken: ACCESS_TOKEN,
    refreshToken,
    expiresIn: 3600,
    scopes: SCOPES,
  };
}

function googleIdentity(
  subject: string,
  email: string | null = `${subject}@example.test`,
): GoogleConnectionIdentity {
  return { subject, email, emailVerified: email !== null };
}

function reconnectAttempt(connectionId = CONNECTION_A): OAuthConnectionAttempt {
  return {
    userId: USER_ID,
    codeVerifier: 'pkce-code-verifier',
    intent: 'RECONNECT',
    targetConnectionId: connectionId,
  };
}

interface HarnessOptions {
  tokens?: GoogleTokenSet;
  authorizedIdentity?: GoogleConnectionIdentity;
  targetSubject?: string;
  existingIdentity?: GoogleConnectionIdentity;
  refreshError?: AppError;
}

function createHarness(options: HarnessOptions = {}) {
  const targets = new Map<string, ReconnectTarget>([
    [
      CONNECTION_A,
      {
        id: CONNECTION_A,
        userId: USER_ID,
        googleSubject: options.targetSubject ?? 'google-subject-a',
        grantedScopes: SCOPES,
      },
    ],
    [
      CONNECTION_B,
      {
        id: CONNECTION_B,
        userId: USER_ID,
        googleSubject: 'google-subject-b',
        grantedScopes: SCOPES,
      },
    ],
  ]);
  const credentials = new Map<string, string>([
    [CONNECTION_A, OLD_TOKEN_A],
    [CONNECTION_B, OLD_TOKEN_B],
  ]);
  const channelState = new Map<string, string[]>([
    [CONNECTION_A, ['youtube-channel-a']],
    [CONNECTION_B, ['youtube-channel-b']],
  ]);
  const readRequests: Array<{ connectionId: string; userId: string }> = [];
  const completed = vi.fn((input: OAuthConnectionCompletionInput) => {
    if (input.targetConnectionId) {
      const target = targets.get(input.targetConnectionId);
      if (target) target.googleSubject = input.googleSubject;
      credentials.set(input.targetConnectionId, input.refreshToken);
      channelState.set(
        input.targetConnectionId,
        input.channels.map(({ youtubeChannelId }) => youtubeChannelId),
      );
    }
    return Promise.resolve(input);
  });
  const dependencies: OAuthCallbackDependencies<OAuthConnectionCompletionInput> = {
    exchangeCode: vi.fn().mockResolvedValue(options.tokens ?? tokenSet(NEW_TOKEN)),
    fetchIdentity(accessToken) {
      return Promise.resolve(
        accessToken === REFRESHED_ACCESS_TOKEN
          ? (options.existingIdentity ?? googleIdentity('google-subject-a'))
          : (options.authorizedIdentity ?? googleIdentity('google-subject-a')),
      );
    },
    loadReconnectTarget(connectionId, userId) {
      const target = targets.get(connectionId);
      return Promise.resolve(target?.userId === userId ? target : null);
    },
    readRefreshToken(connectionId, userId) {
      readRequests.push({ connectionId, userId });
      const target = targets.get(connectionId);
      return Promise.resolve(
        target?.userId === userId ? (credentials.get(connectionId) ?? null) : null,
      );
    },
    refreshAccessToken() {
      if (options.refreshError) return Promise.reject(options.refreshError);
      return Promise.resolve({
        accessToken: REFRESHED_ACCESS_TOKEN,
        refreshToken: null,
        expiresIn: 3600,
        scopes: SCOPES,
      });
    },
    fetchChannels: vi.fn().mockResolvedValue([CHANNEL]),
    completeConnection: completed,
    now: () => new Date('2026-08-27T12:00:00.000Z'),
  };
  return { targets, credentials, channelState, readRequests, completed, dependencies };
}

describe('YouTube OAuth callback credential semantics', () => {
  it('completes ADD when Google supplies a refresh token', async () => {
    const harness = createHarness();
    const result = await processYouTubeOAuthAuthorization(
      {
        userId: USER_ID,
        codeVerifier: 'pkce-code-verifier',
        intent: 'ADD',
        targetConnectionId: null,
      },
      'authorization-code',
      harness.dependencies,
    );
    expect(result.refreshToken).toBe(NEW_TOKEN);
    expect(result.targetConnectionId).toBeNull();
    expect(harness.completed).toHaveBeenCalledOnce();
  });

  it('rejects ADD without a refresh token before persistent mutation', async () => {
    const harness = createHarness({ tokens: tokenSet(null) });
    await expect(
      processYouTubeOAuthAuthorization(
        {
          userId: USER_ID,
          codeVerifier: 'pkce-code-verifier',
          intent: 'ADD',
          targetConnectionId: null,
        },
        'authorization-code',
        harness.dependencies,
      ),
    ).rejects.toMatchObject({ code: 'YOUTUBE_REAUTH_REQUIRED' });
    expect(harness.completed).not.toHaveBeenCalled();
  });

  it('rotates a normal RECONNECT credential when Google supplies a new one', async () => {
    const harness = createHarness();
    await processYouTubeOAuthAuthorization(
      reconnectAttempt(),
      'authorization-code',
      harness.dependencies,
    );
    expect(harness.credentials.get(CONNECTION_A)).toBe(NEW_TOKEN);
    expect(harness.readRequests).toEqual([]);
  });

  it('reuses only the target normal connection credential when Google omits one', async () => {
    const harness = createHarness({ tokens: tokenSet(null) });
    const result = await processYouTubeOAuthAuthorization(
      reconnectAttempt(),
      'authorization-code',
      harness.dependencies,
    );
    expect(result.refreshToken).toBe(OLD_TOKEN_A);
    expect(harness.readRequests).toEqual([
      { connectionId: CONNECTION_A, userId: USER_ID },
    ]);
    expect(harness.credentials.get(CONNECTION_B)).toBe(OLD_TOKEN_B);
  });

  it('rejects the wrong normal Google subject without touching the old token', async () => {
    const harness = createHarness({
      tokens: tokenSet(null),
      authorizedIdentity: googleIdentity('google-subject-b'),
    });
    await expect(
      processYouTubeOAuthAuthorization(
        reconnectAttempt(),
        'authorization-code',
        harness.dependencies,
      ),
    ).rejects.toMatchObject({ code: 'YOUTUBE_ACCOUNT_MISMATCH' });
    expect(harness.credentials.get(CONNECTION_A)).toBe(OLD_TOKEN_A);
    expect(harness.readRequests).toEqual([]);
    expect(harness.completed).not.toHaveBeenCalled();
  });

  it('verifies and upgrades a legacy connection when the old token has the same subject', async () => {
    const harness = createHarness({
      tokens: tokenSet(null),
      targetSubject: `legacy:${USER_ID}`,
      authorizedIdentity: googleIdentity('google-subject-a', null),
      existingIdentity: googleIdentity(
        'google-subject-a',
        'verified-owner@example.test',
      ),
    });
    const result = await processYouTubeOAuthAuthorization(
      reconnectAttempt(),
      'authorization-code',
      harness.dependencies,
    );
    expect(result.googleSubject).toBe('google-subject-a');
    expect(result.googleEmail).toBe('verified-owner@example.test');
    expect(result.refreshToken).toBe(OLD_TOKEN_A);
    expect(harness.targets.get(CONNECTION_A)?.googleSubject).toBe('google-subject-a');
  });

  it('rejects legacy credential reuse when the old token resolves another subject', async () => {
    const harness = createHarness({
      tokens: tokenSet(null),
      targetSubject: `legacy:${USER_ID}`,
      existingIdentity: googleIdentity('different-google-subject'),
    });
    await expect(
      processYouTubeOAuthAuthorization(
        reconnectAttempt(),
        'authorization-code',
        harness.dependencies,
      ),
    ).rejects.toMatchObject({ code: 'YOUTUBE_ACCOUNT_MISMATCH' });
    expect(harness.targets.get(CONNECTION_A)?.googleSubject).toBe(`legacy:${USER_ID}`);
    expect(harness.credentials.get(CONNECTION_A)).toBe(OLD_TOKEN_A);
  });

  it('requires new consent when a legacy connection old token is invalid', async () => {
    const harness = createHarness({
      tokens: tokenSet(null),
      targetSubject: `legacy:${USER_ID}`,
      refreshError: new AppError('YOUTUBE_REAUTH_REQUIRED'),
    });
    await expect(
      processYouTubeOAuthAuthorization(
        reconnectAttempt(),
        'authorization-code',
        harness.dependencies,
      ),
    ).rejects.toMatchObject({ code: 'YOUTUBE_REAUTH_REQUIRED' });
    expect(harness.credentials.get(CONNECTION_A)).toBe(OLD_TOKEN_A);
    expect(harness.completed).not.toHaveBeenCalled();
  });

  it('never falls back to another connection credential', async () => {
    const harness = createHarness({ tokens: tokenSet(null) });
    harness.credentials.delete(CONNECTION_A);
    await expect(
      processYouTubeOAuthAuthorization(
        reconnectAttempt(),
        'authorization-code',
        harness.dependencies,
      ),
    ).rejects.toMatchObject({ code: 'YOUTUBE_REAUTH_REQUIRED' });
    expect(harness.readRequests).toEqual([
      { connectionId: CONNECTION_A, userId: USER_ID },
    ]);
    expect(harness.credentials.get(CONNECTION_B)).toBe(OLD_TOKEN_B);
  });

  it('preserves connection, credential, and channel state after failed reconnect', async () => {
    const harness = createHarness({
      tokens: tokenSet(null),
      authorizedIdentity: googleIdentity('wrong-google-subject'),
    });
    const before = {
      subject: harness.targets.get(CONNECTION_A)?.googleSubject,
      credential: harness.credentials.get(CONNECTION_A),
      channels: [...(harness.channelState.get(CONNECTION_A) ?? [])],
    };
    await expect(
      processYouTubeOAuthAuthorization(
        reconnectAttempt(),
        'authorization-code',
        harness.dependencies,
      ),
    ).rejects.toMatchObject({ code: 'YOUTUBE_ACCOUNT_MISMATCH' });
    expect({
      subject: harness.targets.get(CONNECTION_A)?.googleSubject,
      credential: harness.credentials.get(CONNECTION_A),
      channels: harness.channelState.get(CONNECTION_A),
    }).toEqual(before);
    expect(harness.completed).not.toHaveBeenCalled();
  });
});
