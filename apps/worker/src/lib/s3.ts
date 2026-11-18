import { S3Client } from '@aws-sdk/client-s3';

/**
 * S3 client compartido para el worker. Misma config que `apps/api/src/lib/s3.ts`
 * pero leemos desde `process.env` directamente porque el worker no tiene su
 * propio Zod env (todavía).
 */
let cached: S3Client | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} requerido para procesar fotos`);
  return v;
}

export function getS3Client(): S3Client {
  if (cached) return cached;
  cached = new S3Client({
    endpoint: requireEnv('S3_ENDPOINT'),
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY'),
      secretAccessKey: requireEnv('S3_SECRET_KEY'),
    },
  });
  return cached;
}

export function getBucket(): string {
  return requireEnv('S3_BUCKET');
}

export function publicUrlFor(key: string): string {
  const base = process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT ?? '';
  return `${base.replace(/\/$/, '')}/${getBucket()}/${key}`;
}
