import { authenticatedUser } from '../_shared/auth.ts';
import { databasePurgeDependencies, runPurgePipeline } from '../_shared/deletion.ts';
import { AppError, jsonResponse } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/handler.ts';

Deno.serve((request) =>
  handleRequest(request, 'delete-account', async () => {
    const { user, admin } = await authenticatedUser(request);
    const { data: active, error: activeError } = await admin
      .from('data_deletion_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('type', 'ACCOUNT_DELETE')
      .in('status', ['PENDING', 'RUNNING', 'FAILED_RETRYABLE'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeError) throw new AppError('SUPABASE_ERROR', { cause: activeError });
    if (active) {
      return jsonResponse(
        { deletionId: active.id, status: 'PENDING' },
        { status: 202 },
      );
    }
    const created = await admin
      .from('data_deletion_requests')
      .insert({
        user_id: user.id,
        type: 'ACCOUNT_DELETE',
        status: 'RUNNING',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (created.error) throw new AppError('SUPABASE_ERROR', { cause: created.error });
    try {
      await runPurgePipeline(databasePurgeDependencies(admin, user.id, null), true);
      const completed = await admin
        .from('data_deletion_requests')
        .update({ status: 'COMPLETE', completed_at: new Date().toISOString() })
        .eq('id', created.data.id);
      if (completed.error)
        throw new AppError('SUPABASE_ERROR', { cause: completed.error });
      return jsonResponse({ deletionId: created.data.id, status: 'COMPLETE' });
    } catch (error) {
      await admin
        .from('data_deletion_requests')
        .update({
          status: 'FAILED_RETRYABLE',
          last_error: error instanceof AppError ? error.code : 'SUPABASE_ERROR',
        })
        .eq('id', created.data.id);
      return jsonResponse(
        { deletionId: created.data.id, status: 'PENDING' },
        { status: 202 },
      );
    }
  }),
);
