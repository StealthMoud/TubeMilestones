// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  activeArchiveKeyVersion,
  archiveMasterKey,
  parseActiveArchiveKeyVersion,
} from './archive-keyring';

const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
const environment = new Map<string, string>();

beforeEach(() => {
  environment.clear();
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: { env: { get: (name: string) => environment.get(name) } },
  });
});

afterAll(() => {
  if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno);
  else Reflect.deleteProperty(globalThis, 'Deno');
});

describe('archive keyring configuration', () => {
  it('selects the configured active key without changing older reads', () => {
    environment.set('ARCHIVE_ACTIVE_KEY_VERSION', '2');
    environment.set('ARCHIVE_MASTER_KEY_V1', 'old-key');
    environment.set('ARCHIVE_MASTER_KEY_V2', 'new-key');
    expect(activeArchiveKeyVersion()).toBe(2);
    expect(archiveMasterKey(2)).toBe('new-key');
    expect(archiveMasterKey(1)).toBe('old-key');
  });

  it.each([null, '', '0', '-1', '1.5', '4294967296', 'NaN'])(
    'rejects invalid active key version %s',
    (value) => {
      expect(() => parseActiveArchiveKeyVersion(value)).toThrow(
        expect.objectContaining({ code: 'CONFIGURATION_ERROR' }),
      );
    },
  );

  it('fails safely instead of falling back when a referenced key is missing', () => {
    environment.set('ARCHIVE_MASTER_KEY_V1', 'old-key');
    expect(() => archiveMasterKey(2)).toThrow(
      expect.objectContaining({ code: 'ARCHIVE_KEY_UNAVAILABLE' }),
    );
  });
});
