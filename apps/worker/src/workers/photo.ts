import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createDb, eq, schema } from '@impacto/db';
import { Worker } from 'bullmq';
import sharp from 'sharp';
import { getBucket, getS3Client, publicUrlFor } from '../lib/s3.js';
import { logger } from '../logger.js';
import { redisConnection } from '../queues.js';

/**
 * Photo processing worker.
 *
 * Pipeline:
 *   1. SELECT photo por id → leer key del original
 *   2. GET el original desde S3
 *   3. sharp: rotate() (aplica EXIF orientation), strip metadata, resize a
 *      thumb_small (256px) y thumb_large (1024px), output WebP quality 80
 *   4. PUT los dos thumbs al bucket
 *   5. UPDATE photos.thumbSmallUrl + thumbLargeUrl + status='ready'
 *
 * Si el original tiene `width × height < 256`, los thumbs siguen el `withoutEnlargement: true`
 * de sharp y quedan iguales al original.
 *
 * Errores:
 *   - 404 al GET → marca status='failed' (probablemente el browser nunca subió)
 *   - sharp throw → marca status='failed' + log
 *   - DB throw → throw para que BullMQ reintente con backoff
 */

interface PhotoJobData {
  photoId: string;
}

const SUPER_URL =
  process.env.DATABASE_URL ??
  'postgresql://impacto:impacto_dev_password_change_me@localhost:5433/impacto';

/**
 * Parsea la URL pública del objeto para extraer el `key` (path-style).
 * Ej: `http://localhost:9100/impacto-dev/photos/{orgId}/{photoId}/original.jpg`
 *     → `photos/{orgId}/{photoId}/original.jpg`
 */
function keyFromPublicUrl(url: string, bucket: string): string {
  try {
    const u = new URL(url);
    const prefix = `/${bucket}/`;
    if (u.pathname.startsWith(prefix)) return u.pathname.slice(prefix.length);
    // Fallback: si está en virtual-host style, devolver el path sin slash inicial.
    return u.pathname.replace(/^\//, '');
  } catch {
    return url;
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream | null): Promise<Buffer> {
  if (!stream) throw new Error('s3 GetObject sin Body');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export const photoWorker = new Worker<PhotoJobData>(
  'photo',
  async (job) => {
    const { photoId } = job.data;
    const db = createDb(SUPER_URL);
    const s3 = getS3Client();
    const bucket = getBucket();

    const [photo] = await db
      .select()
      .from(schema.photos)
      .where(eq(schema.photos.id, photoId))
      .limit(1);
    if (!photo) throw new Error(`photo ${photoId} not found`);

    const originalKey = keyFromPublicUrl(photo.originalUrl, bucket);

    let originalBuf: Buffer;
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: originalKey }));
      // biome-ignore lint/suspicious/noExplicitAny: Body es ReadableStream en node
      originalBuf = await streamToBuffer(obj.Body as any);
    } catch (err) {
      logger.error({ err, photoId, originalKey }, 'photo: original no disponible en S3');
      await db
        .update(schema.photos)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(schema.photos.id, photoId));
      return { processed: false, reason: 'original_not_found' };
    }

    const baseSharp = () => sharp(originalBuf).rotate(); // aplica EXIF orientation
    const meta = await baseSharp().metadata();

    const smallKey = originalKey.replace(/\/original\.[^/.]+$/, '/thumb_small.webp');
    const largeKey = originalKey.replace(/\/original\.[^/.]+$/, '/thumb_large.webp');

    const smallBuf = await baseSharp()
      .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();

    const largeBuf = await baseSharp()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: smallKey,
        Body: smallBuf,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: largeKey,
        Body: largeBuf,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    await db
      .update(schema.photos)
      .set({
        thumbSmallUrl: publicUrlFor(smallKey),
        thumbLargeUrl: publicUrlFor(largeKey),
        width: meta.width ?? photo.width ?? null,
        height: meta.height ?? photo.height ?? null,
        status: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(schema.photos.id, photoId));

    return { processed: true, smallKey, largeKey };
  },
  { connection: redisConnection },
);

photoWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, result }, '✓ photo job completed');
});

photoWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, '✗ photo job failed');
});
