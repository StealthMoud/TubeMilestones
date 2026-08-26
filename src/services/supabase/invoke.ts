import { FunctionsHttpError } from '@supabase/supabase-js';
import { TubeMilestonesError, type TubeMilestonesErrorCode } from '../errors';
import { requireSupabaseClient } from './client';

interface ErrorEnvelope {
  error?: { code?: string; message?: string; retryable?: boolean };
}

const KNOWN_CODES = new Set<TubeMilestonesErrorCode>([
  'AUTH_REQUIRED',
  'CONFIGURATION_ERROR',
  'INVALID_REQUEST',
  'OAUTH_STATE_INVALID',
  'OAUTH_STATE_EXPIRED',
  'OAUTH_STATE_USED',
  'OAUTH_DENIED',
  'OAUTH_CODE_MISSING',
  'YOUTUBE_NOT_CONNECTED',
  'YOUTUBE_REAUTH_REQUIRED',
  'SYNC_IN_PROGRESS',
  'SYNC_COOLDOWN',
  'GOOGLE_REFRESH_FAILED',
  'YOUTUBE_QUOTA',
  'YOUTUBE_API_ERROR',
  'ANALYTICS_UNAVAILABLE',
  'R2_UNAVAILABLE',
  'ARCHIVE_CORRUPT',
  'SUPABASE_ERROR',
  'DELETION_PENDING',
  'FORBIDDEN',
]);

async function typedInvokeError(error: unknown): Promise<TubeMilestonesError> {
  let envelope: ErrorEnvelope | null = null;
  let status: number | undefined;
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    status = error.context.status;
    envelope = (await error.context
      .clone()
      .json()
      .catch(() => null)) as ErrorEnvelope | null;
  }
  const rawCode = envelope?.error?.code;
  const code =
    rawCode && KNOWN_CODES.has(rawCode as TubeMilestonesErrorCode)
      ? (rawCode as TubeMilestonesErrorCode)
      : 'SUPABASE_ERROR';
  return new TubeMilestonesError(
    code,
    envelope?.error?.message ?? 'TubeMilestones could not complete the request.',
    { status, retryable: envelope?.error?.retryable ?? false, cause: error },
  );
}

export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await requireSupabaseClient().functions.invoke<T>(name, {
    body,
  });
  if (error) throw await typedInvokeError(error);
  if (data === null) {
    throw new TubeMilestonesError('SUPABASE_ERROR', 'The function returned no data.');
  }
  return data;
}
