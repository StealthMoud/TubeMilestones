// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { complianceAction, isPermanentGoogleFailure } from './compliance';

describe('authorization compliance window', () => {
  const now = new Date('2026-08-26T12:00:00.000Z');
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1_000).toISOString();

  it('does nothing at day 24 and verifies from day 25', () => {
    expect(complianceAction(daysAgo(24), now)).toBe('NONE');
    expect(complianceAction(daysAgo(25), now)).toBe('VERIFY');
  });

  it('holds and purges at day 30 only after verification failure', () => {
    expect(complianceAction(daysAgo(30), now, false)).toBe('VERIFY');
    expect(complianceAction(daysAgo(30), now, true)).toBe('HOLD_AND_PURGE');
  });

  it('treats invalid_grant mapping as permanent but a Google 500 as transient', () => {
    expect(isPermanentGoogleFailure('YOUTUBE_REAUTH_REQUIRED')).toBe(true);
    expect(isPermanentGoogleFailure('GOOGLE_REFRESH_FAILED')).toBe(false);
  });
});
