// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { processBoundedClaimBatches } from './work-queue';

describe('bounded worker batches', () => {
  it('makes oldest-first progress across more than 100 due records', async () => {
    const queue = Array.from({ length: 250 }, (_, index) => index);
    const processed: number[] = [];
    const claimBatch = () => Promise.resolve(queue.splice(0, 50));
    const processItem = (item: number) => {
      processed.push(item);
      return Promise.resolve(item);
    };

    const first = await processBoundedClaimBatches(claimBatch, processItem, 4);
    expect(first).toMatchObject({ batches: 4, claimed: 200 });
    expect(processed).toEqual(Array.from({ length: 200 }, (_, index) => index));

    const second = await processBoundedClaimBatches(claimBatch, processItem, 4);
    expect(second).toMatchObject({ batches: 1, claimed: 50 });
    expect(processed).toEqual(Array.from({ length: 250 }, (_, index) => index));
  });

  it('stops immediately when no work remains', async () => {
    let claims = 0;
    const result = await processBoundedClaimBatches(
      () => {
        claims += 1;
        return Promise.resolve([]);
      },
      () => Promise.resolve('unused'),
      4,
    );
    expect(result).toEqual({ batches: 0, claimed: 0, results: [] });
    expect(claims).toBe(1);
  });
});
