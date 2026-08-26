import { z } from 'zod';
import { AppError } from './errors.ts';
import { deriveArchiveKey, randomBytes, sha256Hex, toArrayBuffer } from './crypto.ts';

const MAGIC = new Uint8Array([0x54, 0x4d, 0x41, 0x52]); // TMAR
const FORMAT_VERSION = 1;
const IV_LENGTH = 12;
const HEADER_LENGTH = MAGIC.length + 1 + 4 + 1 + IV_LENGTH;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const integerString = z.string().regex(/^\d+$/u);
const numericString = z.string().regex(/^\d+(?:\.\d+)?$/u);

export const archiveAnalyticsRowSchema = z.object({
  day: z.iso.date(),
  views: integerString,
  estimatedMinutesWatched: numericString,
  subscribersGained: integerString,
  subscribersLost: integerString,
  averageViewDuration: numericString,
  averageViewPercentage: numericString,
  fetchedAt: z.iso.datetime(),
});

export const archiveSnapshotRowSchema = z.object({
  snapshotDate: z.iso.date(),
  observedAt: z.iso.datetime(),
  subscriberCount: integerString.nullable(),
  viewCount: integerString,
  videoCount: integerString,
});

export const archivePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  period: z.string().regex(/^\d{4}-\d{2}$/u),
  analytics: z.array(archiveAnalyticsRowSchema),
  snapshots: z.array(archiveSnapshotRowSchema),
});

export type ArchiveAnalyticsRow = z.infer<typeof archiveAnalyticsRowSchema>;
export type ArchiveSnapshotRow = z.infer<typeof archiveSnapshotRowSchema>;
export type ArchivePayload = z.infer<typeof archivePayloadSchema>;

function canonicalPayload(payload: ArchivePayload): ArchivePayload {
  const parsed = archivePayloadSchema.parse(payload);
  return {
    schemaVersion: 1,
    period: parsed.period,
    analytics: [...parsed.analytics]
      .sort((left, right) => left.day.localeCompare(right.day))
      .map((row) => ({
        day: row.day,
        views: row.views,
        estimatedMinutesWatched: row.estimatedMinutesWatched,
        subscribersGained: row.subscribersGained,
        subscribersLost: row.subscribersLost,
        averageViewDuration: row.averageViewDuration,
        averageViewPercentage: row.averageViewPercentage,
        fetchedAt: row.fetchedAt,
      })),
    snapshots: [...parsed.snapshots]
      .sort((left, right) => left.snapshotDate.localeCompare(right.snapshotDate))
      .map((row) => ({
        snapshotDate: row.snapshotDate,
        observedAt: row.observedAt,
        subscriberCount: row.subscriberCount,
        viewCount: row.viewCount,
        videoCount: row.videoCount,
      })),
  };
}

export function serializeArchive(payload: ArchivePayload): Uint8Array {
  return encoder.encode(JSON.stringify(canonicalPayload(payload)));
}

async function transformStream(
  input: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  await writer.write(toArrayBuffer(input));
  await writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export function gzip(input: Uint8Array): Promise<Uint8Array> {
  return transformStream(input, new CompressionStream('gzip'));
}

export function gunzip(input: Uint8Array): Promise<Uint8Array> {
  return transformStream(input, new DecompressionStream('gzip'));
}

function createHeader(keyVersion: number, iv: Uint8Array): Uint8Array {
  if (!Number.isSafeInteger(keyVersion) || keyVersion <= 0) {
    throw new RangeError('Archive key version must be a positive safe integer.');
  }
  const header = new Uint8Array(HEADER_LENGTH);
  header.set(MAGIC, 0);
  header[MAGIC.length] = FORMAT_VERSION;
  new DataView(header.buffer).setUint32(MAGIC.length + 1, keyVersion);
  header[MAGIC.length + 5] = IV_LENGTH;
  header.set(iv, MAGIC.length + 6);
  return header;
}

function parseHeader(input: Uint8Array): {
  header: Uint8Array;
  iv: Uint8Array;
  keyVersion: number;
  ciphertext: Uint8Array;
} {
  if (input.byteLength <= HEADER_LENGTH) throw new AppError('ARCHIVE_CORRUPT');
  if (MAGIC.some((byte, index) => input[index] !== byte)) {
    throw new AppError('ARCHIVE_CORRUPT');
  }
  if (input[MAGIC.length] !== FORMAT_VERSION) {
    throw new AppError('ARCHIVE_CORRUPT');
  }
  const keyVersion = new DataView(
    input.buffer,
    input.byteOffset,
    input.byteLength,
  ).getUint32(MAGIC.length + 1);
  if (input[MAGIC.length + 5] !== IV_LENGTH || keyVersion <= 0) {
    throw new AppError('ARCHIVE_CORRUPT');
  }
  return {
    header: input.slice(0, HEADER_LENGTH),
    iv: input.slice(MAGIC.length + 6, HEADER_LENGTH),
    keyVersion,
    ciphertext: input.slice(HEADER_LENGTH),
  };
}

export interface EncryptedArchive {
  bytes: Uint8Array;
  compressedSize: number;
  encryptedSize: number;
  sha256: string;
  keyVersion: number;
  formatVersion: 1;
}

export async function encryptArchive(
  payload: ArchivePayload,
  userId: string,
  masterKeyBase64: string,
  keyVersion = 1,
  iv = randomBytes(IV_LENGTH),
): Promise<EncryptedArchive> {
  if (iv.byteLength !== IV_LENGTH) throw new RangeError('AES-GCM IV must be 12 bytes.');
  const compressed = await gzip(serializeArchive(payload));
  const key = await deriveArchiveKey(masterKeyBase64, userId);
  const header = createHeader(keyVersion, iv);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(header),
        tagLength: 128,
      },
      key,
      toArrayBuffer(compressed),
    ),
  );
  const bytes = new Uint8Array(header.byteLength + encrypted.byteLength);
  bytes.set(header, 0);
  bytes.set(encrypted, header.byteLength);
  return {
    bytes,
    compressedSize: compressed.byteLength,
    encryptedSize: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    keyVersion,
    formatVersion: 1,
  };
}

export async function decryptArchive(
  input: Uint8Array,
  userId: string,
  masterKeyForVersion: (version: number) => string,
): Promise<ArchivePayload> {
  try {
    const parsedHeader = parseHeader(input);
    const key = await deriveArchiveKey(
      masterKeyForVersion(parsedHeader.keyVersion),
      userId,
    );
    const compressed = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(parsedHeader.iv),
          additionalData: toArrayBuffer(parsedHeader.header),
          tagLength: 128,
        },
        key,
        toArrayBuffer(parsedHeader.ciphertext),
      ),
    );
    const json = decoder.decode(await gunzip(compressed));
    return archivePayloadSchema.parse(JSON.parse(json) as unknown);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('ARCHIVE_CORRUPT', { cause: error });
  }
}

export async function verifyArchiveChecksum(
  bytes: Uint8Array,
  expected: string,
): Promise<void> {
  if ((await sha256Hex(bytes)) !== expected.toLowerCase()) {
    throw new AppError('ARCHIVE_CORRUPT');
  }
}

export function verifyArchiveRowCounts(
  payload: ArchivePayload,
  analyticsRows: number,
  snapshotRows: number,
): void {
  if (
    payload.analytics.length !== analyticsRows ||
    payload.snapshots.length !== snapshotRows
  ) {
    throw new AppError('ARCHIVE_CORRUPT');
  }
}
