import { z } from 'zod';
import { TubeMilestonesError } from '../errors';

const googleErrorSchema = z
  .object({
    error: z
      .object({
        code: z.number().optional(),
        message: z.string().optional(),
        errors: z
          .array(
            z.object({
              reason: z.string().optional(),
              message: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  })
  .passthrough();

function mapHttpError(status: number, body: unknown): TubeMilestonesError {
  const parsed = googleErrorSchema.safeParse(body);
  const reasons = parsed.success
    ? (parsed.data.error?.errors ?? []).flatMap(({ reason }) =>
        reason ? [reason] : [],
      )
    : [];
  const message =
    parsed.success && parsed.data.error?.message
      ? parsed.data.error.message
      : 'Google API request failed.';

  if (status === 401) {
    return new TubeMilestonesError('TOKEN_EXPIRED', message, { status });
  }
  if (status === 403) {
    if (
      reasons.some((reason) =>
        ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(reason),
      )
    ) {
      return new TubeMilestonesError('QUOTA_EXCEEDED', message, {
        status,
        retryable: true,
      });
    }
    return new TubeMilestonesError('PERMISSION_DENIED', message, { status });
  }
  if (status === 429) {
    return new TubeMilestonesError('RATE_LIMITED', message, {
      status,
      retryable: true,
    });
  }
  if (status >= 500) {
    return new TubeMilestonesError('SERVER_ERROR', message, {
      status,
      retryable: true,
    });
  }
  return new TubeMilestonesError('API_ERROR', message, { status });
}

export async function authorizedFetchJson(
  url: URL,
  accessToken: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15_000,
  );
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new TubeMilestonesError(
        'MALFORMED_RESPONSE',
        'Google returned a non-JSON response.',
        { status: response.status, cause: error },
      );
    }

    if (!response.ok) throw mapHttpError(response.status, body);
    return body;
  } catch (error) {
    if (error instanceof TubeMilestonesError) throw error;
    if (controller.signal.aborted) {
      if (options.signal?.aborted) {
        throw new TubeMilestonesError('API_ERROR', 'Request was cancelled.', {
          cause: error,
        });
      }
      throw new TubeMilestonesError('TIMEOUT', 'Google API request timed out.', {
        retryable: true,
        cause: error,
      });
    }
    throw new TubeMilestonesError(
      'NETWORK_UNAVAILABLE',
      'Google API could not be reached.',
      { retryable: true, cause: error },
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
