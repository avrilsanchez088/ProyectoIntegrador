'use client';

import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Mail, MessageSquare, Snowflake } from 'lucide-react';

/**
 * FrozenBanner — visible cuando el workspace activo está congelado por
 * staff Impacto (propuesta 131.2 ronda 11).
 *
 * Lee `tenant_settings.frozen` via `/api/settings`. Si está true, muestra
 * banner permanente arriba del dashboard. Reads siguen funcionando — solo
 * mutations se rechazan con 402.
 */

interface TenantSettings {
  id: string;
  frozen?: boolean;
  frozenReason?: string | null;
  frozenAllowOps?: string[];
}

/**
 * Mapa de op-keys a labels human-readable. Mantener en sync con
 * `packages/shared/src/freeze-ops.ts`. Si no matchea, mostramos la key cruda.
 */
const ALLOW_OP_LABELS: Record<string, string> = {
  'booking.checkin': 'Check-in del huésped',
  'booking.checkout': 'Check-out del huésped',
  'booking.cancel': 'Cancelar reserva',
  'notification.read': 'Marcar notificaciones leídas',
};

export function FrozenBanner() {
  const query = useQuery({
    queryKey: ['tenant-settings-frozen'],
    queryFn: () => api<{ data: TenantSettings }>('/api/settings'),
    staleTime: 60_000,
    retry: false,
  });

  if (!query.data?.data.frozen) return null;

  const reason = query.data.data.frozenReason;

  // Configurable via env. Default a un mailto genérico — el deploy real
  // sobrescribe con la URL real de WhatsApp Business si la hay.
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'soporte@impacto-saas.app';
  const supportWhatsApp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_URL;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 border-b border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
    >
      <Snowflake className="size-4 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <strong>Workspace congelado.</strong>{' '}
        {reason ?? 'Las mutaciones están temporalmente bloqueadas.'}
        {query.data.data.frozenAllowOps && query.data.data.frozenAllowOps.length > 0 && (
          <p className="mt-0.5 text-xs opacity-80">
            Aún podés:{' '}
            {query.data.data.frozenAllowOps.map((op) => ALLOW_OP_LABELS[op] ?? op).join(' · ')}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <a
          href={`mailto:${supportEmail}?subject=Workspace%20congelado`}
          className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-900 hover:bg-rose-50 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-100"
        >
          <Mail className="size-3" aria-hidden="true" />
          Email
        </a>
        {supportWhatsApp && (
          <a
            href={supportWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-900 hover:bg-rose-50 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-100"
          >
            <MessageSquare className="size-3" aria-hidden="true" />
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
