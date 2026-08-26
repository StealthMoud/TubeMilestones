// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTOMATION_HEADER_NAME, assertAutomationRequest } from './auth';

const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
const environment = new Map<string, string>();

beforeEach(() => {
  environment.clear();
  environment.set(
    'TUBEMILESTONES_AUTOMATION_SECRET',
    'automation-secret-with-at-least-thirty-two-characters',
  );
  environment.set('SUPABASE_SERVICE_ROLE_KEY', 'different-service-role-key');
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: { env: { get: (name: string) => environment.get(name) } },
  });
});

afterAll(() => {
  if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno);
  else Reflect.deleteProperty(globalThis, 'Deno');
});

describe('TubeMilestones automation authentication', () => {
  it('accepts only the dedicated automation header and secret', () => {
    const request = new Request('https://worker.test', {
      headers: {
        [AUTOMATION_HEADER_NAME]: environment.get('TUBEMILESTONES_AUTOMATION_SECRET')!,
      },
    });
    expect(() => assertAutomationRequest(request)).not.toThrow();
  });

  it('rejects a missing or wrong automation header', () => {
    expect(() => assertAutomationRequest(new Request('https://worker.test'))).toThrow(
      expect.objectContaining({ code: 'AUTH_REQUIRED' }),
    );
    expect(() =>
      assertAutomationRequest(
        new Request('https://worker.test', {
          headers: { [AUTOMATION_HEADER_NAME]: 'wrong-secret' },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'AUTH_REQUIRED' }));
  });

  it('does not accept the Supabase service-role key as automation authority', () => {
    const serviceRole = environment.get('SUPABASE_SERVICE_ROLE_KEY')!;
    expect(() =>
      assertAutomationRequest(
        new Request('https://worker.test', {
          headers: {
            apikey: serviceRole,
            [AUTOMATION_HEADER_NAME]: serviceRole,
          },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'AUTH_REQUIRED' }));
  });

  it('fails closed when the configured automation secret is too short', () => {
    environment.set('TUBEMILESTONES_AUTOMATION_SECRET', 'too-short');
    expect(() =>
      assertAutomationRequest(
        new Request('https://worker.test', {
          headers: { [AUTOMATION_HEADER_NAME]: 'too-short' },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
  });
});
