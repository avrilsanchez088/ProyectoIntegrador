/**
 * Stripe subscription mock — el SaaS cobra la mensualidad a Impacto vía
 * Stripe (M12). Este mock permite hacer el flow completo de "elegir plan →
 * checkout → confirmación" sin Stripe real.
 */
import { logger } from '../../logger.js';

export type StripePlan = 'starter' | 'pro' | 'business';

export interface StripeCheckoutSession {
  id: string;
  url: string;
  customerId: string;
  subscriptionId: string;
}

export const PLAN_PRICES_USD: Record<StripePlan, number> = {
  starter: 29,
  pro: 99,
  business: 249,
};

let counter = 0;

export const stripeMock = {
  async createCheckoutSession(params: {
    organizationId: string;
    plan: StripePlan;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<StripeCheckoutSession> {
    counter++;
    const id = `cs_mock_${Date.now()}_${counter}`;
    const customerId = `cus_mock_${params.organizationId}`;
    const subscriptionId = `sub_mock_${params.organizationId}_${counter}`;
    logger.info(
      { orgId: params.organizationId, plan: params.plan, email: params.customerEmail },
      '🟢 [stripe-mock] createCheckoutSession',
    );
    return {
      id,
      url: `https://impacto.local/mock/stripe/checkout/${id}`,
      customerId,
      subscriptionId,
    };
  },

  async cancelSubscription(subscriptionId: string) {
    logger.info({ subscriptionId }, '🟢 [stripe-mock] cancelSubscription');
    return { id: subscriptionId, status: 'canceled' as const };
  },

  async createPortalSession(customerId: string) {
    return {
      id: `bps_mock_${customerId}`,
      url: `https://impacto.local/mock/stripe/portal/${customerId}`,
    };
  },

  /**
   * Simula payload del webhook Stripe `invoice.paid`.
   */
  buildInvoicePaidPayload(subscriptionId: string, amountUsd: number) {
    return {
      id: `evt_mock_${Date.now()}`,
      object: 'event',
      type: 'invoice.paid',
      data: {
        object: {
          id: `in_mock_${Date.now()}`,
          subscription: subscriptionId,
          amount_paid: amountUsd * 100,
          currency: 'usd',
          status: 'paid',
        },
      },
    };
  },
};

export type StripeClient = typeof stripeMock;
