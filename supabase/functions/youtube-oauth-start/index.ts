import { authenticatedUser } from '../_shared/auth.ts';
import { requiredEnv } from '../_shared/env.ts';
import { AppError, jsonResponse } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/handler.ts';
import {
  buildYouTubeAuthorizationUrl,
  createOAuthAttempt,
  oauthStartRequestSchema,
} from '../_shared/oauth.ts';

Deno.serve((request) =>
  handleRequest(request, 'youtube-oauth-start', async () => {
    const { user, admin } = await authenticatedUser(request);
    const input = oauthStartRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success) throw new AppError('INVALID_REQUEST', { cause: input.error });

    const targetConnectionId =
      input.data.intent === 'RECONNECT' ? input.data.connectionId : null;
    if (targetConnectionId) {
      const target = await admin
        .from('youtube_connections')
        .select('id, status')
        .eq('id', targetConnectionId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (target.error) throw new AppError('SUPABASE_ERROR', { cause: target.error });
      if (!target.data) throw new AppError('FORBIDDEN');
      if (target.data.status === 'DELETION_PENDING') {
        throw new AppError('DELETION_PENDING');
      }
    }

    const attempt = await createOAuthAttempt();
    const cleanup = await admin
      .from('youtube_oauth_attempts')
      .delete()
      .eq('user_id', user.id)
      .lt('expires_at', new Date().toISOString());
    if (cleanup.error) throw new AppError('SUPABASE_ERROR', { cause: cleanup.error });
    const stored = await admin.from('youtube_oauth_attempts').insert({
      user_id: user.id,
      state_hash: attempt.stateHash,
      code_verifier: attempt.codeVerifier,
      intent: input.data.intent,
      target_connection_id: targetConnectionId,
      created_at: attempt.createdAt,
      expires_at: attempt.expiresAt,
    });
    if (stored.error) throw new AppError('SUPABASE_ERROR', { cause: stored.error });

    const authorizationUrl = buildYouTubeAuthorizationUrl({
      clientId: requiredEnv('GOOGLE_YOUTUBE_CLIENT_ID'),
      redirectUri: requiredEnv('GOOGLE_YOUTUBE_REDIRECT_URI'),
      state: attempt.state,
      codeChallenge: attempt.codeChallenge,
    });
    if (authorizationUrl.protocol !== 'https:') {
      throw new AppError('CONFIGURATION_ERROR');
    }
    return jsonResponse({ authorizationUrl: authorizationUrl.toString() });
  }),
);
