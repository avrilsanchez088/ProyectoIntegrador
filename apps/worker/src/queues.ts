import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const redisConnection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6380', {
  maxRetriesPerRequest: null, // requirement de BullMQ
});

/**
 * Defaults compartidos para todos los jobs (G2.14 del audit).
 * - Retry exponencial 3 intentos (2s base, máx ~10s)
 * - removeOnComplete con cap para no inflar Redis
 * - removeOnFail conserva los últimos 100 para diagnóstico
 */
export const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 } as const,
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  removeOnFail: { count: 100 },
};

/**
 * Lista de colas que usa la app. Cuando agreguemos nuevas (ej: meta-capi,
 * email, ical-import, photo-processing) las definimos acá y las exportamos.
 *
 * Otras apps las pueden importar para encolar:
 *   import { photoQueue } from '@impacto/worker/queues';
 *   await photoQueue.add('process', { photoId });
 */
export const photoQueue = new Queue('photo', {
  connection: redisConnection,
  defaultJobOptions,
});
export const emailQueue = new Queue('email', {
  connection: redisConnection,
  defaultJobOptions,
});
export const icalQueue = new Queue('ical', {
  connection: redisConnection,
  defaultJobOptions,
});
export const capiQueue = new Queue('meta-capi', {
  connection: redisConnection,
  defaultJobOptions,
});

/** Queue de tasas de cambio. Job repeatable diario (G10 / §1.6). */
export const fxQueue = new Queue('fx-rates', {
  connection: redisConnection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 5, // si la API externa falla un día, reintenta más
  },
});

/**
 * Queue de refresh de materialized views (propuesta 135.1 ronda 11).
 * Job repeatable cada 5 min llama `refresh_mv_tenant_stats()`.
 */
export const mvRefreshQueue = new Queue('mv-refresh', {
  connection: redisConnection,
  defaultJobOptions,
});

/**
 * Queue de purge de audit.events viejos (propuesta 141.4 ronda 12).
 * Job repeatable diario llama `purge_old_audit_events()` que respeta el
 * `audit_retention_days` de cada tenant.
 */
export const auditPurgeQueue = new Queue('audit-purge', {
  connection: redisConnection,
  defaultJobOptions,
});

/**
 * Queue de detección de tenants frozen long-term (propuesta 152.2 ronda 13).
 * Diario, alerta a staff (in-app + Slack) cuando un tenant lleva > 7 días
 * congelado.
 */
export const staleFreezeAlertQueue = new Queue('stale-freeze-alert', {
  connection: redisConnection,
  defaultJobOptions,
});

/**
 * Queue de procesamiento GDPR (propuesta 187.1 ronda 17). On-demand —
 * encola cuando staff marca una request como 'processing'.
 */
export const gdprProcessQueue = new Queue('gdpr-process', {
  connection: redisConnection,
  defaultJobOptions,
});
