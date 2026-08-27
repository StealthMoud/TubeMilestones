import { z } from 'zod';
import { adminClient } from '../_shared/auth.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { frontendUrl } from '../_shared/env.ts';
import { AppError, asAppError } from '../_shared/errors.ts';
import {
  exchangeAuthorizationCode,
  fetchGoogleConnectionIdentity,
} from '../_shared/google.ts';
import { logEvent } from '../_shared/logging.ts';
import {
  assertOfflineRefreshToken,
  parseOAuthCallback,
  reconnectIdentityMatches,
} from '../_shared/oauth.ts';
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

    const tokens = await exchangeAuthorizationCode(
      callback.code,
      attempt.code_verifier,
    );
    const newRefreshToken = assertOfflineRefreshToken(tokens);
    const identity = await fetchGoogleConnectionIdentity(tokens.accessToken);

    if (attempt.intent === 'RECONNECT') {
      if (!attempt.target_connection_id) throw new AppError('OAUTH_STATE_INVALID');
      const target = await admin
        .from('youtube_connections')
        .select('id, google_subject')
        .eq('id', attempt.target_connection_id)
        .eq('user_id', attempt.user_id)
        .maybeSingle();
      if (target.error) throw new AppError('SUPABASE_ERROR', { cause: target.error });
      if (!target.data) throw new AppError('FORBIDDEN');
      connectionId = target.data.id;
      if (!reconnectIdentityMatches(target.data.google_subject, identity.subject)) {
        throw new AppError('YOUTUBE_ACCOUNT_MISMATCH');
      }
    } else if (attempt.intent !== 'ADD' || attempt.target_connection_id) {
      throw new AppError('OAUTH_STATE_INVALID');
    }

    const channels = await fetchOwnedChannels(tokens.accessToken);
    if (channels.length === 0) throw new AppError('YOUTUBE_API_ERROR');
    const observedAt = new Date().toISOString();
    const completed = await admin.rpc('complete_youtube_oauth_connection', {
      p_user_id: attempt.user_id,
      p_intent: attempt.intent,
      p_target_connection_id: attempt.target_connection_id,
      p_google_subject: identity.subject,
      p_google_email: identity.email,
      p_refresh_token: newRefreshToken,
      p_granted_scopes: tokens.scopes,
      p_channels: channels.map((channel) => channelPayload(channel, observedAt)),
    });
    if (completed.error) {
      throw new AppError('SUPABASE_ERROR', { cause: completed.error });
    }
    const parsed = completionSchema.safeParse(completed.data);
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
