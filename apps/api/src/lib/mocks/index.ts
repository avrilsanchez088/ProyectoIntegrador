/**
 * Selector de implementación real vs mock por integración.
 * Cierra §1.4 del audit ("Mocks WhatsApp / Meta Ads / GCal / Booking / Airbnb /
 * Mercado Pago / Stripe / LLM — todas mockeables").
 *
 * Convención por env var: cada provider tiene su propia toggle. Un workspace
 * puede tener WhatsApp real + LLM mock, etc. Si la env var del provider real
 * no está seteada, automáticamente cae al mock — el dueño de un alojamiento
 * puede probar todo el flow sin contratar nada.
 *
 * Cada provider expone una interfaz idéntica entre real y mock para que el
 * resto del código no tenga que conocer cuál está activo.
 */
import { env } from '../../env.js';
import { logger } from '../../logger.js';

export interface IntegrationMode {
  whatsapp: 'real' | 'mock';
  metaAds: 'real' | 'mock';
  mercadoPago: 'real' | 'mock';
  stripe: 'real' | 'mock';
  llm: 'real' | 'mock';
}

/**
 * Determina el modo activo por integración. Lee las env vars en runtime
 * (no en module load) para que tests puedan mutar process.env.
 */
export function getIntegrationMode(): IntegrationMode {
  const isDemo = env.APP_MODE === 'demo';

  return {
    // En demo siempre mock. En real, mock si falta la credencial.
    whatsapp: isDemo || !process.env.META_SYSTEM_USER_TOKEN ? 'mock' : 'real',
    metaAds: isDemo || !process.env.META_CAPI_ACCESS_TOKEN ? 'mock' : 'real',
    mercadoPago: isDemo || !process.env.MP_ACCESS_TOKEN ? 'mock' : 'real',
    stripe: isDemo || !process.env.STRIPE_SECRET_KEY ? 'mock' : 'real',
    llm:
      isDemo || process.env.LLM_PROVIDER === 'mock' || !process.env.LLM_PROVIDER ? 'mock' : 'real',
  };
}

let logged = false;
export function logIntegrationMode() {
  if (logged) return;
  logged = true;
  const mode = getIntegrationMode();
  logger.info(mode, '🔌 Integration modes resolved');
}
