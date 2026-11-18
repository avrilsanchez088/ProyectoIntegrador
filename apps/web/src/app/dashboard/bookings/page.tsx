'use client';

import { type ApiError, api } from '@/lib/api';
import { BOOKING_STATUS_TONE } from '@/lib/tone-tokens';
import type { ApiList, Booking, BookingStatus, Unit } from '@impacto/shared';
import { Button } from '@impacto/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useConfirm } from '@impacto/ui/confirm-dialog';
import { EmptyState } from '@impacto/ui/empty-state';
import { Input } from '@impacto/ui/input';
import { Skeleton } from '@impacto/ui/skeleton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Download, Loader2, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const STATUS_LABEL: Record<BookingStatus, string> = {
  tentative: 'Tentativa',
  confirmed: 'Confirmada',
  checked_in: 'En estadía',
  checked_out: 'Finalizada',
  cancelled: 'Cancelada',
  no_show: 'No-show',
};

// Re-exportado desde @/lib/tone-tokens para single source of truth.
const STATUS_TONE = BOOKING_STATUS_TONE;

const SOURCE_LABEL: Record<Booking['source'], string> = {
  direct: 'Directa',
  manual: 'Manual',
  airbnb: 'Airbnb',
  booking: 'Booking',
  gcal: 'GCal',
  ical: 'iCal',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMoney(cents: number, currency: string): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

/**
 * Escapa un valor para CSV. Si tiene `,` `"` o newline, wrap en `"` y duplica `"` interno.
 */
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  // BOM para que Excel detecte UTF-8 correctamente.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type StatusFilter = 'all' | 'active' | BookingStatus;

const FILTER_LABEL: Record<StatusFilter, string> = {
  all: 'Todas',
  active: 'Activas',
  tentative: 'Tentativas',
  confirmed: 'Confirmadas',
  checked_in: 'En estadía',
  checked_out: 'Finalizadas',
  cancelled: 'Canceladas',
  no_show: 'No-show',
};

const FILTER_ORDER: StatusFilter[] = ['all', 'active', 'confirmed', 'tentative', 'cancelled'];

export default function BookingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Pre-rellenar query desde URL (`?q=...`) — viene del ⌘K cuando el user
  // tipea un código de reserva.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
  }, [searchParams]);

  const cancelBulkMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Sequential pero rápido — la API no tiene endpoint bulk todavía.
      for (const id of ids) {
        await api(`/api/bookings/${id}`, { method: 'DELETE' });
      }
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} reservas canceladas`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (err: ApiError) => toast.error(err.message ?? 'Error al cancelar'),
  });

  const toggleAll = (ids: string[]) => {
    if (selected.size === ids.length) setSelected(new Set());
    else setSelected(new Set(ids));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  // TanStack Query (G7.1). staleTime 30s evita refetch al volver del detalle.
  const bookingsQuery = useQuery({
    queryKey: ['bookings', 'list'],
    queryFn: () => api<ApiList<Booking>>('/api/bookings').then((r) => r.data),
    staleTime: 30_000,
  });

  const unitsQuery = useQuery({
    queryKey: ['units', 'list'],
    queryFn: () => api<ApiList<Unit>>('/api/units').then((r) => r.data),
    staleTime: 60_000, // los units cambian muy poco
  });

  const bookings = bookingsQuery.data ?? null;
  const units = unitsQuery.data ?? [];
  const error = bookingsQuery.error
    ? ((bookingsQuery.error as ApiError).message ?? 'No pudimos cargar las reservas')
    : null;

  const unitName = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of units) map.set(u.id, u.name);
    return (id: string) => map.get(id) ?? id.slice(0, 8);
  }, [units]);

  // Filtrado client-side: search por código/nombre/unit + status filter.
  const filtered = useMemo(() => {
    if (!bookings) return null;
    const q = query.trim().toLowerCase();
    return bookings.filter((b) => {
      // Status filter
      if (filter === 'active') {
        if (b.status === 'cancelled' || b.status === 'no_show' || b.status === 'checked_out')
          return false;
      } else if (filter !== 'all' && b.status !== filter) {
        return false;
      }
      // Search filter
      if (!q) return true;
      const haystack = [b.code, b.guestName ?? '', unitName(b.unitId)].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [bookings, filter, query, unitName]);

  return (
    <div className="mx-auto max-w-6xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/dashboard">
          <ArrowLeft /> Volver al panel
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reservas</h1>
          <p className="text-muted-foreground">
            Reservas confirmadas, tentativas y cargadas manualmente. La vista de calendario llega en
            M5.
          </p>
        </div>
        <div className="flex gap-2">
          {bookings && bookings.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                const list = filtered ?? bookings;
                if (list.length === 0) {
                  toast.info('Nada para exportar con los filtros actuales');
                  return;
                }
                const header = [
                  'Código',
                  'Estado',
                  'Origen',
                  'Unidad',
                  'Huésped',
                  'Check-in',
                  'Check-out',
                  'Pax',
                  'Mascotas',
                  'Total',
                  'Moneda',
                ];
                const rows: string[][] = [header];
                for (const b of list) {
                  rows.push([
                    b.code,
                    STATUS_LABEL[b.status],
                    SOURCE_LABEL[b.source],
                    unitName(b.unitId),
                    b.guestName ?? '',
                    formatDate(b.checkIn),
                    formatDate(b.checkOut),
                    String(b.guestsCount),
                    String(b.petsCount),
                    (b.totalCents / 100).toFixed(2),
                    b.currency,
                  ]);
                }
                const ts = new Date().toISOString().slice(0, 10);
                downloadCsv(`reservas-impacto-${ts}.csv`, rows);
                toast.success(`${list.length} reservas exportadas`);
              }}
              title="Exportar a CSV (compatible con Excel)"
            >
              <Download /> Exportar
            </Button>
          )}
          <Button asChild>
            <Link href="/dashboard/bookings/new">
              <Plus /> Nueva reserva
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick filter chips (rangos predefinidos) — propuesta 115.3 ronda 9. */}
      {bookings && bookings.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">Acceso rápido:</span>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('confirmed');
            }}
            className="text-primary hover:underline"
          >
            Próximas confirmadas
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('tentative');
            }}
            className="text-primary hover:underline"
          >
            Tentativas pendientes
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('checked_in');
            }}
            className="text-primary hover:underline"
          >
            En estadía
          </button>
        </div>
      )}

      {/* Search + filter bar (visible cuando hay bookings) */}
      {bookings && bookings.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por código, huésped o unidad..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTER_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === k
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
              >
                {FILTER_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bulk actions bar (visible cuando hay seleccionadas) */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} seleccionada(s)</span>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Limpiar
          </Button>
          <span className="ml-auto" />
          <Button
            variant="outline"
            size="sm"
            disabled={cancelBulkMutation.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: `¿Cancelar ${selected.size} reservas?`,
                description:
                  'Los slots quedan disponibles para nuevas reservas. No se pueden recuperar fácilmente.',
                confirmLabel: 'Cancelar reservas',
                destructive: true,
              });
              if (ok) cancelBulkMutation.mutate([...selected]);
            }}
          >
            {cancelBulkMutation.isPending && (
              <Loader2 className="animate-spin" aria-hidden="true" />
            )}
            Cancelar seleccionadas
          </Button>
        </div>
      )}

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error cargando reservas</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : bookings === null ? (
        <div className="space-y-2">
          {['a', 'b', 'c', 'd', 'e'].map((k) => (
            <Skeleton key={k} className="h-16 w-full" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <EmptyState
          illustration="calendar"
          title="Aún no hay reservas"
          description="Cuando llegue una vía WhatsApp o cuando la cargues manualmente, aparece acá."
          actionLabel="Cargar reserva manual"
          actionHref="/dashboard/bookings/new"
        />
      ) : filtered && filtered.length === 0 ? (
        <EmptyState
          illustration="inbox"
          title="Sin resultados"
          description={`No encontramos reservas que coincidan con "${query}"${filter !== 'all' ? ` en filtro "${FILTER_LABEL[filter]}"` : ''}.`}
        />
      ) : (
        <>
          {/* Mobile: cards verticales (md:hidden) */}
          <div className="space-y-2 md:hidden">
            {(filtered ?? bookings).map((b) => (
              <Link
                key={b.id}
                href={`/dashboard/bookings/${b.id}`}
                className="block rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{b.code}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_TONE[b.status]}`}
                      >
                        {STATUS_LABEL[b.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-medium">
                      {b.guestName ?? <span className="text-muted-foreground">Sin nombre</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{unitName(b.unitId)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{formatMoney(b.totalCents, b.currency)}</p>
                    <p className="text-[10px] text-muted-foreground">{SOURCE_LABEL[b.source]}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                  <span>
                    {formatDate(b.checkIn)} → {formatDate(b.checkOut)}
                  </span>
                  <span>
                    {b.guestsCount}👥{b.petsCount > 0 ? ` · ${b.petsCount}🐾` : ''}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: tabla completa (hidden en mobile) */}
          <div className="hidden rounded-md border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                  <th className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas"
                      checked={
                        (filtered ?? bookings).length > 0 &&
                        selected.size === (filtered ?? bookings).length
                      }
                      onChange={() => toggleAll((filtered ?? bookings).map((b) => b.id))}
                      className="size-4"
                    />
                  </th>
                  <th>Código</th>
                  <th>Unidad</th>
                  <th>Huésped</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th className="text-center">Pax</th>
                  <th>Origen</th>
                  <th>Estado</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(filtered ?? bookings).map((b) => {
                  const goto = () => router.push(`/dashboard/bookings/${b.id}`);
                  return (
                    <tr
                      key={b.id}
                      className={`cursor-pointer border-b last:border-b-0 hover:bg-muted/40 [&>td]:px-3 [&>td]:py-2 ${
                        selected.has(b.id) ? 'bg-primary/5' : ''
                      }`}
                      onClick={goto}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') goto();
                      }}
                      tabIndex={0}
                      aria-label={`Abrir reserva ${b.code}`}
                    >
                      <td
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar reserva ${b.code}`}
                          checked={selected.has(b.id)}
                          onChange={() => toggleOne(b.id)}
                          className="size-4"
                        />
                      </td>
                      <td className="font-mono text-xs">{b.code}</td>
                      <td>{unitName(b.unitId)}</td>
                      <td>{b.guestName ?? <span className="text-muted-foreground">—</span>}</td>
                      <td>{formatDate(b.checkIn)}</td>
                      <td>{formatDate(b.checkOut)}</td>
                      <td className="text-center">
                        {b.guestsCount}
                        {b.petsCount > 0 ? ` · ${b.petsCount}🐾` : ''}
                      </td>
                      <td>{SOURCE_LABEL[b.source]}</td>
                      <td>
                        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[b.status]}`}>
                          {STATUS_LABEL[b.status]}
                        </span>
                      </td>
                      <td className="text-right font-medium">
                        {formatMoney(b.totalCents, b.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4" /> Vista de calendario · M5
          </CardTitle>
          <CardDescription>
            Próxima iteración: vista mensual con bookings + bloqueos, drag-to-create, y
            sincronización con Booking/Airbnb/Google Calendar.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
