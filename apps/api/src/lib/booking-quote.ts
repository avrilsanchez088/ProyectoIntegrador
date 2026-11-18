import { eq, schema, sql } from '@impacto/db';
import { type FeeInput, type QuoteResult, type RateInput, quote } from '@impacto/pricing';
import { type PricingRulesConfig, pricingRulesConfigSchema } from '@impacto/shared';
import type { TenantDb } from '../middleware/auth.js';

/**
 * Snapshot persistido en `bookings.cancellation_policy_snapshot`. Contiene
 * todo lo necesario para calcular un refund sin volver a leer el state actual
 * de la policy del workspace (que puede haber cambiado después).
 */
export interface CancellationPolicySnapshot {
  policyId: string;
  name: string;
  tiers: Array<{ daysBefore: number; refundPercent: number }>;
  capturedAt: string;
}

/**
 * Resuelve la cancellation policy aplicable a una unit al momento de crear
 * el booking. Prefiere la policy específica de la unit; si no hay, cae a la
 * policy default del workspace (`unit_id IS NULL` y `is_default = 1`).
 *
 * Devuelve `null` si el workspace no tiene ninguna policy configurada — el
 * booking se persiste con `cancellationPolicySnapshot = {}`.
 *
 * Implementa G3.4: snapshot inmutable de policy al momento de la reserva.
 */
export async function loadCancellationPolicySnapshot(
  db: TenantDb,
  unitId: string,
): Promise<CancellationPolicySnapshot | null> {
  const rows = await db.execute<{
    id: string;
    name: string;
    tiers: unknown;
    unit_id: string | null;
  }>(sql`
    SELECT id, name, tiers, unit_id
    FROM cancellation_policies
    WHERE unit_id = ${unitId}
       OR (unit_id IS NULL AND is_default = 1)
    ORDER BY unit_id NULLS LAST
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    policyId: row.id,
    name: row.name,
    tiers: Array.isArray(row.tiers)
      ? (row.tiers as Array<{ daysBefore: number; refundPercent: number }>)
      : [],
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Convierte un Date a YYYY-MM-DD en el timezone dado (no UTC).
 * Usa Intl.DateTimeFormat — sin deps externas. `en-CA` produce YYYY-MM-DD.
 *
 * Crítico para workspaces fuera de UTC: un check-in a las 22:00 hora de Buenos
 * Aires (-03:00) cae el día siguiente en UTC. Con `tz = 'America/Argentina/...'`
 * preservamos el día local.
 */
export function toLocalDateString(d: Date, tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(d);
  } catch {
    // Timezone inválido → fallback a UTC.
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Carga inputs de pricing para una unit + corre `quote()`.
 *
 * Se usa al crear bookings sin precio explícito. El handler puede luego
 * persistir el `lineItems` en `quote_snapshot` para auditoría.
 *
 * Lee `tenant_settings.timezone` (RLS lo limita al workspace en contexto) y
 * normaliza checkIn/checkOut/today a la fecha local de ese tz antes de pasar
 * al engine. Resuelve G4.9.
 */
export async function quoteForBooking(
  db: TenantDb,
  args: {
    unitId: string;
    checkIn: Date;
    checkOut: Date;
    guests: number;
    pets: number;
    /** Override explícito (testing). Si no viene, se lee de tenant_settings. */
    timezone?: string;
  },
): Promise<QuoteResult> {
  const { unitId, checkIn, checkOut, guests, pets } = args;

  // Las 4 queries (timezone, rates, fees, rules) son independientes — corren
  // en paralelo. Reduce ~150ms de wall-clock contra 4 secuenciales (G7.4).
  const settingsPromise = args.timezone
    ? Promise.resolve([{ timezone: args.timezone }] as Array<{ timezone: string }>)
    : db.select({ timezone: schema.tenantSettings.timezone }).from(schema.tenantSettings).limit(1);

  const ratesPromise = db.execute<{
    start_date: string;
    end_date: string;
    price_per_night_cents: number;
    extra_guest_price_cents: number;
    base_guests: number;
  }>(sql`
    SELECT s.start_date::text AS start_date,
           s.end_date::text   AS end_date,
           r.price_per_night_cents,
           r.extra_guest_price_cents,
           r.base_guests
    FROM rates r
    JOIN seasons s ON s.id = r.season_id
    WHERE r.unit_id = ${unitId}
      AND s.deleted_at IS NULL
  `);

  const feesPromise = db.select().from(schema.unitFees).where(eq(schema.unitFees.unitId, unitId));

  // Pricing rules: prefer unit-specific, fallback a org-wide. Solo enabled.
  const rulesPromise = db.execute<{ config: unknown; unit_id: string | null }>(sql`
    SELECT config, unit_id
    FROM pricing_rules
    WHERE enabled = 1
      AND (unit_id = ${unitId} OR unit_id IS NULL)
    ORDER BY unit_id NULLS LAST
    LIMIT 1
  `);

  const [settingsRows, rateRows, feeRows, ruleRows] = await Promise.all([
    settingsPromise,
    ratesPromise,
    feesPromise,
    rulesPromise,
  ]);

  const timezone = settingsRows[0]?.timezone ?? 'UTC';

  const rates: RateInput[] = rateRows.map((r) => ({
    startDate: r.start_date,
    endDate: r.end_date,
    pricePerNightCents: Number(r.price_per_night_cents),
    extraGuestPriceCents: Number(r.extra_guest_price_cents),
    baseGuests: Number(r.base_guests),
  }));

  const fees: FeeInput[] = feeRows
    .filter((f) => f.optional === 0)
    .map((f) => ({
      name: f.name,
      feeType: f.feeType as FeeInput['feeType'],
      chargeType: f.chargeType as FeeInput['chargeType'],
      amountCents: Number(f.amountCents),
      refundable: f.refundable === 1,
      optional: false,
    }));

  let rules: PricingRulesConfig | undefined;
  if (ruleRows[0]?.config) {
    const parsed = pricingRulesConfigSchema.safeParse(ruleRows[0].config);
    if (parsed.success) rules = parsed.data;
  }

  return quote({
    checkIn: toLocalDateString(checkIn, timezone),
    checkOut: toLocalDateString(checkOut, timezone),
    today: toLocalDateString(new Date(), timezone),
    guests,
    pets,
    rates,
    fees,
    rules,
  });
}
