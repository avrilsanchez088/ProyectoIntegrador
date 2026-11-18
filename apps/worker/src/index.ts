/**
 * Worker entrypoint.
 * Inicia todos los workers de BullMQ y los mantiene corriendo.
 *
 * En docker compose se levanta como un servicio aparte. En dev local con
 * `pnpm dev` corre junto con web y api.
 */
import { logger } from './logger.js';
import { auditPurgeQueue, fxQueue, mvRefreshQueue, staleFreezeAlertQueue } from './queues.js';
import { auditPurgeWorker } from './workers/audit-purge.js';
import { fxWorker } from './workers/fx.js';
import { gdprProcessWorker } from './workers/gdpr-process.js';
import { icalWorker } from './workers/ical.js';
import { mvRefreshWorker } from './workers/mv-refresh.js';
import { photoWorker } from './workers/photo.js';
import { staleFreezeAlertWorker } from './workers/stale-freeze-alert.js';

logger.info('🔧 Impacto worker starting');

// Side-effect imports: traer cada worker hace que se conecte a Redis.
// Cuando agreguemos más, importarlos acá.
const workers = [
  photoWorker,
  icalWorker,
  fxWorker,
  mvRefreshWorker,
  auditPurgeWorker,
  staleFreezeAlertWorker,
  gdprProcessWorker,
];

// Schedulea el job repeatable de fx-rates (G10 / §1.6). Idempotente: BullMQ
// dedupea por jobId, así que si el worker se reinicia no se duplica.
async function scheduleFxRefresh() {
  try {
    await fxQueue.upsertJobScheduler(
      'fx-rates-daily',
      { pattern: '0 6 * * *', tz: 'UTC' },
      {
        name: 'refresh',
        data: { base: 'USD', quotes: ['UYU', 'ARS', 'BRL', 'CLP', 'PEN', 'COP', 'MXN'] },
      },
    );
    // Encola un fetch inmediato si la tabla está vacía (best-effort).
    await fxQueue.add(
      'refresh',
      { base: 'USD', quotes: ['UYU', 'ARS'] },
      { jobId: `fx-bootstrap-${new Date().toISOString().slice(0, 10)}` },
    );
  } catch (err) {
    logger.warn({ err }, 'failed to schedule fx-rates job (Redis disponible?)');
  }
}

// `worker.on('error')` evita que un error de conexion a Redis termine como
// unhandledError event y mate el proceso. BullMQ recomienda este handler
// explicito en docs.
for (const w of workers) {
  w.on('error', (err) => {
    logger.error({ err, worker: w.name }, 'worker emitted error event');
  });
}

logger.info(
  {
    count: workers.length,
    queues: [
      'photo',
      'ical',
      'fx-rates',
      'mv-refresh',
      'audit-purge',
      'stale-freeze-alert',
      'gdpr-process',
    ],
  },
  '✅ Workers ready',
);

scheduleFxRefresh().catch((err) => logger.error({ err }, 'fx schedule init failed'));

// MV refresh cada 5 min (propuesta 135.1 ronda 11).
async function scheduleMvRefresh() {
  try {
    await mvRefreshQueue.upsertJobScheduler(
      'mv-refresh-cron',
      { pattern: '*/5 * * * *' },
      { name: 'refresh', data: {} },
    );
  } catch (err) {
    logger.warn({ err }, 'failed to schedule mv-refresh');
  }
}
scheduleMvRefresh().catch((err) => logger.error({ err }, 'mv-refresh schedule init failed'));

// Audit purge diario a las 03:00 UTC (propuesta 141.4 ronda 12).
async function scheduleAuditPurge() {
  try {
    await auditPurgeQueue.upsertJobScheduler(
      'audit-purge-cron',
      { pattern: '0 3 * * *', tz: 'UTC' },
      { name: 'purge', data: {} },
    );
  } catch (err) {
    logger.warn({ err }, 'failed to schedule audit-purge');
  }
}
scheduleAuditPurge().catch((err) => logger.error({ err }, 'audit-purge schedule init failed'));

// Stale-freeze alert diario a las 04:00 UTC (propuesta 152.2 ronda 13).
async function scheduleStaleFreezeAlert() {
  try {
    await staleFreezeAlertQueue.upsertJobScheduler(
      'stale-freeze-alert-cron',
      { pattern: '0 4 * * *', tz: 'UTC' },
      { name: 'scan', data: {} },
    );
  } catch (err) {
    logger.warn({ err }, 'failed to schedule stale-freeze-alert');
  }
}
scheduleStaleFreezeAlert().catch((err) =>
  logger.error({ err }, 'stale-freeze-alert schedule init failed'),
);

// Graceful shutdown
const shutdown = async () => {
  logger.info('🛑 Shutting down workers...');
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Defensive: si algun handler async tira sin catch o un Promise queda
// rejected sin handler, lo loggeamos pero NO matamos el proceso. Mejor un
// log que un worker caido silenciosamente.
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise: String(promise) }, 'unhandledRejection in worker process');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException in worker process');
  // Node default seria exit(1). Mantenemos default — fail fast es la
  // mejor politica para uncaught synchronous errors. Docker compose
  // restart=always lo levanta de nuevo.
  process.exit(1);
});
