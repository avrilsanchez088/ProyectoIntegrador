'use client';

import { type ApiError, api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useConfirm } from '@impacto/ui/confirm-dialog';
import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Lock, Megaphone, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * Admin UI para announcements globales (propuesta 143.1 ronda 12).
 *
 * El endpoint POST /api/admin/announcements ya existe (ronda 11). Esta página
 * lo expone visualmente: form arriba + listado debajo con botón delete.
 */

type Severity = 'info' | 'warning' | 'urgent' | 'critical';

interface Announcement {
  id: string;
  severity: Severity;
  message: string;
  href: string | null;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
}

const SEVERITY_LABELS: Record<Severity, string> = {
  info: 'Info',
  warning: 'Warning',
  urgent: 'Urgent',
  critical: 'Critical',
};

const SEVERITY_BADGE: Record<Severity, string> = {
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  urgent: 'bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
  critical: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
};

export default function AdminAnnouncementsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  // Edit mode (propuesta 162.1 ronda 14). null = no editing.
  const [editingId, setEditingId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: () => api<{ data: Announcement[] }>('/api/admin/announcements'),
    retry: false,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Anuncio eliminado');
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
    onError: () => toast.error('No pudimos eliminar.'),
  });

  // Bulk cleanup expirados (propuesta 173.1 ronda 15).
  const cleanupMutation = useMutation({
    mutationFn: () =>
      api<{ data: { deletedCount: number } }>('/api/admin/announcements/cleanup', {
        method: 'POST',
      }),
    onSuccess: (res) => {
      const n = res.data.deletedCount;
      toast.success(n > 0 ? `Eliminados ${n} anuncios expirados` : 'No había expirados');
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
    onError: () => toast.error('No pudimos limpiar expirados.'),
  });

  // Clone existing → setea defaults para el form de crear (173.2 ronda 15).
  // Pasamos un signal via URL hash para que CreateForm lo lea.
  const handleClone = (a: Announcement) => {
    const params = new URLSearchParams({
      severity: a.severity,
      message: a.message,
      ...(a.href ? { href: a.href } : {}),
    });
    window.location.hash = `#clone?${params.toString()}`;
    document.getElementById('announcement-create-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  if (listQuery.error && (listQuery.error as ApiError).status === 403) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <Lock className="size-5" aria-hidden="true" />
            </div>
            <CardTitle>Acceso restringido</CardTitle>
            <CardDescription>Esta página es solo para staff de Impacto.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const announcements = listQuery.data?.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <header className="border-b pb-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Admin · Impacto-internal
        </p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Megaphone className="size-7" aria-hidden="true" />
          Anuncios globales
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estos mensajes aparecen en el StatusBanner de todos los workspaces.
        </p>
      </header>

      <CreateForm />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Anuncios</CardTitle>
            <CardDescription>
              Últimos 100. Los expirados quedan visibles acá pero no se muestran a usuarios.
            </CardDescription>
          </div>
          {announcements.some((a) => a.expires_at && new Date(a.expires_at) < new Date()) && (
            <Button
              size="sm"
              variant="outline"
              disabled={cleanupMutation.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Limpiar expirados',
                  description: 'Borra todos los anuncios cuyo expires_at ya pasó.',
                  confirmLabel: 'Limpiar',
                  destructive: true,
                });
                if (ok) cleanupMutation.mutate();
              }}
            >
              {cleanupMutation.isPending ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3" aria-hidden="true" />
              )}
              Limpiar expirados
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {listQuery.isPending ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay anuncios todavía.</p>
          ) : (
            <ul className="divide-y">
              {announcements.map((a) => {
                const expired = a.expires_at && new Date(a.expires_at) < new Date();
                return (
                  <li key={a.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                              SEVERITY_BADGE[a.severity]
                            }`}
                          >
                            {SEVERITY_LABELS[a.severity]}
                          </span>
                          {expired && (
                            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              expirado
                            </span>
                          )}
                        </div>
                        <p className="mt-1 break-words text-sm">{a.message}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Creado {new Date(a.created_at).toLocaleString('es-AR')}
                          {a.expires_at && (
                            <> · expira {new Date(a.expires_at).toLocaleString('es-AR')}</>
                          )}
                          {a.href && (
                            <>
                              {' · '}
                              <a
                                href={a.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                              >
                                link
                              </a>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Duplicar"
                          onClick={() => handleClone(a)}
                          title="Duplicar como nuevo anuncio"
                        >
                          <Copy aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={editingId === a.id ? 'Cerrar edición' : 'Editar'}
                          onClick={() => setEditingId((curr) => (curr === a.id ? null : a.id))}
                        >
                          {editingId === a.id ? (
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
                              title: 'Eliminar anuncio',
                              description: 'No se puede deshacer.',
                              confirmLabel: 'Eliminar',
                              destructive: true,
                            });
                            if (ok) deleteMutation.mutate(a.id);
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    {editingId === a.id && (
                      <EditPanel announcement={a} onClose={() => setEditingId(null)} />
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

function CreateForm() {
  const queryClient = useQueryClient();
  const [severity, setSeverity] = useState<Severity>('info');
  const [message, setMessage] = useState('');
  const [href, setHref] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  // Clone-existing hash flow (propuesta 173.2 ronda 15). Cuando otro botón
  // setea `#clone?severity=...&message=...`, lo recogemos acá.
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (!hash.startsWith('#clone?')) return;
      const params = new URLSearchParams(hash.slice('#clone?'.length));
      const sev = params.get('severity');
      if (sev === 'info' || sev === 'warning' || sev === 'urgent' || sev === 'critical') {
        setSeverity(sev);
      }
      const msg = params.get('message');
      if (msg) setMessage(msg);
      const hrefParam = params.get('href');
      if (hrefParam) setHref(hrefParam);
      // Limpiar hash para no re-aplicar al navigate.
      history.replaceState(null, '', window.location.pathname + window.location.search);
      toast.info('Anuncio duplicado en el form. Editá lo que quieras y publicá.');
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const createMutation = useMutation({
    mutationFn: (body: {
      severity: Severity;
      message: string;
      href?: string;
      expiresAt?: string;
    }) =>
      api('/api/admin/announcements', {
        method: 'POST',
        json: {
          severity: body.severity,
          message: body.message,
          href: body.href || null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success('Anuncio creado');
      setMessage('');
      setHref('');
      setExpiresAt('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'No pudimos crear.'),
  });

  return (
    <Card id="announcement-create-form">
      <CardHeader>
        <CardTitle>Nuevo anuncio</CardTitle>
        <CardDescription>
          Visible a todos los workspaces. Para targeting más fino usá la API directamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (message.length < 2) return;
            createMutation.mutate({
              severity,
              message,
              href: href.trim() || undefined,
              expiresAt: expiresAt || undefined,
            });
          }}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <div className="space-y-1">
              <Label htmlFor="ann-severity">Severidad</Label>
              <select
                id="ann-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ann-expires">Expira (opcional)</Label>
              <Input
                id="ann-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ann-message">Mensaje</Label>
            <Input
              id="ann-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              maxLength={500}
              placeholder="Mantenimiento programado el sábado de 02:00 a 04:00 UYT"
            />
            <p className="text-xs text-muted-foreground">{message.length}/500</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ann-href">Link (opcional)</Label>
            <Input
              id="ann-href"
              type="url"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://blog.impacto/maintenance"
            />
          </div>

          <Button type="submit" disabled={createMutation.isPending || message.length < 2}>
            {createMutation.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Megaphone aria-hidden="true" />
            )}
            Publicar anuncio
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Panel inline de edición (propuesta 162.1 ronda 14). Reusa el endpoint
 * PATCH /api/admin/announcements/:id.
 */
function EditPanel({
  announcement,
  onClose,
}: {
  announcement: Announcement;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [severity, setSeverity] = useState<Severity>(announcement.severity);
  const [message, setMessage] = useState(announcement.message);
  const [href, setHref] = useState(announcement.href ?? '');
  const [expiresAt, setExpiresAt] = useState(
    announcement.expires_at ? new Date(announcement.expires_at).toISOString().slice(0, 16) : '',
  );

  const updateMutation = useMutation({
    mutationFn: () =>
      api(`/api/admin/announcements/${announcement.id}`, {
        method: 'PATCH',
        json: {
          severity,
          message,
          href: href.trim() || null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success('Anuncio actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? 'No pudimos actualizar.'),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        updateMutation.mutate();
      }}
      className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div className="space-y-1">
          <Label htmlFor={`edit-sev-${announcement.id}`}>Severidad</Label>
          <select
            id={`edit-sev-${announcement.id}`}
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`edit-exp-${announcement.id}`}>Expira</Label>
          <Input
            id={`edit-exp-${announcement.id}`}
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`edit-msg-${announcement.id}`}>Mensaje</Label>
        <Input
          id={`edit-msg-${announcement.id}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`edit-href-${announcement.id}`}>Link (opcional)</Label>
        <Input
          id={`edit-href-${announcement.id}`}
          type="url"
          value={href}
          onChange={(e) => setHref(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={updateMutation.isPending || message.length < 2}>
          {updateMutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
