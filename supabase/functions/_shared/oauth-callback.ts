import { AppError } from './errors.ts';
import type { GoogleConnectionIdentity, refreshGoogleAccessToken } from './google.ts';
import {
  assertOfflineRefreshToken,
  isLegacyGoogleSubject,
  type GoogleTokenSet,
  type OAuthIntent,
} from './oauth.ts';
import type { ObservedChannel } from './youtube.ts';

export interface OAuthConnectionAttempt {
  userId: string;
  codeVerifier: string;
  intent: OAuthIntent;
  targetConnectionId: string | null;
}

export interface ReconnectTarget {
  id: string;
  userId: string;
  googleSubject: string;
  grantedScopes: string[];
}

export interface OAuthConnectionCompletionInput {
  userId: string;
  intent: OAuthIntent;
  targetConnectionId: string | null;
  googleSubject: string;
  googleEmail: string | null;
  refreshToken: string;
  grantedScopes: string[];
  channels: ObservedChannel[];
  observedAt: string;
}

export interface OAuthCallbackDependencies<Result> {
  exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokenSet>;
  fetchIdentity(accessToken: string): Promise<GoogleConnectionIdentity>;
  loadReconnectTarget(
    connectionId: string,
    userId: string,
  ): Promise<ReconnectTarget | null>;
  readRefreshToken(connectionId: string, userId: string): Promise<string | null>;
  refreshAccessToken: typeof refreshGoogleAccessToken;
  fetchChannels(accessToken: string): Promise<ObservedChannel[]>;
  completeConnection(input: OAuthConnectionCompletionInput): Promise<Result>;
  now?: () => Date;
}

interface PersistentAuthorization {
  googleSubject: string;
  googleEmail: string | null;
  refreshToken: string;
}

function requireStoredRefreshToken(value: string | null): string {
  if (!value || value.length < 20) {
    throw new AppError('YOUTUBE_REAUTH_REQUIRED', {
      message: 'The existing YouTube refresh credential is unavailable.',
    });
  }
  return value;
}

async function resolveReconnectAuthorization(
  attempt: OAuthConnectionAttempt,
  target: ReconnectTarget,
  tokens: GoogleTokenSet,
  authorizedIdentity: GoogleConnectionIdentity,
  dependencies: Pick<
    OAuthCallbackDependencies<unknown>,
    'readRefreshToken' | 'refreshAccessToken' | 'fetchIdentity'
  >,
): Promise<PersistentAuthorization> {
  const legacy = isLegacyGoogleSubject(target.googleSubject);
  if (!legacy && target.googleSubject !== authorizedIdentity.subject) {
    throw new AppError('YOUTUBE_ACCOUNT_MISMATCH');
  }

  if (tokens.refreshToken) {
    return {
      googleSubject: authorizedIdentity.subject,
      googleEmail: authorizedIdentity.email,
      refreshToken: tokens.refreshToken,
    };
  }

  const existingRefreshToken = requireStoredRefreshToken(
    await dependencies.readRefreshToken(target.id, attempt.userId),
  );
  if (!legacy) {
    return {
      googleSubject: authorizedIdentity.subject,
      googleEmail: authorizedIdentity.email,
      refreshToken: existingRefreshToken,
    };
  }

  const refreshed = await dependencies.refreshAccessToken(
    existingRefreshToken,
    target.grantedScopes,
  );
  const existingIdentity = await dependencies.fetchIdentity(refreshed.accessToken);
  if (existingIdentity.subject !== authorizedIdentity.subject) {
    throw new AppError('YOUTUBE_ACCOUNT_MISMATCH');
  }

  return {
    googleSubject: authorizedIdentity.subject,
    googleEmail: authorizedIdentity.email ?? existingIdentity.email,
    refreshToken: existingRefreshToken,
  };
}

export async function processYouTubeOAuthAuthorization<Result>(
  attempt: OAuthConnectionAttempt,
  code: string,
  dependencies: OAuthCallbackDependencies<Result>,
): Promise<Result> {
  const validTargetShape =
    (attempt.intent === 'ADD' && attempt.targetConnectionId === null) ||
    (attempt.intent === 'RECONNECT' && attempt.targetConnectionId !== null);
  if (!validTargetShape) throw new AppError('OAUTH_STATE_INVALID');

  const tokens = await dependencies.exchangeCode(code, attempt.codeVerifier);
  const authorizedIdentity = await dependencies.fetchIdentity(tokens.accessToken);
  let authorization: PersistentAuthorization;

  if (attempt.intent === 'ADD') {
    authorization = {
      googleSubject: authorizedIdentity.subject,
      googleEmail: authorizedIdentity.email,
      refreshToken: assertOfflineRefreshToken(tokens),
    };
  } else {
    const targetConnectionId = attempt.targetConnectionId;
    if (!targetConnectionId) throw new AppError('OAUTH_STATE_INVALID');
    const target = await dependencies.loadReconnectTarget(
      targetConnectionId,
      attempt.userId,
    );
    if (
      !target ||
      target.id !== targetConnectionId ||
      target.userId !== attempt.userId
    ) {
      throw new AppError('FORBIDDEN');
    }
    authorization = await resolveReconnectAuthorization(
      attempt,
      target,
      tokens,
      authorizedIdentity,
      dependencies,
    );
  }

  const channels = await dependencies.fetchChannels(tokens.accessToken);
  if (channels.length === 0) throw new AppError('YOUTUBE_API_ERROR');

  return dependencies.completeConnection({
    userId: attempt.userId,
    intent: attempt.intent,
    targetConnectionId: attempt.targetConnectionId,
    googleSubject: authorization.googleSubject,
    googleEmail: authorization.googleEmail,
    refreshToken: authorization.refreshToken,
    grantedScopes: tokens.scopes,
    channels,
    observedAt: (dependencies.now?.() ?? new Date()).toISOString(),
  });
}
