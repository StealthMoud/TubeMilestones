// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { logEvent } from '../functions/_shared/logging';

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx)$/u.test(name)
        ? [path]
        : [];
  });
}

describe('browser and logging secret boundaries', () => {
  it('keeps direct Google and R2 credential integrations out of frontend source', () => {
    const frontend = sourceFiles(resolve('src'))
      .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    for (const forbidden of [
      'youtube.googleapis.com',
      'youtubeanalytics.googleapis.com',
      'oauth2.googleapis.com/token',
      'GOOGLE_YOUTUBE_CLIENT_SECRET',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SECRET_KEY',
      'R2_SECRET_ACCESS_KEY',
      'ARCHIVE_MASTER_KEY',
      'TUBEMILESTONES_AUTOMATION_SECRET',
      '@aws-sdk/client-s3',
      'dexie',
    ]) {
      expect(frontend).not.toContain(forbidden);
    }
  });

  it('emits only structured identifiers and safe error codes', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logEvent({
      requestId: 'request-1',
      functionName: 'youtube-sync',
      stage: 'error',
      errorCode: 'YOUTUBE_API_ERROR',
      userId: 'user-1',
    });
    const serialized = String(consoleSpy.mock.calls[0]?.[0]);
    expect(serialized).toContain('YOUTUBE_API_ERROR');
    expect(serialized).not.toMatch(/access[_-]?token|refresh[_-]?token|authorization/i);
  });

  it('uses constant-time dedicated automation authentication', () => {
    const auth = readFileSync(resolve('supabase/functions/_shared/auth.ts'), 'utf8');
    const assertion = auth.slice(
      auth.indexOf('export function assertAutomationRequest'),
    );
    expect(assertion).toContain("requiredEnv('TUBEMILESTONES_AUTOMATION_SECRET')");
    expect(assertion).toContain('constantTimeEqual(provided, expected)');
    expect(assertion).not.toContain('secretKey()');
    expect(assertion).not.toContain("request.headers.get('apikey')");
  });

  it('rejects empty reconnect credentials before Vault mutation', () => {
    const callback = readFileSync(
      resolve('supabase/functions/youtube-oauth-callback/index.ts'),
      'utf8',
    );
    expect(callback).toContain(
      'const newRefreshToken = assertOfflineRefreshToken(tokens)',
    );
    expect(callback).toContain('p_refresh_token: newRefreshToken');
    expect(callback).not.toContain("tokens.refreshToken ?? ''");
  });

  it('never returns Google token fields from public Edge Function modules', () => {
    const functions = sourceFiles(resolve('supabase/functions'))
      .filter((path) => !path.includes('/_shared/'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(functions).not.toMatch(
      /jsonResponse\([\s\S]{0,300}(?:accessToken|refreshToken)/u,
    );
    expect(functions).not.toMatch(
      /redirect\([\s\S]{0,120}(?:access_token|refresh_token)/u,
    );
  });
});
