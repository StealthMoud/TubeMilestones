import { z } from 'zod';
import { AppError } from './errors.ts';
import { base64Url, pkceChallenge, randomBytes, sha256Hex } from './crypto.ts';

export const YOUTUBE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/youtube.readonly';
export const YOUTUBE_ANALYTICS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/yt-analytics.readonly';
export const OPENID_SCOPE = 'openid';
export const EMAIL_SCOPE = 'email';
export const REQUIRED_YOUTUBE_SCOPES = [
  OPENID_SCOPE,
  EMAIL_SCOPE,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
] as const;

export type OAuthIntent = 'ADD' | 'RECONNECT';

export interface StoredOAuthAttemptStatus {
  intent: OAuthIntent;
  targetConnectionId: string | null;
  expiresAt: string;
  usedAt: string | null;
}

export function oauthAttemptStateError(
  attempt: StoredOAuthAttemptStatus | null,
  now = new Date(),
): 'OAUTH_STATE_INVALID' | 'OAUTH_STATE_EXPIRED' | 'OAUTH_STATE_USED' | null {
  if (!attempt) return 'OAUTH_STATE_INVALID';
  if (attempt.usedAt) return 'OAUTH_STATE_USED';
  const expiresAt = new Date(attempt.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return 'OAUTH_STATE_INVALID';
  return expiresAt <= now.getTime() ? 'OAUTH_STATE_EXPIRED' : null;
}

export const oauthStartRequestSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('ADD') }).strict(),
  z.object({ intent: z.literal('RECONNECT'), connectionId: z.uuid() }).strict(),
]);

export interface OAuthAttempt {
  state: string;
  stateHash: string;
  codeVerifier: string;
  codeChallenge: string;
  createdAt: string;
  expiresAt: string;
}

export function buildYouTubeAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): URL {
  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: REQUIRED_YOUTUBE_SCOPES.join(' '),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'select_account consent',
  }).toString();
  return authorizationUrl;
}

export async function createOAuthAttempt(now = new Date()): Promise<OAuthAttempt> {
  const state = base64Url(randomBytes(32));
  const codeVerifier = base64Url(randomBytes(64));
  return {
    state,
    stateHash: await sha256Hex(state),
    codeVerifier,
    codeChallenge: await pkceChallenge(codeVerifier),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1_000).toISOString(),
  };
}

export interface StoredOAuthAttempt {
  stateHash: string;
  codeVerifier: string;
  expiresAt: string;
  usedAt: string | null;
  userId: string;
}

export async function validateOAuthAttempt(
  rawState: string,
  attempt: StoredOAuthAttempt,
  now = new Date(),
): Promise<void> {
  if ((await sha256Hex(rawState)) !== attempt.stateHash) {
    throw new AppError('OAUTH_STATE_INVALID');
  }
  if (attempt.usedAt) throw new AppError('OAUTH_STATE_USED');
  if (Date.parse(attempt.expiresAt) <= now.getTime()) {
    throw new AppError('OAUTH_STATE_EXPIRED');
  }
}

export function hasRequiredScopes(scopes: readonly string[]): boolean {
  const granted = new Set(scopes);
  return REQUIRED_YOUTUBE_SCOPES.every((scope) => granted.has(scope));
}

export function assertRequiredScopes(scopes: readonly string[]): void {
  if (!hasRequiredScopes(scopes)) {
    throw new AppError('YOUTUBE_REAUTH_REQUIRED', {
      message: 'Google identity and both YouTube read-only scopes must be granted.',
    });
  }
}

export function isLegacyGoogleSubject(subject: string): boolean {
  return subject.startsWith('legacy:');
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(20),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(20).optional(),
  scope: z.string().optional(),
  token_type: z.literal('Bearer').or(z.literal('bearer')).optional(),
});

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scopes: string[];
}

export function parseGoogleTokenResponse(input: unknown): GoogleTokenSet {
  const parsed = tokenResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('GOOGLE_REFRESH_FAILED', { cause: parsed.error });
  }
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token ?? null,
    expiresIn: parsed.data.expires_in,
    scopes: (parsed.data.scope ?? '').split(/\s+/u).filter(Boolean),
  };
}

export function assertOfflineRefreshToken(tokens: GoogleTokenSet): string {
  if (!tokens.refreshToken) {
    throw new AppError('YOUTUBE_REAUTH_REQUIRED', {
      message: 'Google did not issue an offline refresh credential.',
    });
  }
  return tokens.refreshToken;
}

export type CallbackInput =
  | { kind: 'code'; code: string; state: string }
  | { kind: 'denied'; state: string }
  | { kind: 'invalid'; code: 'OAUTH_STATE_INVALID' | 'OAUTH_CODE_MISSING' };

export function parseOAuthCallback(url: URL): CallbackInput {
  const state = url.searchParams.get('state')?.trim() ?? '';
  if (!state) return { kind: 'invalid', code: 'OAUTH_STATE_INVALID' };
  if (url.searchParams.has('error')) return { kind: 'denied', state };
  const code = url.searchParams.get('code')?.trim() ?? '';
  if (!code) return { kind: 'invalid', code: 'OAUTH_CODE_MISSING' };
  return { kind: 'code', code, state };
}
