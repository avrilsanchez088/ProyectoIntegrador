'use client';

import { api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@impacto/ui/dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, Check, CheckCheck, Inbox, Info, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

/**
 * Bell de notificaciones del header (§2.10 del audit + G2.10 carry-over).
 *
 * Polling discreto cada 60s para refrescar el contador. Cuando llegue M13
 * se reemplaza por SSE / Pusher (env vars ya están en .env.example).
 *
 * Items provienen de `in_app_notifications` filtradas por user (con fallback
 * a broadcast org-wide cuando user_id IS NULL).
 */

type Severity = 'info' | 'success' | 'warning' | 'urgent';

interface Notification {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  body: string | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

const SEVERITY_TONE: Record<Severity, string> = {
  info: 'text-muted-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  urgent: 'text-rose-600 dark:text-rose-400',
};

function CategoryIcon({ category, severity }: { category: string; severity: Severity }) {
  const cls = `size-4 ${SEVERITY_TONE[severity]}`;
  switch (category) {
    case 'wa_message':
      return <MessageCircle className={cls} aria-hidden="true" />;
    case 'ical_sync_failed':
      return <AlertTriangle className={cls} aria-hidden="true" />;
    case 'payment':
      return <Check className={cls} aria-hidden="true" />;
    case 'booking':
      return <Inbox className={cls} aria-hidden="true" />;
    default:
      return <Info className={cls} aria-hidden="true" />;
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return 'recién';
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.round(hr / 24);
  if (day < 30) return `hace ${day} d`;
  return new Date(iso).toLocaleDateString('es-AR');
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const countQuery = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api<{ data: { unread: number } }>('/api/notifications/count'),
    refetchInterval: 60_000, // polling de bajo costo (un COUNT)
    refetchIntervalInBackground: false,
    retry: false,
  });

  const listQuery = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () =>
      api<{ data: Notification[]; unreadCount: number }>('/api/notifications?limit=50'),
    enabled: open,
    staleTime: 10_000,
  });

  const markAllRead = useMutation({
    mutationFn: () => api('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/api/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unread = countQuery.data?.data.unread ?? 0;
  const items = listQuery.data?.data ?? [];

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title="Notificaciones"
        aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : 'Notificaciones'}
        className="relative"
      >
        <Bell aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-md">
          <DialogTitle className="sr-only">Notificaciones</DialogTitle>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Notificaciones</h2>
              <p className="text-xs text-muted-foreground">
                {unread > 0
                  ? `${unread} sin leer`
                  : items.length > 0
                    ? 'Todas leídas'
                    : 'Sin notificaciones'}
              </p>
            </div>
            {unread > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                <CheckCheck aria-hidden="true" />
                Marcar todas
              </Button>
            )}
          </div>

          <div className="border-b bg-muted/20 px-4 py-2 text-center">
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver historial completo →
            </Link>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && !listQuery.isPending && (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
                <Inbox className="mb-2 size-8 opacity-40" aria-hidden="true" />
                Cuando llegue una nueva reserva o un mensaje WhatsApp, aparecerá acá.
              </div>
            )}

            <ul>
              {items.map((n) => {
                const Wrapper = n.actionUrl ? Link : 'div';
                const body = (
                  <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40">
                    <div className="mt-0.5">
                      <CategoryIcon category={n.category} severity={n.severity} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={`truncate text-sm ${
                            n.readAt ? 'font-normal text-muted-foreground' : 'font-medium'
                          }`}
                        >
                          {n.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {relativeTime(n.createdAt)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {!n.readAt && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          markRead.mutate(n.id);
                        }}
                        title="Marcar como leída"
                        aria-label="Marcar como leída"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Check className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
                return (
                  <li key={n.id} className="border-b last:border-0">
                    {n.actionUrl ? (
                      <Link
                        href={n.actionUrl as never}
                        onClick={() => {
                          if (!n.readAt) markRead.mutate(n.id);
                          setOpen(false);
                        }}
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
