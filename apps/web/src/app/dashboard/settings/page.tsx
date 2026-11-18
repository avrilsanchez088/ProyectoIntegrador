'use client';

import { RequireWorkspace } from '@/components/dashboard/require-workspace';
import { useTheme } from '@/components/theme-provider';
import { type ApiError, api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useSoundPrefs } from '@/lib/use-sound-prefs';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useConfirm } from '@impacto/ui/confirm-dialog';
import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { Switch } from '@impacto/ui/switch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Monitor, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type TenantSettings = {
  id: string;
  country: string;
  timezone: string;
  currency: 'USD' | 'UYU' | 'ARS';
  plan: string | null;
  trialEndsAt: string | null;
  auditRetentionDays?: number;
  materialized: boolean;
};

export default function SettingsPage() {
  return <RequireWorkspace>{({ orgId }) => <SettingsView orgId={orgId} />}</RequireWorkspace>;
}

type SettingsTab = 'appearance' | 'profile' | 'workspace' | 'compliance' | 'sounds' | 'futures';

function SettingsView({ orgId }: { orgId: string }) {
  const search = useSearchParams();
  const tabParam = search.get('section');
  const tab: SettingsTab =
    tabParam === 'workspace' ||
    tabParam === 'profile' ||
    tabParam === 'compliance' ||
    tabParam === 'sounds' ||
    tabParam === 'futures'
      ? tabParam
      : 'appearance';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">
          Ajustes del workspace, apariencia y cuenta. Las secciones aún no disponibles aparecen
          marcadas.
        </p>
      </div>

      {/* Tabs URL-driven (propuesta 122.1 ronda 10). */}
      <nav className="flex gap-1 border-b" aria-label="Secciones de configuración">
        <SettingsTabLink section="appearance" current={tab}>
          Apariencia
        </SettingsTabLink>
        <SettingsTabLink section="profile" current={tab}>
          Perfil
        </SettingsTabLink>
        <SettingsTabLink section="workspace" current={tab}>
          Workspace
        </SettingsTabLink>
        <SettingsTabLink section="compliance" current={tab}>
          Compliance
        </SettingsTabLink>
        <SettingsTabLink section="sounds" current={tab}>
          Sonidos
        </SettingsTabLink>
        <SettingsTabLink section="futures" current={tab}>
          Próximamente
        </SettingsTabLink>
      </nav>

      {tab === 'appearance' && <ThemeCard />}
      {tab === 'profile' && <ProfileCard />}
      {tab === 'workspace' && <WorkspaceCard orgId={orgId} />}
      {tab === 'compliance' && (
        <div className="space-y-6">
          <ComplianceCard orgId={orgId} />
          <ExportWorkspaceCard />
        </div>
      )}
      {tab === 'sounds' && <SoundPrefsCard />}
      {tab === 'futures' && <FuturesCard />}
    </div>
  );
}

function SettingsTabLink({
  section,
  current,
  children,
}: {
  section: SettingsTab;
  current: SettingsTab;
  children: React.ReactNode;
}) {
  const active = section === current;
  return (
    <Link
      href={`/dashboard/settings?section=${section}` as never}
      className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-b-2 border-primary text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}

function ThemeCard() {
  const { theme, setTheme } = useTheme();
  const options: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }> = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Oscuro', icon: Moon },
    { value: 'system', label: 'Sistema', icon: Monitor },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apariencia</CardTitle>
        <CardDescription>Cambiá el tema visual de la aplicación.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2" role="group" aria-label="Tema visual">
          {options.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant={theme === value ? 'default' : 'outline'}
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
            >
              <Icon aria-hidden="true" />
              {label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const COMMON_TIMEZONES = [
  'America/Montevideo',
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Cordoba',
  'America/Argentina/Mendoza',
  'America/Sao_Paulo',
  'America/Santiago',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'UTC',
];

function WorkspaceCard({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['tenant-settings', orgId],
    queryFn: () => api<{ data: TenantSettings }>('/api/settings').then((r) => r.data),
    staleTime: 60_000,
  });

  const [country, setCountry] = useState('UY');
  const [timezone, setTimezone] = useState('America/Montevideo');
  const [currency, setCurrency] = useState<'USD' | 'UYU' | 'ARS'>('USD');

  useEffect(() => {
    if (settingsQuery.data) {
      setCountry(settingsQuery.data.country);
      setTimezone(settingsQuery.data.timezone);
      setCurrency(settingsQuery.data.currency);
    }
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: () =>
      api<{ data: TenantSettings }>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ country, timezone, currency }),
      }),
    onSuccess: () => {
      toast.success('Configuración guardada');
      queryClient.invalidateQueries({ queryKey: ['tenant-settings', orgId] });
    },
    onError: (err: ApiError) => toast.error(err.message ?? 'No pudimos guardar.'),
  });

  if (settingsQuery.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
        <CardDescription>
          Idioma, zona horaria y moneda interna. Estos valores afectan cálculos de noches, quotes y
          reportes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="country">País</Label>
              <select
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="UY">Uruguay</option>
                <option value="AR">Argentina</option>
                <option value="BR">Brasil</option>
                <option value="CL">Chile</option>
                <option value="MX">México</option>
                <option value="CO">Colombia</option>
                <option value="PE">Perú</option>
                <option value="OT">Otro</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="timezone">Zona horaria</Label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="currency">Moneda interna</Label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'USD' | 'UYU' | 'ARS')}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="USD">USD</option>
                <option value="UYU">UYU</option>
                <option value="ARS">ARS</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Al huésped se le muestra UYU/ARS según país, sin importar esta opción.
              </p>
            </div>
          </div>

          <Input
            type="text"
            value={`Workspace ID: ${orgId}`}
            readOnly
            className="text-xs text-muted-foreground"
            aria-label="Identificador del workspace"
          />

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Guardar cambios
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SoundPrefsCard() {
  const { prefs, update, playSound } = useSoundPrefs();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {prefs.enabled ? (
            <Volume2 className="size-5" aria-hidden="true" />
          ) : (
            <VolumeX className="size-5" aria-hidden="true" />
          )}
          Sonidos del inbox
        </CardTitle>
        <CardDescription>
          Reproducimos un sonido suave cuando llega una notificación nueva. Estos ajustes son por
          usuario y se guardan en este navegador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">Habilitar sonidos</span>
          <Switch
            id="sounds-enabled"
            checked={prefs.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="volume">Volumen ({Math.round(prefs.volume * 100)}%)</Label>
          <input
            id="volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={prefs.volume}
            onChange={(e) => update({ volume: Number(e.target.value) })}
            disabled={!prefs.enabled}
            className="w-full"
          />
        </div>

        <fieldset disabled={!prefs.enabled} className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Categorías que suenan</legend>
          {(
            [
              ['wa_message', 'Mensajes de WhatsApp'],
              ['booking', 'Nueva reserva'],
              ['mention', 'Menciones del equipo'],
              ['urgent', 'Urgentes (tono distinto)'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4 text-sm">
              <span>{label}</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => playSound(key)}
                  disabled={!prefs.enabled || !prefs.categories[key]}
                  aria-label={`Probar sonido ${label}`}
                >
                  Probar
                </Button>
                <Switch
                  id={`sound-${key}`}
                  checked={prefs.categories[key]}
                  onChange={(e) =>
                    update({ categories: { ...prefs.categories, [key]: e.target.checked } })
                  }
                  aria-label={`Habilitar sonido para ${label}`}
                />
              </div>
            </div>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}

/**
 * Perfil del usuario (propuesta 165.5 ronda 14). Edit name + image URL.
 * Email es read-only (Better Auth requiere flow separado para cambiarlo).
 *
 * Importante: usa `authClient.useSession()` directo en lugar de leer del
 * RequireWorkspace porque el avatar depende del user, no del workspace.
 */
function ProfileCard() {
  return (
    <div className="space-y-6">
      <ProfileBasicCard />
      <ChangePasswordCard />
      <SessionsCard />
      <DangerZoneCard />
    </div>
  );
}

function ProfileBasicCard() {
  const { data: session } = authClient.useSession();
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name ?? '');
      setImage(session.user.image ?? '');
    }
  }, [session?.user]);

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    );
  }

  const dirty = name !== (session.user.name ?? '') || image !== (session.user.image ?? '');
  const initial = (session.user.name || session.user.email || '?').charAt(0).toUpperCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>
          Tu nombre + foto que ven el resto de los miembros del workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const { error } = await authClient.updateUser({
              name,
              image: image.trim() || null,
            });
            setSaving(false);
            if (error) {
              toast.error(error.message ?? 'No pudimos guardar.');
              return;
            }
            toast.success('Perfil actualizado');
          }}
          className="space-y-4"
        >
          <div className="flex items-center gap-4">
            {image ? (
              // Avatar simple sin next/image — el src puede ser URL externa.
              <img
                src={image}
                alt="Avatar"
                className="size-16 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div
                className="flex size-16 items-center justify-center rounded-full bg-secondary text-2xl font-semibold uppercase"
                aria-label="Avatar placeholder"
              >
                {initial}
              </div>
            )}
            <div className="flex-1 space-y-1">
              <Label htmlFor="profile-image">URL de foto (opcional)</Label>
              <Input
                id="profile-image"
                type="url"
                placeholder="https://…"
                value={image}
                onChange={(e) => setImage(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Hasta que tengamos upload, podés pegar una URL pública (Gravatar, LinkedIn).
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="profile-name">Nombre</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={session.user.email} disabled className="bg-muted/30" />
            <p className="text-xs text-muted-foreground">
              Para cambiar el email, contactá a soporte (V1).
            </p>
          </div>

          <Button type="submit" disabled={saving || !dirty || !name}>
            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
            Guardar perfil
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Cambiar contraseña (propuesta 176.5 ronda 14). Llama
 * `authClient.changePassword` con currentPassword + newPassword. Mejor
 * Auth se encarga de la validación del actual.
 */
function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cambiar contraseña</CardTitle>
        <CardDescription>
          Si entraste con OAuth (Google/Facebook) y querés agregar contraseña local, vas a tener que
          completar este flujo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (next !== confirmNext) {
              toast.error('La nueva contraseña no coincide');
              return;
            }
            if (next.length < 8) {
              toast.error('Mínimo 8 caracteres');
              return;
            }
            setSaving(true);
            // biome-ignore lint/suspicious/noExplicitAny: better-auth typing
            const result = await (authClient as any).changePassword({
              currentPassword: current,
              newPassword: next,
            });
            setSaving(false);
            if (result?.error) {
              toast.error(result.error.message ?? 'No pudimos cambiar.');
              return;
            }
            toast.success('Contraseña actualizada');
            setCurrent('');
            setNext('');
            setConfirmNext('');
          }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <Label htmlFor="pw-current">Contraseña actual</Label>
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pw-new">Nueva</Label>
              <Input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw-confirm">Confirmá nueva</Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmNext}
                onChange={(e) => setConfirmNext(e.target.value)}
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={saving || !current || !next}>
            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
            Cambiar contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Sesiones activas + revoke individual (propuestas 145.1 + 176.4 ronda 12).
 */
function SessionsCard() {
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery({
    queryKey: ['profile', 'sessions'],
    queryFn: async () => {
      // biome-ignore lint/suspicious/noExplicitAny: better-auth shape
      const r = await (authClient as any).listSessions();
      return (r?.data ?? []) as Array<{
        id: string;
        userAgent: string | null;
        ipAddress: string | null;
        createdAt: string;
        expiresAt: string;
      }>;
    },
    staleTime: 60_000,
    retry: false,
  });

  const revokeMutation = useMutation({
    mutationFn: async (token: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: better-auth shape
      return (authClient as any).revokeSession({ token });
    },
    onSuccess: () => {
      toast.success('Sesión cerrada');
      queryClient.invalidateQueries({ queryKey: ['profile', 'sessions'] });
    },
    onError: () => toast.error('No pudimos cerrar la sesión.'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sesiones activas</CardTitle>
        <CardDescription>
          Dispositivos donde estás logueado. Cerrá una sesión si no la reconocés.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sessionsQuery.isPending ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : !sessionsQuery.data || sessionsQuery.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pudimos listar sesiones (Better Auth puede no tener esta API habilitada todavía).
          </p>
        ) : (
          <ul className="divide-y">
            {sessionsQuery.data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" title={s.userAgent ?? 'desconocido'}>
                    {s.userAgent ?? 'Cliente desconocido'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.ipAddress ?? '—'} · iniciada {new Date(s.createdAt).toLocaleString('es-AR')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(s.id)}
                >
                  Cerrar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Danger zone: delete account (propuesta 176.6 ronda 14). Doble confirmación
 * — escribir el email para evitar deletes accidentales.
 */
function DangerZoneCard() {
  const { data: session } = authClient.useSession();
  const confirm = useConfirm();
  const [emailInput, setEmailInput] = useState('');

  if (!session) return null;
  const matches = emailInput.trim().toLowerCase() === session.user.email.toLowerCase();

  return (
    <Card className="border-rose-200 dark:border-rose-900">
      <CardHeader>
        <CardTitle className="text-rose-900 dark:text-rose-200">Zona peligrosa</CardTitle>
        <CardDescription>
          Eliminar tu cuenta es irreversible. Perdés acceso a todos los workspaces. Si sos owner
          único de alguno, transferí ownership antes o el workspace queda huérfano.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="delete-confirm-email">Para confirmar, escribí tu email</Label>
          <Input
            id="delete-confirm-email"
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder={session.user.email}
            autoComplete="off"
          />
        </div>
        <Button
          variant="destructive"
          disabled={!matches}
          onClick={async () => {
            const ok = await confirm({
              title: '¿Eliminar tu cuenta?',
              description: 'Última oportunidad. Esta acción no se puede deshacer.',
              confirmLabel: 'Eliminar mi cuenta',
              destructive: true,
            });
            if (!ok) return;
            // biome-ignore lint/suspicious/noExplicitAny: better-auth shape
            const result = await (authClient as any).deleteUser?.();
            if (result?.error) {
              toast.error(
                result.error.message ?? 'Better Auth no expone deleteUser. Contactá soporte.',
              );
              return;
            }
            toast.success('Cuenta eliminada. Saliendo…');
            window.location.href = '/login';
          }}
        >
          Eliminar mi cuenta
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Export del workspace (propuesta 165.1 ronda 14). El user descarga un JSON
 * con bookings/properties/units/audit del workspace. Self-service portability.
 */
function ExportWorkspaceCard() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';
  const [redact, setRedact] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Exportar workspace</CardTitle>
        <CardDescription>
          Descargá un JSON con toda la información del workspace: properties, units, reservas
          (últimas 5000), notificaciones (1000) y audit log (5000). Solo el owner puede hacerlo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-start gap-3 rounded-md border p-3 text-sm hover:bg-muted/40">
          <input
            type="checkbox"
            checked={redact}
            onChange={(e) => setRedact(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <div>
            <p className="font-medium">Anonimizar PII de huéspedes</p>
            <p className="text-xs text-muted-foreground">
              Reemplaza emails/teléfonos/nombres con marcadores anónimos. Útil para compartir con
              contadores o terceros sin exponer datos personales. Las relaciones se preservan (mismo
              huésped → mismo marcador en todas sus reservas).
            </p>
          </div>
        </label>
        <a
          href={`${apiUrl}/api/settings/export${redact ? '?redact=1' : ''}`}
          download
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
        >
          Descargar export{redact ? '-redacted' : ''}.json
        </a>
      </CardContent>
    </Card>
  );
}

/**
 * Compliance / retention settings (propuesta 151.1 ronda 13).
 *
 * Solo expone `auditRetentionDays`. El worker `audit-purge` corre diario y
 * borra eventos más viejos. Tooltip explica el costo de almacenamiento vs
 * auditabilidad para que el dueño tome una decisión informada.
 */
function ComplianceCard({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const settingsQuery = useQuery({
    queryKey: ['tenant-settings', orgId],
    queryFn: () => api<{ data: TenantSettings }>('/api/settings').then((r) => r.data),
    staleTime: 60_000,
  });

  const [days, setDays] = useState(365);

  useEffect(() => {
    if (settingsQuery.data?.auditRetentionDays !== undefined) {
      setDays(settingsQuery.data.auditRetentionDays);
    }
  }, [settingsQuery.data]);

  // Preview cuántos eventos se borrarían (propuesta 163.1 ronda 14).
  const previewQuery = useQuery({
    queryKey: ['audit', 'retention-preview', days],
    queryFn: () =>
      api<{
        data: { deleteCount: number; keepCount: number; oldestTs: string | null };
      }>(`/api/audit/retention/preview?days=${days}`),
    staleTime: 30_000,
    retry: false,
    placeholderData: (prev) => prev,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api('/api/settings', {
        method: 'PATCH',
        json: { auditRetentionDays: days },
      }),
    onSuccess: () => {
      toast.success('Retention actualizado');
      queryClient.invalidateQueries({ queryKey: ['tenant-settings', orgId] });
    },
    onError: (err: ApiError) => toast.error(err.message ?? 'No pudimos guardar.'),
  });

  // Purge inmediato (propuesta 174.3 ronda 15). Útil cuando bajaste el
  // TTL y querés ver el efecto sin esperar al cron diario.
  const purgeMutation = useMutation({
    mutationFn: () =>
      api<{ data: { deletedCount: number; days: number } }>('/api/audit/retention/purge-now', {
        method: 'POST',
      }),
    onSuccess: (res) => {
      toast.success(
        `Purgados ${res.data.deletedCount.toLocaleString('es-AR')} eventos (retention ${res.data.days}d)`,
      );
      queryClient.invalidateQueries({ queryKey: ['audit', 'retention-preview', days] });
    },
    onError: () => toast.error('Falló el purge'),
  });

  const handleSave = async () => {
    const deleteCount = previewQuery.data?.data?.deleteCount ?? 0;
    if (deleteCount > 1000) {
      const ok = await confirm({
        title: '¿Bajar retention?',
        description: `Esto borrará ${deleteCount.toLocaleString('es-AR')} eventos del audit log al próximo purge diario. ¿Continuar?`,
        confirmLabel: 'Sí, bajar retention',
        destructive: true,
      });
      if (!ok) return;
    }
    mutation.mutate();
  };

  if (settingsQuery.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compliance</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    );
  }

  // Snap a presets razonables — el slider es lineal pero los inputs típicos
  // son 30/90/180/365/730/1825/3650.
  const presets = [
    { value: 30, label: '1 mes' },
    { value: 90, label: '3 meses' },
    { value: 180, label: '6 meses' },
    { value: 365, label: '1 año' },
    { value: 730, label: '2 años' },
    { value: 1825, label: '5 años' },
    { value: 3650, label: '10 años' },
  ];

  const dirty = days !== (settingsQuery.data?.auditRetentionDays ?? 365);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retención del audit log</CardTitle>
        <CardDescription>
          Cuánto tiempo guardamos el historial de cambios (creaciones, ediciones, eliminaciones).
          Más días = mejor auditabilidad pero más almacenamiento. Mínimo 30, máximo 3650 (10 años).
          Por debajo de 30 días podría no cumplir compliance regional.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="space-y-5"
        >
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="retention-slider">Días de retención</Label>
              <span className="text-2xl font-semibold tabular-nums">{days}</span>
            </div>
            <input
              id="retention-slider"
              type="range"
              min={30}
              max={3650}
              step={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Equivale a {(days / 30).toFixed(1)} meses · {(days / 365).toFixed(1)} años
            </p>
          </div>

          {previewQuery.data?.data && (
            <div
              className={`rounded-md border p-3 text-sm ${
                previewQuery.data.data.deleteCount > 0
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20'
                  : 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
              }`}
              role="status"
            >
              {previewQuery.data.data.deleteCount > 0 ? (
                <>
                  Con este valor, el próximo purge borrará{' '}
                  <strong>{previewQuery.data.data.deleteCount.toLocaleString('es-AR')}</strong>{' '}
                  eventos del audit log.
                  {previewQuery.data.data.oldestTs && (
                    <>
                      {' '}
                      El más viejo es de{' '}
                      <strong>
                        {new Date(previewQuery.data.data.oldestTs).toLocaleDateString('es-AR')}
                      </strong>
                      .
                    </>
                  )}{' '}
                  Quedarán {previewQuery.data.data.keepCount.toLocaleString('es-AR')} dentro del
                  rango.
                </>
              ) : (
                <>
                  No hay eventos a borrar. Quedan{' '}
                  {previewQuery.data.data.keepCount.toLocaleString('es-AR')} dentro del rango.
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2" role="group" aria-label="Presets">
            {presets.map((p) => (
              <Button
                key={p.value}
                type="button"
                size="sm"
                variant={days === p.value ? 'default' : 'outline'}
                onClick={() => setDays(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!dirty || mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Guardar retention
            </Button>
            {(previewQuery.data?.data?.deleteCount ?? 0) > 0 && (
              <Button
                type="button"
                variant="outline"
                disabled={purgeMutation.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: '¿Purgar ahora?',
                    description: `Borra ${previewQuery.data?.data.deleteCount.toLocaleString('es-AR')} eventos inmediatamente. No espera al cron diario.`,
                    confirmLabel: 'Purgar ahora',
                    destructive: true,
                  });
                  if (ok) purgeMutation.mutate();
                }}
              >
                {purgeMutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                Purgar ahora
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FuturesCard() {
  const sections: Array<{ title: string; module: string; desc: string }> = [
    {
      title: 'Equipo y permisos',
      module: 'M2.5',
      desc: 'Invitar miembros · roles owner/admin/agent/viewer · revocar accesos.',
    },
    {
      title: 'Notificaciones',
      module: 'M13',
      desc: 'Email + in-app + sonidos del inbox configurables por usuario.',
    },
    {
      title: 'Plan y facturación',
      module: 'M12',
      desc: 'Cambiar plan Stripe · ver invoices · método de pago.',
    },
    {
      title: 'API keys e integraciones',
      module: 'M7-M11',
      desc: 'Conectar WhatsApp, Mercado Pago, Meta Ads, Google Calendar.',
    },
    {
      title: 'Branding',
      module: 'M14',
      desc: 'Logo del workspace · color primario · plantillas WA.',
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Próximamente</CardTitle>
        <CardDescription>
          Estas secciones se completan en los módulos siguientes del roadmap.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {sections.map((s) => (
            <li
              key={s.title}
              className="flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
              <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-mono uppercase">
                {s.module}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
