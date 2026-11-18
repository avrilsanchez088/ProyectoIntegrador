import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../env.js';

/**
 * Producers BullMQ. El worker consume desde estas mismas queues
 * (`apps/worker/src/queues.ts`), conectadas al mismo Redis.
 */
const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const icalQueue = new Queue<{ externalCalendarId: string }>('ical', {
  connection,
});

/**
 * Queue de procesamiento de fotos. Worker corre sharp:
 *  - download original desde S3 por key
 *  - resize a thumb_small (256px max) y thumb_large (1024px max)
 *  - strip EXIF (orientation preservada)
 *  - upload .webp al bucket
 *  - actualiza row photos con thumbSmallUrl/thumbLargeUrl + status='ready'
 */
export const photoQueue = new Queue<{ photoId: string }>('photo', {
  connection,
});

/**
 * Encola un job de procesamiento de foto. Idempotente con `removeOnComplete`
 * para no acumular jobs históricos en Redis.
 */
export async function enqueuePhotoProcess(photoId: string): Promise<void> {
  await photoQueue.add(
    'process',
    { photoId },
    {
      jobId: `photo-process:${photoId}`,
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  );
}

/**
 * Job key estable para repeatable jobs por external_calendar.
 * Lo usamos para upsert/remove al crear/actualizar/borrar el feed.
 */
export function icalRepeatableJobId(externalCalendarId: string): string {
  return `ical-poll:${externalCalendarId}`;
}

/**
 * (Re)programa el polling de un feed cada `intervalMinutes`.
 * Idempotente — usa jobId estable.
 */
export async function scheduleIcalPoll(
  externalCalendarId: string,
  intervalMinutes: number,
): Promise<void> {
  const jobId = icalRepeatableJobId(externalCalendarId);
  // Drop existing repeatable bajo el mismo jobId si existe.
  const repeatables = await icalQueue.getRepeatableJobs();
  const existing = repeatables.find((r) => r.id === jobId);
  if (existing) {
    await icalQueue.removeRepeatableByKey(existing.key);
  }
  await icalQueue.add(
    'poll',
    { externalCalendarId },
    {
      repeat: { every: intervalMinutes * 60 * 1000 },
      jobId,
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
}

/**
 * Cancela el polling repetitivo de un feed.
 */
export async function unscheduleIcalPoll(externalCalendarId: string): Promise<void> {
  const jobId = icalRepeatableJobId(externalCalendarId);
  const repeatables = await icalQueue.getRepeatableJobs();
  const existing = repeatables.find((r) => r.id === jobId);
  if (existing) {
    await icalQueue.removeRepeatableByKey(existing.key);
  }
}

/**
 * Encola un sync inmediato (one-shot).
 */
export async function syncIcalNow(externalCalendarId: string): Promise<string> {
  const job = await icalQueue.add(
    'poll-now',
    { externalCalendarId },
    {
      removeOnComplete: 50,
      removeOnFail: 50,
    },
  );
  return job.id ?? 'queued';
}
