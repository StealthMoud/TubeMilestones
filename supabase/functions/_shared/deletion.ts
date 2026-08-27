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

interface StoredCredential {
  connectionId: string;
  grantedScopes: string[];
  refreshToken: string | null;
}

export function databasePurgeDependencies(
  admin: DatabaseClient,
  userId: string,
  connectionId: string | null,
): PurgeDependencies {
  let credentials: StoredCredential[] = [];
  let channelIds: string[] = [];
  const scoped = connectionId !== null;

  return {
    async markUnavailable() {
      let connectionQuery = admin
        .from('youtube_connections')
        .select('id, granted_scopes')
        .eq('user_id', userId);
      if (connectionId) connectionQuery = connectionQuery.eq('id', connectionId);
      const connections = await connectionQuery;
      ensureNoError(connections.error);

      credentials = await Promise.all(
        (connections.data ?? []).map(async (connection) => {
          const credential = await admin.rpc('read_youtube_refresh_token', {
            p_connection_id: connection.id,
            p_user_id: userId,
          });
          ensureNoError(credential.error);
          return {
            connectionId: connection.id,
            grantedScopes: connection.granted_scopes,
            refreshToken: credential.data,
          };
        }),
      );

      if ((connections.data?.length ?? 0) > 0) {
        const ids = (connections.data ?? []).map(({ id }) => id);
        const unavailable = await admin
          .from('youtube_connections')
          .update({ status: 'DELETION_PENDING' })
          .eq('user_id', userId)
          .in('id', ids);
        ensureNoError(unavailable.error);
      }

      let channelQuery = admin.from('channels').select('id').eq('user_id', userId);
      if (connectionId) channelQuery = channelQuery.eq('connection_id', connectionId);
      const channels = await channelQuery;
      ensureNoError(channels.error);
      channelIds = (channels.data ?? []).map(({ id }) => id);
    },
    async revokeGoogle() {
      for (const credential of credentials) {
        if (!credential.refreshToken) continue;
        try {
          const refreshed = await refreshGoogleAccessToken(
            credential.refreshToken,
            credential.grantedScopes,
          );
          await revokeGoogleCredential(refreshed.accessToken);
        } catch {
          // Revocation is best effort. The connection-scoped Vault delete follows.
        }
      }
    },
    async deleteVaultCredential() {
      const ids = scoped
        ? [connectionId]
        : credentials.map(({ connectionId: id }) => id);
      for (const id of ids) {
        if (!id) continue;
        const deleted = await admin.rpc('delete_youtube_refresh_token', {
          p_connection_id: id,
          p_user_id: userId,
        });
        ensureNoError(deleted.error);
      }
      credentials = [];
    },
    async deleteArchives() {
      if (channelIds.length === 0) return;
      const manifests = await admin
        .from('archive_manifests')
        .select('id, object_key')
        .eq('user_id', userId)
        .in('channel_id', channelIds);
      ensureNoError(manifests.error);
      if ((manifests.data?.length ?? 0) === 0) return;
      if (!isR2Configured()) {
        throw new AppError('R2_UNAVAILABLE', { retryable: true });
      }
      const r2 = new R2Store();
      for (const manifest of manifests.data ?? []) {
        await r2.delete(manifest.object_key);
        if (await r2.exists(manifest.object_key)) {
          throw new AppError('R2_UNAVAILABLE', { retryable: true });
        }
      }
      const deleted = await admin
        .from('archive_manifests')
        .delete()
        .eq('user_id', userId)
        .in(
          'id',
          (manifests.data ?? []).map(({ id }) => id),
        );
      ensureNoError(deleted.error);
    },
    async deleteAuthorizedRows() {
      if (connectionId) {
        const deleted = await admin
          .from('youtube_connections')
          .delete()
          .eq('id', connectionId)
          .eq('user_id', userId);
        ensureNoError(deleted.error);

        const profile = await admin
          .from('profiles')
          .select('selected_channel_id')
          .eq('user_id', userId)
          .maybeSingle();
        ensureNoError(profile.error);
        if (profile.data && profile.data.selected_channel_id === null) {
          const fallback = await admin
            .from('channels')
            .select('id')
            .eq('user_id', userId)
            .order('created_at')
            .order('id')
            .limit(1)
            .maybeSingle();
          ensureNoError(fallback.error);
          const selected = await admin
            .from('profiles')
            .update({ selected_channel_id: fallback.data?.id ?? null })
            .eq('user_id', userId);
          ensureNoError(selected.error);
        }
        return;
      }

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
