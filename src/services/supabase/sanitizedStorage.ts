import type { SupportedStorage } from '@supabase/supabase-js';

const FORBIDDEN_PROVIDER_FIELDS = new Set(['provider_token', 'provider_refresh_token']);

function stripProviderCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripProviderCredentials);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FORBIDDEN_PROVIDER_FIELDS.has(key))
      .map(([key, child]) => [key, stripProviderCredentials(child)]),
  );
}

export function sanitizeSessionValue(value: string): string {
  try {
    return JSON.stringify(stripProviderCredentials(JSON.parse(value) as unknown));
  } catch {
    return value;
  }
}

export class SanitizedAuthStorage implements SupportedStorage {
  getItem(key: string): string | null {
    return window.localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    window.localStorage.setItem(key, sanitizeSessionValue(value));
  }

  removeItem(key: string): void {
    window.localStorage.removeItem(key);
  }
}
