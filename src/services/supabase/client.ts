import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../supabase/database.types';
import { runtimeConfiguration } from '../../config/runtime';
import { SanitizedAuthStorage } from './sanitizedStorage';

let singleton: SupabaseClient<Database> | null | undefined;

export function supabaseClient(): SupabaseClient<Database> | null {
  if (singleton !== undefined) return singleton;
  const configuration = runtimeConfiguration();
  if (!configuration.configured) {
    singleton = null;
    return singleton;
  }
  singleton = createClient<Database>(
    configuration.supabaseUrl,
    configuration.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        persistSession: true,
        storage: new SanitizedAuthStorage(),
      },
    },
  );
  return singleton;
}

export function requireSupabaseClient(): SupabaseClient<Database> {
  const client = supabaseClient();
  if (!client) throw new Error('SUPABASE_UNCONFIGURED');
  return client;
}

export function resetSupabaseClientForTests(): void {
  singleton = undefined;
}
