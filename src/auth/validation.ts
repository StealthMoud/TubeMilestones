export const AUTH_EMAIL_MAX_LENGTH = 254;
export const AUTH_PASSWORD_MIN_LENGTH = 8;
export const AUTH_PASSWORD_MAX_LENGTH = 1_024;

export function normalizeAuthEmail(value: string): string {
  return value.trim();
}

export function authEmailError(value: string): string | null {
  const email = normalizeAuthEmail(value);
  if (
    email.length === 0 ||
    email.length > AUTH_EMAIL_MAX_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  ) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function authPasswordError(password: string): string | null {
  if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > AUTH_PASSWORD_MAX_LENGTH) {
    return 'Password is too long.';
  }
  return null;
}

export function authPasswordConfirmationError(
  password: string,
  confirmation: string,
): string | null {
  return password === confirmation ? null : 'Passwords do not match.';
}
