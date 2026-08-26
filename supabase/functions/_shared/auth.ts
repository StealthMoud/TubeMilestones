import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Database } from '../../database.types.ts';
import { constantTimeEqual } from './crypto.ts';
import { optionalEnv, requiredEnv } from './env.ts';
import { AppError } from './errors.ts';

export type DatabaseClient = SupabaseClient<Database>;

function supabaseUrl(): string {
  return requiredEnv('SUPABASE_URL');
}

function publishableKey(): string {
  return (
    optionalEnv('SUPABASE_PUBLISHABLE_KEY') ??
    optionalEnv('SUPABASE_ANON_KEY') ??
    requiredEnv('SUPABASE_PUBLISHABLE_KEY')
  );
}

function secretKey(): string {
  return (
    optionalEnv('SUPABASE_SECRET_KEY') ??
    optionalEnv('SUPABASE_SERVICE_ROLE_KEY') ??
    requiredEnv('SUPABASE_SECRET_KEY')
  );
}

export function adminClient(): DatabaseClient {
  return createClient<Database>(supabaseUrl(), secretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) throw new AppError('AUTH_REQUIRED');
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw new AppError('AUTH_REQUIRED');
  return token;
}

export async function authenticatedUser(request: Request): Promise<{
  user: User;
  admin: DatabaseClient;
}> {
  const token = bearerToken(request);
  const verificationClient = createClient<Database>(supabaseUrl(), publishableKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await verificationClient.auth.getUser(token);
  if (error || !data.user) throw new AppError('AUTH_REQUIRED', { cause: error });
  return { user: data.user, admin: adminClient() };
}

export function assertAutomationRequest(request: Request): void {
  const provided = request.headers.get('apikey') ?? '';
  if (!provided || !constantTimeEqual(provided, secretKey())) {
    throw new AppError('AUTH_REQUIRED');
  }
}
