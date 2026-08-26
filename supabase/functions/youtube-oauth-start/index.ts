import { authenticatedUser } from '../_shared/auth.ts';
import { requiredEnv } from '../_shared/env.ts';
import { AppError, jsonResponse } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/handler.ts';
import { createOAuthAttempt, REQUIRED_YOUTUBE_SCOPES } from '../_shared/oauth.ts';

Deno.serve((request) =>
  handleRequest(request, 'youtube-oauth-start', async () => {
    const { user, admin } = await authenticatedUser(request);
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
      created_at: attempt.createdAt,
      expires_at: attempt.expiresAt,
    });
    if (stored.error) throw new AppError('SUPABASE_ERROR', { cause: stored.error });

    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizationUrl.search = new URLSearchParams({
      client_id: requiredEnv('GOOGLE_YOUTUBE_CLIENT_ID'),
      redirect_uri: requiredEnv('GOOGLE_YOUTUBE_REDIRECT_URI'),
      response_type: 'code',
      scope: REQUIRED_YOUTUBE_SCOPES.join(' '),
      state: attempt.state,
      code_challenge: attempt.codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
    }).toString();
    if (authorizationUrl.protocol !== 'https:') {
      throw new AppError('CONFIGURATION_ERROR');
    }
    return jsonResponse({ authorizationUrl: authorizationUrl.toString() });
  }),
);
