'use client';

import { RequireWorkspace } from '@/components/dashboard/require-workspace';
import { type ApiError, api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@impacto/ui/card';
import { EmptyState } from '@impacto/ui/empty-state';
import { Skeleton } from '@impacto/ui/skeleton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, Check, CheckCheck, Inbox, Info, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Historial completo de notificaciones (propuesta 29.4 ronda 4).
 *
 * El bell del header muestra solo últimas 50; esta page tiene paginación,
 * filtros (todas / no leídas / por categoría) y bulk mark-as-read.
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

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Sin leer' },
  { key: 'booking', label: 'Reservas' },
  { key: 'wa_message', label: 'WhatsApp' },
  { key: 'ical_sync_failed', label: 'Sync iCal' },
  { key: 'system', label: 'Sistema' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

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
      return <Bell className={cls} aria-hidden="true" />;
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

const PAGE_SIZE = 30;

export default function NotificationsPage() {
  return <RequireWorkspace>{() => <NotificationsView />}</RequireWorkspace>;
}

function NotificationsView() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [offset, setOffset] = useState(0);

  const queryKey = ['notifications', 'page', filter, offset];
  const onlyUnread = filter === 'unread';
  const url = `/api/notifications?limit=${PAGE_SIZE}&offset=${offset}${onlyUnread ? '&onlyUnread=1' : ''}`;

  const listQuery = useQuery({
    queryKey,
    queryFn: () => api<{ data: Notification[]; unreadCount: number }>(url),
    staleTime: 10_000,
  });

  const markAllRead = useMutation({
    mutationFn: () => api('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      toast.success('Todas marcadas como leídas');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/api/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteNotif = useMutation({
    mutationFn: (id: string) => api(`/api/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Notificación eliminada');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: ApiError) => toast.error(err.message ?? 'No pudimos eliminar'),
  });

  const items = listQuery.data?.data ?? [];
  const unreadCount = listQuery.data?.unreadCount ?? 0;

  // Filtro por categoría (frontend — el endpoint solo soporta `onlyUnread`).
  const filtered =
    filter === 'all' || filter === 'unread' ? items : items.filter((n) => n.category === filter);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Notificaciones</h1>
          <p className="text-muted-foreground">
            Historial completo. {unreadCount > 0 && <strong>{unreadCount} sin leer.</strong>}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <CheckCheck aria-hidden="true" /> Marcar todas
          </Button>
        )}
      </div>

      {/* Filter pills */}
      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setOffset(0);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'notificación' : 'notificaciones'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isPending ? (
            <div className="space-y-2 p-4">
              {['a', 'b', 'c', 'd'].map((k) => (
                <Skeleton key={k} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration="inbox"
              title="Nada por acá"
              description={
                filter === 'unread'
                  ? 'Estás al día con todas las notificaciones.'
                  : 'No hay notificaciones para mostrar con este filtro.'
              }
            />
          ) : (
            <ul className="divide-y">
              {filtered.map((n) => {
                const wrapper = n.actionUrl ? (
                  <Link
                    href={n.actionUrl as never}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate(n.id);
                    }}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    {renderInner(n)}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-4 py-3">{renderInner(n)}</div>
                );
                return (
                  <li key={n.id} className="group relative">
                    {wrapper}
                    <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {!n.readAt && (
                        <button
                          type="button"
                          onClick={() => markRead.mutate(n.id)}
                          aria-label="Marcar como leída"
                          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                        >
                          <Check className="size-4" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteNotif.mutate(n.id)}
                        aria-label="Eliminar"
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {(items.length === PAGE_SIZE || offset > 0) && (
        <div className="mt-4 flex justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {offset + 1}-{offset + items.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={items.length < PAGE_SIZE}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}

function renderInner(n: Notification) {
  return (
    <>
      <div className="mt-0.5">
        <CategoryIcon category={n.category} severity={n.severity} />
      </div>
      <div className="min-w-0 flex-1 pr-16">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-sm ${n.readAt ? 'text-muted-foreground' : 'font-medium'}`}>
            {n.title}
          </p>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {relativeTime(n.createdAt)}
          </span>
        </div>
        {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
      </div>
    </>
  );
}
