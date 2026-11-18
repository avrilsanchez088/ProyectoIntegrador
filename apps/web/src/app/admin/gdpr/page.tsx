'use client';

import { type ApiError, api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Skeleton } from '@impacto/ui/skeleton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Shield } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Admin UI para procesar GDPR requests (propuestas 158.1 + 158.2 ronda 13).
 */

type Status = 'pending' | 'processing' | 'completed' | 'rejected';

interface Request {
  id: string;
  organization_id: string;
  organization_name: string | null;
  email: string;
  action: 'export' | 'delete';
  status: Status;
  request_ip: string | null;
  notes: string | null;
  created_at: string;
  processed_at: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Pendiente',
  processing: 'En proceso',
  completed: 'Completado',
  rejected: 'Rechazado',
};

const STATUS_TONE: Record<Status, string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  processing: 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
  completed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  rejected: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
};

export default function GdprRequestsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | Status>('pending');

  const listQuery = useQuery({
    queryKey: ['admin', 'gdpr', filter],
    queryFn: () =>
      api<{ data: Request[] }>(
        filter === 'all' ? '/api/admin/gdpr/requests' : `/api/admin/gdpr/requests?status=${filter}`,
      ),
    retry: false,
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      api(`/api/admin/gdpr/requests/${id}`, {
        method: 'PATCH',
        json: { status },
      }),
    onSuccess: (_data, variables) => {
      toast.success(`Solicitud ${STATUS_LABEL[variables.status].toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'gdpr'] });
    },
    onError: () => toast.error('No pudimos actualizar.'),
  });

  if (listQuery.error && (listQuery.error as ApiError).status === 403) {
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

  const requests = listQuery.data?.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al panel admin
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Shield className="size-7" aria-hidden="true" />
          GDPR / ARCO requests
        </h1>
        <p className="text-sm text-muted-foreground">
          Solicitudes de huéspedes sobre su data. Procesamos manualmente — el endpoint solo
          registra.
        </p>
      </div>

      <div className="flex gap-1">
        {(['pending', 'processing', 'completed', 'rejected', 'all'] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? 'default' : 'outline'}
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? 'Todos' : STATUS_LABEL[s as Status]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Solicitudes ({requests.length})</CardTitle>
          <CardDescription>
            Click en una para cambiar el estado. Procesar export = generar bundle. Procesar delete =
            anonimizar bookings/messages del email.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {listQuery.isPending ? (
            <div className="space-y-2 p-4">
              {['a', 'b', 'c'].map((k) => (
                <Skeleton key={k} className="h-14 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">Sin solicitudes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-muted-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left">
                  <th>Email</th>
                  <th>Acción</th>
                  <th>Workspace</th>
                  <th>Estado</th>
                  <th>Recibida</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0 [&>td]:px-4 [&>td]:py-2">
                    <td>
                      <div>
                        <p className="font-medium">{r.email}</p>
                        {r.notes && (
                          <p className="max-w-md truncate text-xs text-muted-foreground">
                            {r.notes}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase">
                        {r.action}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/admin/tenants/${r.organization_id}` as never}
                        className="hover:underline"
                      >
                        {r.organization_name ?? r.organization_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {r.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateMutation.mutate({
                                id: r.id,
                                status: 'processing',
                              })
                            }
                          >
                            Tomar
                          </Button>
                        )}
                        {(r.status === 'pending' || r.status === 'processing') && (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                updateMutation.mutate({
                                  id: r.id,
                                  status: 'completed',
                                })
                              }
                            >
                              Completar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                updateMutation.mutate({
                                  id: r.id,
                                  status: 'rejected',
                                })
                              }
                            >
                              Rechazar
                            </Button>
                          </>
                        )}
                      </div>
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
