'use client';

import { RequireWorkspace } from '@/components/dashboard/require-workspace';
import { UserPicker } from '@/components/dashboard/user-picker';
import { type ApiError, api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { Button } from '@impacto/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { EmptyState } from '@impacto/ui/empty-state';
import { Input } from '@impacto/ui/input';
import { JsonDiff } from '@impacto/ui/json-diff';
import { Skeleton } from '@impacto/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, Link2, Lock, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * Audit log page (propuesta 106.1 ronda 9).
 *
 * Solo accesible para owners del workspace. Lista los últimos cambios con
 * filtros + expand/collapse del diff JSON.
 */

interface AuditEvent {
  id: string;
  organization_id: string;
  user_id: string | null;
  table_name: string;
  op: 'I' | 'U' | 'D';
  row_id: string | null;
  old_row: unknown;
  new_row: unknown;
  ts: string;
}

const TABLE_OPTIONS = [
  { value: '', label: 'Todas las tablas' },
  { value: 'bookings', label: 'Reservas' },
  { value: 'properties', label: 'Propiedades' },
  { value: 'units', label: 'Unidades' },
  { value: 'cancellation_policies', label: 'Políticas cancelación' },
  { value: 'pricing_rules', label: 'Reglas pricing' },
  { value: 'unit_fees', label: 'Fees' },
  { value: 'tenant_settings', label: 'Configuración' },
  // gdpr_action es virtual — eventos que escribe el worker GDPR (propuesta
  // 219.1 ronda 20). Util para auditar quién/qué procesó solicitudes.
  { value: 'gdpr_action', label: 'GDPR (acciones automáticas)' },
];

const OP_LABEL: Record<AuditEvent['op'], string> = {
  I: 'Crear',
  U: 'Actualizar',
  D: 'Eliminar',
};

const OP_TONE: Record<AuditEvent['op'], string> = {
  I: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  U: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200',
  D: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
};

const PAGE_SIZE = 30;

export default function AuditPage() {
  return <RequireWorkspace>{() => <AuditView />}</RequireWorkspace>;
}

function AuditView() {
  const [tableFilter, setTableFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [opFilter, setOpFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  // Compare two events (propuesta 141.7 ronda 12). Set de IDs seleccionados.
  // Cap a 2 — si seleccionás un 3°, se reemplaza el más viejo.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const toggleSelected = (id: string) => {
    setSelectedIds((curr) => {
      if (curr.includes(id)) return curr.filter((x) => x !== id);
      if (curr.length === 2) {
        const second = curr[1];
        return second ? [second, id] : [id];
      }
      return [...curr, id];
    });
  };

  // Members del workspace para el dropdown de user filter (propuesta 130.1).
  const membersQuery = useQuery({
    queryKey: ['org-members'],
    queryFn: async () => {
      const res = await authClient.organization.listMembers();
      // biome-ignore lint/suspicious/noExplicitAny: better-auth response variable
      const data = (res as any).data;
      return (data?.members ?? data ?? []) as Array<{
        userId: string;
        user: { name?: string; email?: string };
      }>;
    },
    staleTime: 5 * 60_000,
  });

  // Permalink: si la URL tiene `?event=<id>`, scrollear al evento al cargar (117.4).
  const targetEventId =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('event') : null;

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (tableFilter) params.set('table', tableFilter);
  if (userFilter) params.set('user_id', userFilter);
  if (opFilter) params.set('op', opFilter);
  if (from) params.set('from', `${from}T00:00:00Z`);
  if (to) params.set('to', `${to}T23:59:59Z`);

  const auditQuery = useQuery({
    queryKey: ['audit', tableFilter, from, to, offset],
    queryFn: () =>
      api<{ data: AuditEvent[]; pagination: { total: number; limit: number; offset: number } }>(
        `/api/audit/events?${params}`,
      ),
    staleTime: 30_000,
    retry: false,
  });

  const isForbidden = auditQuery.error ? (auditQuery.error as ApiError).status === 403 : false;

  if (isForbidden) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <Lock className="size-5" aria-hidden="true" />
            </div>
            <CardTitle>Audit log restringido</CardTitle>
            <CardDescription>
              Solo el owner del workspace puede ver el historial de cambios. Si necesitás acceso,
              pedíselo a quien lo creó.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const events = auditQuery.data?.data ?? [];
  const total = auditQuery.data?.pagination.total ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <ShieldAlert className="size-7 text-muted-foreground" aria-hidden="true" />
          Audit log
        </h1>
        <p className="text-muted-foreground">
          Historial completo de cambios. Cada INSERT/UPDATE/DELETE en datos críticos queda
          registrado por triggers Postgres. {total > 0 && <strong>{total} eventos</strong>}.
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <label
              htmlFor="audit-table"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              Tabla
            </label>
            <select
              id="audit-table"
              value={tableFilter}
              onChange={(e) => {
                setTableFilter(e.target.value);
                setOffset(0);
              }}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              {TABLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="user-picker-input"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              Usuario <span className="opacity-60">(tecla u)</span>
            </label>
            <UserPicker
              users={membersQuery.data ?? []}
              value={userFilter}
              onChange={(next) => {
                setUserFilter(next);
                setOffset(0);
              }}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="audit-op"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              Operación
            </label>
            <select
              id="audit-op"
              value={opFilter}
              onChange={(e) => {
                setOpFilter(e.target.value);
                setOffset(0);
              }}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="">Todas</option>
              <option value="I">Crear</option>
              <option value="U">Actualizar</option>
              <option value="D">Eliminar</option>
            </select>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="audit-from"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              Desde
            </label>
            <Input
              id="audit-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setOffset(0);
              }}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="audit-to"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              Hasta
            </label>
            <Input
              id="audit-to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setOffset(0);
              }}
            />
          </div>
        </div>
        {/* Export bar */}
        <div className="flex justify-end border-t px-4 py-2">
          <Button asChild variant="ghost" size="sm">
            <a
              href={`/api/audit/events.csv?${params}`}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <Download aria-hidden="true" /> Exportar CSV
            </a>
          </Button>
        </div>
      </Card>

      {auditQuery.isPending ? (
        <div className="space-y-2">
          {['a', 'b', 'c', 'd'].map((k) => (
            <Skeleton key={k} className="h-16 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          illustration="policy"
          title="Sin eventos"
          description="No hay cambios registrados con los filtros actuales."
        />
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <AuditEventRow
              key={event.id}
              event={event}
              defaultOpen={event.id === targetEventId}
              selected={selectedIds.includes(event.id)}
              onToggleSelect={() => toggleSelected(event.id)}
            />
          ))}
        </ul>
      )}

      {/* Compare floating bar (propuesta 141.7 ronda 12) */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border bg-card px-4 py-2 shadow-lg">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">
              {selectedIds.length} evento{selectedIds.length > 1 ? 's' : ''} seleccionado
              {selectedIds.length > 1 ? 's' : ''}
            </span>
            <Button size="sm" variant="outline" onClick={() => setSelectedIds([])}>
              Limpiar
            </Button>
            <Button
              size="sm"
              disabled={selectedIds.length !== 2}
              onClick={() => setCompareOpen(true)}
            >
              Comparar
            </Button>
          </div>
        </div>
      )}

      {compareOpen && selectedIds.length === 2 && (
        <CompareDialog
          eventIds={selectedIds as [string, string]}
          events={events}
          onClose={() => setCompareOpen(false)}
        />
      )}

      {/* Pagination */}
      {(events.length === PAGE_SIZE || offset > 0) && (
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
            {offset + 1}-{offset + events.length} de {total}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={events.length < PAGE_SIZE}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}

function AuditEventRow({
  event,
  defaultOpen = false,
  selected = false,
  onToggleSelect,
}: {
  event: AuditEvent;
  defaultOpen?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [highlighted, setHighlighted] = useState(defaultOpen);
  const ref = useRef<HTMLLIElement>(null);
  const ts = new Date(event.ts);
  const tableLabel =
    TABLE_OPTIONS.find((t) => t.value === event.table_name)?.label ?? event.table_name;

  // Permalink (propuesta 117.4 + auto-expand 141.1 ronda 12). Cuando viene
  // como target: scroll, abrir el diff automáticamente, y desvanecer el
  // highlight tras 3s para no distraer indefinidamente.
  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
      setHighlighted(true);
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = setTimeout(() => setHighlighted(false), 3000);
      return () => clearTimeout(t);
    }
  }, [defaultOpen]);

  const copyPermalink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('event', event.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar el link');
    }
  };

  return (
    <li
      ref={ref}
      id={`event-${event.id}`}
      className={`overflow-hidden rounded-md border bg-card transition-colors ${
        highlighted ? 'ring-2 ring-primary/40' : ''
      }`}
    >
      <div className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Seleccionar evento ${event.id} para comparar`}
            className="size-4 shrink-0 cursor-pointer"
          />
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-3 text-left"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${OP_TONE[event.op]}`}>
            {OP_LABEL[event.op]}
          </span>
          <span className="font-medium">{tableLabel}</span>
          {event.row_id && (
            <span className="font-mono text-xs text-muted-foreground">
              #{event.row_id.slice(0, 8)}
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {ts.toLocaleString('es-AR', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </button>
        <button
          type="button"
          onClick={copyPermalink}
          aria-label="Copiar link a este evento"
          title="Copiar link"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Link2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {open && <DiffPanel event={event} />}
    </li>
  );
}

/**
 * Panel de diff con toggle table/paths (propuesta 141.3 ronda 12). Persiste
 * el modo elegido en sessionStorage para que el user no tenga que togglear
 * en cada row.
 */
function DiffPanel({ event }: { event: AuditEvent }) {
  const [mode, setMode] = useState<'table' | 'paths'>(() => {
    if (typeof window === 'undefined') return 'table';
    return (sessionStorage.getItem('audit.diffMode') as 'table' | 'paths') ?? 'table';
  });

  const setModePersist = (m: 'table' | 'paths') => {
    setMode(m);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('audit.diffMode', m);
    }
  };

  return (
    <div className="overflow-x-auto border-t bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase text-muted-foreground">
          {event.user_id ? `User ID: ${event.user_id}` : 'Sin user (sistema)'}
        </p>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setModePersist('table')}
            className={`rounded px-2 py-0.5 ${
              mode === 'table'
                ? 'bg-primary text-primary-foreground'
                : 'border bg-transparent hover:bg-muted'
            }`}
          >
            Tabla
          </button>
          <button
            type="button"
            onClick={() => setModePersist('paths')}
            className={`rounded px-2 py-0.5 ${
              mode === 'paths'
                ? 'bg-primary text-primary-foreground'
                : 'border bg-transparent hover:bg-muted'
            }`}
          >
            Paths
          </button>
        </div>
      </div>
      <JsonDiff prev={event.old_row} next={event.new_row} mode={mode} />
    </div>
  );
}

/**
 * Compare dialog (propuesta 141.7 ronda 12). Toma 2 eventos del mismo
 * conjunto y muestra el diff entre ambos `new_row`. Útil para ver "qué
 * cambió entre la edición #3 y la #5" de la misma policy.
 */
function CompareDialog({
  eventIds,
  events,
  onClose,
}: {
  eventIds: [string, string];
  events: AuditEvent[];
  onClose: () => void;
}) {
  const [a, b] = eventIds.map((id) => events.find((e) => e.id === id));
  if (!a || !b) {
    return null;
  }
  // Ordenar por ts ASC para que el "antes" sea siempre el más viejo.
  const [older, newer] = new Date(a.ts).getTime() <= new Date(b.ts).getTime() ? [a, b] : [b, a];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-lg border bg-card shadow-xl">
        <div className="border-b px-5 py-3">
          <h2 id="compare-dialog-title" className="text-lg font-semibold tracking-tight">
            Comparar eventos
          </h2>
          <p className="text-xs text-muted-foreground">
            {older.table_name} #{older.row_id?.slice(0, 8)} —{' '}
            {new Date(older.ts).toLocaleString('es-AR')} →{' '}
            {new Date(newer.ts).toLocaleString('es-AR')}
          </p>
        </div>
        <div className="max-h-[60vh] overflow-auto p-5">
          <JsonDiff prev={older.new_row} next={newer.new_row} mode="paths" />
        </div>
        <div className="flex justify-end border-t bg-muted/30 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
