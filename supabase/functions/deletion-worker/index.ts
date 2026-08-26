import { adminClient, assertAutomationRequest } from '../_shared/auth.ts';
import { databasePurgeDependencies, runPurgePipeline } from '../_shared/deletion.ts';
import { AppError, asAppError, jsonResponse } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/handler.ts';

Deno.serve((request) =>
  handleRequest(request, 'deletion-worker', async () => {
    assertAutomationRequest(request);
    const admin = adminClient();
    const { data: requests, error } = await admin
      .from('data_deletion_requests')
      .select('*')
      .in('status', ['PENDING', 'FAILED_RETRYABLE'])
      .order('requested_at')
      .limit(25);
    if (error) throw new AppError('SUPABASE_ERROR', { cause: error });

    let completed = 0;
    let failed = 0;
    for (const deletion of requests ?? []) {
      const attempts = deletion.attempts + 1;
      const claimed = await admin
        .from('data_deletion_requests')
        .update({ status: 'RUNNING', started_at: new Date().toISOString(), attempts })
        .eq('id', deletion.id)
        .in('status', ['PENDING', 'FAILED_RETRYABLE']);
      if (claimed.error) continue;
      try {
        await runPurgePipeline(
          databasePurgeDependencies(admin, deletion.user_id),
          deletion.type === 'ACCOUNT_DELETE',
        );
        const result = await admin
          .from('data_deletion_requests')
          .update({
            status: 'COMPLETE',
            completed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', deletion.id);
        if (result.error) throw new AppError('SUPABASE_ERROR', { cause: result.error });
        completed += 1;
      } catch (purgeError) {
        const terminal = attempts >= 10;
        await admin
          .from('data_deletion_requests')
          .update({
            status: terminal ? 'FAILED_FINAL' : 'FAILED_RETRYABLE',
            last_error: asAppError(purgeError, 'SUPABASE_ERROR').code,
          })
          .eq('id', deletion.id);
        failed += 1;
      }
    }
    return jsonResponse({ checked: requests?.length ?? 0, completed, failed });
  }),
);
