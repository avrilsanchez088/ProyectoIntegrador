'use client';

import { RequireWorkspace } from '@/components/dashboard/require-workspace';
import { type ApiError, api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { JsonDiff } from '@impacto/ui/json-diff';
import { Skeleton } from '@impacto/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FileJson,
  History,
  Link2,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * Audit "blame" page (propuesta 186.3 ronda 17). Muestra la historia
 * completa de una fila individual — ej: todos los cambios de un booking.
 *
 * Solo el owner ve esto.
 */

interface AuditEvent {
  id: string;
  user_id: string | null;
  table_name: string;
  op: 'I' | 'U' | 'D';
  row_id: string | null;
  old_row: unknown;
  new_row: unknown;
  ts: string;
}

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

export default function BlamePage() {
  return <RequireWorkspace>{() => <BlameView />}</RequireWorkspace>;
}

function BlameView() {
  const params = useParams<{ table: string; id: string }>();
  // Sort toggle (propuesta 215.1 ronda 19). Default: ASC chronological —
  // útil para "leer la historia" desde el principio. Toggle a DESC para
  // ver el último cambio primero.
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  // Ref al primer item del timeline para scroll al toggle (propuesta 222.1
  // ronda 20). Skipea el primer mount.
  const olRef = useRef<HTMLOListElement>(null);
  const isFirstRender = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sortOrder es el trigger explicito del scroll; olRef es ref.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Después de cambiar orden, scrollear al primer evento de la nueva lista.
    const firstItem = olRef.current?.firstElementChild;
    firstItem?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [sortOrder]);
  const query = useQuery({
    queryKey: ['audit', 'blame', params.table, params.id],
    queryFn: () => api<{ data: AuditEvent[] }>(`/api/audit/row/${params.table}/${params.id}`),
    retry: false,
    staleTime: 30_000,
  });

  if (query.error && (query.error as ApiError).status === 403) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <Lock className="size-5" aria-hidden="true" />
            <CardTitle>Audit log restringido</CardTitle>
            <CardDescription>
              Solo el owner del workspace puede ver el historial de cambios.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const eventsRaw = query.data?.data ?? [];
  // El endpoint devuelve ASC by ts. Si el user prefiere DESC, reverse local.
  const events = sortOrder === 'desc' ? [...eventsRaw].reverse() : eventsRaw;

  // Anchor scroll on mount (propuesta 233.3 ronda 21). Si la URL trae
  // `#event-<id>`, scrollear a ese event y highlight ~2.5s.
  const didAnchorScroll = useRef(false);
  useEffect(() => {
    if (didAnchorScroll.current || events.length === 0) return;
    const hash = window.location.hash;
    if (!hash.startsWith('#event-')) return;
    const id = hash.slice('#event-'.length);
    const el = document.getElementById(`blame-event-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary/40');
      setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40'), 2500);
      didAnchorScroll.current = true;
    }
  }, [events]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={'/dashboard/audit' as never}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al audit log
        </Link>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <History className="size-7 text-muted-foreground" aria-hidden="true" />
              Historial de cambios
            </h1>
            <p className="font-mono text-xs text-muted-foreground">
              {params.table} · {params.id}
            </p>
          </div>
          {events.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
              aria-label={`Ordenar ${sortOrder === 'asc' ? 'descendente' : 'ascendente'}`}
            >
              {sortOrder === 'asc' ? (
                <>
                  <ArrowUp className="size-3" aria-hidden="true" />
                  Más antiguo arriba
                </>
              ) : (
                <>
                  <ArrowDown className="size-3" aria-hidden="true" />
                  Más reciente arriba
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {query.isPending ? (
        <div className="space-y-3">
          {['a', 'b', 'c'].map((k) => (
            <Skeleton key={k} className="h-32 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardHeader>
            <ShieldAlert className="size-5" aria-hidden="true" />
            <CardTitle>Sin eventos</CardTitle>
            <CardDescription>
              No hay cambios auditados sobre esta fila. Puede ser que la fila se haya creado antes
              de que el audit estuviera activo, o que ya haya superado el período de retention.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ol ref={olRef} className="space-y-4">
          {events.map((event, i) => (
            <BlameEventCard key={event.id} event={event} isLast={i === events.length - 1} />
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Card por evento con toggle Diff / Snapshot (propuesta 198.5 ronda 18).
 * El snapshot muestra `new_row` completo en JSON pretty — útil cuando el
 * diff es chico pero querés ver el estado total.
 */
function BlameEventCard({
  event,
  isLast,
}: {
  event: AuditEvent;
  isLast: boolean;
}) {
  const [mode, setMode] = useState<'diff' | 'snapshot'>('diff');
  const ts = new Date(event.ts);
  // El "estado completo" más útil suele ser el `new_row` (post-cambio).
  // Para DELETE no hay new_row → mostramos old_row con badge "estado previo".
  const snapshot = event.op === 'D' ? event.old_row : event.new_row;
  const snapshotLabel = event.op === 'D' ? 'estado antes del DELETE' : 'estado tras el cambio';

  return (
    <li id={`blame-event-${event.id}`} className="relative pl-8 transition-shadow">
      <span aria-hidden="true" className="absolute left-2 top-3 size-3 rounded-full bg-primary" />
      {!isLast && (
        <span aria-hidden="true" className="absolute left-3 top-6 h-full w-px bg-border" />
      )}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${OP_TONE[event.op]}`}>
                {OP_LABEL[event.op]}
              </span>
              <span className="text-muted-foreground">{ts.toLocaleString('es-AR')}</span>
              {event.user_id && (
                <span className="font-mono text-xs text-muted-foreground">
                  user: {event.user_id.slice(0, 8)}
                </span>
              )}
            </div>
            <div className="flex gap-1 text-xs">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Copiar link al evento"
                title="Copiar link"
                onClick={async () => {
                  const url = new URL(window.location.href);
                  url.hash = `event-${event.id}`;
                  try {
                    await navigator.clipboard.writeText(url.toString());
                    toast.success('Link copiado');
                  } catch {
                    toast.error('No se pudo copiar');
                  }
                }}
              >
                <Link2 className="size-3" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === 'diff' ? 'default' : 'ghost'}
                onClick={() => setMode('diff')}
              >
                Diff
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === 'snapshot' ? 'default' : 'ghost'}
                onClick={() => setMode('snapshot')}
                title="Ver estado completo de la fila"
              >
                <FileJson className="size-3" aria-hidden="true" />
                Snapshot
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {mode === 'diff' ? (
            <JsonDiff prev={event.old_row} next={event.new_row} mode="paths" />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{snapshotLabel}</p>
              <pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
                {JSON.stringify(snapshot, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
