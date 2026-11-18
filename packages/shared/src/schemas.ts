import { z } from 'zod';

/**
 * Zod schemas compartidos entre frontend (forms) y backend (API validation).
 * Definir una vez, reutilizar en los dos lados.
 */

// ─── slug ───────────────────────────────────────────
export const slugSchema = z
  .string()
  .min(2, 'Mínimo 2 caracteres')
  .max(60, 'Máximo 60 caracteres')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Solo minúsculas, números y guiones (sin guión al inicio o final)',
  );

// ─── property ───────────────────────────────────────
export const propertyTypeSchema = z.enum([
  'cabanas',
  'hotel',
  'hosteria',
  'apart',
  'departamento',
  'hostel',
  'casa',
  'otro',
]);

export const createPropertySchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  slug: slugSchema,
  description: z.string().max(2000).optional(),
  propertyType: propertyTypeSchema.default('cabanas'),
  addressLine: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().length(2).default('UY'),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
});

export const updatePropertySchema = createPropertySchema.partial();

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

// ─── unit ───────────────────────────────────────────
export const unitTypeSchema = z.enum(['cabin', 'room', 'apartment', 'studio', 'suite', 'dorm']);

export const petsAllowedSchema = z.enum(['no', 'yes', 'consult']);

export const createUnitSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(2).max(100),
  slug: slugSchema,
  maxGuests: z.number().int().min(1).max(50).default(2),
  bedrooms: z.number().int().min(0).max(20).default(1),
  bathrooms: z.number().int().min(0).max(20).default(1),
  unitType: unitTypeSchema.default('cabin'),
  description: z.string().max(2000).optional(),
  amenities: z.array(z.string()).default([]),
  petsAllowed: petsAllowedSchema.default('no'),
});

export const updateUnitSchema = createUnitSchema.partial();

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

// also export the schema name expected by routes
export const propertySchema = createPropertySchema;
export const unitSchema = createUnitSchema;

// ─── invitations ────────────────────────────────────
export const inviteMemberSchema = z.object({
  email: z.string().email('Email inválido'),
  role: z.enum(['admin', 'member']).default('member'),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
