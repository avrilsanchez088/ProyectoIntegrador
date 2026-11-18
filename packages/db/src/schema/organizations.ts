import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Tablas requeridas por el plugin `organization` de Better Auth.
 *
 * Conceptualmente: cada `organizations` row = 1 workspace de Impacto = 1 dueño.
 *
 * IMPORTANTE: con `usePlural: true` el plugin espera estos nombres exactos:
 * - `organizations` (workspace)
 * - `members` (user × organization + role)
 * - `invitations` (pending member invitations)
 *
 * Estas tablas son **gestionadas por Better Auth** — no escribirles directamente
 * desde nuestro código de aplicación; usar los métodos del plugin.
 *
 * https://better-auth.com/docs/plugins/organization
 */

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  metadata: text('metadata'), // JSON serializado por el plugin
});

export const members = pgTable('members', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // 'owner' | 'admin' | 'member' (extensible)
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const invitations = pgTable('invitations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  inviterId: text('inviter_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export type Organization = typeof organizations.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
