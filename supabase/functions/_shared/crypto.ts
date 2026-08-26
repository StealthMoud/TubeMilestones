import { AppError } from './errors.ts';

const encoder = new TextEncoder();

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch (error) {
    throw new AppError('CONFIGURATION_ERROR', { cause: error });
  }
}

export function base64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export function randomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new RangeError('Random byte length must be a positive safe integer.');
  }
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function sha256Bytes(input: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(input)));
}

export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  return bytesToHex(await sha256Bytes(bytes));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64Url(await sha256Bytes(encoder.encode(verifier)));
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function deriveArchiveKey(
  masterKeyBase64: string,
  userId: string,
): Promise<CryptoKey> {
  const master = base64ToBytes(masterKeyBase64);
  if (master.byteLength !== 32) {
    throw new AppError('CONFIGURATION_ERROR', {
      message: 'Archive master key must decode to exactly 256 bits.',
    });
  }
  const source = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(master),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(userId),
      info: encoder.encode('TubeMilestones archive v1'),
    },
    source,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
