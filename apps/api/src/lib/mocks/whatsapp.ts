/**
 * WhatsApp Cloud API mock — implementa el contrato de Meta Cloud API sin
 * salir a internet. CLAUDE.md §1 + §15 G6 (Tech Provider).
 *
 * Llama a este módulo `wa.sendMessage(...)` etc.; el dispatcher real elige
 * mock o real según `getIntegrationMode().whatsapp`.
 *
 * Comportamiento del mock:
 *   - sendMessage: devuelve un id sintético, loggea, no toca red
 *   - sendTemplate: idem
 *   - sendMedia: idem
 *   - subscribeWebhook: no-op (siempre OK)
 *   - getMessageStatus: devuelve estados sintéticos según patrones del id
 *
 * Es **deterministic** — los ids vienen de un counter, así los tests son
 * reproducibles.
 */
import { logger } from '../../logger.js';

export interface WhatsappMessageResult {
  messageId: string;
  to: string;
  status: 'queued';
  sentAt: string;
}

export interface WhatsappTemplateParams {
  to: string;
  templateName: string;
  language?: string;
  components?: Array<{
    type: 'header' | 'body' | 'button';
    parameters?: Array<{ type: 'text' | 'currency' | 'date_time'; text?: string }>;
  }>;
}

let mockCounter = 0;
function nextMockId(prefix: string): string {
  mockCounter++;
  return `${prefix}-mock-${Date.now()}-${mockCounter}`;
}

export const whatsappMock = {
  async sendMessage(params: {
    to: string;
    body: string;
    phoneNumberId?: string;
  }): Promise<WhatsappMessageResult> {
    logger.info(
      { to: params.to, bodyLen: params.body.length, phoneNumberId: params.phoneNumberId },
      '🟢 [wa-mock] sendMessage',
    );
    return {
      messageId: nextMockId('wamid'),
      to: params.to,
      status: 'queued',
      sentAt: new Date().toISOString(),
    };
  },

  async sendTemplate(params: WhatsappTemplateParams): Promise<WhatsappMessageResult> {
    logger.info(
      { to: params.to, template: params.templateName, lang: params.language ?? 'es' },
      '🟢 [wa-mock] sendTemplate',
    );
    return {
      messageId: nextMockId('wamid-tpl'),
      to: params.to,
      status: 'queued',
      sentAt: new Date().toISOString(),
    };
  },

  async sendMedia(params: {
    to: string;
    mediaUrl: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
    caption?: string;
  }): Promise<WhatsappMessageResult> {
    logger.info({ to: params.to, mediaType: params.mediaType }, '🟢 [wa-mock] sendMedia');
    return {
      messageId: nextMockId('wamid-media'),
      to: params.to,
      status: 'queued',
      sentAt: new Date().toISOString(),
    };
  },

  async getMessageStatus(messageId: string): Promise<{
    messageId: string;
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  }> {
    // Mock determinístico: por convención los mensajes con sufijo terminado en
    // "fail" devuelven failed, los demás progresan a "delivered".
    const status = messageId.endsWith('fail') ? 'failed' : 'delivered';
    return { messageId, status };
  },

  /**
   * Genera un evento entrante de WhatsApp (usado en tests + demo seed).
   * Mimica el shape del webhook real de Meta para que el handler sea idéntico.
   */
  buildIncomingMessageEvent(params: {
    from: string;
    body: string;
    phoneNumberId: string;
    messageId?: string;
  }) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'mock-waba-id',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+598000000',
                  phone_number_id: params.phoneNumberId,
                },
                contacts: [
                  {
                    profile: { name: 'Test Guest' },
                    wa_id: params.from,
                  },
                ],
                messages: [
                  {
                    from: params.from,
                    id: params.messageId ?? nextMockId('wamid-in'),
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: params.body },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  },
};

export type WhatsappClient = typeof whatsappMock;
