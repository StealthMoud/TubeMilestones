import type { DatabaseClient } from './auth.ts';
import { AppError } from './errors.ts';
import { refreshGoogleAccessToken, revokeGoogleCredential } from './google.ts';
import { isR2Configured, R2Store } from './r2.ts';

export interface PurgeDependencies {
  markUnavailable(): Promise<void>;
  revokeGoogle(): Promise<void>;
  deleteVaultCredential(): Promise<void>;
  deleteArchives(): Promise<void>;
  deleteAuthorizedRows(): Promise<void>;
  deleteAccountRows(): Promise<void>;
  deleteAuthUser(): Promise<void>;
}

export async function runPurgePipeline(
  dependencies: PurgeDependencies,
  deleteAccount: boolean,
): Promise<void> {
  await dependencies.markUnavailable();
  try {
    await dependencies.revokeGoogle();
  } catch {
    // Revocation is best effort. Credential destruction is the hard access boundary.
  }
  await dependencies.deleteVaultCredential();
  await dependencies.deleteArchives();
  await dependencies.deleteAuthorizedRows();
  if (deleteAccount) {
    await dependencies.deleteAccountRows();
    await dependencies.deleteAuthUser();
  }
}

function ensureNoError(error: unknown): void {
  if (error) throw new AppError('SUPABASE_ERROR', { cause: error, retryable: true });
}

export function authUserIsAlreadyAbsent(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: number; code?: string };
  return candidate.status === 404 || candidate.code === 'user_not_found';
}

export function databasePurgeDependencies(
  admin: DatabaseClient,
  userId: string,
): PurgeDependencies {
  let refreshCredential: string | null = null;
  let grantedScopes: string[] = [];
  return {
    async markUnavailable() {
      const { data: connection, error } = await admin
        .from('youtube_connections')
        .select('granted_scopes')
        .eq('user_id', userId)
        .maybeSingle();
      ensureNoError(error);
      grantedScopes = connection?.granted_scopes ?? [];
      const credentialResult = await admin.rpc('read_youtube_refresh_token', {
        p_user_id: userId,
      });
      ensureNoError(credentialResult.error);
      refreshCredential = credentialResult.data;
      const update = await admin
        .from('youtube_connections')
        .update({ status: 'DELETION_PENDING' })
        .eq('user_id', userId);
      ensureNoError(update.error);
    },
    async revokeGoogle() {
      if (!refreshCredential) return;
      try {
        const refreshed = await refreshGoogleAccessToken(
          refreshCredential,
          grantedScopes,
        );
        await revokeGoogleCredential(refreshed.accessToken);
      } catch {
        // Revocation is best effort. Destroying the Vault credential still stops access.
      }
    },
    async deleteVaultCredential() {
      const result = await admin.rpc('delete_youtube_refresh_token', {
        p_user_id: userId,
      });
      ensureNoError(result.error);
      refreshCredential = null;
    },
    async deleteArchives() {
      const { data: manifests, error } = await admin
        .from('archive_manifests')
        .select('id, object_key')
        .eq('user_id', userId);
      ensureNoError(error);
      if ((manifests?.length ?? 0) === 0) return;
      if (!isR2Configured()) {
        throw new AppError('R2_UNAVAILABLE', { retryable: true });
      }
      const r2 = new R2Store();
      for (const manifest of manifests ?? []) {
        await r2.delete(manifest.object_key);
        if (await r2.exists(manifest.object_key)) {
          throw new AppError('R2_UNAVAILABLE', { retryable: true });
        }
      }
      const deleted = await admin
        .from('archive_manifests')
        .delete()
        .eq('user_id', userId);
      ensureNoError(deleted.error);
    },
    async deleteAuthorizedRows() {
      for (const table of [
        'analytics_daily',
        'analytics_summary',
        'channel_snapshots',
        'milestone_states',
        'manual_metrics',
        'custom_goals',
        'channels',
        'youtube_connections',
      ] as const) {
        const deleted = await admin.from(table).delete().eq('user_id', userId);
        ensureNoError(deleted.error);
      }
      const profile = await admin
        .from('profiles')
        .update({ selected_channel_id: null })
        .eq('user_id', userId);
      ensureNoError(profile.error);
    },
    async deleteAccountRows() {
      const profile = await admin.from('profiles').delete().eq('user_id', userId);
      ensureNoError(profile.error);
    },
    async deleteAuthUser() {
      const result = await admin.auth.admin.deleteUser(userId);
      if (authUserIsAlreadyAbsent(result.error)) return;
      ensureNoError(result.error);
    },
  };
}
