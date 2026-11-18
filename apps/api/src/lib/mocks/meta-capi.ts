/**
 * Meta CAPI (Conversions API) mock — para atribución de Meta Ads a reservas
 * (M10). El bot trackea Lead → ScheduleAppointment → Purchase en el funnel
 * del huésped.
 *
 * El mock no hace fetch a `graph.facebook.com`. Persiste en memoria los
 * eventos enviados para que tests puedan inspeccionarlos.
 */
import { logger } from '../../logger.js';

export type CapiEventName =
  | 'PageView'
  | 'Lead'
  | 'ScheduleAppointment'
  | 'InitiateCheckout'
  | 'Purchase'
  | 'CompleteRegistration';

export interface CapiUserData {
  /** Email hasheado SHA256 (lowercase). Si está como plain, lo hashea el cliente. */
  emailHash?: string;
  phoneHash?: string;
  fbp?: string; // _fbp cookie
  fbc?: string; // _fbc cookie (clickid)
  clientIp?: string;
  clientUserAgent?: string;
  externalId?: string; // user_id de la app
}

export interface CapiCustomData {
  currency?: string;
  value?: number;
  contentName?: string;
  contentIds?: string[];
}

export interface CapiEvent {
  eventName: CapiEventName;
  eventTime: number; // unix seconds
  eventId?: string; // dedup
  userData: CapiUserData;
  customData?: CapiCustomData;
  actionSource: 'whatsapp' | 'website' | 'email' | 'app' | 'system_generated';
}

const sentEvents: CapiEvent[] = [];

export const metaCapiMock = {
  async sendEvent(event: CapiEvent): Promise<{ eventsReceived: number; messages: string[] }> {
    sentEvents.push(event);
    logger.info(
      {
        eventName: event.eventName,
        actionSource: event.actionSource,
        value: event.customData?.value,
      },
      '🟢 [capi-mock] sendEvent',
    );
    return { eventsReceived: 1, messages: [] };
  },

  async sendEvents(events: CapiEvent[]) {
    for (const e of events) sentEvents.push(e);
    logger.info({ count: events.length }, '🟢 [capi-mock] sendEvents batch');
    return { eventsReceived: events.length, messages: [] };
  },

  /** Solo para tests: lista de eventos enviados. */
  getSentEvents(): CapiEvent[] {
    return [...sentEvents];
  },

  /** Solo para tests: resetea el buffer. */
  clearSentEvents(): void {
    sentEvents.length = 0;
  },
};

export type MetaCapiClient = typeof metaCapiMock;
