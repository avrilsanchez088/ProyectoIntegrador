import { createDb, schema, sql } from '@impacto/db';
import { Worker } from 'bullmq';
import { logger } from '../logger.js';
import { redisConnection } from '../queues.js';

/**
 * fx worker — refresca tasas de cambio diarias desde open.er-api.com.
 *
 * Source elegida en CLAUDE.md §15 G10:
 *   https://open.er-api.com/v6/latest/USD  (free, sin API key, soporta UYU/ARS)
 *
 * Contrato del job:
 *   { base: 'USD', quotes: ['UYU','ARS','BRL'] }
 *
 * El job es idempotente — el unique index `(day, base, quote)` permite hacer
 * upsert múltiples veces el mismo día sin duplicar.
 *
 * Schedule: el API encola un job repeatable cron diario a las 06:00 UTC
 * (~3:00 ART / 4:00 UYT). Configurable por env si el ratelimit cambia.
 */

interface FxJobData {
  base: string;
  quotes: string[];
}

interface FxApiResponse {
  result: 'success' | 'error';
  base_code: string;
  rates: Record<string, number>;
  time_last_update_utc: string;
}

const db = createDb(process.env.DATABASE_URL ?? 'postgres://localhost:5433/impacto');

async function fetchRates(base: string): Promise<FxApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`fx api responded ${res.status}`);
    }
    const json = (await res.json()) as FxApiResponse;
    if (json.result !== 'success') {
      throw new Error(`fx api returned non-success: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

export const fxWorker = new Worker<FxJobData>(
  'fx-rates',
  async (job) => {
    const { base, quotes } = job.data;
    logger.info({ base, quotes }, '💱 fetching exchange rates');

    const json = await fetchRates(base);
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

    let upserted = 0;
    for (const quote of quotes) {
      const rate = json.rates[quote];
      if (typeof rate !== 'number' || !Number.isFinite(rate)) {
        logger.warn({ base, quote }, 'rate missing in fx response');
        continue;
      }
      await db.execute(sql`
        INSERT INTO exchange_rates (day, base, quote, rate, source, fetched_at)
        VALUES (${day}, ${base}, ${quote}, ${rate}, 'open.er-api.com', now())
        ON CONFLICT (day, base, quote) DO UPDATE
          SET rate = EXCLUDED.rate,
              fetched_at = EXCLUDED.fetched_at
      `);
      upserted++;
    }

    logger.info({ base, day, upserted }, '💱 fx rates upserted');
    return { day, upserted, totalQuotes: quotes.length };
  },
  {
    connection: redisConnection,
    concurrency: 1, // un solo job a la vez — la API tiene rate limits
  },
);

fxWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'fx job failed');
});
