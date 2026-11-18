import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

/**
 * `in_app_notifications` — buzón persistente del usuario.
 *
 * Implementa §2.10 del audit. Sonner Toast cubre el feedback transitorio,
 * pero las notificaciones importantes (nueva reserva, mensaje WhatsApp,
 * fallo de sync, recordatorio de check-in) tienen que sobrevivir el reload.
 *
 * Convención:
 *  - cada fila es una notificación para UN user dentro de una organization
 *  - `read_at` NULL = no leída → bullet rojo en 🔔
 *  - severity ordena en la UI (urgent primero), no es severidad de log
 *
 * Producers (van a aparecer en próximos módulos):
 *  - M5  blocked iCal sync → category='ical_sync_failed', severity='warning'
 *  - M7  inbound WA message → category='wa_message', severity='info'
 *  - M11 MP payment received → category='payment', severity='success'
 *
 * Cleanup: un cron diario borra notificaciones leídas de >90 días para no
 * inflar la tabla. Notificaciones no leídas se conservan indefinidamente.
 */
export const inAppNotifications = pgTable(
  'in_app_notifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** User destinatario. NULL = broadcast a toda la org. */
    userId: text('user_id'),

    /** Categoría — usar para iconos / agrupación / sound prefs. */
    category: text('category').notNull(), // 'wa_message' | 'booking' | 'ical_sync_failed' | 'payment' | 'mention' | 'system'

    severity: text('severity').notNull().default('info'), // 'info' | 'success' | 'warning' | 'urgent'

    title: text('title').notNull(),
    body: text('body'),

    /** Link opcional para hacer click → navega al detalle. */
    actionUrl: text('action_url'),

    /** Datos extra para custom rendering (ej. preview message para WA). */
    data: jsonb('data').notNull().default({}),

    readAt: timestamp('read_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Lookup principal: notifications no leídas del user en orden cronológico.
    index('in_app_notifs_user_unread_idx').on(t.organizationId, t.userId, t.readAt),
    pgPolicy('tenant_isolation_select', {
      for: 'select',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_insert', {
      for: 'insert',
      withCheck: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_update', {
      for: 'update',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
      withCheck: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
    pgPolicy('tenant_isolation_delete', {
      for: 'delete',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
  ],
);

export type InAppNotification = typeof inAppNotifications.$inferSelect;
export type NewInAppNotification = typeof inAppNotifications.$inferInsert;
