import { frontendUrl } from './env.ts';

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Origin',
};

export function corsHeaders(request: Request): Headers {
  const headers = new Headers(BASE_HEADERS);
  const origin = request.headers.get('Origin');
  const allowed = frontendUrl().origin;
  if (origin === allowed) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

export function optionsResponse(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const headers = corsHeaders(request);
  if (!headers.has('Access-Control-Allow-Origin')) {
    return new Response(null, { status: 403, headers });
  }
  return new Response(null, { status: 204, headers });
}
