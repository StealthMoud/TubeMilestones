import { adminClient, assertAutomationRequest } from '../_shared/auth.ts';
import { complianceAction, isPermanentGoogleFailure } from '../_shared/compliance.ts';
import { databasePurgeDependencies, runPurgePipeline } from '../_shared/deletion.ts';
import { AppError, asAppError, jsonResponse } from '../_shared/errors.ts';
import { refreshGoogleAccessToken } from '../_shared/google.ts';
import { handleRequest } from '../_shared/handler.ts';

async function createComplianceDeletion(
  userId: string,
  admin: ReturnType<typeof adminClient>,
): Promise<string> {
  const { data: existing } = await admin
    .from('data_deletion_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'COMPLIANCE_REVOKED')
    .in('status', ['PENDING', 'RUNNING', 'FAILED_RETRYABLE'])
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const created = await admin
    .from('data_deletion_requests')
    .insert({ user_id: userId, type: 'COMPLIANCE_REVOKED', status: 'RUNNING' })
    .select('id')
    .single();
  if (created.error) throw new AppError('SUPABASE_ERROR', { cause: created.error });
  return created.data.id;
}

Deno.serve((request) =>
  handleRequest(request, 'compliance-revalidate', async () => {
    assertAutomationRequest(request);
    const admin = adminClient();
    const now = new Date();
    const threshold = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1_000).toISOString();
    const { data: connections, error } = await admin
      .from('youtube_connections')
      .select('*')
      .in('status', ['CONNECTED', 'SYNCING'])
      .or(
        `last_authorization_verified_at.is.null,last_authorization_verified_at.lte.${threshold}`,
      )
      .limit(100);
    if (error) throw new AppError('SUPABASE_ERROR', { cause: error });

    let verified = 0;
    let retryLater = 0;
    let purged = 0;
    for (const connection of connections ?? []) {
      let failureCode: string;
      try {
        const credential = await admin.rpc('read_youtube_refresh_token', {
          p_user_id: connection.user_id,
        });
        if (credential.error || !credential.data) {
          throw new AppError('YOUTUBE_REAUTH_REQUIRED', { cause: credential.error });
        }
        const tokens = await refreshGoogleAccessToken(
          credential.data,
          connection.granted_scopes,
        );
        if (tokens.refreshToken) {
          const rotated = await admin.rpc('store_youtube_refresh_token', {
            p_user_id: connection.user_id,
            p_refresh_token: tokens.refreshToken,
          });
          if (rotated.error)
            throw new AppError('SUPABASE_ERROR', { cause: rotated.error });
        }
        const updated = await admin
          .from('youtube_connections')
          .update({
            last_authorization_verified_at: now.toISOString(),
            last_verification_attempt_at: now.toISOString(),
            verification_retry_count: 0,
            granted_scopes: tokens.scopes,
          })
          .eq('user_id', connection.user_id);
        if (updated.error)
          throw new AppError('SUPABASE_ERROR', { cause: updated.error });
        verified += 1;
        continue;
      } catch (refreshError) {
        failureCode = asAppError(refreshError, 'GOOGLE_REFRESH_FAILED').code;
      }

      const permanent = isPermanentGoogleFailure(failureCode);
      const action = permanent
        ? 'HOLD_AND_PURGE'
        : complianceAction(connection.last_authorization_verified_at, now, true);
      const attemptUpdate = await admin
        .from('youtube_connections')
        .update({
          last_verification_attempt_at: now.toISOString(),
          verification_retry_count: connection.verification_retry_count + 1,
          last_sync_error_code: failureCode,
          status: action === 'HOLD_AND_PURGE' ? 'COMPLIANCE_HOLD' : connection.status,
        })
        .eq('user_id', connection.user_id);
      if (attemptUpdate.error) {
        throw new AppError('SUPABASE_ERROR', { cause: attemptUpdate.error });
      }
      if (action !== 'HOLD_AND_PURGE') {
        retryLater += 1;
        continue;
      }

      const deletionId = await createComplianceDeletion(connection.user_id, admin);
      try {
        await runPurgePipeline(
          databasePurgeDependencies(admin, connection.user_id),
          false,
        );
        await admin
          .from('data_deletion_requests')
          .update({
            status: 'COMPLETE',
            completed_at: now.toISOString(),
            last_error: null,
          })
          .eq('id', deletionId);
        purged += 1;
      } catch (purgeError) {
        await admin
          .from('data_deletion_requests')
          .update({
            status: 'FAILED_RETRYABLE',
            last_error: asAppError(purgeError, 'SUPABASE_ERROR').code,
          })
          .eq('id', deletionId);
        retryLater += 1;
      }
    }
    return jsonResponse({
      checked: connections?.length ?? 0,
      verified,
      purged,
      retryLater,
    });
  }),
);
