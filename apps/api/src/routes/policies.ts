import { eq, schema } from '@impacto/db';
import {
  createCancellationPolicySchema,
  createUnitFeeSchema,
  pricingRulesConfigSchema,
  updateCancellationPolicySchema,
  updateUnitFeeSchema,
} from '@impacto/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { handle304, tableEtag } from '../lib/etag.js';
import {
  type AppEnv,
  getActiveOrgId,
  requireAuth,
  requireOrganization,
} from '../middleware/auth.js';
import { getTenantDb, rlsContext } from '../middleware/tenant.js';

export const policiesRouter = new Hono<AppEnv>();

policiesRouter.use('*', requireAuth);
policiesRouter.use('*', requireOrganization);
policiesRouter.use('*', rlsContext);

// ─── Cancellation policies ──────────────────────────
policiesRouter.get('/cancellation', async (c) => {
  const db = getTenantDb(c);
  const etag = await tableEtag(db, 'cancellation_policies');
  if (handle304(c, etag)) return c.body(null, 304);
  const policies = await db.select().from(schema.cancellationPolicies);
  return c.json({ data: policies });
});

policiesRouter.post('/cancellation', async (c) => {
  const body = await c.req.json();
  const parsed = createCancellationPolicySchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);

  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const [created] = await db
    .insert(schema.cancellationPolicies)
    .values({
      organizationId: orgId,
      unitId: parsed.data.unitId ?? null,
      name: parsed.data.name,
      tiers: parsed.data.tiers,
      isDefault: parsed.data.isDefault ? 1 : 0,
    })
    .returning();
  return c.json({ data: created }, 201);
});

policiesRouter.patch('/cancellation/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateCancellationPolicySchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);

  const db = getTenantDb(c);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.tiers !== undefined) updates.tiers = parsed.data.tiers;
  if (parsed.data.unitId !== undefined) updates.unitId = parsed.data.unitId;
  if (parsed.data.isDefault !== undefined) updates.isDefault = parsed.data.isDefault ? 1 : 0;

  const [updated] = await db
    .update(schema.cancellationPolicies)
    .set(updates)
    .where(eq(schema.cancellationPolicies.id, id))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: updated });
});

policiesRouter.delete('/cancellation/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [deleted] = await db
    .delete(schema.cancellationPolicies)
    .where(eq(schema.cancellationPolicies.id, id))
    .returning({ id: schema.cancellationPolicies.id });
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});

// ─── Unit fees ──────────────────────────────────────
policiesRouter.get('/fees', async (c) => {
  const unitId = c.req.query('unitId');
  const db = getTenantDb(c);

  const safeUnitId = unitId && /^[0-9a-f-]{36}$/i.test(unitId) ? unitId : null;
  const where = safeUnitId ? `unit_id = '${safeUnitId}'` : 'TRUE';
  const etag = await tableEtag(db, 'unit_fees', where);
  if (handle304(c, etag)) return c.body(null, 304);

  const query = db.select().from(schema.unitFees);
  const fees = unitId ? await query.where(eq(schema.unitFees.unitId, unitId)) : await query;
  return c.json({ data: fees });
});

policiesRouter.post('/fees', async (c) => {
  const body = await c.req.json();
  const parsed = createUnitFeeSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);

  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const [created] = await db
    .insert(schema.unitFees)
    .values({
      organizationId: orgId,
      unitId: parsed.data.unitId,
      name: parsed.data.name,
      feeType: parsed.data.feeType,
      chargeType: parsed.data.chargeType,
      amountCents: parsed.data.amountCents,
      refundable: parsed.data.refundable ? 1 : 0,
      optional: parsed.data.optional ? 1 : 0,
      sortOrder: parsed.data.sortOrder,
    })
    .returning();
  return c.json({ data: created }, 201);
});

policiesRouter.patch('/fees/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateUnitFeeSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);

  const db = getTenantDb(c);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k === 'refundable' || k === 'optional') {
      updates[k] = v ? 1 : 0;
    } else if (v !== undefined) {
      updates[k] = v;
    }
  }
  const [updated] = await db
    .update(schema.unitFees)
    .set(updates)
    .where(eq(schema.unitFees.id, id))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: updated });
});

policiesRouter.delete('/fees/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [deleted] = await db
    .delete(schema.unitFees)
    .where(eq(schema.unitFees.id, id))
    .returning({ id: schema.unitFees.id });
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});

// ─── Pricing rules ──────────────────────────────────
const createPricingRuleSchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(100),
  config: pricingRulesConfigSchema,
  enabled: z.boolean().default(true),
});

const updatePricingRuleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  config: pricingRulesConfigSchema.optional(),
  enabled: z.boolean().optional(),
});

policiesRouter.get('/rules', async (c) => {
  const unitId = c.req.query('unitId');
  const db = getTenantDb(c);

  const safeUnitId = unitId && /^[0-9a-f-]{36}$/i.test(unitId) ? unitId : null;
  const where = safeUnitId ? `unit_id = '${safeUnitId}'` : 'TRUE';
  const etag = await tableEtag(db, 'pricing_rules', where);
  if (handle304(c, etag)) return c.body(null, 304);

  const query = db.select().from(schema.pricingRules);
  const rows = unitId ? await query.where(eq(schema.pricingRules.unitId, unitId)) : await query;
  return c.json({ data: rows });
});

policiesRouter.post('/rules', async (c) => {
  const body = await c.req.json();
  const parsed = createPricingRuleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const orgId = getActiveOrgId(c);
  const db = getTenantDb(c);

  const [created] = await db
    .insert(schema.pricingRules)
    .values({
      organizationId: orgId,
      unitId: parsed.data.unitId ?? null,
      name: parsed.data.name,
      config: parsed.data.config,
      enabled: parsed.data.enabled ? 1 : 0,
    })
    .returning();
  return c.json({ data: created }, 201);
});

policiesRouter.patch('/rules/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updatePricingRuleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.flatten() }, 400);
  }
  const db = getTenantDb(c);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.config !== undefined) updates.config = parsed.data.config;
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled ? 1 : 0;

  const [updated] = await db
    .update(schema.pricingRules)
    .set(updates)
    .where(eq(schema.pricingRules.id, id))
    .returning();
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: updated });
});

policiesRouter.delete('/rules/:id', async (c) => {
  const id = c.req.param('id');
  const db = getTenantDb(c);
  const [deleted] = await db
    .delete(schema.pricingRules)
    .where(eq(schema.pricingRules.id, id))
    .returning({ id: schema.pricingRules.id });
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});
