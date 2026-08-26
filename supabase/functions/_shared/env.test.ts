// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { allowedFrontendOrigins, frontendUrl } from './env';

const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
const environment = new Map<string, string>();

beforeEach(() => {
  environment.clear();
  environment.set('FRONTEND_URL', 'https://stealthmoud.github.io/TubeMilestones/');
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: { env: { get: (name: string) => environment.get(name) } },
  });
});

afterAll(() => {
  if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno);
  else Reflect.deleteProperty(globalThis, 'Deno');
});

describe('trusted frontend URL configuration', () => {
  it('uses the canonical frontend origin when no explicit list exists', () => {
    expect(frontendUrl().toString()).toBe(
      'https://stealthmoud.github.io/TubeMilestones/',
    );
    expect([...allowedFrontendOrigins()]).toEqual(['https://stealthmoud.github.io']);
  });

  it('accepts a strict custom-domain allow-list containing the canonical origin', () => {
    environment.set(
      'TUBEMILESTONES_ALLOWED_ORIGINS',
      'https://stealthmoud.github.io,https://app.tubemilestones.com',
    );
    expect([...allowedFrontendOrigins()]).toEqual([
      'https://stealthmoud.github.io',
      'https://app.tubemilestones.com',
    ]);
  });

  it('rejects wildcards, paths, missing canonical origins, and production localhost', () => {
    for (const invalid of [
      'https://stealthmoud.github.io,*',
      'https://stealthmoud.github.io/TubeMilestones',
      'https://app.tubemilestones.com',
      'https://stealthmoud.github.io,http://localhost:5173',
    ]) {
      environment.set('TUBEMILESTONES_ALLOWED_ORIGINS', invalid);
      expect(() => allowedFrontendOrigins()).toThrow(
        expect.objectContaining({ code: 'CONFIGURATION_ERROR' }),
      );
    }
  });

  it('allows explicit localhost origins only with a local canonical frontend', () => {
    environment.set('FRONTEND_URL', 'http://127.0.0.1:5173/');
    environment.set(
      'TUBEMILESTONES_ALLOWED_ORIGINS',
      'http://127.0.0.1:5173,http://localhost:5173',
    );
    expect([...allowedFrontendOrigins()]).toEqual([
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ]);
  });
});
