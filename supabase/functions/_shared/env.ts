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

export function frontendUrl(): URL {
  const value = requiredEnv('FRONTEND_URL');
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new AppError('CONFIGURATION_ERROR', { cause: error });
  }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new AppError('CONFIGURATION_ERROR', {
      message: 'FRONTEND_URL must use HTTPS outside local development.',
    });
  }
  url.hash = '';
  url.search = '';
  return url;
}
