'use client';

import { type ApiError, api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Skeleton } from '@impacto/ui/skeleton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Cog,
  Loader2,
  Lock,
  PauseCircle,
  Play,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@impacto/ui/button';

/**
 * Worker runs dashboard (propuestas 163.5 + 182.4 ronda 12-14 + filter por
 * status 189.1 ronda 17). Default = "failure" para destacar problemas.
 */

interface Run {
  id: string;
  worker_name: string;
  job_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: 'running' | 'success' | 'failure' | 'skipped';
  duration_ms: number | null;
  result: unknown;
  error_message: string | null;
}

const STATUS_TONE = {
  running: 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
  success: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  failure: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  skipped: 'bg-muted text-muted-foreground',
} as const;

const STATUS_ICON = {
  running: Cog,
  success: CheckCircle2,
  failure: XCircle,
  skipped: PauseCircle,
} as const;

type StatusFilter = 'all' | 'failure' | 'success' | 'running' | 'skipped';

export default function WorkerRunsPage() {
  // Default: 'failure' para que el primer vistazo destaque problemas
  // (propuesta 189.1 ronda 17).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('failure');
  // Filter por worker_name (propuesta 200.5 ronda 18).
  const [workerFilter, setWorkerFilter] = useState<string>('all');
  // Detail drawer (propuesta 212.1 ronda 19).
  const [detailRun, setDetailRun] = useState<Run | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'worker-runs'],
    queryFn: () => api<{ data: Run[] }>('/api/admin/worker-runs?limit=200'),
    retry: false,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  if (query.error && (query.error as ApiError).status === 403) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
        <Card>
          <CardHeader>
            <Lock className="size-5" aria-hidden="true" />
            <CardTitle>Solo staff</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const allRuns = query.data?.data ?? [];

  const workerNames = Array.from(new Set(allRuns.map((r) => r.worker_name))).sort();

  // Filters aplican a la tabla. El summary tiles siempre se calcula sobre
  // TODOS los runs (no filtrado) — así no perdés visibilidad de los healthy.
  const runs = allRuns
    .filter((r) => statusFilter === 'all' || r.status === statusFilter)
    .filter((r) => workerFilter === 'all' || r.worker_name === workerFilter);

  // Agrupar por worker para el resumen.
  const byWorker = allRuns.reduce(
    (acc, r) => {
      let entry = acc[r.worker_name];
      if (!entry) {
        entry = { total: 0, failed: 0, lastRun: r };
        acc[r.worker_name] = entry;
      }
      entry.total++;
      if (r.status === 'failure') entry.failed++;
      return acc;
    },
    {} as Record<string, { total: number; failed: number; lastRun: Run }>,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al panel admin
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Cog className="size-7" aria-hidden="true" />
          Workers
        </h1>
        <p className="text-sm text-muted-foreground">
          Últimos 100 runs de los BullMQ workers. Refresh automático cada 10s.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(byWorker).map(([name, info]) => {
          const Icon = STATUS_ICON[info.lastRun.status];
          return (
            <Card key={name}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs uppercase text-muted-foreground">{name}</p>
                  <Icon
                    className={`size-4 ${
                      info.lastRun.status === 'success'
                        ? 'text-emerald-600'
                        : info.lastRun.status === 'failure'
                          ? 'text-rose-600'
                          : info.lastRun.status === 'running'
                            ? 'animate-spin text-sky-600'
                            : 'text-muted-foreground'
                    }`}
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{info.total}</p>
                <p className="text-xs text-muted-foreground">
                  {info.failed > 0 ? (
                    <span className="text-rose-700 dark:text-rose-300">{info.failed} fallidos</span>
                  ) : (
                    'Todos OK'
                  )}{' '}
                  · última {new Date(info.lastRun.started_at).toLocaleTimeString('es-AR')}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-row items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Runs recientes</CardTitle>
              <CardDescription>
                {statusFilter === 'all' ? 'Todos los status' : `Solo status: ${statusFilter}`}
                {workerFilter !== 'all' && ` · solo ${workerFilter}`}
                {' · '}ordenados por started_at DESC.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1">
              {(['failure', 'success', 'running', 'skipped', 'all'] as const).map((s) => {
                const count =
                  s === 'all' ? allRuns.length : allRuns.filter((r) => r.status === s).length;
                return (
                  <Button
                    key={s}
                    size="sm"
                    variant={statusFilter === s ? 'default' : 'outline'}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s} <span className="ml-1 opacity-60">({count})</span>
                  </Button>
                );
              })}
            </div>
          </div>
          {workerNames.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
              <span className="text-xs text-muted-foreground">Worker:</span>
              <Button
                size="sm"
                variant={workerFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setWorkerFilter('all')}
              >
                Todos
              </Button>
              {workerNames.map((w) => (
                <Button
                  key={w}
                  size="sm"
                  variant={workerFilter === w ? 'default' : 'outline'}
                  onClick={() => setWorkerFilter(w)}
                >
                  {w}
                </Button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {query.isPending ? (
            <div className="space-y-2 p-4">
              {['a', 'b', 'c'].map((k) => (
                <Skeleton key={k} className="h-12 w-full" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              Aún no hay runs. Cuando el worker corra, aparecen acá.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                  <th>Worker</th>
                  <th>Status</th>
                  <th className="text-right">Duración</th>
                  <th>Inicio</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40 [&>td]:px-3 [&>td]:py-2"
                    onClick={() => setDetailRun(r)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailRun(r);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="font-mono text-xs">{r.worker_name}</td>
                    <td>
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">
                      {r.duration_ms != null ? `${r.duration_ms}ms` : '—'}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {new Date(r.started_at).toLocaleString('es-AR')}
                    </td>
                    <td>
                      {r.error_message ? (
                        <code
                          className="block max-w-md truncate text-xs text-rose-700 dark:text-rose-300"
                          title={r.error_message}
                        >
                          {r.error_message}
                        </code>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {detailRun && <RunDetailDrawer run={detailRun} onClose={() => setDetailRun(null)} />}
    </div>
  );
}

/**
 * Detail drawer del run (propuesta 212.1 ronda 19 + 220.1 + 220.4 ronda 20).
 * Side panel con result JSON + error completo + metadatos. Cierre por click
 * overlay o Escape. Botón Re-run para workers que lo soportan. Results
 * grandes se truncan a 5KB con toggle.
 */
const RERUNNABLE_WORKERS = new Set(['mv-refresh', 'audit-purge', 'stale-freeze-alert']);
const TRUNCATE_THRESHOLD = 5_000;

interface LineageEntry {
  id: string;
  worker_name: string;
  status: 'running' | 'success' | 'failure' | 'skipped';
  started_at: string;
  parent_run_id: string | null;
  triggered_by: string | null;
  role: 'self' | 'parent' | 'child';
}

function RunDetailDrawer({ run, onClose }: { run: Run; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [showFullResult, setShowFullResult] = useState(false);

  // Lineage parent ↔ children (propuesta 239.1 ronda 22).
  const lineageQuery = useQuery({
    queryKey: ['admin', 'worker-runs', run.id, 'lineage'],
    queryFn: () => api<{ data: LineageEntry[] }>(`/api/admin/worker-runs/${run.id}/lineage`),
    retry: false,
    staleTime: 30_000,
  });
  const resultStr = run.result ? JSON.stringify(run.result, null, 2) : '';
  const isLarge = resultStr.length > TRUNCATE_THRESHOLD;
  const displayResult =
    isLarge && !showFullResult
      ? `${resultStr.slice(0, TRUNCATE_THRESHOLD)}\n\n... [truncado, ${(
          resultStr.length - TRUNCATE_THRESHOLD
        ).toLocaleString('es-AR')} chars más]`
      : resultStr;

  const rerunMutation = useMutation({
    mutationFn: () =>
      api<{ data: { workerName: string; jobId: string } }>(
        `/api/admin/worker-runs/${run.id}/rerun`,
        { method: 'POST' },
      ),
    onSuccess: (res) => {
      toast.success(`Re-encolado en ${res.data.workerName}`, {
        description: `Job ID: ${res.data.jobId}`,
        duration: 6000,
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'worker-runs'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'No pudimos re-encolar.'),
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-detail-title"
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <aside className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-card shadow-xl">
        <header className="flex items-start justify-between border-b px-5 py-3">
          <div>
            <h2 id="run-detail-title" className="text-lg font-semibold">
              {run.worker_name}
            </h2>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{run.id}</span>
              {run.job_id && (
                <>
                  {' · '}
                  job <span className="font-mono">{run.job_id}</span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-auto p-5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Status</p>
              <p className={`inline-flex rounded px-2 py-0.5 text-xs ${STATUS_TONE[run.status]}`}>
                {run.status}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Duración</p>
              <p className="font-mono tabular-nums">
                {run.duration_ms != null ? `${run.duration_ms}ms` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Inicio</p>
              <p>{new Date(run.started_at).toLocaleString('es-AR')}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Fin</p>
              <p>{run.ended_at ? new Date(run.ended_at).toLocaleString('es-AR') : 'en curso'}</p>
            </div>
          </div>

          {run.error_message && (
            <div className="space-y-1">
              <p className="text-xs uppercase text-muted-foreground">Error</p>
              <pre className="overflow-auto rounded-md border border-rose-300 bg-rose-50 p-3 font-mono text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                {run.error_message}
              </pre>
            </div>
          )}

          {/* Lineage parent ↔ children (propuesta 239.1 ronda 22) */}
          {lineageQuery.data && lineageQuery.data.data.length > 1 && (
            <div className="space-y-1">
              <p className="text-xs uppercase text-muted-foreground">Lineage</p>
              <ul className="space-y-1 rounded-md border bg-muted/20 p-2 text-xs">
                {lineageQuery.data.data.map((node) => (
                  <li
                    key={node.id}
                    className={`flex items-center gap-2 rounded px-2 py-1 ${
                      node.role === 'self'
                        ? 'bg-primary/10 font-medium'
                        : node.role === 'parent'
                          ? ''
                          : 'pl-6'
                    }`}
                  >
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${
                        node.role === 'self'
                          ? 'bg-primary text-primary-foreground'
                          : node.role === 'parent'
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                            : 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200'
                      }`}
                    >
                      {node.role}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_TONE[node.status]}`}
                    >
                      {node.status}
                    </span>
                    {node.role === 'self' ? (
                      <span className="font-mono text-[10px] text-muted-foreground">este run</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          // Re-fetch lineage para el node clickeado would
                          // be ideal — por simplicidad, cerrar drawer y
                          // reload con detailRun seteado externamente. Por
                          // ahora solo copy ID al clipboard.
                          navigator.clipboard
                            .writeText(node.id)
                            .then(() => toast.info('Run ID copiado'))
                            .catch(() => {});
                        }}
                        className="font-mono text-[10px] text-muted-foreground hover:underline"
                        title="Copiar run ID"
                      >
                        {node.id.slice(0, 8)}
                      </button>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {new Date(node.started_at).toLocaleString('es-AR')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase text-muted-foreground">Result</p>
              {isLarge && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowFullResult((v) => !v)}
                >
                  {showFullResult ? 'Truncar' : 'Mostrar todo'}
                </Button>
              )}
            </div>
            <pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
              {displayResult || 'sin result'}
            </pre>
          </div>

          {RERUNNABLE_WORKERS.has(run.worker_name) && (
            <div className="border-t pt-3">
              <Button
                type="button"
                variant="outline"
                disabled={rerunMutation.isPending}
                onClick={() => rerunMutation.mutate()}
              >
                {rerunMutation.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Play aria-hidden="true" />
                )}
                Re-trigger worker
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                Encola un job nuevo en {run.worker_name}. No re-corre el run exacto — solo dispara
                una nueva ejecución del worker.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
