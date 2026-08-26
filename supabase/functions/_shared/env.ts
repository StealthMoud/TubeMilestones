import { AppError } from './errors.ts';

interface DenoEnvironment {
  env: { get(name: string): string | undefined };
}

function denoEnvironment(): DenoEnvironment | undefined {
  return (globalThis as typeof globalThis & { Deno?: DenoEnvironment }).Deno;
}

export function optionalEnv(name: string): string | null {
  const value = denoEnvironment()?.env.get(name)?.trim();
  return value ? value : null;
}

export function requiredEnv(name: string): string {
  const value = optionalEnv(name);
  if (!value) {
    throw new AppError('CONFIGURATION_ERROR', {
      message: `Required server configuration ${name} is missing.`,
    });
  }
  return value;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function assertSafeWebUrl(url: URL, name: string): void {
  const local = isLocalHostname(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new AppError('CONFIGURATION_ERROR', {
      message: `${name} must use HTTPS outside local development.`,
    });
  }
  if (url.username || url.password) {
    throw new AppError('CONFIGURATION_ERROR', {
      message: `${name} must not include URL credentials.`,
    });
  }
}

export function frontendUrl(): URL {
  const value = requiredEnv('FRONTEND_URL');
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new AppError('CONFIGURATION_ERROR', { cause: error });
  }
  assertSafeWebUrl(url, 'FRONTEND_URL');
  url.hash = '';
  url.search = '';
  return url;
}

export function allowedFrontendOrigins(): ReadonlySet<string> {
  const canonical = frontendUrl();
  const configured = optionalEnv('TUBEMILESTONES_ALLOWED_ORIGINS');
  if (!configured) return new Set([canonical.origin]);

  const values = configured.split(',').map((value) => value.trim());
  if (values.length > 20 || values.some((value) => !value)) {
    throw new AppError('CONFIGURATION_ERROR', {
      message: 'TUBEMILESTONES_ALLOWED_ORIGINS is invalid.',
    });
  }

  const origins = new Set<string>();
  for (const value of values) {
    let url: URL;
    try {
      url = new URL(value);
    } catch (error) {
      throw new AppError('CONFIGURATION_ERROR', { cause: error });
    }
    assertSafeWebUrl(url, 'TUBEMILESTONES_ALLOWED_ORIGINS');
    if (url.pathname !== '/' || url.search || url.hash) {
      throw new AppError('CONFIGURATION_ERROR', {
        message: 'Allowed origins must not include paths, queries, or fragments.',
      });
    }
    if (isLocalHostname(url.hostname) && !isLocalHostname(canonical.hostname)) {
      throw new AppError('CONFIGURATION_ERROR', {
        message: 'Local origins are allowed only with a local FRONTEND_URL.',
      });
    }
    origins.add(url.origin);
  }
  if (!origins.has(canonical.origin)) {
    throw new AppError('CONFIGURATION_ERROR', {
      message: 'Allowed origins must include the configured FRONTEND_URL origin.',
    });
  }
  return origins;
}
