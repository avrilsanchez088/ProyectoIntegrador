/**
 * Channex sync adapter — integración real con la API de Channex.
 * White-label: la API key es de Impacto, no del tenant.
 */

import { env } from '../../env.js';
import { logger } from '../../logger.js';

const BASE_URL = env.CHANNEX_BASE_URL;

export interface ChannexConfig {
  propertyId: string;
}

export interface ChannexAvailabilityValue {
  property_id: string;
  room_type_id: string;
  date: string;
  availability: number;
}

export interface ChannexRestrictionValue {
  property_id: string;
  rate_plan_id: string;
  date: string;
  rate?: string;
  stop_sell?: boolean;
  min_stay_arrival?: number;
}

export interface ChannexBooking {
  id: string;
  status: string;
  arrival_date: string;
  departure_date: string;
  rooms: Array<{
    room_type_id: string;
    rate_plan_id: string;
  }>;
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  price: string;
  currency: string;
  channel_code: string;
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'user-api-key': env.CHANNEX_API_KEY,
  };
}

export const channexAdapter = {
  async healthCheck(config: ChannexConfig): Promise<{
    ok: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/properties/${config.propertyId}`, {
        headers: headers(),
      });
      const latencyMs = Date.now() - start;

      if (res.status === 401) return { ok: false, latencyMs, error: 'API key inválida' };
      if (res.status === 404) return { ok: false, latencyMs, error: 'Property ID no encontrado' };
      if (!res.ok) return { ok: false, latencyMs, error: `Error Channex: ${res.status}` };

      logger.info({ propertyId: config.propertyId, latencyMs }, '✅ [channex] healthCheck OK');
      return { ok: true, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : 'Error de red';
      logger.error({ err }, '❌ [channex] healthCheck failed');
      return { ok: false, latencyMs, error: msg };
    }
  },

  async pushAvailability(values: ChannexAvailabilityValue[]): Promise<{ taskId: string }> {
    const res = await fetch(`${BASE_URL}/availability`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ values }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      logger.error({ status: res.status, body }, '❌ [channex] pushAvailability failed');
      throw new Error(`Channex availability error: ${res.status}`);
    }

    const data = await res.json();
    const taskId = data.data?.[0]?.id ?? 'unknown';
    logger.info({ taskId, count: values.length }, '✅ [channex] pushAvailability queued');
    return { taskId };
  },

  async pushRestrictions(values: ChannexRestrictionValue[]): Promise<{ taskId: string }> {
    const res = await fetch(`${BASE_URL}/restrictions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ values }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      logger.error({ status: res.status, body }, '❌ [channex] pushRestrictions failed');
      throw new Error(`Channex restrictions error: ${res.status}`);
    }

    const data = await res.json();
    const taskId = data.data?.[0]?.id ?? 'unknown';
    logger.info({ taskId, count: values.length }, '✅ [channex] pushRestrictions queued');
    return { taskId };
  },

  parseWebhookBooking(raw: ChannexBooking) {
    return {
      channelCode: raw.channel_code,
      externalId: raw.id,
      status: raw.status,
      checkIn: raw.arrival_date,
      checkOut: raw.departure_date,
      totalCents: Math.round(Number.parseFloat(raw.price) * 100),
      currency: raw.currency,
      guestName: raw.customer.name,
      guestEmail: raw.customer.email,
      guestPhone: raw.customer.phone,
    };
  },

  async createGroup(params: {
    name: string;
  }): Promise<{ channexGroupId: string }> {
    const res = await fetch(`${BASE_URL}/groups`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        group: {
          title: params.name,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      logger.error({ status: res.status, body }, '❌ [channex] createGroup failed');
      throw new Error(`Channex createGroup error: ${res.status}`);
    }

    const data = await res.json();
    const channexGroupId = data.data?.id;
    if (!channexGroupId) throw new Error('Channex no devolvió group ID');

    logger.info({ channexGroupId, name: params.name }, '✅ [channex] group created');
    return { channexGroupId };
  },

  async createProperty(params: {
    name: string;
    city: string;
    country: string;
    currency: string;
    timezone: string;
    email: string;
    groupId?: string;
  }): Promise<{ channexPropertyId: string }> {
    const res = await fetch(`${BASE_URL}/properties`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        property: {
          title: params.name,
          currency: params.currency,
          email: params.email,
          country_code: params.country,
          city: params.city,
          timezone: params.timezone,
          property_type: 'Hostel',
          ...(params.groupId ? { group_ids: [params.groupId] } : {}),
        },
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      logger.error({ status: res.status, body }, '❌ [channex] createProperty failed');
      throw new Error(`Channex createProperty error: ${res.status}`);
    }

    const data = await res.json();
    const channexPropertyId = data.data?.id;
    if (!channexPropertyId) throw new Error('Channex no devolvió property ID');

    logger.info({ channexPropertyId, name: params.name }, '✅ [channex] property created');
    return { channexPropertyId };
  },

  async assignPropertyToGroup(params: {
    channexGroupId: string;
    channexPropertyId: string;
  }): Promise<void> {
    const res = await fetch(
      `${BASE_URL}/groups/${params.channexGroupId}/properties/${params.channexPropertyId}`,
      {
        method: 'POST',
        headers: headers(),
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      logger.error({ status: res.status, body }, '❌ [channex] assignPropertyToGroup failed');
      throw new Error(`Channex assignPropertyToGroup error: ${res.status}`);
    }

    logger.info(params, '✅ [channex] property asignada al group');
  },

  async createRoomType(params: {
    channexPropertyId: string;
    name: string;
    capacity: number;
  }): Promise<{ channexRoomTypeId: string }> {
    const res = await fetch(`${BASE_URL}/room_types`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        room_type: {
          property_id: params.channexPropertyId,
          title: params.name,
          count_of_rooms: 1,
          capacity: params.capacity,
          occ_adults: params.capacity,
          occ_children: 0,
          occ_infants: 0,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      logger.error({ status: res.status, body }, '❌ [channex] createRoomType failed');
      throw new Error(`Channex createRoomType error: ${res.status}`);
    }

    const data = await res.json();
    const channexRoomTypeId = data.data?.id;
    if (!channexRoomTypeId) throw new Error('Channex no devolvió room_type ID');

    logger.info({ channexRoomTypeId, name: params.name }, '✅ [channex] room_type created');
    return { channexRoomTypeId };
  },

  async createRatePlan(params: {
    channexPropertyId: string;
    channexRoomTypeId: string;
    title: string;
    currency: string;
    capacity: number;
  }): Promise<{ channexRatePlanId: string }> {
    const res = await fetch(`${BASE_URL}/rate_plans`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        rate_plan: {
          title: params.title,
          property_id: params.channexPropertyId,
          room_type_id: params.channexRoomTypeId,
          currency: params.currency,
          sell_mode: 'per_room',
          rate_mode: 'manual',
          options: [{ occupancy: params.capacity, is_primary: true }],
          children_fee: '0.00',
          infant_fee: '0.00',
          inherit_rate: false,
          inherit_closed_to_arrival: false,
          inherit_closed_to_departure: false,
          inherit_stop_sell: false,
          inherit_min_stay_arrival: false,
          inherit_max_stay: false,
          inherit_max_sell: false,
          inherit_max_availability: false,
          inherit_availability_offset: false,
          auto_rate_settings: null,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      logger.error({ status: res.status, body }, '❌ [channex] createRatePlan failed');
      throw new Error(`Channex createRatePlan error: ${res.status}`);
    }

    const data = await res.json();
    const channexRatePlanId = data.data?.id;
    if (!channexRatePlanId) throw new Error('Channex no devolvió rate_plan ID');

    logger.info({ channexRatePlanId }, '✅ [channex] rate_plan created');
    return { channexRatePlanId };
  },

  async getBookingRevision(revisionId: string): Promise<{
    id: string;
    status: string;
    arrival_date: string;
    departure_date: string;
    rooms: Array<{ room_type_id: string; rate_plan_id: string }>;
    customer: { name: string; email: string | null; phone: string | null };
    amount: string;
    currency: string;
    channel_id: string;
    booking_id: string;
  }> {
    const res = await fetch(`${BASE_URL}/booking_revisions/${revisionId}`, {
      headers: headers(),
    });

    if (!res.ok) {
      logger.error({ status: res.status, revisionId }, '❌ [channex] getBookingRevision failed');
      throw new Error(`Channex getBookingRevision error: ${res.status}`);
    }

    const data = await res.json();
    logger.info({ revisionId }, '✅ [channex] booking revision obtenida');
    return data.data?.attributes;
  },

  async ackBookingRevision(revisionId: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/booking_revisions/${revisionId}/ack`, {
      method: 'POST',
      headers: headers(),
    });

    if (!res.ok) {
      logger.error({ status: res.status, revisionId }, '❌ [channex] ack failed');
      throw new Error(`Channex ack error: ${res.status}`);
    }

    logger.info({ revisionId }, '✅ [channex] booking revision acked');
  },
};

export type channexAdapter = typeof channexAdapter;
