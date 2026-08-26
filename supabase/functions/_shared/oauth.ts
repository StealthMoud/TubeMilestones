import { z } from 'zod';
import { AppError } from './errors.ts';
import { base64Url, pkceChallenge, randomBytes, sha256Hex } from './crypto.ts';

export const YOUTUBE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/youtube.readonly';
export const YOUTUBE_ANALYTICS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/yt-analytics.readonly';
export const REQUIRED_YOUTUBE_SCOPES = [
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
] as const;

export interface OAuthAttempt {
  state: string;
  stateHash: string;
  codeVerifier: string;
  codeChallenge: string;
  createdAt: string;
  expiresAt: string;
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
      message: 'Both required YouTube read-only scopes must be granted.',
    });
  }
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
