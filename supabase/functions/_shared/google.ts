import { z } from 'zod';
import { requiredEnv } from './env.ts';
import { AppError } from './errors.ts';
import {
  assertRequiredScopes,
  parseGoogleTokenResponse,
  type GoogleTokenSet,
} from './oauth.ts';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

const userInfoSchema = z
  .object({
    sub: z.string().min(1).max(255),
    email: z.email().max(320).optional(),
    email_verified: z.boolean().optional(),
  })
  .passthrough();

export interface GoogleConnectionIdentity {
  subject: string;
  email: string | null;
  emailVerified: boolean;
}

async function postTokenForm(form: URLSearchParams): Promise<GoogleTokenSet> {
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new AppError('GOOGLE_REFRESH_FAILED', { cause: error, retryable: true });
  }

  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const code =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : 'unknown';
    throw new AppError(
      code === 'invalid_grant' ? 'YOUTUBE_REAUTH_REQUIRED' : 'GOOGLE_REFRESH_FAILED',
      { retryable: code !== 'invalid_grant' },
    );
  }
  return parseGoogleTokenResponse(body);
}

export async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
): Promise<GoogleTokenSet> {
  const tokens = await postTokenForm(
    new URLSearchParams({
      client_id: requiredEnv('GOOGLE_YOUTUBE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_YOUTUBE_CLIENT_SECRET'),
      redirect_uri: requiredEnv('GOOGLE_YOUTUBE_REDIRECT_URI'),
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
    }),
  );
  assertRequiredScopes(tokens.scopes);
  return tokens;
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
  previouslyGrantedScopes: readonly string[],
): Promise<GoogleTokenSet> {
  const tokens = await postTokenForm(
    new URLSearchParams({
      client_id: requiredEnv('GOOGLE_YOUTUBE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_YOUTUBE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  );
  const scopes =
    tokens.scopes.length > 0 ? tokens.scopes : [...previouslyGrantedScopes];
  assertRequiredScopes(scopes);
  return { ...tokens, scopes };
}

export async function fetchGoogleConnectionIdentity(
  accessToken: string,
): Promise<GoogleConnectionIdentity> {
  let response: Response;
  try {
    response = await fetch(USERINFO_ENDPOINT, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new AppError('GOOGLE_IDENTITY_FAILED', {
      cause: error,
      retryable: true,
    });
  }
  const body = (await response.json().catch(() => null)) as unknown;
  const parsed = userInfoSchema.safeParse(body);
  if (!response.ok || !parsed.success) {
    throw new AppError('GOOGLE_IDENTITY_FAILED', {
      cause: parsed.success ? undefined : parsed.error,
      retryable: response.status >= 500,
    });
  }
  const emailVerified = parsed.data.email_verified === true;
  return {
    subject: parsed.data.sub,
    email: emailVerified ? (parsed.data.email ?? null) : null,
    emailVerified,
  };
}

export async function revokeGoogleCredential(token: string): Promise<boolean> {
  try {
    const response = await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}
