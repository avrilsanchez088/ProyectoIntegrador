'use client';

import { type ApiError, api } from '@/lib/api';
import { FREEZE_OP_KEYS } from '@impacto/shared';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useConfirm } from '@impacto/ui/confirm-dialog';
import { Input } from '@impacto/ui/input';
import { Skeleton } from '@impacto/ui/skeleton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Lock, Settings2, Snowflake, Tag, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Motivos templated para freeze (propuesta 156.6 ronda 13). Mejora
 * consistencia + permite agrupar estadísticas (`COUNT(*) WHERE reason LIKE
 * 'unpaid_invoice%'`). El admin puede elegir uno o escribir libre.
 */
const FREEZE_REASON_TEMPLATES: Array<{ key: string; label: string; text: string }> = [
  {
    key: 'unpaid_invoice',
    label: 'Factura impaga',
    text: 'unpaid_invoice: factura del último período aún no fue pagada.',
  },
  {
    key: 'tos_violation',
    label: 'Violación TOS',
    text: 'tos_violation: uso indebido detectado por el equipo.',
  },
  {
    key: 'fraud_review',
    label: 'Revisión por fraude',
    text: 'fraud_review: pausado mientras revisamos transacciones sospechosas.',
  },
  {
    key: 'customer_request',
    label: 'Pedido del cliente',
    text: 'customer_request: el dueño solicitó pausa temporal del workspace.',
  },
  {
    key: 'compliance_hold',
    label: 'Compliance hold',
    text: 'compliance_hold: requerimiento legal/regulatorio pendiente.',
  },
];

/**
 * Detail page por tenant para staff Impacto (propuesta 118.1 ronda 10).
 *
 * Muestra:
 *  - tenant info + plan + frozen status
 *  - members + roles
 *  - últimos 20 bookings
 *  - últimos 20 audit events
 *  - acción "Freeze / unfreeze"
 */

interface TenantDetail {
  tenant: {
    id: string;
    name: string;
    slug: string | null;
    created_at: string;
    country: string | null;
    timezone: string | null;
    currency: string | null;
    plan: string | null;
    frozen: boolean;
    frozen_reason: string | null;
    frozen_at: string | null;
    frozen_allow_ops: string[];
  };
  members: Array<{
    user_id: string;
    role: string;
    email: string | null;
    name: string | null;
  }>;
  recentBookings: Array<{
    id: string;
    code: string;
    status: string;
    check_in: string;
    check_out: string;
    total_cents: number;
    currency: string;
    created_at: string;
  }>;
  recentAudit: Array<{
    id: string;
    table_name: string;
    op: string;
    row_id: string | null;
    ts: string;
  }>;
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeTemplate, setFreezeTemplate] = useState<string>('');
  const [freezeReason, setFreezeReason] = useState('');

  const detailQuery = useQuery({
    queryKey: ['admin', 'tenant', params.id],
    queryFn: () => api<{ data: TenantDetail }>(`/api/admin/tenants/${params.id}`),
    retry: false,
    staleTime: 30_000,
  });

  // Tags del tenant (propuesta 166.1 ronda 14).
  const tagsQuery = useQuery({
    queryKey: ['admin', 'tenant', params.id, 'tags'],
    queryFn: () =>
      api<{
        data: Array<{ id: string; tag: string; color: string }>;
      }>(`/api/admin/tenants/${params.id}/tags`),
    retry: false,
    staleTime: 60_000,
  });

  const addTagMutation = useMutation({
    mutationFn: (input: { tag: string; color: string }) =>
      api(`/api/admin/tenants/${params.id}/tags`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: () => {
      toast.success('Tag agregado');
      queryClient.invalidateQueries({
        queryKey: ['admin', 'tenant', params.id, 'tags'],
      });
    },
    onError: (err: ApiError) => toast.error(err.message ?? 'No pudimos agregar.'),
  });

  const removeTagMutation = useMutation({
    mutationFn: (tagId: string) =>
      api(`/api/admin/tenants/${params.id}/tags/${tagId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'tenant', params.id, 'tags'],
      });
    },
  });

  // Whitelist de ops permitidas durante freeze (propuesta 191.1 ronda 17).
  const allowOpsMutation = useMutation({
    mutationFn: (allowOps: string[]) =>
      api(`/api/admin/tenants/${params.id}/freeze-allow-ops`, {
        method: 'PATCH',
        json: { allowOps },
      }),
    onSuccess: () => {
      toast.success('Whitelist actualizada');
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenant', params.id] });
    },
    onError: () => toast.error('No pudimos actualizar.'),
  });

  const [newTag, setNewTag] = useState('');
  const [newTagColor, setNewTagColor] = useState<
    'gray' | 'red' | 'amber' | 'green' | 'blue' | 'violet'
  >('gray');

  // Freeze history (propuesta 142.7 ronda 12). Devuelve [] si la migration
  // 0013 todavía no corrió.
  const freezeHistoryQuery = useQuery({
    queryKey: ['admin', 'tenant', params.id, 'freeze-history'],
    queryFn: () =>
      api<{
        data: Array<{
          id: string;
          frozen: boolean;
          reason: string | null;
          by_email: string | null;
          ts: string;
        }>;
      }>(`/api/admin/tenants/${params.id}/freeze-history`),
    retry: false,
    staleTime: 60_000,
  });

  const freezeMutation = useMutation({
    mutationFn: (input: { frozen: boolean; reason?: string }) =>
      api(`/api/admin/tenants/${params.id}/freeze`, { method: 'POST', json: input }),
    onSuccess: (_, variables) => {
      toast.success(variables.frozen ? 'Workspace congelado' : 'Workspace descongelado');
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenant', params.id] });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'tenant', params.id, 'freeze-history'],
      });
    },
    onError: (err: ApiError) => toast.error(err.message ?? 'Error'),
  });

  if (detailQuery.error && (detailQuery.error as ApiError).status === 403) {
    return (
      <div className="mx-auto max-w-md py-12">
        <Card>
          <CardHeader>
            <Lock className="size-5" aria-hidden="true" />
            <CardTitle>Solo staff</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (detailQuery.isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-8">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const data = detailQuery.data?.data;
  if (!data) return null;
  const { tenant, members, recentBookings, recentAudit } = data;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href="/admin">
            <ArrowLeft aria-hidden="true" /> Volver al panel admin
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">{tenant.name}</h1>
        <p className="font-mono text-xs text-muted-foreground">{tenant.id}</p>
      </div>

      {tenant.frozen && (
        <Card className="border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-900 dark:text-rose-200">
              <Snowflake aria-hidden="true" /> Workspace congelado
            </CardTitle>
            <CardDescription className="text-rose-800 dark:text-rose-300">
              {tenant.frozen_reason ?? 'Sin motivo registrado.'}
              {tenant.frozen_at && (
                <> · desde {new Date(tenant.frozen_at).toLocaleString('es-AR')}</>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Tenant info + freeze action */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Información</CardTitle>
            <CardDescription>
              Plan {tenant.plan ?? 'trial'} · {tenant.country ?? '—'} · {tenant.timezone ?? '—'} ·{' '}
              {tenant.currency ?? 'USD'}
            </CardDescription>
          </div>
          <Button
            variant={tenant.frozen ? 'outline' : 'default'}
            size="sm"
            disabled={freezeMutation.isPending}
            onClick={async () => {
              if (tenant.frozen) {
                const ok = await confirm({
                  title: '¿Descongelar workspace?',
                  description: 'Volverá a permitir mutaciones inmediatamente.',
                  confirmLabel: 'Descongelar',
                });
                if (ok) freezeMutation.mutate({ frozen: false });
              } else {
                // Abrir dialog templated (propuesta 156.6 ronda 13).
                setFreezeTemplate('');
                setFreezeReason('');
                setFreezeOpen(true);
              }
            }}
          >
            {freezeMutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            <Snowflake aria-hidden="true" />
            {tenant.frozen ? 'Descongelar' : 'Congelar'}
          </Button>
        </CardHeader>
      </Card>

      {/* Dialog freeze con motivos templated (propuesta 156.6 ronda 13) */}
      {freezeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="freeze-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && setFreezeOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setFreezeOpen(false)}
        >
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle id="freeze-dialog-title" className="flex items-center gap-2">
                <Snowflake aria-hidden="true" /> Congelar workspace
              </CardTitle>
              <CardDescription>
                Bloquea creación/edición/eliminación. Los usuarios pueden seguir leyendo. Elegí un
                motivo template o escribí uno custom.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Motivos comunes
                </p>
                <div className="flex flex-wrap gap-2">
                  {FREEZE_REASON_TEMPLATES.map((t) => (
                    <Button
                      key={t.key}
                      type="button"
                      size="sm"
                      variant={freezeTemplate === t.key ? 'default' : 'outline'}
                      onClick={() => {
                        setFreezeTemplate(t.key);
                        setFreezeReason(t.text);
                      }}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="freeze-reason-text" className="text-sm font-medium">
                  Motivo (visible al dueño en el banner)
                </label>
                <textarea
                  id="freeze-reason-text"
                  rows={3}
                  value={freezeReason}
                  onChange={(e) => setFreezeReason(e.target.value)}
                  maxLength={500}
                  placeholder="Razón breve…"
                  className="flex w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">{freezeReason.length}/500</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setFreezeOpen(false)}
                  disabled={freezeMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={freezeMutation.isPending}
                  onClick={() => {
                    freezeMutation.mutate(
                      { frozen: true, reason: freezeReason.trim() || undefined },
                      { onSuccess: () => setFreezeOpen(false) },
                    );
                  }}
                >
                  {freezeMutation.isPending && (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  )}
                  Congelar workspace
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tags (propuesta 166.1 ronda 14) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="size-5" aria-hidden="true" />
            Tags
          </CardTitle>
          <CardDescription>
            Clasificación interna del staff. No visibles al dueño del workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tagsQuery.data?.data && tagsQuery.data.data.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tagsQuery.data.data.map((t) => (
                <span
                  key={t.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                    t.color === 'red'
                      ? 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                      : t.color === 'amber'
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                        : t.color === 'green'
                          ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : t.color === 'blue'
                            ? 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200'
                            : t.color === 'violet'
                              ? 'bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200'
                              : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {t.tag}
                  <button
                    type="button"
                    onClick={() => removeTagMutation.mutate(t.id)}
                    aria-label={`Quitar tag ${t.tag}`}
                    className="opacity-60 hover:opacity-100"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTag.trim()) return;
              addTagMutation.mutate({ tag: newTag.trim(), color: newTagColor });
              setNewTag('');
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="ej: enterprise, vip, risk"
              maxLength={40}
              className="max-w-xs"
              aria-label="Nuevo tag"
            />
            <select
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value as typeof newTagColor)}
              className="flex h-9 rounded-md border bg-transparent px-3 text-sm"
              aria-label="Color del tag"
            >
              <option value="gray">gray</option>
              <option value="red">red</option>
              <option value="amber">amber</option>
              <option value="green">green</option>
              <option value="blue">blue</option>
              <option value="violet">violet</option>
            </select>
            <Button type="submit" size="sm" disabled={addTagMutation.isPending || !newTag.trim()}>
              Agregar
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Whitelist de ops durante freeze (propuesta 191.1 ronda 17) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="size-5" aria-hidden="true" />
            Operaciones permitidas durante freeze
          </CardTitle>
          <CardDescription>
            Si el workspace queda congelado, estas operaciones igual pasan. Útil para no bloquear
            check-ins/check-outs de huéspedes que ya están en el alojamiento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {FREEZE_OP_KEYS.map((op) => {
              const enabled = tenant.frozen_allow_ops.includes(op.key);
              return (
                <label
                  key={op.key}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...tenant.frozen_allow_ops, op.key]
                        : tenant.frozen_allow_ops.filter((k) => k !== op.key);
                      allowOpsMutation.mutate(next);
                    }}
                    className="mt-0.5 size-4 cursor-pointer"
                    disabled={allowOpsMutation.isPending}
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{op.label}</p>
                    <p className="text-xs text-muted-foreground">
                      <code>{op.key}</code> — {op.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Freeze history */}
      {freezeHistoryQuery.data?.data && freezeHistoryQuery.data.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historial de congelamientos</CardTitle>
            <CardDescription>Toggles freeze/unfreeze. Append-only, no editable.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {freezeHistoryQuery.data.data.map((h) => (
                <li key={h.id} className="flex items-start gap-3 py-2">
                  <span
                    className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${
                      h.frozen
                        ? 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                        : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                    }`}
                  >
                    {h.frozen ? 'Frozen' : 'Unfrozen'}
                  </span>
                  <div className="min-w-0 flex-1">
                    {h.reason && <p className="wrap-break-word">{h.reason}</p>}
                    <p className="text-xs text-muted-foreground">
                      {h.by_email ?? 'system'} · {new Date(h.ts).toLocaleString('es-AR')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Miembros ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin miembros.</p>
          ) : (
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{m.name ?? m.email ?? m.user_id}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono uppercase">
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Bookings recientes */}
      <Card>
        <CardHeader>
          <CardTitle>Últimas reservas ({recentBookings.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {recentBookings.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">Sin bookings.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-muted-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left">
                  <th>Código</th>
                  <th>Status</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th className="text-right">Total</th>
                  <th>Creado</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b) => (
                  <tr key={b.id} className="border-b last:border-b-0 [&>td]:px-4 [&>td]:py-2">
                    <td className="font-mono text-xs">{b.code}</td>
                    <td>{b.status}</td>
                    <td>{new Date(b.check_in).toLocaleDateString('es-AR')}</td>
                    <td>{new Date(b.check_out).toLocaleDateString('es-AR')}</td>
                    <td className="text-right">
                      {b.currency} {(b.total_cents / 100).toFixed(0)}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {new Date(b.created_at).toLocaleDateString('es-AR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Audit recientes */}
      <Card>
        <CardHeader>
          <CardTitle>Audit log reciente ({recentAudit.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAudit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin eventos.</p>
          ) : (
            <ul className="divide-y text-sm">
              {recentAudit.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">{e.op}</span>
                  <span>{e.table_name}</span>
                  {e.row_id && (
                    <span className="font-mono text-xs text-muted-foreground">
                      #{e.row_id.slice(0, 8)}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(e.ts).toLocaleString('es-AR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
