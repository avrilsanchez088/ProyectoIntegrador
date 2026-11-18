'use client';

import { type ApiError, api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useConfirm } from '@impacto/ui/confirm-dialog';
import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { Skeleton } from '@impacto/ui/skeleton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Siren,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * Admin UI para incidents públicos del status page (propuesta 208.1 ronda 19).
 *
 * Listado de los últimos 100 + form para crear/editar. Cambios status
 * rápidos via botones inline (investigating → identified → monitoring →
 * resolved).
 */

type Severity = 'minor' | 'major' | 'critical';
type Status = 'investigating' | 'identified' | 'monitoring' | 'resolved';

interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: Severity;
  status: Status;
  started_at: string;
  resolved_at: string | null;
  postmortem: string | null;
  affected_components: string[] | null;
}

const AFFECTED_COMPONENT_KEYS = [
  'whatsapp',
  'bookings',
  'calendar',
  'dashboard',
  'webhooks',
  'payments',
  'email',
  'ical',
  'ai-bot',
  'database',
] as const;

const SEVERITY_TONE: Record<Severity, string> = {
  minor: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-200',
  major: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  critical: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
};

const STATUS_LABEL: Record<Status, string> = {
  investigating: 'Investigando',
  identified: 'Identificado',
  monitoring: 'Monitoreando',
  resolved: 'Resuelto',
};

const STATUS_FLOW: Status[] = ['investigating', 'identified', 'monitoring', 'resolved'];

export default function IncidentsAdminPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Filter por affected_components (propuesta 236.1 ronda 22). Multi-select
  // — un incident matchea si al menos uno de sus components está seleccionado.
  const [componentFilter, setComponentFilter] = useState<string[]>([]);

  const listQuery = useQuery({
    queryKey: ['admin', 'incidents'],
    queryFn: () => api<{ data: Incident[] }>('/api/admin/incidents'),
    retry: false,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      api(`/api/admin/incidents/${id}`, { method: 'PATCH', json: { status } }),
    onSuccess: () => {
      toast.success('Estado actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin', 'incidents'] });
    },
    onError: () => toast.error('No pudimos actualizar.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/incidents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Incident eliminado');
      queryClient.invalidateQueries({ queryKey: ['admin', 'incidents'] });
    },
    onError: () => toast.error('No pudimos eliminar.'),
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

  const allIncidents = listQuery.data?.data ?? [];
  // Aplicamos filter por components: OR entre las selected components.
  const incidents =
    componentFilter.length === 0
      ? allIncidents
      : allIncidents.filter((inc) =>
          inc.affected_components?.some((c) => componentFilter.includes(c)),
        );

  // Computar para badges: cuántos incidents hay con cada component, sobre
  // el listing completo (no el filtrado, sino se zero out al filtrar).
  const componentCounts = AFFECTED_COMPONENT_KEYS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = allIncidents.filter((inc) => inc.affected_components?.includes(key)).length;
    return acc;
  }, {});

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
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <Siren className="size-7" aria-hidden="true" />
              Incidents
            </h1>
            <p className="text-sm text-muted-foreground">
              Eventos públicos en{' '}
              <Link href="/status" className="underline">
                /status
              </Link>
              . Visibles a todos los workspaces sin login.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            Nuevo incident
          </Button>
        </div>
      </div>

      {creating && <CreateForm onClose={() => setCreating(false)} />}

      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle>Últimos 100</CardTitle>
            <CardDescription>
              Refresh cada 30s. El más reciente arriba.
              {componentFilter.length > 0 && (
                <>
                  {' '}
                  · Filtrados por <strong>{componentFilter.join(', ')}</strong>: {incidents.length}/
                  {allIncidents.length}.
                </>
              )}
            </CardDescription>
          </div>
          {/* Filter por affected_components (propuesta 236.1 ronda 22) */}
          <div className="flex flex-wrap gap-1 border-t pt-3 text-xs">
            <span className="self-center pr-1 text-muted-foreground">Filtrar componente:</span>
            <button
              type="button"
              onClick={() => setComponentFilter([])}
              className={`rounded-full border px-2 py-0.5 ${
                componentFilter.length === 0
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:bg-muted'
              }`}
            >
              Todos
            </button>
            {AFFECTED_COMPONENT_KEYS.map((c) => {
              const active = componentFilter.includes(c);
              const count = componentCounts[c] ?? 0;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setComponentFilter((curr) =>
                      curr.includes(c) ? curr.filter((x) => x !== c) : [...curr, c],
                    )
                  }
                  disabled={count === 0 && !active}
                  className={`rounded-full border px-2 py-0.5 ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : count === 0
                        ? 'cursor-not-allowed border-border opacity-40'
                        : 'border-border hover:bg-muted'
                  }`}
                >
                  {c} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent>
          {listQuery.isPending ? (
            <div className="space-y-2">
              {['a', 'b', 'c'].map((k) => (
                <Skeleton key={k} className="h-20 w-full" />
              ))}
            </div>
          ) : incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin incidents todavía. Cuando algo se rompa, creá uno acá para comunicar a los
              tenants.
            </p>
          ) : (
            <ul className="divide-y">
              {incidents.map((inc) => {
                const isResolved = inc.status === 'resolved';
                const currIdx = STATUS_FLOW.indexOf(inc.status);
                const nextStatus =
                  currIdx >= 0 && currIdx < STATUS_FLOW.length - 1
                    ? STATUS_FLOW[currIdx + 1]
                    : null;
                return (
                  <li key={inc.id} className="space-y-2 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                              SEVERITY_TONE[inc.severity]
                            }`}
                          >
                            {inc.severity}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-xs ${
                              isResolved
                                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                                : 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200'
                            }`}
                          >
                            {STATUS_LABEL[inc.status]}
                          </span>
                        </div>
                        <p className="mt-1 font-medium">{inc.title}</p>
                        {inc.affected_components && inc.affected_components.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {inc.affected_components.map((c) => (
                              <span
                                key={c}
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                        {inc.description && (
                          <p className="mt-1 break-words text-sm text-muted-foreground">
                            {inc.description}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Inicio {new Date(inc.started_at).toLocaleString('es-AR')}
                          {inc.resolved_at && (
                            <> · resuelto {new Date(inc.resolved_at).toLocaleString('es-AR')}</>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {nextStatus && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={advanceMutation.isPending}
                            onClick={() =>
                              advanceMutation.mutate({ id: inc.id, status: nextStatus })
                            }
                            title={`Avanzar a ${STATUS_LABEL[nextStatus]}`}
                          >
                            {nextStatus === 'resolved' ? (
                              <CheckCircle2 className="size-3" aria-hidden="true" />
                            ) : null}
                            → {STATUS_LABEL[nextStatus]}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={editingId === inc.id ? 'Cerrar edición' : 'Editar'}
                          onClick={() => setEditingId((curr) => (curr === inc.id ? null : inc.id))}
                        >
                          {editingId === inc.id ? (
                            <X aria-hidden="true" />
                          ) : (
                            <Pencil aria-hidden="true" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Eliminar"
                          disabled={deleteMutation.isPending}
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Eliminar incident',
                              description: 'No se puede deshacer.',
                              confirmLabel: 'Eliminar',
                              destructive: true,
                            });
                            if (ok) deleteMutation.mutate(inc.id);
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    {editingId === inc.id && (
                      <EditPanel incident={inc} onClose={() => setEditingId(null)} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('minor');
  const [status, setStatus] = useState<Status>('investigating');
  const [affectedComponents, setAffectedComponents] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: () =>
      api('/api/admin/incidents', {
        method: 'POST',
        json: {
          title,
          description: description || undefined,
          severity,
          status,
          affectedComponents,
        },
      }),
    onSuccess: () => {
      toast.success('Incident creado');
      queryClient.invalidateQueries({ queryKey: ['admin', 'incidents'] });
      onClose();
    },
    onError: () => toast.error('No pudimos crear.'),
  });

  const toggleComponent = (key: string) =>
    setAffectedComponents((curr) =>
      curr.includes(key) ? curr.filter((x) => x !== key) : [...curr, key],
    );

  return (
    <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/10">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Nuevo incident</CardTitle>
          <CardDescription>
            Se publica inmediatamente en /status. Editá título corto y claro.
          </CardDescription>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Cerrar">
          <X aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.length < 2) return;
            createMutation.mutate();
          }}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="inc-sev">Severidad</Label>
              <select
                id="inc-sev"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="minor">Minor</option>
                <option value="major">Major</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="inc-stat">Estado inicial</Label>
              <select
                id="inc-stat"
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                {STATUS_FLOW.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="inc-title">Título</Label>
            <Input
              id="inc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              placeholder="Lentitud en webhook de WhatsApp"
            />
          </div>
          <div className="space-y-1">
            <Label>Componentes afectados (opcional)</Label>
            <div className="flex flex-wrap gap-1">
              {AFFECTED_COMPONENT_KEYS.map((c) => {
                const active = affectedComponents.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleComponent(c)}
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="inc-desc">Descripción (opcional)</Label>
            <textarea
              id="inc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Detalle visible al público. Mantenelo claro y sin jargon."
              className="flex w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={createMutation.isPending || title.length < 2}>
            {createMutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Publicar incident
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EditPanel({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(incident.title);
  const [description, setDescription] = useState(incident.description ?? '');
  const [severity, setSeverity] = useState<Severity>(incident.severity);
  // Postmortem (propuesta 218.2 ronda 20). Solo visible/editable cuando
  // status='resolved' — antes de resolver no tiene sentido.
  const [postmortem, setPostmortem] = useState(incident.postmortem ?? '');
  // Update message (propuesta 218.1). Cada submit crea row en
  // incident_updates con el status actual.
  const [updateMessage, setUpdateMessage] = useState('');

  useEffect(() => {
    setTitle(incident.title);
    setDescription(incident.description ?? '');
    setSeverity(incident.severity);
    setPostmortem(incident.postmortem ?? '');
    setUpdateMessage('');
  }, [incident]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api(`/api/admin/incidents/${incident.id}`, {
        method: 'PATCH',
        json: {
          title,
          description: description || null,
          severity,
          postmortem: postmortem || null,
        },
      }),
    onSuccess: () => {
      toast.success('Incident actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin', 'incidents'] });
      onClose();
    },
    onError: () => toast.error('No pudimos actualizar.'),
  });

  // Update message → POST /incidents/:id/updates (propuesta 218.1)
  const addUpdateMutation = useMutation({
    mutationFn: () =>
      api(`/api/admin/incidents/${incident.id}/updates`, {
        method: 'POST',
        json: { status: incident.status, message: updateMessage },
      }),
    onSuccess: () => {
      toast.success('Update publicado');
      setUpdateMessage('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'incidents'] });
    },
    onError: () => toast.error('No pudimos publicar el update.'),
  });

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateMutation.mutate();
        }}
        className="space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <div className="space-y-1">
            <Label htmlFor={`edit-sev-${incident.id}`}>Severidad</Label>
            <select
              id={`edit-sev-${incident.id}`}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`edit-title-${incident.id}`}>Título</Label>
            <Input
              id={`edit-title-${incident.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`edit-desc-${incident.id}`}>Descripción</Label>
          <textarea
            id={`edit-desc-${incident.id}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            className="flex w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          />
        </div>
        {/* Postmortem solo cuando resolved (propuesta 218.2) */}
        {incident.status === 'resolved' && (
          <div className="space-y-1">
            <Label htmlFor={`edit-pm-${incident.id}`}>Postmortem (markdown OK)</Label>
            <textarea
              id={`edit-pm-${incident.id}`}
              value={postmortem}
              onChange={(e) => setPostmortem(e.target.value)}
              rows={6}
              maxLength={8000}
              placeholder="Resumen, root cause, action items..."
              className="flex w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs"
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={updateMutation.isPending || title.length < 2}>
            {updateMutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Guardar cambios
          </Button>
        </div>
      </form>

      {/* Append update message (propuesta 218.1) */}
      {incident.status !== 'resolved' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (updateMessage.length < 2) return;
            addUpdateMutation.mutate();
          }}
          className="space-y-2 border-t pt-3"
        >
          <Label htmlFor={`upd-msg-${incident.id}`}>
            Agregar update al timeline (status actual: {incident.status})
          </Label>
          <div className="flex gap-2">
            <Input
              id={`upd-msg-${incident.id}`}
              value={updateMessage}
              onChange={(e) => setUpdateMessage(e.target.value)}
              maxLength={2000}
              placeholder="Encontramos la causa, aplicando fix..."
            />
            <Button
              type="submit"
              size="sm"
              disabled={addUpdateMutation.isPending || updateMessage.length < 2}
            >
              {addUpdateMutation.isPending && (
                <Loader2 className="animate-spin" aria-hidden="true" />
              )}
              Publicar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Aparece inmediatamente en /status como timeline. Status puede cambiar con los botones
            del row.
          </p>
        </form>
      )}
    </div>
  );
}
