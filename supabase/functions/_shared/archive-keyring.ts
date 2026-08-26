import { optionalEnv } from './env.ts';
import { AppError } from './errors.ts';

const MAX_ARCHIVE_KEY_VERSION = 0xffff_ffff;

export function parseActiveArchiveKeyVersion(value: string | null): number {
  if (!value || !/^\d+$/u.test(value)) {
    throw new AppError('CONFIGURATION_ERROR', {
      message: 'ARCHIVE_ACTIVE_KEY_VERSION must be a positive integer.',
    });
  }
  const version = Number(value);
  if (
    !Number.isSafeInteger(version) ||
    version < 1 ||
    version > MAX_ARCHIVE_KEY_VERSION
  ) {
    throw new AppError('CONFIGURATION_ERROR', {
      message: 'ARCHIVE_ACTIVE_KEY_VERSION is outside the supported range.',
    });
  }
  return version;
}

export function activeArchiveKeyVersion(): number {
  return parseActiveArchiveKeyVersion(optionalEnv('ARCHIVE_ACTIVE_KEY_VERSION'));
}

export function archiveMasterKey(version: number): string {
  const validated = parseActiveArchiveKeyVersion(String(version));
  const key = optionalEnv(`ARCHIVE_MASTER_KEY_V${validated}`);
  if (!key) {
    throw new AppError('ARCHIVE_KEY_UNAVAILABLE', {
      message: `Archive key version ${validated} is unavailable.`,
    });
  }
  return key;
}
