import type { User } from '@supabase/supabase-js';
import { applicationBaseUrl } from '../config/runtime';

export interface ApplicationSignInMethods {
  google: boolean;
  password: boolean;
}

export function applicationAuthRedirectUrl(baseUrl = applicationBaseUrl()): string {
  const redirect = new URL(baseUrl);
  redirect.searchParams.set('auth', 'callback');
  return redirect.toString();
}

export function applicationSignInMethods(user: User | null): ApplicationSignInMethods {
  const providers = new Set<string>([
    ...(user?.app_metadata.providers ?? []),
    ...(user?.identities ?? []).map(({ provider }) => provider),
  ]);
  return {
    google: providers.has('google'),
    password: providers.has('email'),
  };
}
