import {
  authEmailError,
  authPasswordConfirmationError,
  authPasswordError,
  normalizeAuthEmail,
} from './validation';

describe('application auth validation', () => {
  it('trims email but never alters password content', () => {
    expect(normalizeAuthEmail('  creator@example.com  ')).toBe('creator@example.com');
    expect(authPasswordError('  pass  ')).toBeNull();
  });

  it('requires a valid-looking email and an eight-character password', () => {
    expect(authEmailError('not-an-email')).toBe('Enter a valid email address.');
    expect(authEmailError('creator@example.com')).toBeNull();
    expect(authPasswordError('1234567')).toBe(
      'Password must be at least 8 characters.',
    );
    expect(authPasswordError('12345678')).toBeNull();
  });

  it('requires exact password confirmation', () => {
    expect(authPasswordConfirmationError('password', 'passworD')).toBe(
      'Passwords do not match.',
    );
    expect(authPasswordConfirmationError('password', 'password')).toBeNull();
  });
});
