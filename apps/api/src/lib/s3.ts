import { type PutObjectCommandInput, S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.js';

/**
 * S3 client compartido. Apunta a MinIO en dev (`S3_ENDPOINT=http://localhost:9100`)
 * y a Cloudflare R2 en prod.
 *
 * `forcePathStyle: true` es necesario para MinIO — R2 acepta ambos.
 */
let cached: S3Client | null = null;

export function getS3Client(): S3Client {
  if (cached) return cached;
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
    throw new Error('S3 no configurado (S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY)');
  }
  cached = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
  });
  return cached;
}

export function getBucket(): string {
  if (!env.S3_BUCKET) throw new Error('S3_BUCKET no configurado');
  return env.S3_BUCKET;
}

/**
 * URL pública del objeto vista desde el browser. En dev apunta a MinIO
 * (path-style: `${endpoint}/${bucket}/${key}`). En prod, al CDN.
 */
export function publicUrlFor(key: string): string {
  const base = env.S3_PUBLIC_URL ?? env.S3_ENDPOINT;
  if (!base) throw new Error('S3_PUBLIC_URL o S3_ENDPOINT requerido');
  return `${base.replace(/\/$/, '')}/${getBucket()}/${key}`;
}

/**
 * Genera URL firmada PUT para upload directo desde el browser. Expira en
 * `expiresInSeconds` (default 5 min — un upload realista de 5MB termina antes).
 */
export async function presignPut(
  key: string,
  contentType: string,
  options: { expiresInSeconds?: number; contentLength?: number } = {},
): Promise<string> {
  const input: PutObjectCommandInput = {
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  };
  if (options.contentLength != null) {
    input.ContentLength = options.contentLength;
  }
  const cmd = new PutObjectCommand(input);
  return getSignedUrl(getS3Client(), cmd, {
    expiresIn: options.expiresInSeconds ?? 300,
  });
}
