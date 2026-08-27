import type { Database, TablesUpdate } from '../../database.types.ts';
import { adminClient, assertAutomationRequest } from '../_shared/auth.ts';
import {
  processComplianceClaim,
  type ComplianceAction,
  type ComplianceProcessingResult,
} from '../_shared/compliance.ts';
import { AppError, asAppError, jsonResponse } from '../_shared/errors.ts';
import { refreshGoogleAccessToken } from '../_shared/google.ts';
import { handleRequest } from '../_shared/handler.ts';
import { processBoundedClaimBatches } from '../_shared/work-queue.ts';

const BATCH_SIZE = 50;
const MAX_BATCHES_PER_INVOCATION = 4;

type Admin = ReturnType<typeof adminClient>;
type ConnectionClaim =
  Database['public']['Functions']['claim_due_compliance_connections']['Returns'][number];

async function claimDueConnections(admin: Admin): Promise<ConnectionClaim[]> {
  const claimId = crypto.randomUUID();
  const result = await admin.rpc('claim_due_compliance_connections', {
    p_batch_size: BATCH_SIZE,
    p_claim_id: claimId,
  });
  if (result.error) throw new AppError('SUPABASE_ERROR', { cause: result.error });
  return result.data ?? [];
}

async function updateOwnedConnection(
  admin: Admin,
  connection: ConnectionClaim,
  values: TablesUpdate<'youtube_connections'>,
): Promise<boolean> {
  const result = await admin
    .from('youtube_connections')
    .update(values)
    .eq('id', connection.connection_id)
    .eq('user_id', connection.user_id)
    .eq('verification_claim_id', connection.verification_claim_id)
    .select('id')
    .maybeSingle();
  if (result.error) throw new AppError('SUPABASE_ERROR', { cause: result.error });
  return Boolean(result.data);
}

async function queueComplianceDeletion(
  userId: string,
  connectionId: string,
  admin: Admin,
): Promise<boolean> {
  const existing = await admin
    .from('data_deletion_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('connection_id', connectionId)
    .eq('type', 'COMPLIANCE_REVOKED')
    .in('status', ['PENDING', 'RUNNING', 'FAILED_RETRYABLE'])
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new AppError('SUPABASE_ERROR', { cause: existing.error });
  if (existing.data) return true;
  const created = await admin.from('data_deletion_requests').insert({
    user_id: userId,
    connection_id: connectionId,
    type: 'COMPLIANCE_REVOKED',
    status: 'PENDING',
  });
  if (created.error) throw new AppError('SUPABASE_ERROR', { cause: created.error });
  return true;
}

function processConnection(
  admin: Admin,
  connection: ConnectionClaim,
  now: Date,
): Promise<ComplianceProcessingResult> {
  return processComplianceClaim(
    {
      userId: connection.user_id,
      lastAuthorizationVerifiedAt: connection.last_authorization_verified_at,
      grantedScopes: connection.granted_scopes,
    },
    {
      async readCredential() {
        const credential = await admin.rpc('read_youtube_refresh_token', {
          p_connection_id: connection.connection_id,
          p_user_id: connection.user_id,
        });
        if (credential.error) {
          throw new AppError('SUPABASE_ERROR', { cause: credential.error });
        }
        if (!credential.data) throw new AppError('YOUTUBE_REAUTH_REQUIRED');
        return credential.data;
      },
      refreshCredential: refreshGoogleAccessToken,
      async storeRotatedCredential(refreshToken) {
        const rotated = await admin.rpc('store_youtube_refresh_token', {
          p_connection_id: connection.connection_id,
          p_user_id: connection.user_id,
          p_refresh_token: refreshToken,
        });
        if (rotated.error) {
          throw new AppError('SUPABASE_ERROR', { cause: rotated.error });
        }
      },
      markVerified: (tokens) =>
        updateOwnedConnection(admin, connection, {
          last_authorization_verified_at: now.toISOString(),
          last_verification_attempt_at: now.toISOString(),
          verification_retry_count: 0,
          granted_scopes: tokens.scopes,
          last_sync_error_code: null,
          verification_claim_id: null,
          verification_claimed_at: null,
        }),
      markFailed: (code: string, action: ComplianceAction) =>
        updateOwnedConnection(admin, connection, {
          last_verification_attempt_at: now.toISOString(),
          verification_retry_count: connection.verification_retry_count + 1,
          last_sync_error_code: code,
          status: action === 'HOLD_AND_PURGE' ? 'COMPLIANCE_HOLD' : connection.status,
          verification_claim_id: null,
          verification_claimed_at: null,
        }),
      queueAuthorizedDataPurge: () =>
        queueComplianceDeletion(connection.user_id, connection.connection_id, admin),
      errorCode: (error) => asAppError(error, 'GOOGLE_REFRESH_FAILED').code,
    },
    now,
  );
}

async function releaseUnexpectedFailure(
  admin: Admin,
  connection: ConnectionClaim,
  now: Date,
): Promise<void> {
  await updateOwnedConnection(admin, connection, {
    last_verification_attempt_at: now.toISOString(),
    verification_retry_count: connection.verification_retry_count + 1,
    last_sync_error_code: 'SUPABASE_ERROR',
    verification_claim_id: null,
    verification_claimed_at: null,
  }).catch(() => false);
}

Deno.serve((request) =>
  handleRequest(request, 'compliance-revalidate', async () => {
    assertAutomationRequest(request);
    const admin = adminClient();
    const now = new Date();
    const processed = await processBoundedClaimBatches(
      () => claimDueConnections(admin),
      async (connection) => {
        try {
          return await processConnection(admin, connection, now);
        } catch {
          await releaseUnexpectedFailure(admin, connection, now);
          return 'RETRY_LATER' as const;
        }
      },
      MAX_BATCHES_PER_INVOCATION,
    );

    const count = (result: ComplianceProcessingResult) =>
      processed.results.filter((candidate) => candidate === result).length;
    return jsonResponse({
      checked: processed.claimed,
      batches: processed.batches,
      verified: count('VERIFIED'),
      purgeQueued: count('PURGE_QUEUED'),
      retryLater: count('RETRY_LATER'),
      claimLost: count('CLAIM_LOST'),
    });
  }),
);
