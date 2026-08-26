// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  authUserIsAlreadyAbsent,
  runPurgePipeline,
  type PurgeDependencies,
} from './deletion';

function dependencies(log: string[], failAt?: string): PurgeDependencies {
  const step = (name: string) => () => {
    log.push(name);
    return failAt === name ? Promise.reject(new Error(name)) : Promise.resolve();
  };
  return {
    markUnavailable: step('unavailable'),
    revokeGoogle: step('revoke'),
    deleteVaultCredential: step('vault'),
    deleteArchives: step('r2'),
    deleteAuthorizedRows: step('authorized'),
    deleteAccountRows: step('account'),
    deleteAuthUser: step('auth'),
  };
}

describe('cross-system deletion pipeline', () => {
  it('uses the required order and retains the app account on disconnect', async () => {
    const log: string[] = [];
    await runPurgePipeline(dependencies(log), false);
    expect(log).toEqual(['unavailable', 'revoke', 'vault', 'r2', 'authorized']);
  });

  it('continues through account rows and Auth for account deletion', async () => {
    const log: string[] = [];
    await runPurgePipeline(dependencies(log), true);
    expect(log).toEqual([
      'unavailable',
      'revoke',
      'vault',
      'r2',
      'authorized',
      'account',
      'auth',
    ]);
  });

  it('continues credential and data deletion when Google revocation fails', async () => {
    const log: string[] = [];
    await runPurgePipeline(dependencies(log, 'revoke'), false);
    expect(log).toEqual(['unavailable', 'revoke', 'vault', 'r2', 'authorized']);
  });

  it('does not remove Auth when a Postgres account-row deletion fails', async () => {
    const log: string[] = [];
    await expect(runPurgePipeline(dependencies(log, 'account'), true)).rejects.toThrow(
      'account',
    );
    expect(log).toEqual([
      'unavailable',
      'revoke',
      'vault',
      'r2',
      'authorized',
      'account',
    ]);
  });

  it('stops before Postgres deletion on R2 failure and is retryable/idempotent', async () => {
    const failed: string[] = [];
    await expect(runPurgePipeline(dependencies(failed, 'r2'), false)).rejects.toThrow(
      'r2',
    );
    expect(failed).toEqual(['unavailable', 'revoke', 'vault', 'r2']);
    const retry: string[] = [];
    await runPurgePipeline(dependencies(retry), false);
    await runPurgePipeline(dependencies(retry), false);
    expect(retry.filter((step) => step === 'authorized')).toHaveLength(2);
  });

  it('treats a previously deleted Auth identity as an idempotent retry', () => {
    expect(authUserIsAlreadyAbsent({ status: 404 })).toBe(true);
    expect(authUserIsAlreadyAbsent({ code: 'user_not_found' })).toBe(true);
    expect(authUserIsAlreadyAbsent({ status: 500 })).toBe(false);
  });
});
