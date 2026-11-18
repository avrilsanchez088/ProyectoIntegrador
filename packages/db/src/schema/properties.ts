import { sql } from 'drizzle-orm';
import { integer, jsonb, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

/**
 * Properties = alojamientos. Una organization (workspace) puede tener varios.
 *
 * Ejemplos: "Meraki Cabañas - Mar de las Pampas", "Aloe Village - Punta del Diablo",
 * o si el dueño tiene 2 complejos en distintas ciudades, cada uno es una property.
 *
 * RLS: solo se ven properties cuya `organization_id` matchea `app.tenant_id`
 * seteado en la sesión actual. Ver `setTenantContext()` en client.ts.
 */
export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Nombre del alojamiento. Ej: "Meraki Cabañas - Mar de las Pampas". */
    name: text('name').notNull(),

    /** Slug único dentro de la organization. */
    slug: text('slug').notNull(),

    /** Descripción larga (para el bot, FAQ, etc.). */
    description: text('description'),

    /** Tipo libre: 'cabanas' | 'hotel' | 'hosteria' | 'apart' | 'departamento' ... */
    propertyType: text('property_type').notNull().default('cabanas'),

    /** Dirección física + componentes geo. */
    addressLine: text('address_line'),
    city: text('city'),
    state: text('state'),
    country: text('country').default('UY'),
    latitude: text('latitude'), // Decimal como string para no perder precisión
    longitude: text('longitude'),

    /** URL de la foto principal (cover). */
    coverPhotoUrl: text('cover_photo_url'),

    /** Configuración custom del alojamiento (ver `tenant_settings.settings` también). */
    settings: jsonb('settings').notNull().default({}),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  () => [
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

/**
 * Units = unidades reservables. Cabañas, habitaciones, deptos.
 * Un alojamiento (property) tiene varias units (Aurora, Bosque, Río...).
 *
 * Cada unidad tiene capacidad fija y disponibilidad propia. El bot consulta
 * disponibilidad por unit, no por property.
 */
export const units = pgTable(
  'units',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Nombre identificable. Ej: "Cabaña Aurora". */
    name: text('name').notNull(),

    /** Slug único dentro de la property. */
    slug: text('slug').notNull(),

    /** Capacidad máxima de huéspedes. */
    maxGuests: integer('max_guests').notNull().default(2),

    /** Cantidad de dormitorios y baños. */
    bedrooms: integer('bedrooms').notNull().default(1),
    bathrooms: integer('bathrooms').notNull().default(1),

    /** Tipo: 'cabin' | 'room' | 'apartment' | 'studio'... */
    unitType: text('unit_type').notNull().default('cabin'),

    /** Descripción específica de la unidad. */
    description: text('description'),

    /** Amenities list (array de strings). Ej: ["wifi","parrilla","jacuzzi"]. */
    amenities: jsonb('amenities').notNull().default([]),

    /** Si acepta mascotas. */
    petsAllowed: integer('pets_allowed').notNull().default(0), // 0=no, 1=yes, 2=consult

    /** Cover photo URL. */
    coverPhotoUrl: text('cover_photo_url'),

    /** Settings adicionales. */
    settings: jsonb('settings').notNull().default({}),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  () => [
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

/**
 * Photos asociadas a una property o a una unit (uno u el otro).
 * Tienen tags semánticos para que el bot pueda mandar la foto correcta:
 * "muéstrame la parrilla" → buscar foto con tag 'grill'.
 */
export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Una foto pertenece a property O a unit (no ambos). */
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }),

    /** URL del archivo original. */
    originalUrl: text('original_url').notNull(),

    /** URLs de los thumbnails. Generados por el worker. */
    thumbSmallUrl: text('thumb_small_url'), // 256px max
    thumbLargeUrl: text('thumb_large_url'), // 1024px max

    /** Mime type ('image/jpeg', 'image/png', 'image/webp'). */
    mimeType: text('mime_type').notNull(),

    /** Tamaño en bytes del original. */
    sizeBytes: integer('size_bytes').notNull(),

    /** Dimensiones en píxeles. */
    width: integer('width'),
    height: integer('height'),

    /** Tags semánticos. Ej: ["bedroom","exterior","grill"]. */
    tags: jsonb('tags').notNull().default([]),

    /** Caption / alt text. */
    caption: text('caption'),

    /** Order para mostrar en galería (más bajo primero). */
    sortOrder: integer('sort_order').notNull().default(0),

    /** Estado del procesamiento. */
    status: text('status').notNull().default('pending'), // 'pending' | 'processing' | 'ready' | 'failed'

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  () => [
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

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
