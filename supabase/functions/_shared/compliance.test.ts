// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  complianceAction,
  isPermanentGoogleFailure,
  processComplianceClaim,
  type ComplianceProcessingDependencies,
} from './compliance';

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

  function dependencies(
    refreshResult: 'valid' | 'transient' | 'permanent',
    log: string[],
  ): ComplianceProcessingDependencies {
    return {
      readCredential: () => Promise.resolve('stored-refresh-token'),
      refreshCredential: () => {
        log.push('refresh');
        if (refreshResult === 'transient') {
          return Promise.reject(new Error('transient'));
        }
        if (refreshResult === 'permanent') {
          return Promise.reject(new Error('permanent'));
        }
        return Promise.resolve({ refreshToken: 'rotated-token', scopes: ['scope'] });
      },
      storeRotatedCredential: (token) => {
        log.push(`store:${token}`);
        return Promise.resolve();
      },
      markVerified: () => {
        log.push('verified');
        return Promise.resolve(true);
      },
      markFailed: (code, action) => {
        log.push(`failed:${code}:${action}`);
        return Promise.resolve(true);
      },
      queueAuthorizedDataPurge: () => {
        log.push('queue-purge');
        return Promise.resolve(true);
      },
      errorCode: () =>
        refreshResult === 'permanent'
          ? 'YOUTUBE_REAUTH_REQUIRED'
          : 'GOOGLE_REFRESH_FAILED',
    };
  }

  it('refreshes a valid grant, rotates its token, and marks verification', async () => {
    const log: string[] = [];
    await expect(
      processComplianceClaim(
        {
          userId: 'user-1',
          lastAuthorizationVerifiedAt: daysAgo(25),
          grantedScopes: ['scope'],
        },
        dependencies('valid', log),
        now,
      ),
    ).resolves.toBe('VERIFIED');
    expect(log).toEqual(['refresh', 'store:rotated-token', 'verified']);
  });

  it('leaves transient provider failures retryable without purging', async () => {
    const log: string[] = [];
    await expect(
      processComplianceClaim(
        {
          userId: 'user-1',
          lastAuthorizationVerifiedAt: daysAgo(25),
          grantedScopes: ['scope'],
        },
        dependencies('transient', log),
        now,
      ),
    ).resolves.toBe('RETRY_LATER');
    expect(log).toEqual(['refresh', 'failed:GOOGLE_REFRESH_FAILED:VERIFY']);
  });

  it('holds and purges a permanently revoked grant immediately', async () => {
    const log: string[] = [];
    await expect(
      processComplianceClaim(
        {
          userId: 'user-1',
          lastAuthorizationVerifiedAt: daysAgo(25),
          grantedScopes: ['scope'],
        },
        dependencies('permanent', log),
        now,
      ),
    ).resolves.toBe('PURGE_QUEUED');
    expect(log).toEqual([
      'refresh',
      'queue-purge',
      'failed:YOUTUBE_REAUTH_REQUIRED:HOLD_AND_PURGE',
    ]);
  });

  it('applies the existing 30-day purge deadline after a transient failure', async () => {
    const log: string[] = [];
    await expect(
      processComplianceClaim(
        {
          userId: 'user-1',
          lastAuthorizationVerifiedAt: daysAgo(30),
          grantedScopes: ['scope'],
        },
        dependencies('transient', log),
        now,
      ),
    ).resolves.toBe('PURGE_QUEUED');
    expect(log.indexOf('queue-purge')).toBeLessThan(
      log.indexOf('failed:GOOGLE_REFRESH_FAILED:HOLD_AND_PURGE'),
    );
    expect(log).toContain('failed:GOOGLE_REFRESH_FAILED:HOLD_AND_PURGE');
  });

  it('keeps the connection retryable when a purge cannot be queued', async () => {
    const log: string[] = [];
    const deps = dependencies('permanent', log);
    deps.queueAuthorizedDataPurge = () => Promise.resolve(false);
    await expect(
      processComplianceClaim(
        {
          userId: 'user-1',
          lastAuthorizationVerifiedAt: daysAgo(25),
          grantedScopes: ['scope'],
        },
        deps,
        now,
      ),
    ).resolves.toBe('RETRY_LATER');
    expect(log).toContain('failed:YOUTUBE_REAUTH_REQUIRED:VERIFY');
    expect(log).not.toContain('failed:YOUTUBE_REAUTH_REQUIRED:HOLD_AND_PURGE');
  });
});
