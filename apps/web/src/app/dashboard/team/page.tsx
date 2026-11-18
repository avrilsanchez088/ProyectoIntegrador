'use client';

import { RequireWorkspace } from '@/components/dashboard/require-workspace';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useConfirm } from '@impacto/ui/confirm-dialog';
import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, RotateCw, Trash2, UserCog } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type Member = {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user: { name: string; email: string; image?: string | null };
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

const INVITABLE_ROLES = ['admin', 'member'] as const;

/** Formato corto de "hace X" para la columna de actividad. */
function formatLastActive(iso: string | null | undefined): string {
  if (!iso) return 'Sin sesiones';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'Activo ahora';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'Activo ahora';
  if (min < 60) return `Hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `Hace ${day} d`;
  return new Date(iso).toLocaleDateString('es-AR');
}

export default function TeamPage() {
  return <RequireWorkspace>{({ orgId }) => <TeamView orgId={orgId} />}</RequireWorkspace>;
}

function TeamView({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const membersQuery = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async () => {
      const res = await authClient.organization.listMembers();
      // biome-ignore lint/suspicious/noExplicitAny: better-auth response shape variable
      const data = (res as any).data;
      return (data?.members ?? data ?? []) as Member[];
    },
    staleTime: 30_000,
  });

  const invitationsQuery = useQuery({
    queryKey: ['org-invitations', orgId],
    queryFn: async () => {
      const res = await authClient.organization.listInvitations();
      // biome-ignore lint/suspicious/noExplicitAny: better-auth response shape variable
      const data = (res as any).data;
      return (data ?? []) as Invitation[];
    },
    staleTime: 30_000,
  });

  // Last activity por miembro (propuesta 136.2). Endpoint propio porque
  // Better Auth no expone session.updated_at en listMembers.
  const activityQuery = useQuery({
    queryKey: ['team-activity', orgId],
    queryFn: () =>
      api<{ data: Array<{ user_id: string; last_active_at: string | null }> }>(
        '/api/team/activity',
      ).then((r) => {
        const map = new Map<string, string | null>();
        for (const row of r.data) map.set(row.user_id, row.last_active_at);
        return map;
      }),
    staleTime: 60_000,
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) =>
      authClient.organization.removeMember({ memberIdOrEmail: memberId }),
    onSuccess: () => {
      toast.success('Miembro removido');
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
    onError: () => toast.error('No pudimos remover al miembro'),
  });

  // Bulk role change (propuesta 145.5 ronda 12). Selección múltiple →
  // promote/demote en serie. Owners se excluyen — solo admin/member toggleable.
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const bulkRoleMutation = useMutation({
    mutationFn: async ({
      memberIds,
      role,
    }: {
      memberIds: string[];
      role: 'admin' | 'member';
    }) => {
      let ok = 0;
      const failed: string[] = [];
      for (const mid of memberIds) {
        try {
          // biome-ignore lint/suspicious/noExplicitAny: better-auth shape
          await (authClient.organization as any).updateMemberRole({
            memberId: mid,
            role,
          });
          ok++;
        } catch {
          failed.push(mid);
        }
      }
      return { ok, failed };
    },
    onSuccess: ({ ok, failed }) => {
      if (failed.length === 0) {
        toast.success(`Actualizados ${ok} miembros`);
      } else {
        toast.warning(`Actualizados ${ok}, fallaron ${failed.length}`);
      }
      setSelectedMemberIds([]);
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
    onError: () => toast.error('No pudimos actualizar los roles.'),
  });

  // Bulk remove (propuesta 202.1 ronda 18). Confirm dialog explícito —
  // remover miembros es destructivo (pierden acceso) y queremos doble check.
  const bulkRemoveMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      let ok = 0;
      const failed: string[] = [];
      for (const mid of memberIds) {
        try {
          await authClient.organization.removeMember({ memberIdOrEmail: mid });
          ok++;
        } catch {
          failed.push(mid);
        }
      }
      return { ok, failed };
    },
    onSuccess: ({ ok, failed }) => {
      if (failed.length === 0) {
        toast.success(`Removidos ${ok} miembros`);
      } else {
        toast.warning(`Removidos ${ok}, fallaron ${failed.length}`);
      }
      setSelectedMemberIds([]);
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
    onError: () => toast.error('No pudimos remover.'),
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) =>
      authClient.organization.cancelInvitation({ invitationId }),
    onSuccess: () => {
      toast.success('Invitación cancelada');
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgId] });
    },
    onError: () => toast.error('No pudimos cancelar la invitación'),
  });

  /**
   * Resend invitation: cancela la actual y crea una nueva con el mismo email
   * y rol. Better Auth no expone un "resend" nativo. Propuesta 9.5 / 95.x.
   */
  const resendInvitationMutation = useMutation({
    mutationFn: async (inv: Invitation) => {
      await authClient.organization.cancelInvitation({ invitationId: inv.id });
      const res = await authClient.organization.inviteMember({
        email: inv.email,
        role: inv.role as 'admin' | 'member',
      });
      // biome-ignore lint/suspicious/noExplicitAny: better-auth response shape variable
      if ((res as any).error) throw new Error((res as any).error.message);
      return res;
    },
    onSuccess: () => {
      toast.success('Invitación reenviada');
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgId] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'No pudimos reenviar.'),
  });

  /**
   * Bulk resend: reenvía todas las invitaciones pendientes en serie. Propuesta
   * 121.3 ronda 11 + reporting de fallados (145.7 ronda 12). Mantiene la lista
   * de emails que fallaron para mostrarlos en pantalla.
   */
  const resendAllMutation = useMutation({
    mutationFn: async (invs: Invitation[]) => {
      const failed: Array<{ email: string; reason: string }> = [];
      let ok = 0;
      for (const inv of invs) {
        try {
          await authClient.organization.cancelInvitation({ invitationId: inv.id });
          const res = await authClient.organization.inviteMember({
            email: inv.email,
            role: inv.role as 'admin' | 'member',
          });
          // biome-ignore lint/suspicious/noExplicitAny: better-auth response shape variable
          if ((res as any).error) throw new Error((res as any).error.message);
          ok++;
        } catch (err) {
          failed.push({
            email: inv.email,
            reason: err instanceof Error ? err.message : 'unknown',
          });
        }
      }
      return { ok, failed };
    },
    onSuccess: ({ ok, failed }) => {
      if (failed.length === 0) {
        toast.success(`Reenviadas ${ok} invitaciones`);
      } else {
        // Toast con el detalle: muestra hasta 3 emails fallados.
        const head = failed
          .slice(0, 3)
          .map((f) => f.email)
          .join(', ');
        const more = failed.length > 3 ? ` y ${failed.length - 3} más` : '';
        toast.warning(`Reenviadas ${ok}. Fallaron: ${head}${more}`, {
          description:
            failed[0]?.reason && failed[0].reason !== 'unknown'
              ? `Razón: ${failed[0].reason}`
              : undefined,
          duration: 8000,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgId] });
    },
    onError: () => toast.error('No pudimos reenviar las invitaciones.'),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Equipo</h1>
        <p className="text-muted-foreground">
          Invitá colaboradores a este workspace. Cada uno tiene un rol y permisos asociados.
        </p>
      </div>

      <InviteCard orgId={orgId} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Miembros</CardTitle>
            <CardDescription>Personas con acceso activo al workspace.</CardDescription>
          </div>
          {selectedMemberIds.length > 0 && (
            <div className="flex shrink-0 items-center gap-1 text-xs">
              <span className="font-medium">{selectedMemberIds.length} sel.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  // Copy emails al clipboard (propuesta 213.1 ronda 19).
                  const selected = (membersQuery.data ?? []).filter((m) =>
                    selectedMemberIds.includes(m.id),
                  );
                  const emails = selected
                    .map((m) => m.user?.email)
                    .filter((e): e is string => !!e)
                    .join(', ');
                  try {
                    await navigator.clipboard.writeText(emails);
                    toast.success(
                      `Copiados ${selected.length} email${selected.length > 1 ? 's' : ''}`,
                    );
                  } catch {
                    toast.error('No pudimos acceder al clipboard');
                  }
                }}
              >
                Copiar emails
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkRoleMutation.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: '¿Promover a admin?',
                    description: `Vas a promover ${selectedMemberIds.length} miembro(s). Los admins pueden invitar/remover otros y cambiar configuración del workspace.`,
                    confirmLabel: 'Promover',
                  });
                  if (ok) {
                    bulkRoleMutation.mutate({
                      memberIds: selectedMemberIds,
                      role: 'admin',
                    });
                  }
                }}
              >
                Promover a admin
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkRoleMutation.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: '¿Bajar a member?',
                    description: `Vas a bajar ${selectedMemberIds.length} miembro(s) a rol member. Pierden permisos administrativos.`,
                    confirmLabel: 'Bajar',
                    destructive: true,
                  });
                  if (ok) {
                    bulkRoleMutation.mutate({
                      memberIds: selectedMemberIds,
                      role: 'member',
                    });
                  }
                }}
              >
                Bajar a member
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkRemoveMutation.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: '¿Remover seleccionados?',
                    description: `Vas a remover ${selectedMemberIds.length} miembro(s). Pierden acceso al workspace inmediatamente. Esta acción es irreversible.`,
                    confirmLabel: 'Remover',
                    destructive: true,
                  });
                  if (ok) bulkRemoveMutation.mutate(selectedMemberIds);
                }}
              >
                Remover
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedMemberIds([])}>
                Limpiar
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {membersQuery.isPending ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : membersQuery.data && membersQuery.data.length > 0 ? (
            <ul className="divide-y">
              {membersQuery.data.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {m.role !== 'owner' && (
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(m.id)}
                        onChange={() =>
                          setSelectedMemberIds((curr) =>
                            curr.includes(m.id) ? curr.filter((x) => x !== m.id) : [...curr, m.id],
                          )
                        }
                        aria-label={`Seleccionar ${m.user?.email}`}
                        className="size-4 cursor-pointer"
                      />
                    )}
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-medium uppercase">
                      {(m.user?.name ?? m.user?.email ?? '?').charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{m.user?.name ?? m.user?.email}</p>
                      <p className="text-xs text-muted-foreground">{m.user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="hidden text-xs text-muted-foreground sm:inline"
                      title={activityQuery.data?.get(m.userId) ?? 'Aún no inició sesión'}
                    >
                      {formatLastActive(activityQuery.data?.get(m.userId))}
                    </span>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase">
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                    {m.role !== 'owner' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remover a ${m.user?.name ?? m.user?.email}`}
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Remover miembro',
                            description: `¿Seguro que querés remover a ${m.user?.email} del workspace?`,
                            confirmLabel: 'Remover',
                            destructive: true,
                          });
                          if (ok) removeMemberMutation.mutate(m.id);
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Solo vos por ahora.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Invitaciones pendientes</CardTitle>
            <CardDescription>
              Aún no aceptaron. El email se envía cuando esté integrado Resend (M13). Mientras tanto
              podés copiar el link manualmente desde los logs.
            </CardDescription>
          </div>
          {invitationsQuery.data && invitationsQuery.data.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              disabled={resendAllMutation.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Reenviar todas',
                  description: `Vamos a reenviar ${invitationsQuery.data?.length} invitaciones. Cada una cancela la actual y crea una nueva.`,
                  confirmLabel: 'Reenviar todas',
                });
                if (ok && invitationsQuery.data) {
                  resendAllMutation.mutate(invitationsQuery.data);
                }
              }}
            >
              {resendAllMutation.isPending ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCw className="size-3" aria-hidden="true" />
              )}
              Reenviar todas
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {invitationsQuery.isPending ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : invitationsQuery.data && invitationsQuery.data.length > 0 ? (
            <ul className="divide-y">
              {invitationsQuery.data.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Rol {ROLE_LABEL[inv.role] ?? inv.role} · {inv.status} · expira{' '}
                      {new Date(inv.expiresAt).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={resendInvitationMutation.isPending}
                      onClick={() => resendInvitationMutation.mutate(inv)}
                      title="Cancelar y volver a enviar"
                    >
                      {resendInvitationMutation.isPending ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <RotateCw className="size-3" aria-hidden="true" />
                      )}
                      Reenviar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Cancelar invitación',
                          description: `¿Seguro? El link enviado a ${inv.email} dejará de funcionar.`,
                          confirmLabel: 'Cancelar invitación',
                          destructive: true,
                        });
                        if (ok) cancelInvitationMutation.mutate(inv.id);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sin invitaciones pendientes.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InviteCard({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number]>('member');

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.organization.inviteMember({ email, role });
      // biome-ignore lint/suspicious/noExplicitAny: better-auth response shape variable
      if ((res as any).error) throw new Error((res as any).error.message);
      return res;
    },
    onSuccess: () => {
      toast.success(`Invitación enviada a ${email}`);
      setEmail('');
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgId] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'No pudimos invitar.'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="size-5" aria-hidden="true" />
          Invitar miembro
        </CardTitle>
        <CardDescription>
          Le mandamos un link a su email para que se sume con el rol que elijas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email) return;
            inviteMutation.mutate();
          }}
          className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]"
        >
          <div className="space-y-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              placeholder="colaborador@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-role">Rol</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof INVITABLE_ROLES)[number])}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={inviteMutation.isPending || !email}>
              {inviteMutation.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Mail aria-hidden="true" />
              )}
              Invitar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
