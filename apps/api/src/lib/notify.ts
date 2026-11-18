import type { NotifyParams } from '@impacto/shared';
import { logger } from '../logger.js';
import type { TenantDb } from '../middleware/auth.js';

// Re-export para compatibilidad con consumidores existentes.
export type {
  NotificationCategory,
  NotificationSeverity,
  NotifyParams,
} from '@impacto/shared';

/**
 * `notifyTenant` — helper único para crear notificaciones in-app desde
 * cualquier handler / worker (G42.3 / propuesta 71 ronda 6).
 *
 * Nunca tira: best-effort. Si la tabla está bloqueada o RLS rechaza,
 * loggea warning y sigue.
 *
 * Uso desde un handler con tenantDb:
 *   await notifyTenant(db, tpl.bookingConfirmed({...}));
 *
 * Uso desde el worker (sin tenant context):
 *   await notifyTenantFromWorker(adminDb, params);
 */

/**
 * Crea una notificación en in_app_notifications usando el TenantDb del
 * request (RLS aplica). Devuelve la fila creada o null si falló.
 */
export async function notifyTenant(
  db: TenantDb,
  params: NotifyParams,
): Promise<{ id: string } | null> {
  try {
    const { schema } = await import('@impacto/db');
    const [created] = await db
      .insert(schema.inAppNotifications)
      .values({
        organizationId: params.organizationId,
        userId: params.userId ?? null,
        category: params.category,
        severity: params.severity ?? 'info',
        title: params.title,
        body: params.body,
        actionUrl: params.actionUrl,
        data: params.data ?? {},
      })
      .returning({ id: schema.inAppNotifications.id });
    return created ?? null;
  } catch (err) {
    logger.warn(
      { err, category: params.category, orgId: params.organizationId },
      'notifyTenant failed (best-effort)',
    );
    return null;
  }
}

/**
 * Variante para workers que no tienen request context.
 * Recibe un Drizzle DB cualquiera (admin o app) y setea el tenant context
 * dentro de una transaction efímera. RLS aplica si el rol es no-superuser;
 * si es superuser con FORCE ROW LEVEL SECURITY, también necesita el SET LOCAL.
 */
export async function notifyTenantFromWorker(
  // biome-ignore lint/suspicious/noExplicitAny: aceptamos Database o transaction
  adminDb: any,
  params: NotifyParams,
): Promise<{ id: string } | null> {
  try {
    const { schema, setTenantContext } = await import('@impacto/db');
    return await adminDb.transaction(async (tx: TenantDb) => {
      await setTenantContext(tx, params.organizationId);
      const [created] = await tx
        .insert(schema.inAppNotifications)
        .values({
          organizationId: params.organizationId,
          userId: params.userId ?? null,
          category: params.category,
          severity: params.severity ?? 'info',
          title: params.title,
          body: params.body,
          actionUrl: params.actionUrl,
          data: params.data ?? {},
        })
        .returning({ id: schema.inAppNotifications.id });
      return created ?? null;
    });
  } catch (err) {
    logger.warn(
      { err, category: params.category, orgId: params.organizationId },
      'notifyTenantFromWorker failed (best-effort)',
    );
    return null;
  }
}
