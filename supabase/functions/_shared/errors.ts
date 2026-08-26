export type ErrorCode =
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
  | 'YOUTUBE_QUOTA'
  | 'YOUTUBE_API_ERROR'
  | 'ANALYTICS_UNAVAILABLE'
  | 'R2_UNAVAILABLE'
  | 'ARCHIVE_CORRUPT'
  | 'SUPABASE_ERROR'
  | 'DELETION_PENDING'
  | 'FORBIDDEN';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  CONFIGURATION_ERROR: 503,
  INVALID_REQUEST: 400,
  OAUTH_STATE_INVALID: 400,
  OAUTH_STATE_EXPIRED: 400,
  OAUTH_STATE_USED: 409,
  OAUTH_DENIED: 400,
  OAUTH_CODE_MISSING: 400,
  YOUTUBE_NOT_CONNECTED: 409,
  YOUTUBE_REAUTH_REQUIRED: 401,
  SYNC_IN_PROGRESS: 409,
  SYNC_COOLDOWN: 429,
  GOOGLE_REFRESH_FAILED: 502,
  YOUTUBE_QUOTA: 429,
  YOUTUBE_API_ERROR: 502,
  ANALYTICS_UNAVAILABLE: 502,
  R2_UNAVAILABLE: 503,
  ARCHIVE_CORRUPT: 502,
  SUPABASE_ERROR: 500,
  DELETION_PENDING: 409,
  FORBIDDEN: 403,
};

const PUBLIC_MESSAGES: Record<ErrorCode, string> = {
  AUTH_REQUIRED: 'Sign in to continue.',
  CONFIGURATION_ERROR: 'This service is not configured yet.',
  INVALID_REQUEST: 'The request could not be processed.',
  OAUTH_STATE_INVALID: 'This authorization request is invalid. Please start again.',
  OAUTH_STATE_EXPIRED: 'This authorization request expired. Please start again.',
  OAUTH_STATE_USED: 'This authorization request was already used. Please start again.',
  OAUTH_DENIED: 'YouTube access was not approved.',
  OAUTH_CODE_MISSING: 'Google did not return an authorization code.',
  YOUTUBE_NOT_CONNECTED: 'Connect YouTube to continue.',
  YOUTUBE_REAUTH_REQUIRED: 'Reconnect YouTube to continue.',
  SYNC_IN_PROGRESS: 'Another sync is already in progress.',
  SYNC_COOLDOWN: 'TubeMilestones refreshed recently. Please wait a few minutes.',
  GOOGLE_REFRESH_FAILED: 'Google authorization could not be refreshed.',
  YOUTUBE_QUOTA: 'YouTube quota is temporarily unavailable.',
  YOUTUBE_API_ERROR: 'YouTube data is temporarily unavailable.',
  ANALYTICS_UNAVAILABLE: 'YouTube Analytics is temporarily unavailable.',
  R2_UNAVAILABLE: 'Older history is temporarily unavailable.',
  ARCHIVE_CORRUPT: 'Older history could not be verified.',
  SUPABASE_ERROR: 'TubeMilestones could not complete the request.',
  DELETION_PENDING: 'Deletion is already in progress.',
  FORBIDDEN: 'You do not have access to this resource.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    options: { cause?: unknown; message?: string; retryable?: boolean } = {},
  ) {
    super(options.message ?? PUBLIC_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }
}

export function asAppError(error: unknown, fallback: ErrorCode): AppError {
  return error instanceof AppError
    ? error
    : new AppError(fallback, {
        cause: error,
        retryable: fallback !== 'INVALID_REQUEST',
      });
}

export interface SafeErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
  };
}

export function safeErrorBody(error: AppError, requestId: string): SafeErrorBody {
  return {
    error: {
      code: error.code,
      message: PUBLIC_MESSAGES[error.code],
      retryable: error.retryable,
      requestId,
    },
  };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { ...init, headers });
}
