'use client';

import { RequireWorkspace } from '@/components/dashboard/require-workspace';
import { api } from '@/lib/api';
import { BLOCK_TONE_BAND, BOOKING_STATUS_BAND_TONE } from '@/lib/tone-tokens';
import type { ApiList, Property, Unit } from '@impacto/shared';
import { Button } from '@impacto/ui/button';
import { Card } from '@impacto/ui/card';
import { EmptyState } from '@impacto/ui/empty-state';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

/**
 * Vista calendario mensual con resource view por unit (§1.10 / G4.3 / M5).
 *
 * Decisión CLAUDE.md §12: "switch entre vista por unidad (resource view tipo
 * Gantt) y vista tradicional". Esta primera versión implementa **solo el
 * resource view** porque es el diferenciador vs Lodgify/Hostfully — la vista
 * mensual tradicional se agrega en M5.5 cuando se elija la librería externa
 * (Schedule-X / FullCalendar).
 *
 * Sin lib externa por ahora — render manual con CSS grid. Beneficios: bundle
 * chico, dark-mode automático con tokens, fácil customización.
 *
 * Features actuales:
 *  - Grid por unit (filas) × días del mes (columnas)
 *  - Bookings y blocks superpuestos como bandas de color
 *  - Navegación mes anterior/siguiente
 *  - Click en día vacío → /dashboard/bookings/new pre-rellenado
 *  - Click en booking → /dashboard/bookings/[id]
 *
 * Pendiente para M5.5:
 *  - Drag-to-create (al elegir librería)
 *  - Drag-to-resize
 *  - Vista mensual tradicional como toggle
 *  - Conflict resolution inline
 */

type AvailabilityKind = 'booking' | 'block';

interface AvailabilityItem {
  id: string;
  unitId: string;
  start: string;
  end: string;
  kind: AvailabilityKind;
  status?: string;
  reason?: string;
}

// Re-export desde @/lib/tone-tokens para consistencia visual cross-page.
const STATUS_TONE = BOOKING_STATUS_BAND_TONE;
const BLOCK_TONE = BLOCK_TONE_BAND;

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}
function endOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0);
}
function daysInMonth(year: number, month: number) {
  return endOfMonth(year, month).getDate();
}

/** Comparador de fechas YYYY-MM-DD (string). */
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Devuelve [startCol, endCol] (1-indexed) de la banda dentro del mes.
 * Si la booking empieza antes del mes o termina después, clampa al límite.
 */
function bandRange(
  itemStart: string,
  itemEnd: string,
  monthStart: Date,
  monthEnd: Date,
): { startCol: number; endCol: number } | null {
  const s = new Date(itemStart);
  const e = new Date(itemEnd);
  if (e < monthStart || s > monthEnd) return null;
  const startDay = s < monthStart ? 1 : s.getDate();
  const endDay = e > monthEnd ? monthEnd.getDate() : e.getDate();
  // Booking checkout es exclusive — la última noche es endDay - 1.
  // Pero el bloque visual termina en endDay - 1 inclusive.
  const lastNight = Math.max(startDay, endDay - 1);
  return { startCol: startDay, endCol: lastNight };
}

export default function CalendarPage() {
  return <RequireWorkspace>{() => <CalendarView />}</RequireWorkspace>;
}

type ViewMode = 'resource' | 'month';

function CalendarView() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [viewMode, setViewMode] = useState<ViewMode>('resource');

  const monthStart = startOfMonth(year, month);
  const monthEnd = endOfMonth(year, month);
  const totalDays = daysInMonth(year, month);

  const propsQuery = useQuery({
    queryKey: ['properties', 'list'],
    queryFn: () => api<ApiList<Property>>('/api/properties').then((r) => r.data),
    staleTime: 60_000,
  });

  const unitsQuery = useQuery({
    queryKey: ['units', 'list'],
    queryFn: () => api<ApiList<Unit>>('/api/units').then((r) => r.data),
    staleTime: 60_000,
  });

  const units = unitsQuery.data ?? [];
  const props = propsQuery.data ?? [];
  const propName = useMemo(() => new Map(props.map((p) => [p.id, p.name])), [props]);

  // Una sola query bulk por mes (perf §59.1 ronda 5 → endpoint /bulk en ronda 6).
  // Antes era N requests (uno por unit). Ahora 1.
  const availabilityQuery = useQuery({
    queryKey: [
      'calendar-month',
      year,
      month,
      units
        .map((u) => u.id)
        .sort()
        .join(','),
    ],
    queryFn: async () => {
      const from = monthStart.toISOString();
      const to = new Date(monthEnd.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
      const params = new URLSearchParams({
        unitIds: units.map((u) => u.id).join(','),
        from,
        to,
      });
      const res = await api<{
        data: Record<string, { bookings: AvailabilityItem[]; blocks: AvailabilityItem[] }>;
      }>(`/api/availability/bulk?${params}`);
      // Aplanar a una lista con `unitId` y `kind` ya seteados.
      const out: AvailabilityItem[] = [];
      for (const [unitId, payload] of Object.entries(res.data)) {
        for (const b of payload.bookings) {
          out.push({ ...(b as AvailabilityItem), unitId, kind: 'booking' });
        }
        for (const b of payload.blocks) {
          out.push({ ...(b as AvailabilityItem), unitId, kind: 'block' });
        }
      }
      return out;
    },
    enabled: units.length > 0,
    staleTime: 30_000,
    gcTime: 5 * 60_000, // cache de 5min para meses ya navegados (§59.2)
  });

  const items = availabilityQuery.data ?? [];

  const monthLabel = monthStart.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const todayDay =
    today.getFullYear() === year && today.getMonth() === month ? today.getDate() : null;

  const goPrev = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else setMonth(month - 1);
  };
  const goNext = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else setMonth(month + 1);
  };

  if (unitsQuery.isPending || propsQuery.isPending) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          illustration="units"
          title="Sin unidades para mostrar"
          description="Creá una propiedad y al menos una unidad para ver el calendario."
          actionLabel="Crear propiedad"
          actionHref="/dashboard/properties/new"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Calendario</h1>
          <p className="text-muted-foreground">
            {viewMode === 'resource'
              ? 'Vista por unidad (Gantt). Una banda por reserva o bloqueo. Click para abrir el detalle.'
              : 'Vista mensual tradicional. Cada celda agrupa las reservas y bloqueos del día.'}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/bookings/new">
            <Plus aria-hidden="true" /> Nueva reserva
          </Link>
        </Button>
      </div>

      {/* Month nav + view toggle */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={goPrev} aria-label="Mes anterior">
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setYear(today.getFullYear());
            setMonth(today.getMonth());
          }}
        >
          Hoy
        </Button>
        <Button variant="outline" size="icon" onClick={goNext} aria-label="Mes siguiente">
          <ChevronRight aria-hidden="true" />
        </Button>
        <h2 className="ml-2 text-lg font-semibold capitalize">{monthLabel}</h2>
        {availabilityQuery.isFetching && (
          <Loader2 className="ml-2 size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
        <div
          className="ml-auto inline-flex rounded-md border bg-muted/30 p-0.5 text-xs"
          role="tablist"
          aria-label="Modo de vista"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'resource'}
            onClick={() => setViewMode('resource')}
            className={`rounded px-3 py-1 transition ${
              viewMode === 'resource'
                ? 'bg-background font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Por unidad
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'month'}
            onClick={() => setViewMode('month')}
            className={`rounded px-3 py-1 transition ${
              viewMode === 'month'
                ? 'bg-background font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Mensual
          </button>
        </div>
      </div>

      {viewMode === 'month' && (
        <MonthView year={year} month={month} items={items} units={units} propName={propName} />
      )}

      {viewMode === 'resource' && (
        <>
          {/* Grid resource view */}

          {/* Grid */}
          <Card className="overflow-x-auto p-0">
            <div className="min-w-max">
              {/* Header con números de día */}
              <div
                className="grid border-b text-xs"
                style={{ gridTemplateColumns: `220px repeat(${totalDays}, minmax(28px, 1fr))` }}
              >
                <div className="border-r bg-muted/40 px-3 py-2 font-medium">Unidad</div>
                {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                  <div
                    key={d}
                    className={`border-r px-1 py-2 text-center text-muted-foreground ${
                      d === todayDay ? 'bg-primary/10 font-semibold text-foreground' : ''
                    }`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Filas por unit */}
              {units.map((u) => {
                const unitItems = items.filter((it) => it.unitId === u.id);
                const propLabel = propName.get(u.propertyId) ?? '';
                return (
                  <div
                    key={u.id}
                    className="relative grid border-b last:border-b-0"
                    style={{
                      gridTemplateColumns: `220px repeat(${totalDays}, minmax(28px, 1fr))`,
                      height: '40px',
                    }}
                  >
                    {/* Label */}
                    <div className="z-10 border-r bg-background px-3 py-2 text-xs">
                      <p className="font-medium">{u.name}</p>
                      {propLabel && <p className="truncate text-muted-foreground">{propLabel}</p>}
                    </div>
                    {/* Cells de fondo (clickeables para crear booking) */}
                    {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                      <Link
                        key={d}
                        href={`/dashboard/bookings/new?unitId=${u.id}&date=${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`}
                        className={`border-r hover:bg-primary/5 ${
                          d === todayDay ? 'bg-primary/5' : ''
                        }`}
                        aria-label={`Crear reserva en ${u.name} el ${d}/${month + 1}`}
                      />
                    ))}
                    {/* Bandas de bookings/blocks */}
                    {unitItems.map((it) => {
                      const range = bandRange(it.start, it.end, monthStart, monthEnd);
                      if (!range) return null;
                      // CSS grid columns: col 1 es la label, los días son 2..(totalDays+1).
                      const startCol = range.startCol + 1;
                      const endCol = range.endCol + 2; // grid-end es exclusive
                      const tone =
                        it.kind === 'booking'
                          ? ((STATUS_TONE as Record<string, string>)[it.status ?? 'confirmed'] ??
                            STATUS_TONE.confirmed)
                          : BLOCK_TONE;

                      const inner = (
                        <span className="block truncate px-2 py-1 text-[11px]">
                          {it.kind === 'booking' ? `· ${it.status ?? 'reserva'}` : 'bloqueo'}
                        </span>
                      );

                      return (
                        <div
                          key={`${it.kind}-${it.id}`}
                          className={`pointer-events-auto absolute top-1 bottom-1 mx-0.5 overflow-hidden rounded-md ${tone}`}
                          style={{
                            gridColumn: `${startCol} / ${endCol}`,
                            // Como `position: absolute`, lo metemos en su columna via inline style:
                            left: `calc(220px + ((100% - 220px) / ${totalDays}) * ${range.startCol - 1} + 2px)`,
                            width: `calc((100% - 220px) / ${totalDays} * ${range.endCol - range.startCol + 1} - 4px)`,
                          }}
                          title={`${it.kind === 'booking' ? `Reserva ${it.status}` : 'Bloqueo'} · ${it.start.slice(0, 10)} → ${it.end.slice(0, 10)}`}
                        >
                          {it.kind === 'booking' ? (
                            <Link href={`/dashboard/bookings/${it.id}`} className="block h-full">
                              {inner}
                            </Link>
                          ) : (
                            inner
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* fin del resource view */}
        </>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Legend tone={STATUS_TONE.confirmed}>Confirmada</Legend>
        <Legend tone={STATUS_TONE.tentative}>Tentativa</Legend>
        <Legend tone={STATUS_TONE.checked_in}>En estadía</Legend>
        <Legend tone={STATUS_TONE.cancelled}>Cancelada</Legend>
        <Legend tone={BLOCK_TONE}>Bloqueo</Legend>
      </div>
    </div>
  );
}

/**
 * MonthView — vista mensual tradicional (7 columnas L-D). Agrupa items que
 * tocan cada día. Click en el día → /dashboard/bookings/new con date pre-llena.
 */
function MonthView({
  year,
  month,
  items,
  units,
  propName,
}: {
  year: number;
  month: number;
  items: AvailabilityItem[];
  units: Unit[];
  propName: Map<string, string>;
}) {
  const unitName = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units]);
  const firstDay = startOfMonth(year, month);
  const totalDays = daysInMonth(year, month);
  // Lunes = 0, Domingo = 6.
  const offset = (firstDay.getDay() + 6) % 7;
  const cells: { day: number | null }[] = [];
  for (let i = 0; i < offset; i++) cells.push({ day: null });
  for (let d = 1; d <= totalDays; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null });

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const itemsForDay = (day: number): AvailabilityItem[] => {
    const dStr = isoDay(new Date(year, month, day));
    return items.filter((it) => {
      const s = it.start.slice(0, 10);
      const e = it.end.slice(0, 10);
      // start <= dStr < end (checkout exclusive).
      return s <= dStr && dStr < e;
    });
  };

  return (
    <Card className="p-0">
      <div className="grid grid-cols-7 border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <div key={d} className="border-r px-2 py-2 last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const isToday = isCurrentMonth && cell.day === today.getDate();
          const dayItems = cell.day != null ? itemsForDay(cell.day) : [];
          const overflow = Math.max(0, dayItems.length - 3);
          const cellKey =
            cell.day == null ? `empty-${year}-${month}-${idx}` : `day-${year}-${month}-${cell.day}`;
          return (
            <div
              key={cellKey}
              className={`min-h-27.5 border-b border-r p-1 last:border-r-0 ${
                cell.day == null ? 'bg-muted/30' : ''
              } ${isToday ? 'bg-primary/5' : ''}`}
            >
              {cell.day != null && (
                <>
                  <div className="mb-1 flex items-center justify-between">
                    <Link
                      href={`/dashboard/bookings/new?date=${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`}
                      className={`text-xs ${isToday ? 'font-semibold' : 'text-muted-foreground'} hover:text-foreground`}
                      aria-label={`Crear reserva el ${cell.day}/${month + 1}`}
                    >
                      {cell.day}
                    </Link>
                  </div>
                  <div className="space-y-0.5">
                    {dayItems.slice(0, 3).map((it) => {
                      const tone =
                        it.kind === 'booking'
                          ? ((STATUS_TONE as Record<string, string>)[it.status ?? 'confirmed'] ??
                            STATUS_TONE.confirmed)
                          : BLOCK_TONE;
                      const uname = unitName.get(it.unitId) ?? 'Unidad';
                      const pname = propName.get(
                        units.find((u) => u.id === it.unitId)?.propertyId ?? '',
                      );
                      const label = `${uname}${pname ? ` · ${pname}` : ''}`;
                      const itemKey = `${it.kind}-${it.id}`;
                      return it.kind === 'booking' ? (
                        <Link key={itemKey} href={`/dashboard/bookings/${it.id}`} className="block">
                          <span
                            className={`block truncate rounded px-1.5 py-0.5 text-[10px] ${tone}`}
                            title={label}
                          >
                            {label}
                          </span>
                        </Link>
                      ) : (
                        <span
                          key={itemKey}
                          className={`block truncate rounded px-1.5 py-0.5 text-[10px] ${tone}`}
                          title={label}
                        >
                          {label}
                        </span>
                      );
                    })}
                    {overflow > 0 && (
                      <span className="block px-1.5 text-[10px] text-muted-foreground">
                        +{overflow} más
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Legend({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-6 rounded ${tone}`} aria-hidden="true" />
      <span className="text-muted-foreground">{children}</span>
    </span>
  );
}
