export interface BoundedBatchResult<Result> {
  batches: number;
  claimed: number;
  results: Result[];
}

export async function processBoundedClaimBatches<Item, Result>(
  claimBatch: () => Promise<readonly Item[]>,
  processItem: (item: Item) => Promise<Result>,
  maxBatches: number,
): Promise<BoundedBatchResult<Result>> {
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 100) {
    throw new RangeError('Maximum queue batches must be between 1 and 100.');
  }

  const results: Result[] = [];
  let batches = 0;
  let claimed = 0;
  while (batches < maxBatches) {
    const items = await claimBatch();
    if (items.length === 0) break;
    batches += 1;
    claimed += items.length;
    for (const item of items) results.push(await processItem(item));
  }
  return { batches, claimed, results };
}
