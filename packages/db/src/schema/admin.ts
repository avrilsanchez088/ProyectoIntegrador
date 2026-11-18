/**
 * Tablas admin/staff-only que viven via migrations handwritten
 * (0010, 0013, 0015, 0017, 0018, 0019-0022).
 *
 * Declaradas acá DEFENSIVAMENTE: las queries de la app las consumen via
 * `adminDb.execute(sql\`...\`)` con types inline en cada call site.
 * Sin estas declaraciones, `drizzle-kit generate` propondría DROP TABLE
 * para todas — exactamente lo que pasó en la primera ronda de la sesión.
 *
 * IMPORTANTE: los CHECK constraints, índices y triggers de las migrations
 * NO están replicados acá. Drizzle-kit puede proponer alteraciones; si lo
 * hace, ignorar o reconciliar manualmente — la fuente de verdad sigue
 * siendo el SQL de las migrations.
 */
import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { organizations } from './organizations';

// ─── system_announcements (M16 — anuncios cross-tenant + staff) ──────────
export const systemAnnouncements = pgTable('system_announcements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  severity: text('severity').notNull().default('info'),
  message: text('message').notNull(),
  href: text('href'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  targetRole: text('target_role'),
  targetOrgId: text('target_org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  data: jsonb('data'),
  tags: text('tags').array(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const announcementViews = pgTable(
  'announcement_views',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => systemAnnouncements.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
    clickedAt: timestamp('clicked_at', { withTimezone: true }),
  },
  (t) => [unique().on(t.announcementId, t.userId)],
);

export const announcementDismissals = pgTable(
  'announcement_dismissals',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => systemAnnouncements.id, { onDelete: 'cascade' }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.announcementId] })],
);

// ─── tenant_freeze_log (audit de freeze/unfreeze) ────────────────────────
export const tenantFreezeLog = pgTable('tenant_freeze_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  reason: text('reason'),
  byUserId: text('by_user_id').references(() => users.id, { onDelete: 'set null' }),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
});

// ─── tenant_tags (staff-side labels) ─────────────────────────────────────
export const tenantTags = pgTable(
  'tenant_tags',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    color: text('color').notNull().default('gray'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.organizationId, t.tag)],
);

// ─── data_subject_requests (GDPR / ARCO) ─────────────────────────────────
export const dataSubjectRequests = pgTable('data_subject_requests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  action: text('action').notNull(), // export | delete
  status: text('status').notNull().default('pending'),
  notes: text('notes'),
  requestIp: text('request_ip'), // INET en la migration, text en TS
  processedBy: text('processed_by').references(() => users.id, { onDelete: 'set null' }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── worker_runs (audit de jobs BullMQ) ──────────────────────────────────
export const workerRuns = pgTable('worker_runs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workerName: text('worker_name').notNull(),
  jobId: text('job_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  status: text('status').notNull().default('running'),
  durationMs: integer('duration_ms'),
  result: jsonb('result'),
  errorMessage: text('error_message'),
  triggeredBy: text('triggered_by').references(() => users.id, { onDelete: 'set null' }),
  affectedTenants: text('affected_tenants').array(),
});

// ─── status_incidents + incident_updates (status page público) ───────────
export const statusIncidents = pgTable('status_incidents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  body: text('body'),
  severity: text('severity').notNull().default('investigating'),
  status: text('status').notNull().default('investigating'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  postmortemUrl: text('postmortem_url'),
  affectedComponents: text('affected_components').array(),
});

export const incidentUpdates = pgTable('incident_updates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  incidentId: uuid('incident_id')
    .notNull()
    .references(() => statusIncidents.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  status: text('status'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── sync_integrations (M11 — OAuth tokens GCal / OTAs) ──────────────────
export const syncIntegrations = pgTable(
  'sync_integrations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    status: text('status').notNull().default('active'),
    config: jsonb('config').notNull().default({}),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastSyncStatus: text('last_sync_status'),
    lastSyncError: text('last_sync_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.provider),
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
    }),
    pgPolicy('tenant_isolation_delete', {
      for: 'delete',
      using: sql`organization_id = current_setting('app.tenant_id', true)`,
    }),
  ],
);
