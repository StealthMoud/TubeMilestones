import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { runtimeConfiguration } from '../config/runtime';
import { supabaseClient } from '../services/supabase/client';
import { asApplicationAuthError } from './authErrors';
import {
  applicationAuthRedirectUrl,
  applicationSignInMethods,
  type ApplicationSignInMethods,
} from './authMethods';

export interface PasswordSignUpResult {
  status: 'CONFIRMATION_REQUIRED' | 'SIGNED_IN';
  email: string;
}

interface AuthContextValue {
  configured: boolean;
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  signInMethods: ApplicationSignInMethods;
  signInWithGoogle(): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string): Promise<PasswordSignUpResult>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<User>;
  completePasswordRecovery(): void;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function clearApplicationAuthQuery(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get('auth') !== 'callback') return;
  for (const parameter of [
    'auth',
    'code',
    'error',
    'error_code',
    'error_description',
  ]) {
    url.searchParams.delete(parameter);
  }
  window.history.replaceState(window.history.state, '', url.toString());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = runtimeConfiguration().configured;
  const client = supabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(configured);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [passwordMethodOverride, setPasswordMethodOverride] = useState<{
    userId: string;
  } | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    let authEventSeen = false;
    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      authEventSeen = true;
      setSession(nextSession);
      setIsLoading(false);
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
      }
    });
    void client.auth.getSession().then(({ data: sessionData }) => {
      if (!active || authEventSeen) return;
      setSession(sessionData.session);
      setIsLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!isLoading && session) {
      clearApplicationAuthQuery();
    }
  }, [isLoading, session]);

  const signInWithGoogle = useCallback(async () => {
    if (!client) throw new Error('SUPABASE_UNCONFIGURED');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: applicationAuthRedirectUrl(),
        scopes: 'openid email profile',
        queryParams: { access_type: 'online', prompt: 'select_account' },
      },
    });
    if (error) throw asApplicationAuthError(error);
  }, [client]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!client) throw asApplicationAuthError(new Error('SUPABASE_UNCONFIGURED'));
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw asApplicationAuthError(error);
    },
    [client],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string): Promise<PasswordSignUpResult> => {
      if (!client) throw asApplicationAuthError(new Error('SUPABASE_UNCONFIGURED'));
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: applicationAuthRedirectUrl() },
      });
      if (error) throw asApplicationAuthError(error);
      return {
        status: data.session ? 'SIGNED_IN' : 'CONFIRMATION_REQUIRED',
        email: email.trim(),
      };
    },
    [client],
  );

  const requestPasswordReset = useCallback(
    async (email: string) => {
      if (!client) throw asApplicationAuthError(new Error('SUPABASE_UNCONFIGURED'));
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: applicationAuthRedirectUrl(),
      });
      if (error) throw asApplicationAuthError(error);
    },
    [client],
  );

  const updatePassword = useCallback(
    async (newPassword: string): Promise<User> => {
      if (!client) throw asApplicationAuthError(new Error('SUPABASE_UNCONFIGURED'));
      const expectedUserId = session?.user.id;
      const { data, error } = await client.auth.updateUser({
        password: newPassword,
      });
      if (error) throw asApplicationAuthError(error);
      if (expectedUserId && data.user.id !== expectedUserId) {
        throw asApplicationAuthError(new Error('AUTH_USER_CHANGED'));
      }
      setPasswordMethodOverride({ userId: data.user.id });
      setSession((current) =>
        current && current.user.id === data.user.id
          ? { ...current, user: data.user }
          : current,
      );
      return data.user;
    },
    [client, session?.user.id],
  );

  const completePasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
    clearApplicationAuthQuery();
  }, []);

  const signOut = useCallback(async () => {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw asApplicationAuthError(error);
  }, [client]);

  const signInMethods = useMemo<ApplicationSignInMethods>(() => {
    const derived = applicationSignInMethods(session?.user ?? null);
    return {
      ...derived,
      password: passwordMethodOverride?.userId === session?.user.id || derived.password,
    };
  }, [passwordMethodOverride, session?.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      session,
      user: session?.user ?? null,
      isLoading,
      isPasswordRecovery,
      signInMethods,
      signInWithGoogle,
      signInWithPassword,
      signUpWithPassword,
      requestPasswordReset,
      updatePassword,
      completePasswordRecovery,
      signOut,
    }),
    [
      completePasswordRecovery,
      configured,
      isLoading,
      isPasswordRecovery,
      requestPasswordReset,
      session,
      signInMethods,
      signInWithGoogle,
      signInWithPassword,
      signOut,
      signUpWithPassword,
      updatePassword,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
