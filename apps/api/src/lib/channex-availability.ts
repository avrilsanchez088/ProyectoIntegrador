/**
 * Helper para sincronizar disponibilidad con Channex cuando cambia
 * el estado de una reserva en Impacto.
 */

import { sql } from '@impacto/db';
import type { createDb } from '@impacto/db';
import { logger } from '../logger.js';
import { channexAdapter } from './sync-adapters/channex.js';
type Database = ReturnType<typeof createDb>;

/**
 * Genera un array de fechas YYYY-MM-DD entre checkIn y checkOut (exclusive).
 * Ej: checkIn=2026-08-01, checkOut=2026-08-03 → ['2026-08-01', '2026-08-02']
 */
function dateRange(checkIn: Date, checkOut: Date): string[] {
  const dates: string[] = [];
  const current = new Date(checkIn);
  current.setUTCHours(0, 0, 0, 0);
  const end = new Date(checkOut);
  end.setUTCHours(0, 0, 0, 0);

  while (current < end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Sincroniza disponibilidad de una unidad con Channex.
 * availability=0 → bloqueado (reserva activa)
 * availability=1 → libre (reserva cancelada)
 */
export async function syncAvailabilityToChannex(params: {
  unitId: string;
  checkIn: Date;
  checkOut: Date;
  availability: 0 | 1;
  rootDb: Database;
}): Promise<void> {
  const { unitId, checkIn, checkOut, availability, rootDb } = params;

  // Buscar el mapeo de la unidad en Channex.
  const mapping = (await rootDb.execute(
    sql`
      SELECT channex_property_id, channex_room_type_id
      FROM channex_unit_mappings
      WHERE unit_id = ${unitId}
      LIMIT 1
    `,
  )) as unknown as { channex_property_id: string; channex_room_type_id: string }[];

  if (!mapping || mapping.length === 0) {
    logger.warn({ unitId }, '⚠️ [channex] unit mapping no encontrado, saltando sync');
    return;
  }

  const row = mapping[0];
  if (!row) return;
  const { channex_property_id, channex_room_type_id } = row;
  const dates = dateRange(checkIn, checkOut);

  const values = dates.map((date) => ({
    property_id: channex_property_id,
    room_type_id: channex_room_type_id,
    date,
    availability,
  }));

  await channexAdapter.pushAvailability(values);

  logger.info(
    { unitId, availability, dates: dates.length },
    `✅ [channex] availability=${availability} sincronizada (${dates.length} días)`,
  );
}
