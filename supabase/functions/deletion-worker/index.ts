import type { Database } from '../../database.types.ts';
import { adminClient, assertAutomationRequest } from '../_shared/auth.ts';
import {
  processDeletionClaim,
  type DeletionProcessingResult,
} from '../_shared/deletion-worker.ts';
import { databasePurgeDependencies, runPurgePipeline } from '../_shared/deletion.ts';
import { AppError, asAppError, jsonResponse } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/handler.ts';

const BATCH_SIZE = 25;

type Admin = ReturnType<typeof adminClient>;
type DeletionClaim =
  Database['public']['Functions']['claim_deletion_requests']['Returns'][number];

async function updateOwnedDeletion(
  admin: Admin,
  deletion: DeletionClaim,
  values: {
    status: 'COMPLETE' | 'FAILED_RETRYABLE' | 'FAILED_FINAL';
    claim_id: null;
    completed_at?: string;
    last_error: string | null;
  },
): Promise<boolean> {
  const result = await admin
    .from('data_deletion_requests')
    .update(values)
    .eq('id', deletion.id)
    .eq('claim_id', deletion.claim_id)
    .select('id')
    .maybeSingle();
  if (result.error) throw new AppError('SUPABASE_ERROR', { cause: result.error });
  return Boolean(result.data);
}

Deno.serve((request) =>
  handleRequest(request, 'deletion-worker', async () => {
    assertAutomationRequest(request);
    const admin = adminClient();
    const claimId = crypto.randomUUID();
    const claimed = await admin.rpc('claim_deletion_requests', {
      p_batch_size: BATCH_SIZE,
      p_claim_id: claimId,
    });
    if (claimed.error) throw new AppError('SUPABASE_ERROR', { cause: claimed.error });

    const results: DeletionProcessingResult[] = [];
    for (const deletion of claimed.data ?? []) {
      results.push(
        await processDeletionClaim(deletion, {
          purge: () =>
            runPurgePipeline(
              databasePurgeDependencies(admin, deletion.user_id),
              deletion.type === 'ACCOUNT_DELETE',
            ),
          complete: () =>
            updateOwnedDeletion(admin, deletion, {
              status: 'COMPLETE',
              claim_id: null,
              completed_at: new Date().toISOString(),
              last_error: null,
            }),
          fail: (terminal, code) =>
            updateOwnedDeletion(admin, deletion, {
              status: terminal ? 'FAILED_FINAL' : 'FAILED_RETRYABLE',
              claim_id: null,
              last_error: code,
            }),
          errorCode: (error) => asAppError(error, 'SUPABASE_ERROR').code,
        }),
      );
    }

    const count = (result: DeletionProcessingResult) =>
      results.filter((candidate) => candidate === result).length;
    return jsonResponse({
      checked: claimed.data?.length ?? 0,
      completed: count('COMPLETE'),
      retryable: count('FAILED_RETRYABLE'),
      terminal: count('FAILED_FINAL'),
      claimLost: count('CLAIM_LOST'),
    });
  }),
);
