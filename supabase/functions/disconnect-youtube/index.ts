import { authenticatedUser } from '../_shared/auth.ts';
import { databasePurgeDependencies, runPurgePipeline } from '../_shared/deletion.ts';
import { AppError, jsonResponse } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/handler.ts';

Deno.serve((request) =>
  handleRequest(request, 'disconnect-youtube', async () => {
    const { user, admin } = await authenticatedUser(request);
    const { data: active, error: activeError } = await admin
      .from('data_deletion_requests')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'YOUTUBE_DISCONNECT')
      .in('status', ['PENDING', 'RUNNING', 'FAILED_RETRYABLE'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeError) throw new AppError('SUPABASE_ERROR', { cause: activeError });
    let deletionId = active?.id;
    if (!deletionId) {
      const created = await admin
        .from('data_deletion_requests')
        .insert({ user_id: user.id, type: 'YOUTUBE_DISCONNECT' })
        .select('id')
        .single();
      if (created.error) throw new AppError('SUPABASE_ERROR', { cause: created.error });
      deletionId = created.data.id;
    }
    await admin
      .from('data_deletion_requests')
      .update({ status: 'RUNNING', started_at: new Date().toISOString() })
      .eq('id', deletionId);
    try {
      await runPurgePipeline(databasePurgeDependencies(admin, user.id), false);
      const completed = await admin
        .from('data_deletion_requests')
        .update({
          status: 'COMPLETE',
          completed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', deletionId);
      if (completed.error)
        throw new AppError('SUPABASE_ERROR', { cause: completed.error });
      return jsonResponse({ deletionId, status: 'COMPLETE' });
    } catch (error) {
      await admin
        .from('data_deletion_requests')
        .update({
          status: 'FAILED_RETRYABLE',
          last_error: error instanceof AppError ? error.code : 'SUPABASE_ERROR',
        })
        .eq('id', deletionId);
      return jsonResponse({ deletionId, status: 'PENDING' }, { status: 202 });
    }
  }),
);
