export type TubeMilestonesErrorCode =
  | 'AUTH_REQUIRED'
  | 'CONFIGURATION_ERROR'
  | 'INVALID_REQUEST'
  | 'OAUTH_STATE_INVALID'
  | 'OAUTH_STATE_EXPIRED'
  | 'OAUTH_STATE_USED'
  | 'OAUTH_DENIED'
  | 'OAUTH_CODE_MISSING'
  | 'YOUTUBE_NOT_CONNECTED'
  | 'YOUTUBE_REAUTH_REQUIRED'
  | 'SYNC_IN_PROGRESS'
  | 'SYNC_COOLDOWN'
  | 'GOOGLE_REFRESH_FAILED'
  | 'GOOGLE_IDENTITY_FAILED'
  | 'YOUTUBE_ACCOUNT_MISMATCH'
  | 'YOUTUBE_CHANNELS_ALREADY_CONNECTED'
  | 'YOUTUBE_QUOTA'
  | 'YOUTUBE_API_ERROR'
  | 'ANALYTICS_UNAVAILABLE'
  | 'R2_UNAVAILABLE'
  | 'ARCHIVE_CORRUPT'
  | 'SUPABASE_ERROR'
  | 'DELETION_PENDING'
  | 'FORBIDDEN'
  | 'PRECISION_UNSUPPORTED';

export class TubeMilestonesError extends Error {
  readonly code: TubeMilestonesErrorCode;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    code: TubeMilestonesErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'TubeMilestonesError';
    this.code = code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

export function asTubeMilestonesError(error: unknown): TubeMilestonesError {
  if (error instanceof TubeMilestonesError) return error;
  return new TubeMilestonesError(
    'SUPABASE_ERROR',
    'TubeMilestones could not complete that request.',
    { cause: error },
  );
}

export function userMessageForError(error: unknown): string {
  const typed = asTubeMilestonesError(error);
  const messages: Record<TubeMilestonesErrorCode, string> = {
    AUTH_REQUIRED: 'Sign in to continue.',
    CONFIGURATION_ERROR: 'TubeMilestones cloud sync is not configured yet.',
    INVALID_REQUEST: 'That request could not be processed.',
    OAUTH_STATE_INVALID: 'This connection request is invalid. Start again.',
    OAUTH_STATE_EXPIRED: 'This connection request expired. Start again.',
    OAUTH_STATE_USED: 'This connection request was already used. Start again.',
    OAUTH_DENIED: 'YouTube access was not approved.',
    OAUTH_CODE_MISSING: 'Google did not return an authorization code.',
    YOUTUBE_NOT_CONNECTED: 'Connect a YouTube account to continue.',
    YOUTUBE_REAUTH_REQUIRED: 'Reconnect YouTube to refresh your journey.',
    SYNC_IN_PROGRESS: 'Your channel is already refreshing in another tab.',
    SYNC_COOLDOWN: 'Your channel refreshed recently. Try again in a few minutes.',
    GOOGLE_REFRESH_FAILED: 'Google authorization is temporarily unavailable.',
    GOOGLE_IDENTITY_FAILED: 'Google could not verify the connected account identity.',
    YOUTUBE_ACCOUNT_MISMATCH:
      'Choose the same Google account that belongs to this YouTube connection.',
    YOUTUBE_CHANNELS_ALREADY_CONNECTED:
      'Those YouTube channels are already tracked through another connected account.',
    YOUTUBE_QUOTA: 'YouTube quota is temporarily unavailable.',
    YOUTUBE_API_ERROR: 'YouTube data is temporarily unavailable.',
    ANALYTICS_UNAVAILABLE:
      "Analytics isn't available right now. Channel milestones still work.",
    R2_UNAVAILABLE: 'Older history is temporarily unavailable.',
    ARCHIVE_CORRUPT: 'Older history could not be verified safely.',
    SUPABASE_ERROR: 'TubeMilestones could not complete the request.',
    DELETION_PENDING: 'Your saved YouTube data is being deleted.',
    FORBIDDEN: 'You do not have access to that channel.',
    PRECISION_UNSUPPORTED:
      'A channel statistic is too large to chart safely in this browser.',
  };
  return messages[typed.code];
}
