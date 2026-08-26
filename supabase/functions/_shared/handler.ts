import { corsHeaders, optionsResponse } from './cors.ts';
import { AppError, asAppError, jsonResponse, safeErrorBody } from './errors.ts';
import { logEvent } from './logging.ts';

export interface HandlerContext {
  requestId: string;
  startedAt: number;
}

function withHeaders(response: Response, headers: Headers): Response {
  const merged = new Headers(response.headers);
  headers.forEach((value, name) => merged.set(name, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}

export async function handleRequest(
  request: Request,
  functionName: string,
  handler: (context: HandlerContext) => Promise<Response>,
): Promise<Response> {
  const preflight = optionsResponse(request);
  if (preflight) return preflight;
  const startedAt = performance.now();
  const requestId = crypto.randomUUID();
  try {
    if (request.method !== 'POST') throw new AppError('INVALID_REQUEST');
    const response = await handler({ requestId, startedAt });
    logEvent({
      requestId,
      functionName,
      stage: 'complete',
      latencyMs: Math.round(performance.now() - startedAt),
    });
    return withHeaders(response, corsHeaders(request));
  } catch (error) {
    const typed = asAppError(error, 'SUPABASE_ERROR');
    logEvent({
      requestId,
      functionName,
      stage: 'error',
      latencyMs: Math.round(performance.now() - startedAt),
      errorCode: typed.code,
    });
    return withHeaders(
      jsonResponse(safeErrorBody(typed, requestId), { status: typed.status }),
      corsHeaders(request),
    );
  }
}
