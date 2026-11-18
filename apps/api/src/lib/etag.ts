import type { Context } from 'hono';
import type { TenantDb } from '../middleware/auth.js';

/**
 * Helper para ETag basado en `MAX(updated_at)` de una tabla. Permite que
 * `useApiList` consume Cache-Control: max-age + 304 Not Modified cuando
 * la data del servidor no cambió (propuestas 68.1 + 81.1).
 *
 * Uso:
 *   const stamp = await tableEtag(db, 'properties', "deleted_at IS NULL");
 *   if (handle304(c, stamp)) return c.body(null, 304);
 *   ... fetch + return rows ...
 */

import { sql } from '@impacto/db';

export async function tableEtag(
  db: TenantDb,
  table: string,
  whereClause = 'TRUE',
): Promise<string> {
  // RLS aplica al SELECT — el `MAX(updated_at)` solo ve filas del tenant.
  const rows = await db.execute<{ stamp: string | null; n: number }>(
    sql.raw(`
      SELECT
        COALESCE(MAX(updated_at)::text, 'epoch') AS stamp,
        COUNT(*)::int AS n
      FROM ${table}
      WHERE ${whereClause}
    `),
  );
  const r = rows[0];
  return `"${r?.stamp ?? 'epoch'}:${r?.n ?? 0}"`;
}

/**
 * Setea ETag + Cache-Control en la response y devuelve true si el cliente
 * mandó If-None-Match con el mismo valor (caller debe responder 304).
 */
export function handle304(c: Context, etag: string, maxAgeSec = 30): boolean {
  c.header('ETag', etag);
  c.header('Cache-Control', `private, max-age=${maxAgeSec}`);
  return c.req.header('if-none-match') === etag;
}
