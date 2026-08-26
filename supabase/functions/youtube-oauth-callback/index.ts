import { adminClient } from '../_shared/auth.ts';
import { frontendUrl } from '../_shared/env.ts';
import { AppError, asAppError } from '../_shared/errors.ts';
import { exchangeAuthorizationCode } from '../_shared/google.ts';
import { logEvent } from '../_shared/logging.ts';
import { assertOfflineRefreshToken, parseOAuthCallback } from '../_shared/oauth.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { fetchOwnedChannels } from '../_shared/youtube.ts';

function redirect(result: 'success' | 'error', code?: string): Response {
  const url = frontendUrl();
  const query = new URLSearchParams({ result });
  if (code) query.set('code', code);
  url.hash = `/oauth/youtube?${query.toString()}`;
  const response = Response.redirect(url.toString(), 303);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(null, { status: response.status, headers });
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  try {
    if (request.method !== 'GET') throw new AppError('INVALID_REQUEST');
    const callback = parseOAuthCallback(new URL(request.url));
    if (callback.kind === 'invalid') throw new AppError(callback.code);

    const admin = adminClient();
    const stateHash = await sha256Hex(callback.state);
    const consumed = await admin.rpc('consume_youtube_oauth_attempt', {
      p_state_hash: stateHash,
    });
    if (consumed.error) throw new AppError('SUPABASE_ERROR', { cause: consumed.error });
    const attempt = Array.isArray(consumed.data) ? consumed.data[0] : undefined;
    if (!attempt) throw new AppError('OAUTH_STATE_INVALID');
    if (callback.kind === 'denied') throw new AppError('OAUTH_DENIED');

    const tokens = await exchangeAuthorizationCode(
      callback.code,
      attempt.code_verifier,
    );
    const newRefreshToken = assertOfflineRefreshToken(tokens);
    const channels = await fetchOwnedChannels(tokens.accessToken);
    if (channels.length === 0) throw new AppError('YOUTUBE_API_ERROR');
    const [existingConnectionResult, existingCredentialResult] = await Promise.all([
      admin
        .from('youtube_connections')
        .select('*')
        .eq('user_id', attempt.user_id)
        .maybeSingle(),
      admin.rpc('read_youtube_refresh_token', { p_user_id: attempt.user_id }),
    ]);
    if (existingConnectionResult.error || existingCredentialResult.error) {
      throw new AppError('SUPABASE_ERROR', {
        cause: existingConnectionResult.error ?? existingCredentialResult.error,
      });
    }
    const existingConnection = existingConnectionResult.data;
    const existingRefreshToken = existingCredentialResult.data;
    const vaultResult = await admin.rpc('store_youtube_refresh_token', {
      p_user_id: attempt.user_id,
      p_refresh_token: newRefreshToken,
    });
    if (vaultResult.error)
      throw new AppError('SUPABASE_ERROR', { cause: vaultResult.error });

    try {
      const observedAt = new Date().toISOString();
      const connection = await admin.from('youtube_connections').upsert({
        user_id: attempt.user_id,
        status: 'CONNECTED',
        connected_at: observedAt,
        last_authorization_verified_at: observedAt,
        last_verification_attempt_at: observedAt,
        verification_retry_count: 0,
        granted_scopes: tokens.scopes,
        last_sync_error_code: null,
      });
      if (connection.error) {
        throw new AppError('SUPABASE_ERROR', { cause: connection.error });
      }
      const stored = await admin
        .from('channels')
        .upsert(
          channels.map((channel) => ({
            user_id: attempt.user_id,
            youtube_channel_id: channel.youtubeChannelId,
            title: channel.title,
            thumbnail_url: channel.thumbnailUrl,
            published_at: channel.publishedAt,
            subscriber_count: channel.subscriberCount,
            subscriber_count_precision: channel.subscriberCountPrecision,
            hidden_subscriber_count: channel.hiddenSubscriberCount,
            view_count: channel.viewCount,
            video_count: channel.videoCount,
            uploads_playlist_id: channel.uploadsPlaylistId,
            last_observed_at: observedAt,
          })),
          { onConflict: 'user_id,youtube_channel_id' },
        )
        .select('id');
      if (stored.error) throw new AppError('SUPABASE_ERROR', { cause: stored.error });
      if (stored.data.length === 1 && stored.data[0]) {
        const selected = await admin
          .from('profiles')
          .update({ selected_channel_id: stored.data[0].id })
          .eq('user_id', attempt.user_id);
        if (selected.error)
          throw new AppError('SUPABASE_ERROR', { cause: selected.error });
      }
    } catch (error) {
      if (existingRefreshToken) {
        await admin.rpc('store_youtube_refresh_token', {
          p_user_id: attempt.user_id,
          p_refresh_token: existingRefreshToken,
        });
      } else {
        await admin.rpc('delete_youtube_refresh_token', { p_user_id: attempt.user_id });
      }
      if (existingConnection) {
        await admin
          .from('youtube_connections')
          .update({
            status: existingConnection.status,
            connected_at: existingConnection.connected_at,
            last_authorization_verified_at:
              existingConnection.last_authorization_verified_at,
            last_verification_attempt_at:
              existingConnection.last_verification_attempt_at,
            verification_retry_count: existingConnection.verification_retry_count,
            last_synced_at: existingConnection.last_synced_at,
            last_sync_started_at: existingConnection.last_sync_started_at,
            last_sync_error_code: existingConnection.last_sync_error_code,
            granted_scopes: existingConnection.granted_scopes,
          })
          .eq('user_id', attempt.user_id);
      } else {
        await admin.from('youtube_connections').delete().eq('user_id', attempt.user_id);
        await admin.from('channels').delete().eq('user_id', attempt.user_id);
        await admin
          .from('profiles')
          .update({ selected_channel_id: null })
          .eq('user_id', attempt.user_id);
      }
      throw error;
    }

    logEvent({
      requestId,
      functionName: 'youtube-oauth-callback',
      stage: 'complete',
      latencyMs: Math.round(performance.now() - startedAt),
      userId: attempt.user_id,
    });
    return redirect('success');
  } catch (error) {
    const typed = asAppError(error, 'SUPABASE_ERROR');
    logEvent({
      requestId,
      functionName: 'youtube-oauth-callback',
      stage: 'error',
      latencyMs: Math.round(performance.now() - startedAt),
      errorCode: typed.code,
    });
    return redirect('error', typed.code);
  }
});
