import { act, renderHook, waitFor } from '@testing-library/react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from './AuthProvider';
import { applicationAuthErrorMessage } from './authErrors';
import { applicationAuthRedirectUrl, applicationSignInMethods } from './authMethods';

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
}));

vi.mock('../config/runtime', () => ({
  applicationBaseUrl: () => 'https://stealthmoud.github.io/TubeMilestones/',
  runtimeConfiguration: () => ({ configured: true }),
}));

vi.mock('../services/supabase/client', () => {
  const client = {
    auth: {
      getSession: authMock.getSession,
      onAuthStateChange: authMock.onAuthStateChange,
      signInWithOAuth: authMock.signInWithOAuth,
      signInWithPassword: authMock.signInWithPassword,
      signUp: authMock.signUp,
      resetPasswordForEmail: authMock.resetPasswordForEmail,
      updateUser: authMock.updateUser,
      signOut: authMock.signOut,
    },
  };
  return { supabaseClient: () => client };
});

function createUser(
  id = 'b2d56ac5-74b7-4f30-8f00-ce67f09437ae',
  providers: string[] = ['google'],
): User {
  return {
    id,
    email: 'creator@example.com',
    app_metadata: { providers, provider: providers[0] },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-08-27T10:00:00.000Z',
    identities: providers.map((provider, index) => ({
      id: `${id}-${index}`,
      user_id: id,
      identity_id: `${id}-${provider}`,
      provider,
      identity_data: {},
      created_at: '2026-08-27T10:00:00.000Z',
      updated_at: '2026-08-27T10:00:00.000Z',
      last_sign_in_at: '2026-08-27T10:00:00.000Z',
    })),
  } as User;
}

function createSession(user: User): Session {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  } as Session;
}

let authResult: { current: ReturnType<typeof useAuth> } | null = null;

async function mountAuth(initialSession: Session | null = null) {
  authMock.getSession.mockResolvedValue({
    data: { session: initialSession },
    error: null,
  });
  authResult = renderHook(() => useAuth(), {
    wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
  }).result;
  await waitFor(() => expect(authResult?.current.isLoading).toBe(false));
}

function auth() {
  if (!authResult) throw new Error('Auth context has not mounted.');
  return authResult.current;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    authResult = null;
    authMock.listener = null;
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
    authMock.onAuthStateChange.mockImplementation(
      (listener: (event: AuthChangeEvent, session: Session | null) => void) => {
        authMock.listener = listener;
        return { data: { subscription: { unsubscribe: authMock.unsubscribe } } };
      },
    );
    authMock.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    authMock.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    authMock.signUp.mockResolvedValue({
      data: { session: null, user: createUser() },
      error: null,
    });
    authMock.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    authMock.updateUser.mockResolvedValue({
      data: { user: createUser() },
      error: null,
    });
    authMock.signOut.mockResolvedValue({ error: null });
  });

  it('uses one approved callback for Google, signup, and password recovery', async () => {
    expect(applicationAuthRedirectUrl()).toBe(
      'https://stealthmoud.github.io/TubeMilestones/?auth=callback',
    );
    await mountAuth();

    await act(() => auth().signInWithGoogle());
    await act(() => auth().signUpWithPassword(' creator@example.com ', ' space '));
    await act(() => auth().requestPasswordReset(' creator@example.com '));

    expect(authMock.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://stealthmoud.github.io/TubeMilestones/?auth=callback',
        scopes: 'openid email profile',
        queryParams: { access_type: 'online', prompt: 'select_account' },
      },
    });
    expect(authMock.signUp).toHaveBeenCalledWith({
      email: 'creator@example.com',
      password: ' space ',
      options: {
        emailRedirectTo: 'https://stealthmoud.github.io/TubeMilestones/?auth=callback',
      },
    });
    expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith('creator@example.com', {
      redirectTo: 'https://stealthmoud.github.io/TubeMilestones/?auth=callback',
    });
  });

  it('signs in with a trimmed email and an untouched password', async () => {
    await mountAuth();
    await act(() =>
      auth().signInWithPassword('  creator@example.com  ', '  secret value  '),
    );
    expect(authMock.signInWithPassword).toHaveBeenCalledWith({
      email: 'creator@example.com',
      password: '  secret value  ',
    });
  });

  it.each([
    ['invalid_credentials', 'Email or password is incorrect.'],
    ['email_not_confirmed', 'Please confirm your email before signing in.'],
  ])('maps %s without exposing the provider response', async (code, message) => {
    authMock.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code, message: 'raw provider response with internal detail' },
    });
    await mountAuth();
    let failure: unknown;
    await act(async () => {
      try {
        await auth().signInWithPassword('creator@example.com', 'password');
      } catch (error) {
        failure = error;
      }
    });
    expect(applicationAuthErrorMessage(failure)).toBe(message);
    expect(applicationAuthErrorMessage(failure)).not.toContain('raw provider');
  });

  it('supports both confirmation-required and immediate-session signup', async () => {
    await mountAuth();
    await expect(
      auth().signUpWithPassword('creator@example.com', 'password'),
    ).resolves.toEqual({
      status: 'CONFIRMATION_REQUIRED',
      email: 'creator@example.com',
    });

    authMock.signUp.mockResolvedValueOnce({
      data: {
        session: createSession(createUser(undefined, ['email'])),
        user: createUser(undefined, ['email']),
      },
      error: null,
    });
    await expect(
      auth().signUpWithPassword('creator@example.com', 'password'),
    ).resolves.toEqual({
      status: 'SIGNED_IN',
      email: 'creator@example.com',
    });
  });

  it('enters a dedicated PASSWORD_RECOVERY state and exits explicitly', async () => {
    const user = createUser(undefined, ['email']);
    const session = createSession(user);
    await mountAuth();
    await act(async () => authMock.listener?.('PASSWORD_RECOVERY', session));
    await waitFor(() => {
      expect(auth().isPasswordRecovery).toBe(true);
      expect(auth().user?.id).toBe(user.id);
    });
    await act(async () => auth().completePasswordRecovery());
    expect(auth().isPasswordRecovery).toBe(false);
    expect(auth().user?.id).toBe(user.id);
  });

  it('removes application callback credentials after a session is established', async () => {
    window.history.replaceState(
      {},
      '',
      '/?auth=callback&code=one-time-code&error_description=private-detail#/journey',
    );
    await mountAuth(createSession(createUser(undefined, ['email'])));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(window.location.hash).toBe('#/journey');
  });

  it('adds password login to the same OAuth user without replacing identity', async () => {
    const googleUser = createUser(undefined, ['google']);
    const updatedUser = createUser(googleUser.id, ['google', 'email']);
    authMock.updateUser.mockResolvedValue({
      data: { user: updatedUser },
      error: null,
    });
    await mountAuth(createSession(googleUser));
    expect(auth().signInMethods).toEqual({ google: true, password: false });

    await act(() => auth().updatePassword('new password'));

    expect(authMock.updateUser).toHaveBeenCalledWith({ password: 'new password' });
    expect(auth().user?.id).toBe(googleUser.id);
    expect(auth().signInMethods).toEqual({ google: true, password: true });
  });

  it('fails closed if a password update unexpectedly returns another UUID', async () => {
    const googleUser = createUser(undefined, ['google']);
    authMock.updateUser.mockResolvedValue({
      data: { user: createUser('61b19a2e-ecf2-4e62-9c65-45812056faad', ['email']) },
      error: null,
    });
    await mountAuth(createSession(googleUser));
    await expect(auth().updatePassword('new password')).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
    });
    expect(auth().user?.id).toBe(googleUser.id);
  });

  it('derives native sign-in methods from Supabase identities', () => {
    expect(applicationSignInMethods(createUser(undefined, ['google']))).toEqual({
      google: true,
      password: false,
    });
    expect(applicationSignInMethods(createUser(undefined, ['email']))).toEqual({
      google: false,
      password: true,
    });
    expect(
      applicationSignInMethods(createUser(undefined, ['google', 'email'])),
    ).toEqual({ google: true, password: true });
  });
});
