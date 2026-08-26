import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { optionalEnv, requiredEnv } from './env.ts';
import { AppError } from './errors.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/u;

export function archiveObjectKey(
  userId: string,
  channelId: string,
  period: string,
): string {
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(channelId)) {
    throw new AppError('INVALID_REQUEST');
  }
  const match = PERIOD_PATTERN.exec(period);
  if (!match?.[1] || !match[2]) throw new AppError('INVALID_REQUEST');
  return `archive/${userId}/${channelId}/${match[1]}/${match[2]}.tmar`;
}

export function isR2Configured(): boolean {
  return ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].every(
    (name) => optionalEnv(name) !== null,
  );
}

export interface StoredObject {
  bytes: Uint8Array;
  sha256: string | null;
}

export class R2Store {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor() {
    const endpoint = requiredEnv('R2_ENDPOINT');
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') throw new AppError('CONFIGURATION_ERROR');
    this.#bucket = requiredEnv('R2_BUCKET');
    this.#client = new S3Client({
      region: 'auto',
      endpoint: url.toString(),
      forcePathStyle: false,
      credentials: {
        accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async put(key: string, bytes: Uint8Array, sha256: string): Promise<void> {
    try {
      await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: key,
          Body: bytes,
          ContentType: 'application/octet-stream',
          Metadata: { sha256 },
        }),
      );
    } catch (error) {
      throw new AppError('R2_UNAVAILABLE', { cause: error, retryable: true });
    }
  }

  async head(key: string): Promise<{ size: number; sha256: string | null }> {
    try {
      const output = await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      return {
        size: output.ContentLength ?? 0,
        sha256: output.Metadata?.sha256 ?? null,
      };
    } catch (error) {
      throw new AppError('R2_UNAVAILABLE', { cause: error, retryable: true });
    }
  }

  async get(key: string): Promise<StoredObject> {
    try {
      const output = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      if (!output.Body) throw new AppError('ARCHIVE_CORRUPT');
      return {
        bytes: new Uint8Array(await output.Body.transformToByteArray()),
        sha256: output.Metadata?.sha256 ?? null,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('R2_UNAVAILABLE', { cause: error, retryable: true });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.#client.send(
        new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
    } catch (error) {
      throw new AppError('R2_UNAVAILABLE', { cause: error, retryable: true });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      return true;
    } catch (error) {
      const metadata = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (metadata.name === 'NotFound' || metadata.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw new AppError('R2_UNAVAILABLE', { cause: error, retryable: true });
    }
  }
}
