export type TubeMilestonesErrorCode =
  | 'NETWORK_UNAVAILABLE'
  | 'TIMEOUT'
  | 'OAUTH_REJECTED'
  | 'POPUP_CLOSED'
  | 'TOKEN_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'API_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'NO_CHANNEL'
  | 'ANALYTICS_EMPTY'
  | 'ANALYTICS_UNSUPPORTED_COMBINATION';

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
    'API_ERROR',
    'TubeMilestones could not complete that request.',
    { cause: error },
  );
}

export function userMessageForError(error: unknown): string {
  const typed = asTubeMilestonesError(error);
  const messages: Record<TubeMilestonesErrorCode, string> = {
    NETWORK_UNAVAILABLE: "You're offline. Showing your last saved progress.",
    TIMEOUT: 'YouTube took too long to respond. Please try again.',
    OAUTH_REJECTED: 'YouTube connection was not approved.',
    POPUP_CLOSED: 'The Google account window was closed before connecting.',
    TOKEN_EXPIRED: 'Reconnect YouTube to refresh your progress.',
    PERMISSION_DENIED:
      'TubeMilestones needs both read-only scopes to load channel milestones and Analytics.',
    QUOTA_EXCEEDED:
      'The YouTube API quota is temporarily exhausted. Your saved progress is still available.',
    RATE_LIMITED: 'YouTube asked TubeMilestones to slow down. Try again shortly.',
    SERVER_ERROR: 'YouTube is temporarily unavailable. Try again in a moment.',
    API_ERROR: 'YouTube could not complete the request. Please try again.',
    MALFORMED_RESPONSE: 'YouTube returned data TubeMilestones could not read safely.',
    NO_CHANNEL: 'No YouTube channel found for this Google account.',
    ANALYTICS_EMPTY:
      "Analytics isn't available yet. Your channel milestones still work normally.",
    ANALYTICS_UNSUPPORTED_COMBINATION:
      'YouTube Analytics could not provide this metric combination.',
  };
  return messages[typed.code];
}
