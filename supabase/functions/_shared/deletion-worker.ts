export const MAX_DELETION_ATTEMPTS = 10;

export type DeletionProcessingResult =
  'COMPLETE' | 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'CLAIM_LOST';

export interface ClaimedDeletion {
  attempts: number;
}

export interface DeletionProcessingDependencies {
  purge(): Promise<void>;
  complete(): Promise<boolean>;
  fail(terminal: boolean, code: string): Promise<boolean>;
  errorCode(error: unknown): string;
}

export async function processDeletionClaim(
  deletion: ClaimedDeletion,
  dependencies: DeletionProcessingDependencies,
): Promise<DeletionProcessingResult> {
  try {
    await dependencies.purge();
    return (await dependencies.complete()) ? 'COMPLETE' : 'CLAIM_LOST';
  } catch (error) {
    const terminal = deletion.attempts >= MAX_DELETION_ATTEMPTS;
    const owned = await dependencies.fail(terminal, dependencies.errorCode(error));
    if (!owned) return 'CLAIM_LOST';
    return terminal ? 'FAILED_FINAL' : 'FAILED_RETRYABLE';
  }
}
