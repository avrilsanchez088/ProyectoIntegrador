import { randomUUID } from 'node:crypto';
import { and, eq, schema } from '@impacto/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { enqueuePhotoProcess } from '../lib/queues.js';
import { presignPut, publicUrlFor } from '../lib/s3.js';
import { logger } from '../logger.js';
import {
  type AppEnv,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { getTenantDb, rlsContext } from '../middleware/tenant.js';

/**
 * Photos API. Implementa §1.2 y §2.1 del audit (worker stub + endpoint
 * faltante).
 *
 * Flujo de upload (cuando MinIO/R2 esté integrado):
 *   1. Cliente: POST /api/photos/presign  → recibe { uploadUrl, photoId }
 *   2. Cliente: PUT al uploadUrl con el binario
 *   3. Cliente: POST /api/photos/confirm  → marca status='processing' y encola job
 *   4. Worker (sharp): genera thumbs + actualiza status='ready'
 *
 * En esta primera versión exponemos:
 *   - GET /api/photos?propertyId=... | ?unitId=...
 *   - POST /api/photos             → metadata + status='pending' (sin upload aún)
 *   - PATCH /api/photos/:id        → editar caption/tags/sortOrder
 *   - DELETE /api/photos/:id
 *   - POST /api/photos/presign     → 501 mientras no esté MinIO/R2 wireado
 *   - POST /api/photos/confirm     → 501 idem
 */
export const photosRouter = new Hono<AppEnv>();

photosRouter.use('*', requireAuth);
photosRouter.use('*', requireOrganization);
photosRouter.use('*', rlsContext);

const createPhotoSchema = z
  .object({
    propertyId: z.string().uuid().optional(),
    unitId: z.string().uuid().optional(),
    originalUrl: z.string().url(),
    mimeType: z.string().regex(/^image\/(jpeg|png|webp|avif)$/, {
      message: 'Solo JPEG / PNG / WebP / AVIF',
    }),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(20 * 1024 * 1024), // 20MB cap
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    caption: z.string().max(500).optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .refine((d) => Boolean(d.propertyId) !== Boolean(d.unitId), {
    message: 'Debe especificarse exactamente uno de propertyId o unitId',
    path: ['propertyId'],
  });

const updatePhotoSchema = z.object({
  caption: z.string().max(500).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

photosRouter.get('/', async (c) => {
  const propertyId = c.req.query('propertyId');
  const unitId = c.req.query('unitId');
  const db = getTenantDb(c);

  const filters = [] as ReturnType<typeof eq>[];
  if (propertyId) filters.push(eq(schema.photos.propertyId, propertyId));
  if (unitId) filters.push(eq(schema.photos.unitId, unitId));

  const rows = await db
    .select()
    .from(schema.photos)
    .where(filters.length > 0 ? and(...filters) : undefined);

  return c.json({ data: rows });
});

photosRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createPhotoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const [created] = await db
    .insert(schema.photos)
    .values({
      organizationId: orgId,
      propertyId: parsed.data.propertyId ?? null,
      unitId: parsed.data.unitId ?? null,
      originalUrl: parsed.data.originalUrl,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      width: parsed.data.width,
      height: parsed.data.height,
      caption: parsed.data.caption,
      tags: parsed.data.tags ?? [],
      sortOrder: parsed.data.sortOrder,
      status: 'pending',
    })
    .returning();

  // TODO M3+: encolar job sharp (resize + EXIF strip + WebP) cuando el worker
  // de fotos sea real. Hoy queda en status='pending'.
  logger.info({ photoId: created?.id, orgId }, 'photo metadata persisted (pipeline pending)');

  return c.json({ data: created }, 201);
});

photosRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updatePhotoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const db = getTenantDb(c);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) updates[k] = v;
  }

  const [updated] = await db
    .update(schema.photos)
    .set(updates)
    .where(eq(schema.photos.id, id))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: updated });
});

photosRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [deleted] = await db
    .delete(schema.photos)
    .where(eq(schema.photos.id, id))
    .returning({ id: schema.photos.id });
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});

// ─── Upload pipeline ─────────────────────────────────────────────────
//
// Flujo:
//   1. POST /api/photos/presign  → reservamos un id + key + URL firmada PUT.
//      Insertamos row con status='uploading' para tener tracking aunque
//      el browser falle el upload.
//   2. Cliente: PUT al uploadUrl con el binario directo a MinIO/R2.
//   3. POST /api/photos/confirm  → marcamos status='processing' y encolamos
//      el job sharp (resize + EXIF strip + thumbs WebP).
//   4. Worker: actualiza thumbSmallUrl/thumbLargeUrl + status='ready'.

const presignSchema = z
  .object({
    propertyId: z.string().uuid().optional(),
    unitId: z.string().uuid().optional(),
    mimeType: z.string().regex(/^image\/(jpeg|png|webp|avif)$/, {
      message: 'Solo JPEG / PNG / WebP / AVIF',
    }),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(20 * 1024 * 1024),
    fileName: z.string().max(255).optional(),
    caption: z.string().max(500).optional(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .refine((d) => Boolean(d.propertyId) !== Boolean(d.unitId), {
    message: 'Debe especificarse exactamente uno de propertyId o unitId',
    path: ['propertyId'],
  });

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

photosRouter.post('/presign', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }

  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const photoId = randomUUID();
  const ext = MIME_EXT[parsed.data.mimeType] ?? 'bin';
  const key = `photos/${orgId}/${photoId}/original.${ext}`;
  const originalUrl = publicUrlFor(key);

  let uploadUrl: string;
  try {
    uploadUrl = await presignPut(key, parsed.data.mimeType, {
      contentLength: parsed.data.sizeBytes,
    });
  } catch (err) {
    logger.error({ err }, 'failed to presign photo upload');
    return c.json({ error: 'storage_unavailable' }, 503);
  }

  const [created] = await db
    .insert(schema.photos)
    .values({
      id: photoId,
      organizationId: orgId,
      propertyId: parsed.data.propertyId ?? null,
      unitId: parsed.data.unitId ?? null,
      originalUrl,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      caption: parsed.data.caption,
      tags: [],
      sortOrder: parsed.data.sortOrder,
      status: 'uploading',
    })
    .returning();

  return c.json({
    data: {
      photoId: created?.id ?? photoId,
      uploadUrl,
      key,
      originalUrl,
      // El cliente debe usar este header al hacer el PUT al uploadUrl.
      requiredHeaders: { 'Content-Type': parsed.data.mimeType },
      expiresIn: 300,
    },
  });
});

const confirmSchema = z.object({
  photoId: z.string().uuid(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

photosRouter.post('/confirm', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const db = getTenantDb(c);

  const updates: Record<string, unknown> = {
    status: 'processing',
    updatedAt: new Date(),
  };
  if (parsed.data.width != null) updates.width = parsed.data.width;
  if (parsed.data.height != null) updates.height = parsed.data.height;

  const [updated] = await db
    .update(schema.photos)
    .set(updates)
    .where(eq(schema.photos.id, parsed.data.photoId))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);

  try {
    await enqueuePhotoProcess(updated.id);
  } catch (err) {
    logger.error({ err, photoId: updated.id }, 'failed to enqueue photo processing');
    // No revertimos el status — un worker manual o un re-confirm puede retomar.
  }

  return c.json({ data: updated });
});
