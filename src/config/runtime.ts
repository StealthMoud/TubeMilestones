export interface RuntimeConfiguration {
  supabaseUrl: string;
  supabasePublishableKey: string;
  configured: boolean;
  issue: string | null;
}

function value(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY'): string {
  return (import.meta.env[name] as string | undefined)?.trim() ?? '';
}

export function runtimeConfiguration(): RuntimeConfiguration {
  const supabaseUrl = value('VITE_SUPABASE_URL');
  const supabasePublishableKey = value('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!supabaseUrl || !supabasePublishableKey) {
    return {
      supabaseUrl,
      supabasePublishableKey,
      configured: false,
      issue: 'Supabase URL and publishable key are required.',
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    return {
      supabaseUrl,
      supabasePublishableKey,
      configured: false,
      issue: 'The Supabase URL is invalid.',
    };
  }
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  const validProtocol =
    parsed.protocol === 'https:' || (local && parsed.protocol === 'http:');
  const currentKey = supabasePublishableKey.startsWith('sb_publishable_');
  const localLegacyCompatibility = local && supabasePublishableKey.startsWith('eyJ');
  if (!validProtocol || (!currentKey && !localLegacyCompatibility)) {
    return {
      supabaseUrl,
      supabasePublishableKey,
      configured: false,
      issue: 'Use an HTTPS Supabase URL and an sb_publishable_ browser key.',
    };
  }
  return {
    supabaseUrl: parsed.toString().replace(/\/$/u, ''),
    supabasePublishableKey,
    configured: true,
    issue: null,
  };
}

export function resolveApplicationBaseUrl(
  documentHref: string,
  viteBaseUrl: string,
): string {
  const documentUrl = new URL(documentHref);
  documentUrl.hash = '';
  documentUrl.search = '';
  const relativeBase = viteBaseUrl === '.' || viteBaseUrl === './';
  const url = new URL(viteBaseUrl, relativeBase ? documentUrl : documentUrl.origin);
  url.hash = '';
  url.search = '';
  return url.toString();
}

export function applicationBaseUrl(): string {
  return resolveApplicationBaseUrl(window.location.href, import.meta.env.BASE_URL);
}

export function youtubeOAuthTestingMode(): boolean {
  return (
    (import.meta.env.VITE_YOUTUBE_OAUTH_MODE as string | undefined)
      ?.trim()
      .toLowerCase() === 'testing'
  );
}
