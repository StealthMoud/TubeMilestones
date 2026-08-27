export type ApplicationAuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'PASSWORD_REJECTED'
  | 'PASSWORD_UNCHANGED'
  | 'REAUTHENTICATION_REQUIRED'
  | 'RATE_LIMITED'
  | 'INVALID_EMAIL'
  | 'REQUEST_FAILED';

export class ApplicationAuthError extends Error {
  readonly code: ApplicationAuthErrorCode;

  constructor(code: ApplicationAuthErrorCode, options: { cause?: unknown } = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ApplicationAuthError';
    this.code = code;
  }
}

export function asApplicationAuthError(error: unknown): ApplicationAuthError {
  if (error instanceof ApplicationAuthError) return error;
  const code =
    error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'invalid_credentials':
      return new ApplicationAuthError('INVALID_CREDENTIALS', { cause: error });
    case 'email_not_confirmed':
      return new ApplicationAuthError('EMAIL_NOT_CONFIRMED', { cause: error });
    case 'weak_password':
      return new ApplicationAuthError('PASSWORD_REJECTED', { cause: error });
    case 'same_password':
      return new ApplicationAuthError('PASSWORD_UNCHANGED', { cause: error });
    case 'reauthentication_needed':
    case 'reauthentication_not_valid':
    case 'reauth_nonce_missing':
      return new ApplicationAuthError('REAUTHENTICATION_REQUIRED', {
        cause: error,
      });
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return new ApplicationAuthError('RATE_LIMITED', { cause: error });
    case 'email_address_invalid':
      return new ApplicationAuthError('INVALID_EMAIL', { cause: error });
    default:
      return new ApplicationAuthError('REQUEST_FAILED', { cause: error });
  }
}

export function applicationAuthErrorMessage(error: unknown): string {
  const typed = asApplicationAuthError(error);
  const messages: Record<ApplicationAuthErrorCode, string> = {
    INVALID_CREDENTIALS: 'Email or password is incorrect.',
    EMAIL_NOT_CONFIRMED: 'Please confirm your email before signing in.',
    PASSWORD_REJECTED: 'That password does not meet the account security requirements.',
    PASSWORD_UNCHANGED: 'Choose a different password for this account.',
    REAUTHENTICATION_REQUIRED:
      'Sign out and sign in again before changing your password.',
    RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
    INVALID_EMAIL: 'Enter a valid email address.',
    REQUEST_FAILED: "We couldn't complete that request. Try again shortly.",
  };
  return messages[typed.code];
}
