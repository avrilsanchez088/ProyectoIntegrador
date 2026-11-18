/**
 * Mercado Pago Checkout / IPN mock. Cubre el flujo de cobrar seña al huésped
 * (M11) sin necesitar credenciales sandbox.
 */
import { logger } from '../../logger.js';

export interface CreatePreferenceParams {
  bookingId: string;
  amountCents: number;
  currency: 'USD' | 'UYU' | 'ARS';
  description: string;
  payerEmail?: string;
  notificationUrl?: string;
  successUrl?: string;
  failureUrl?: string;
}

export interface MpPreference {
  id: string;
  initPoint: string;
  sandboxInitPoint: string;
  expiresAt: string;
}

let counter = 0;

export const mercadoPagoMock = {
  async createPreference(params: CreatePreferenceParams): Promise<MpPreference> {
    counter++;
    const id = `MP-MOCK-PREF-${Date.now()}-${counter}`;
    logger.info(
      { bookingId: params.bookingId, amount: params.amountCents, currency: params.currency },
      '🟢 [mp-mock] createPreference',
    );
    return {
      id,
      initPoint: `https://impacto.local/mock/mp/checkout/${id}`,
      sandboxInitPoint: `https://impacto.local/mock/mp/checkout/${id}?sandbox=1`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  },

  async getPaymentDetail(paymentId: string) {
    logger.info({ paymentId }, '🟢 [mp-mock] getPaymentDetail');
    return {
      id: paymentId,
      status: 'approved' as const,
      statusDetail: 'accredited',
      transactionAmount: 100,
      currencyId: 'USD',
      payer: { email: 'mock@test.local' },
      externalReference: `mock-${paymentId}`,
      dateApproved: new Date().toISOString(),
    };
  },

  /**
   * Simula el payload de un webhook IPN. Útil para tests.
   */
  buildPaymentWebhookPayload(paymentId: string) {
    return {
      action: 'payment.updated',
      api_version: 'v1',
      data: { id: paymentId },
      date_created: new Date().toISOString(),
      id: Math.floor(Math.random() * 1_000_000),
      live_mode: false,
      type: 'payment',
      user_id: 'mock-user',
    };
  },
};

export type MercadoPagoClient = typeof mercadoPagoMock;
