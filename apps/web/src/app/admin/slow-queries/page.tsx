'use client';

import { type ApiError, api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Skeleton } from '@impacto/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Database, Lock } from 'lucide-react';
import Link from 'next/link';

/**
 * UI para `pg_stat_statements` (propuesta 162.3 ronda 14).
 *
 * Lee `/api/admin/slow-queries`. Si la extensión no está habilitada,
 * mostramos un mensaje claro pidiendo `CREATE EXTENSION pg_stat_statements`.
 */

interface SlowQuery {
  query: string;
  calls: number;
  total_exec_time: number;
  mean_exec_time: number;
  rows: number;
}

function tone(meanMs: number): string {
  if (meanMs > 500) return 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200';
  if (meanMs > 100) return 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  if (meanMs > 25)
    return 'bg-yellow-100 text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-200';
  return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
}

export default function SlowQueriesPage() {
  const query = useQuery({
    queryKey: ['admin', 'slow-queries'],
    queryFn: () => api<{ data: SlowQuery[] }>('/api/admin/slow-queries?limit=100'),
    retry: false,
    staleTime: 60_000,
  });

  if (query.error) {
    const err = query.error as ApiError;
    if (err.status === 403) {
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
    if (err.status === 503) {
      return (
        <div className="mx-auto max-w-2xl px-6 py-8">
          <Card>
            <CardHeader>
              <CardTitle>pg_stat_statements no disponible</CardTitle>
              <CardDescription>
                La extensión no está habilitada en esta DB. Conectate como superuser y ejecutá:
                <pre className="mt-2 rounded bg-muted p-3 text-xs">
                  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
                </pre>
                Después reiniciá Postgres con{' '}
                <code>shared_preload_libraries='pg_stat_statements'</code> en postgresql.conf.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }
  }

  const rows = query.data?.data ?? [];

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
          <Database className="size-7" aria-hidden="true" />
          Slow queries
        </h1>
        <p className="text-sm text-muted-foreground">
          Top 100 ordenadas por tiempo medio de ejecución. Lee <code>pg_stat_statements</code>{' '}
          directamente. Verde &lt; 25ms · amarillo 25-100ms · ámbar 100-500ms · rojo &gt; 500ms.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resultados ({rows.length})</CardTitle>
          <CardDescription>
            Para resetear los stats: <code>SELECT pg_stat_statements_reset();</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {query.isPending ? (
            <div className="space-y-2 p-4">
              {['a', 'b', 'c', 'd', 'e'].map((k) => (
                <Skeleton key={k} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">Sin queries.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                  <th className="text-right">Mean</th>
                  <th className="text-right">Calls</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Rows</th>
                  <th>Query</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${i}-${r.query.slice(0, 32)}`}
                    className="border-b last:border-b-0 [&>td]:px-3 [&>td]:py-2"
                  >
                    <td className="text-right">
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-xs ${tone(r.mean_exec_time)}`}
                      >
                        {r.mean_exec_time.toFixed(1)}ms
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{r.calls.toLocaleString('es-AR')}</td>
                    <td className="text-right tabular-nums">
                      {(r.total_exec_time / 1000).toFixed(1)}s
                    </td>
                    <td className="text-right tabular-nums">{r.rows.toLocaleString('es-AR')}</td>
                    <td>
                      <code
                        className="block max-w-[60ch] truncate font-mono text-xs"
                        title={r.query}
                      >
                        {r.query}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
