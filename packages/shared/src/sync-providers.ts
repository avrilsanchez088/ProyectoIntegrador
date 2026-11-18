/**
 * Catálogo declarativo de providers de sincronización con OTAs.
 *
 * Estado del arte (mayo 2026, investigado en internet):
 *
 *  TIER 1 — iCal (lo que ya funciona)
 *    • Polling 15min-6h, real-world 2-3h delay
 *    • Funciona out-of-the-box, sin onboarding
 *    • Riesgo de double-booking durante el delay
 *    • Cubierto por tabla `external_calendars` existente — no aparece acá.
 *
 *  TIER 2 — Channel Manager white-label (RECOMENDADO)
 *    • Real-time push vía API REST + webhooks
 *    • El channel manager ya tiene certificaciones con OTAs
 *    • Impacto solo necesita la API key del provider
 *    • Sub-100ms response, 99.9% SLA típico
 *    • Costo: per-property del channel manager (10-30 USD/property/mes típico)
 *    • Providers: Channex (white-label friendly), Hostaway, Rentals United
 *
 *  TIER 3 — Direct OTA APIs (futuro, alta fricción)
 *    • Real-time push directo (sin middleware)
 *    • Booking.com Connectivity: applications PAUSADAS (mayo 2026).
 *      Requiere Connected → Preferred → Premier tiers.
 *    • Airbnb: invite-only — Airbnb selecciona partners, no se aplica.
 *      Requiere Instant Booking en todas las listings.
 *    • Para Impacto: long-term. Por ahora documentar el path.
 *
 * Cada provider define:
 *   - key: identificador único (usado en sync_integrations.provider_key)
 *   - tier: 'channel_manager' | 'direct_ota'
 *   - configFields: campos que el dueño debe ingresar
 *   - docsUrl: link a docs oficiales del provider
 *   - applyUrl: para tier 3, link al formulario de aplicación (si existe)
 *   - latencySeconds: típica esperada (informativa)
 *   - status: 'available' | 'waitlist' | 'invite_only'
 *
 * Para iCal puro, ver tabla `external_calendars` — no es un provider acá.
 */

export type SyncTier = 'channel_manager' | 'direct_ota';
export type SyncStatus = 'available' | 'waitlist' | 'invite_only';

export interface SyncProviderField {
  key: string;
  label: string;
  help?: string;
  type: 'text' | 'password' | 'email' | 'url';
  required: boolean;
  pattern?: string;
  placeholder?: string;
}

export interface SyncProvider {
  key: string;
  name: string;
  tagline: string;
  tier: SyncTier;
  channels: Array<'booking' | 'airbnb' | 'vrbo' | 'expedia' | 'other'>;
  status: SyncStatus;
  latencySeconds: number;
  logoEmoji: string;
  configFields: SyncProviderField[];
  docsUrl: string;
  applyUrl?: string;
  pricingPerPropertyUsd?: number;
  notes?: string;
}

// ─── Tier 2: Channel Managers ────────────────────────────────────
const channex: SyncProvider = {
  key: 'channex',
  name: 'Channex',
  tagline: 'Channel manager white-label con sub-100ms response',
  tier: 'channel_manager',
  channels: ['booking', 'airbnb', 'vrbo', 'expedia'],
  status: 'available',
  latencySeconds: 5,
  logoEmoji: '🔗',
  configFields: [],
  docsUrl: 'https://docs.channex.io/',
  pricingPerPropertyUsd: 12,
  notes:
    'Sincronización en tiempo real con Booking.com y Airbnb. ' +
    'La integración está incluida en tu plan de Impacto — no necesitás configurar nada.',
};

const hostaway: SyncProvider = {
  key: 'hostaway',
  name: 'Hostaway',
  tagline: 'Vacation rental software con API pública y Preferred Partner status',
  tier: 'channel_manager',
  channels: ['booking', 'airbnb', 'vrbo', 'expedia'],
  status: 'available',
  latencySeconds: 5,
  logoEmoji: '🏠',
  configFields: [
    {
      key: 'accountId',
      label: 'Account ID',
      help: 'En Hostaway dashboard → Settings → API',
      type: 'text',
      required: true,
      pattern: '^[0-9]+$',
      placeholder: '12345',
    },
    {
      key: 'apiKey',
      label: 'API Token',
      help: 'OAuth2 token de larga duración',
      type: 'password',
      required: true,
    },
  ],
  docsUrl: 'https://api.hostaway.com/documentation',
  applyUrl: 'https://www.hostaway.com/contact/',
  pricingPerPropertyUsd: 15,
  notes:
    'Airbnb Preferred Software Partner — sync real-time + Instant Booking ' +
    'requerido en sus listings. Open API documentada.',
};

const rentalsUnited: SyncProvider = {
  key: 'rentals_united',
  name: 'Rentals United',
  tagline: 'Distribución a 90+ OTAs globales con un solo integration',
  tier: 'channel_manager',
  channels: ['booking', 'airbnb', 'vrbo', 'expedia', 'other'],
  status: 'available',
  latencySeconds: 10,
  logoEmoji: '🌐',
  configFields: [
    {
      key: 'username',
      label: 'Usuario',
      type: 'text',
      required: true,
    },
    {
      key: 'password',
      label: 'Contraseña',
      type: 'password',
      required: true,
    },
  ],
  docsUrl: 'https://rentalsunited.com/how-it-works-api/',
  applyUrl: 'https://rentalsunited.com/contact-us/',
  pricingPerPropertyUsd: 20,
  notes:
    'Útil si vas a expandirte fuera de Booking/Airbnb — soporta 90+ OTAs. ' +
    'Onboarding más lento (feasibility → certification → soft-launch).',
};

// ─── Tier 3: Direct OTA APIs ─────────────────────────────────────
const bookingDirect: SyncProvider = {
  key: 'booking_direct',
  name: 'Booking.com Connectivity API',
  tagline: 'API directa de Booking.com — real-time sin middleware',
  tier: 'direct_ota',
  channels: ['booking'],
  status: 'waitlist',
  latencySeconds: 1,
  logoEmoji: '🅱️',
  configFields: [],
  docsUrl: 'https://developers.booking.com/connectivity/docs',
  applyUrl: 'https://connect.booking.com/',
  notes:
    'Applications PAUSADAS (mayo 2026). Cuando reabran: certification stack ' +
    'Connected → Preferred → Premier. Requiere SLA productivo + infra-grade. ' +
    'Para Impacto: long-term, después de Channex/Hostaway proven.',
};

const airbnbDirect: SyncProvider = {
  key: 'airbnb_direct',
  name: 'Airbnb Partner API',
  tagline: 'API directa de Airbnb — invite-only para Preferred Partners',
  tier: 'direct_ota',
  channels: ['airbnb'],
  status: 'invite_only',
  latencySeconds: 1,
  logoEmoji: '🅰️',
  configFields: [],
  docsUrl: 'https://www.airbnb.com/help/article/3304',
  applyUrl: 'https://www.airbnb.com/software-partners',
  notes:
    'Programa cerrado a aplicaciones — Airbnb selecciona partners ellos mismos. ' +
    'Requisitos: scale (>500 listings), Instant Booking en todas, security ' +
    'compliance. Path realista: conectar vía Hostaway (Preferred Partner) ' +
    'hasta calificar como direct.',
};

export const SYNC_PROVIDERS: readonly SyncProvider[] = [
  channex,
  hostaway,
  rentalsUnited,
  bookingDirect,
  airbnbDirect,
];

export function findSyncProvider(key: string): SyncProvider | undefined {
  return SYNC_PROVIDERS.find((p) => p.key === key);
}

export function syncProvidersByTier(tier: SyncTier): readonly SyncProvider[] {
  return SYNC_PROVIDERS.filter((p) => p.tier === tier);
}
