// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decryptArchive,
  encryptArchive,
  serializeArchive,
  verifyArchiveChecksum,
  verifyArchiveRowCounts,
  type ArchivePayload,
} from './archive';
import { bytesToBase64 } from './crypto';
import { AppError } from './errors';

const USER_ID = '86d4f90b-5aa1-43b0-9625-6fe933b730af';
const MASTER = bytesToBase64(Uint8Array.from({ length: 32 }, (_, index) => index));
const OTHER_MASTER = bytesToBase64(
  Uint8Array.from({ length: 32 }, (_, index) => 255 - index),
);
const PAYLOAD: ArchivePayload = {
  schemaVersion: 1,
  period: '2025-06',
  analytics: [
    {
      day: '2025-06-02',
      views: '12',
      estimatedMinutesWatched: '42.5',
      subscribersGained: '3',
      subscribersLost: '1',
      averageViewDuration: '81.2',
      averageViewPercentage: '63.1',
      fetchedAt: '2025-07-01T00:00:00.000Z',
    },
    {
      day: '2025-06-01',
      views: '9',
      estimatedMinutesWatched: '30',
      subscribersGained: '2',
      subscribersLost: '0',
      averageViewDuration: '79',
      averageViewPercentage: '61',
      fetchedAt: '2025-07-01T00:00:00.000Z',
    },
  ],
  snapshots: [
    {
      snapshotDate: '2025-06-01',
      observedAt: '2025-06-01T19:00:00.000Z',
      subscriberCount: '742',
      viewCount: '12000',
      videoCount: '34',
    },
  ],
};

describe('encrypted monthly archives', () => {
  it('serializes deterministically and round-trips gzip plus AES-256-GCM', async () => {
    const first = serializeArchive(PAYLOAD);
    const second = serializeArchive({
      ...PAYLOAD,
      analytics: [...PAYLOAD.analytics].reverse(),
    });
    expect(first).toEqual(second);

    const encrypted = await encryptArchive(
      PAYLOAD,
      USER_ID,
      MASTER,
      1,
      new Uint8Array(12).fill(7),
    );
    expect(encrypted.compressedSize).toBeLessThan(first.byteLength);
    await expect(
      verifyArchiveChecksum(encrypted.bytes, encrypted.sha256),
    ).resolves.toBeUndefined();
    await expect(
      decryptArchive(encrypted.bytes, USER_ID, () => MASTER),
    ).resolves.toEqual({ ...PAYLOAD, analytics: [...PAYLOAD.analytics].reverse() });
  });

  it('rejects wrong keys, wrong IV/header, corrupted ciphertext, and checksum mismatch', async () => {
    const encrypted = await encryptArchive(PAYLOAD, USER_ID, MASTER);
    await expect(
      decryptArchive(encrypted.bytes, USER_ID, () => OTHER_MASTER),
    ).rejects.toMatchObject({ code: 'ARCHIVE_CORRUPT' });

    const wrongIv = encrypted.bytes.slice();
    wrongIv[10] = (wrongIv[10] ?? 0) ^ 1;
    await expect(decryptArchive(wrongIv, USER_ID, () => MASTER)).rejects.toMatchObject({
      code: 'ARCHIVE_CORRUPT',
    });

    const corrupt = encrypted.bytes.slice();
    corrupt[corrupt.length - 1] = (corrupt.at(-1) ?? 0) ^ 1;
    await expect(decryptArchive(corrupt, USER_ID, () => MASTER)).rejects.toMatchObject({
      code: 'ARCHIVE_CORRUPT',
    });
    await expect(
      verifyArchiveChecksum(corrupt, encrypted.sha256),
    ).rejects.toMatchObject({
      code: 'ARCHIVE_CORRUPT',
    });
  });

  it('rejects manifest row-count mismatches', () => {
    expect(() => verifyArchiveRowCounts(PAYLOAD, 3, 1)).toThrowError(
      expect.objectContaining({ code: 'ARCHIVE_CORRUPT' }),
    );
    expect(() => verifyArchiveRowCounts(PAYLOAD, 2, 0)).toThrowError(
      expect.objectContaining({ code: 'ARCHIVE_CORRUPT' }),
    );
    expect(() => verifyArchiveRowCounts(PAYLOAD, 2, 1)).not.toThrow();
  });

  it('writes the selected key version and resolves that exact key on read', async () => {
    const encrypted = await encryptArchive(
      PAYLOAD,
      USER_ID,
      OTHER_MASTER,
      2,
      new Uint8Array(12).fill(9),
    );
    expect(encrypted.keyVersion).toBe(2);
    const requested: number[] = [];
    await expect(
      decryptArchive(encrypted.bytes, USER_ID, (version) => {
        requested.push(version);
        if (version !== 2) throw new Error('wrong key version');
        return OTHER_MASTER;
      }),
    ).resolves.toEqual({ ...PAYLOAD, analytics: [...PAYLOAD.analytics].reverse() });
    expect(requested).toEqual([2]);
  });

  it('returns a safe error when the exact archived key version is unavailable', async () => {
    const encrypted = await encryptArchive(PAYLOAD, USER_ID, MASTER, 3);
    await expect(
      decryptArchive(encrypted.bytes, USER_ID, (version) => {
        throw new AppError('ARCHIVE_KEY_UNAVAILABLE', {
          message: `Missing key ${version}`,
        });
      }),
    ).rejects.toMatchObject({ code: 'ARCHIVE_KEY_UNAVAILABLE' });
  });
});
