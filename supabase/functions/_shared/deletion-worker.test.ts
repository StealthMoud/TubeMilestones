// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_DELETION_ATTEMPTS,
  processDeletionClaim,
  type DeletionProcessingDependencies,
} from './deletion-worker';

function dependencies(
  options: { purgeFails?: boolean; owned?: boolean } = {},
): DeletionProcessingDependencies {
  return {
    purge: () =>
      options.purgeFails
        ? Promise.reject(new Error('r2 unavailable'))
        : Promise.resolve(),
    complete: () => Promise.resolve(options.owned ?? true),
    fail: () => Promise.resolve(options.owned ?? true),
    errorCode: () => 'R2_UNAVAILABLE',
  };
}

describe('claimed deletion processing', () => {
  it('completes only while the worker still owns the claim', async () => {
    await expect(processDeletionClaim({ attempts: 1 }, dependencies())).resolves.toBe(
      'COMPLETE',
    );
    await expect(
      processDeletionClaim({ attempts: 1 }, dependencies({ owned: false })),
    ).resolves.toBe('CLAIM_LOST');
  });

  it('keeps transient R2 failures retryable before the attempt limit', async () => {
    await expect(
      processDeletionClaim({ attempts: 2 }, dependencies({ purgeFails: true })),
    ).resolves.toBe('FAILED_RETRYABLE');
  });

  it('becomes terminal exactly at the configured attempt limit', async () => {
    await expect(
      processDeletionClaim(
        { attempts: MAX_DELETION_ATTEMPTS },
        dependencies({ purgeFails: true }),
      ),
    ).resolves.toBe('FAILED_FINAL');
  });
});
