import { z } from 'zod';
import { adminClient } from '../_shared/auth.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { frontendUrl } from '../_shared/env.ts';
import { AppError, asAppError } from '../_shared/errors.ts';
import {
  exchangeAuthorizationCode,
  fetchGoogleConnectionIdentity,
  refreshGoogleAccessToken,
} from '../_shared/google.ts';
import { logEvent } from '../_shared/logging.ts';
import { processYouTubeOAuthAuthorization } from '../_shared/oauth-callback.ts';
import { parseOAuthCallback } from '../_shared/oauth.ts';
import { fetchOwnedChannels, type ObservedChannel } from '../_shared/youtube.ts';

const completionSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('CONNECTED'),
    connectionId: z.uuid(),
    channelsAdded: z.number().int().nonnegative(),
    channelsAlreadyTracked: z.number().int().nonnegative(),
    selectedChannelId: z.uuid().nullable(),
  }),
  z.object({ outcome: z.literal('ACCOUNT_MISMATCH') }),
  z.object({ outcome: z.literal('CHANNELS_ALREADY_CONNECTED') }),
  z.object({ outcome: z.literal('DELETION_PENDING') }),
  z.object({ outcome: z.literal('FORBIDDEN') }),
]);

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

function channelPayload(channel: ObservedChannel, observedAt: string) {
  return {
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
  };
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  let connectionId: string | undefined;
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

    const completion = await processYouTubeOAuthAuthorization(
      {
        userId: attempt.user_id,
        codeVerifier: attempt.code_verifier,
        intent: attempt.intent,
        targetConnectionId: attempt.target_connection_id,
      },
      callback.code,
      {
        exchangeCode: exchangeAuthorizationCode,
        fetchIdentity: fetchGoogleConnectionIdentity,
        async loadReconnectTarget(targetConnectionId, userId) {
          const target = await admin
            .from('youtube_connections')
            .select('id, user_id, google_subject, granted_scopes')
            .eq('id', targetConnectionId)
            .eq('user_id', userId)
            .maybeSingle();
          if (target.error) {
            throw new AppError('SUPABASE_ERROR', { cause: target.error });
          }
          if (!target.data) return null;
          connectionId = target.data.id;
          return {
            id: target.data.id,
            userId: target.data.user_id,
            googleSubject: target.data.google_subject,
            grantedScopes: target.data.granted_scopes,
          };
        },
        async readRefreshToken(targetConnectionId, userId) {
          const credential = await admin.rpc('read_youtube_refresh_token', {
            p_connection_id: targetConnectionId,
            p_user_id: userId,
          });
          if (credential.error) {
            throw new AppError('SUPABASE_ERROR', { cause: credential.error });
          }
          return credential.data;
        },
        refreshAccessToken: refreshGoogleAccessToken,
        fetchChannels: fetchOwnedChannels,
        async completeConnection(input) {
          const completed = await admin.rpc('complete_youtube_oauth_connection', {
            p_user_id: input.userId,
            p_intent: input.intent,
            p_target_connection_id: input.targetConnectionId,
            p_google_subject: input.googleSubject,
            p_google_email: input.googleEmail,
            p_refresh_token: input.refreshToken,
            p_granted_scopes: input.grantedScopes,
            p_channels: input.channels.map((channel) =>
              channelPayload(channel, input.observedAt),
            ),
          });
          if (completed.error) {
            throw new AppError('SUPABASE_ERROR', { cause: completed.error });
          }
          return completed.data;
        },
      },
    );
    const parsed = completionSchema.safeParse(completion);
    if (!parsed.success) {
      throw new AppError('SUPABASE_ERROR', { cause: parsed.error });
    }
    switch (parsed.data.outcome) {
      case 'ACCOUNT_MISMATCH':
        throw new AppError('YOUTUBE_ACCOUNT_MISMATCH');
      case 'CHANNELS_ALREADY_CONNECTED':
        throw new AppError('YOUTUBE_CHANNELS_ALREADY_CONNECTED');
      case 'DELETION_PENDING':
        throw new AppError('DELETION_PENDING');
      case 'FORBIDDEN':
        throw new AppError('FORBIDDEN');
      case 'CONNECTED':
        connectionId = parsed.data.connectionId;
        break;
    }

    logEvent({
      requestId,
      functionName: 'youtube-oauth-callback',
      stage: 'complete',
      latencyMs: Math.round(performance.now() - startedAt),
      userId: attempt.user_id,
      connectionId,
    });
    return redirect('success');
  } catch (error) {
    const typed = asAppError(error, 'SUPABASE_ERROR');
    logEvent({
      requestId,
      functionName: 'youtube-oauth-callback',
      stage: 'error',
      latencyMs: Math.round(performance.now() - startedAt),
      connectionId,
      errorCode: typed.code,
    });
    return redirect('error', typed.code);
  }
});
