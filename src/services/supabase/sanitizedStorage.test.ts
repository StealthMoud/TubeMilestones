import { sanitizeSessionValue, SanitizedAuthStorage } from './sanitizedStorage';

describe('sanitized Supabase Auth storage', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
          return values.size;
        },
      } satisfies Storage,
    });
  });

  it('recursively strips Google provider credentials while retaining Supabase session data', () => {
    const sanitized = JSON.parse(
      sanitizeSessionValue(
        JSON.stringify({
          access_token: 'supabase-access-token',
          refresh_token: 'supabase-refresh-token',
          provider_token: 'google-access-token',
          user: {
            identities: [
              {
                provider: 'google',
                provider_refresh_token: 'google-refresh-token',
              },
            ],
          },
        }),
      ),
    ) as Record<string, unknown>;
    expect(sanitized).toMatchObject({
      access_token: 'supabase-access-token',
      refresh_token: 'supabase-refresh-token',
      user: { identities: [{ provider: 'google' }] },
    });
    expect(JSON.stringify(sanitized)).not.toContain('google-access-token');
    expect(JSON.stringify(sanitized)).not.toContain('google-refresh-token');
  });

  it('sanitizes before writing and removes only the requested Auth key', () => {
    const storage = new SanitizedAuthStorage();
    storage.setItem(
      'tm-auth',
      JSON.stringify({ provider_token: 'google-secret', ok: true }),
    );
    expect(window.localStorage.getItem('tm-auth')).toBe('{"ok":true}');
    storage.removeItem('tm-auth');
    expect(window.localStorage.getItem('tm-auth')).toBeNull();
  });
});
