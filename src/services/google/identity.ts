import { TubeMilestonesError } from '../errors';

export const YOUTUBE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/youtube.readonly';
export const YOUTUBE_ANALYTICS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/yt-analytics.readonly';
export const REQUIRED_GOOGLE_SCOPES = [
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
] as const;

const GIS_SCRIPT_ID = 'google-identity-services';
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;

export interface OAuthSession {
  accessToken: string;
  grantedScopes: readonly string[];
  expiresAt: number;
}

export function googleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';
}

export function isGoogleOAuthConfigured(): boolean {
  return googleClientId().length > 0;
}

export function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    const timeout = window.setTimeout(() => {
      reject(
        new TubeMilestonesError(
          'TIMEOUT',
          'Google Identity Services took too long to load.',
          { retryable: true },
        ),
      );
    }, 15_000);

    const cleanup = () => window.clearTimeout(timeout);
    script.addEventListener(
      'load',
      () => {
        cleanup();
        if (window.google?.accounts.oauth2) resolve();
        else {
          reject(
            new TubeMilestonesError(
              'MALFORMED_RESPONSE',
              'Google Identity Services loaded without the OAuth API.',
            ),
          );
        }
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => {
        cleanup();
        reject(
          new TubeMilestonesError(
            'NETWORK_UNAVAILABLE',
            'Google Identity Services could not be loaded.',
            { retryable: true },
          ),
        );
      },
      { once: true },
    );

    if (!existing) {
      script.id = GIS_SCRIPT_ID;
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  }).catch((error: unknown) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

export async function requestGoogleAccessToken(
  prompt: '' | 'consent' | 'select_account' = 'select_account',
): Promise<OAuthSession> {
  const clientId = googleClientId();
  if (!clientId) {
    throw new TubeMilestonesError(
      'OAUTH_REJECTED',
      'Google OAuth is not configured for this deployment.',
    );
  }

  await loadGoogleIdentityServices();
  const oauth2 = window.google?.accounts.oauth2;
  if (!oauth2) {
    throw new TubeMilestonesError(
      'MALFORMED_RESPONSE',
      'Google Identity Services is unavailable.',
    );
  }

  return new Promise<OAuthSession>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: REQUIRED_GOOGLE_SCOPES.join(' '),
      include_granted_scopes: true,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new TubeMilestonesError(
              'OAUTH_REJECTED',
              response.error_description ?? 'Google authorization was not approved.',
            ),
          );
          return;
        }

        const allScopesGranted = oauth2.hasGrantedAllScopes(
          response,
          ...REQUIRED_GOOGLE_SCOPES,
        );
        if (!allScopesGranted) {
          reject(
            new TubeMilestonesError(
              'PERMISSION_DENIED',
              'Both YouTube read-only scopes are required.',
            ),
          );
          return;
        }

        resolve({
          accessToken: response.access_token,
          grantedScopes: (response.scope ?? '')
            .split(/\s+/)
            .filter((scope) => scope.length > 0),
          expiresAt: Date.now() + Math.max(0, response.expires_in ?? 0) * 1_000,
        });
      },
      error_callback: ({ type }) => {
        reject(
          new TubeMilestonesError(
            type === 'popup_closed' ? 'POPUP_CLOSED' : 'OAUTH_REJECTED',
            type === 'popup_closed'
              ? 'Google authorization was closed.'
              : 'Google authorization could not open.',
          ),
        );
      },
    });

    client.requestAccessToken({ prompt });
  });
}

export async function revokeGoogleAccess(accessToken: string): Promise<void> {
  await loadGoogleIdentityServices();
  const oauth2 = window.google?.accounts.oauth2;
  if (!oauth2) return;

  await new Promise<void>((resolve) => {
    oauth2.revoke(accessToken, () => resolve());
  });
}
