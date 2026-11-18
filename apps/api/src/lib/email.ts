import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * Mailer compartido.
 *
 * Estrategia:
 *  - DEV: SMTP a Mailhog (`SMTP_HOST=localhost`, port 1125 según
 *    docker-compose). Sin auth, sin TLS — captura el mail y lo muestra en
 *    http://localhost:8125.
 *  - PROD: Resend SMTP relay (smtp.resend.com:465 con
 *    `SMTP_USER='resend'` y `SMTP_PASSWORD=<RESEND_API_KEY>`). El env
 *    `RESEND_API_KEY` se traduce a SMTP_PASSWORD si está seteado y no hay
 *    contraseña explícita.
 *
 * Si no hay `SMTP_HOST` configurado, el mailer queda en modo `noop` —
 * logea el mensaje sin enviar. Esto permite correr la app sin SMTP en CI
 * o en setups exploratorios.
 */

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Reemplaza el From por uno alternativo (raro). */
  from?: string;
};

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter | null {
  if (cachedTransport) return cachedTransport;
  if (!env.SMTP_HOST) return null;

  const isResend = env.SMTP_HOST.includes('resend.com');
  const password = env.SMTP_PASSWORD || (isResend ? env.RESEND_API_KEY : undefined);

  cachedTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? (isResend ? 465 : 1125),
    secure: !!isResend,
    auth:
      env.SMTP_USER && password
        ? { user: env.SMTP_USER, pass: password }
        : isResend && password
          ? { user: 'resend', pass: password }
          : undefined,
  });
  return cachedTransport;
}

const DEFAULT_FROM = env.SMTP_FROM ?? 'noreply@impacto.local';

/**
 * Envia un email. Devuelve `{ sent: false, reason }` si no hay transporter
 * configurado para que el caller decida (best-effort vs strict).
 */
export async function sendMail(args: SendArgs): Promise<{ sent: boolean; reason?: string }> {
  const transport = getTransport();
  if (!transport) {
    logger.info({ to: args.to, subject: args.subject }, '📧 mail noop (SMTP_HOST no configurado)');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  try {
    const info = await transport.sendMail({
      from: args.from ?? DEFAULT_FROM,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    });
    logger.info({ messageId: info.messageId, to: args.to, subject: args.subject }, '📧 mail sent');
    return { sent: true };
  } catch (err) {
    logger.error({ err, to: args.to, subject: args.subject }, 'mail send failed');
    return { sent: false, reason: 'send_failed' };
  }
}

/**
 * Render mínimo de plantilla de invitación. HTML simple, evita dependencia
 * react-email (M13). Diseño sigue tokens del producto: encabezado, CTA,
 * footer con razón.
 */
export function renderInvitationEmail(args: {
  inviterName: string;
  organizationName: string;
  inviteUrl: string;
  recipientEmail: string;
}): { subject: string; text: string; html: string } {
  const subject = `Te invitaron a ${args.organizationName} en Impacto`;
  const text = `Hola,

${args.inviterName} te invitó a sumarte a ${args.organizationName} en Impacto.

Aceptá la invitación: ${args.inviteUrl}

Si no esperabas este mensaje, podés ignorarlo. La invitación expira en 48hs.

— Impacto`;

  const html = `<!doctype html>
<html lang="es">
  <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#fafafa; padding: 32px; color:#0a0a0a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
      <tr><td>
        <h1 style="margin: 0 0 16px; font-size: 20px; letter-spacing: -0.01em;">Te invitaron a ${escapeHtml(args.organizationName)}</h1>
        <p style="line-height: 1.5; margin: 0 0 16px;">${escapeHtml(args.inviterName)} te sumó al workspace en Impacto.</p>
        <p style="margin: 24px 0;">
          <a href="${escapeAttr(args.inviteUrl)}" style="display: inline-block; background:#2563eb; color:#fff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 500;">Aceptar invitación</a>
        </p>
        <p style="font-size: 12px; color: #71717a; margin: 24px 0 0; line-height: 1.5;">
          Si no esperabas este mensaje podés ignorarlo. La invitación expira en 48hs.<br/>
          Enviado a ${escapeHtml(args.recipientEmail)}.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c] ?? c);
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/`/g, '%60');
}
