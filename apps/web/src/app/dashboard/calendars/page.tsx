'use client';

import { ApiError, api } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ApiList, Property, Unit } from '@impacto/shared';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useConfirm } from '@impacto/ui/confirm-dialog';
import { EmptyState } from '@impacto/ui/empty-state';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@impacto/ui/form';
import { Input } from '@impacto/ui/input';
import { Skeleton } from '@impacto/ui/skeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

type ExternalCalendar = {
  id: string;
  unitId: string;
  provider: 'airbnb' | 'booking' | 'gcal' | 'ical';
  name: string;
  icalUrl: string;
  pollIntervalMinutes: number;
  enabled: number;
  lastSyncedAt: string | null;
  lastSyncStatus: 'ok' | 'error' | null;
  lastSyncError: string | null;
  lastEventCount: number;
};

type ExportToken = {
  id: string;
  unitId: string;
  token: string;
  label: string | null;
  lastAccessedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const PROVIDER_LABEL: Record<ExternalCalendar['provider'], string> = {
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  gcal: 'Google Calendar',
  ical: 'iCal genérico',
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';

const externalForm = z.object({
  unitId: z.string().uuid('Elegí una unidad'),
  provider: z.enum(['airbnb', 'booking', 'gcal', 'ical']),
  name: z.string().min(2).max(100),
  icalUrl: z.string().url('URL inválida'),
  pollIntervalMinutes: z.coerce.number().int().min(5).max(1440),
});
type ExternalForm = z.infer<typeof externalForm>;

const tokenForm = z.object({
  unitId: z.string().uuid('Elegí una unidad'),
  label: z.string().max(100).optional(),
});
type TokenForm = z.infer<typeof tokenForm>;

function formatRelative(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const days = Math.round(hr / 24);
  return `hace ${days} d`;
}

export default function CalendarsPage() {
  const queryClient = useQueryClient();

  const propsQuery = useQuery({
    queryKey: ['properties', 'list'],
    queryFn: () => api<ApiList<Property>>('/api/properties').then((r) => r.data),
    staleTime: 60_000,
  });
  const unitsQuery = useQuery({
    queryKey: ['units', 'list'],
    queryFn: () => api<ApiList<Unit>>('/api/units').then((r) => r.data),
    staleTime: 60_000,
  });
  const externalsQuery = useQuery({
    queryKey: ['external-calendars'],
    queryFn: () => api<{ data: ExternalCalendar[] }>('/api/calendars/external').then((r) => r.data),
    staleTime: 30_000,
  });
  const tokensQuery = useQuery({
    queryKey: ['ical-tokens'],
    queryFn: () => api<{ data: ExportToken[] }>('/api/calendars/tokens').then((r) => r.data),
    staleTime: 30_000,
  });

  const props = propsQuery.data ?? [];
  const units = unitsQuery.data ?? [];
  const externals = externalsQuery.data ?? null;
  const tokens = tokensQuery.data ?? null;
  const fetchError =
    propsQuery.error ?? unitsQuery.error ?? externalsQuery.error ?? tokensQuery.error;
  const error = fetchError instanceof ApiError ? fetchError.message : null;

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ['external-calendars'] });
    queryClient.invalidateQueries({ queryKey: ['ical-tokens'] });
    queryClient.invalidateQueries({ queryKey: ['properties', 'list'] });
    queryClient.invalidateQueries({ queryKey: ['units', 'list'] });
  };

  const unitLabel = useMemo(() => {
    const propName = new Map(props.map((p) => [p.id, p.name]));
    const unitName = new Map(units.map((u) => [u.id, u]));
    return (unitId: string) => {
      const u = unitName.get(unitId);
      if (!u) return unitId.slice(0, 8);
      return `${propName.get(u.propertyId) ?? '?'} · ${u.name}`;
    };
  }, [props, units]);

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/dashboard">
          <ArrowLeft /> Volver al panel
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Calendarios externos</h1>
        <p className="text-muted-foreground">
          Sincronizá Booking, Airbnb y Google Calendar con Impacto. Importamos sus reservas y
          exportamos las tuyas.
        </p>
      </div>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : externals === null || tokens === null ? (
        <div className="space-y-8">
          {['a', 'b'].map((k) => (
            <div key={k} className="space-y-3 rounded-xl border bg-card p-4">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <ExternalCalendarsSection
            externals={externals}
            units={units}
            unitLabel={unitLabel}
            onChange={reload}
          />
          <ExportTokensSection
            tokens={tokens}
            units={units}
            unitLabel={unitLabel}
            onChange={reload}
          />
        </div>
      )}
    </div>
  );
}

// ─── External (import) ─────────────────────────────────
function ExternalCalendarsSection({
  externals,
  units,
  unitLabel,
  onChange,
}: {
  externals: ExternalCalendar[];
  units: Unit[];
  unitLabel: (id: string) => string;
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Importar (Booking · Airbnb · GCal → Impacto)</CardTitle>
            <CardDescription>
              Pegá la URL iCal del canal externo. El worker la consulta cada N minutos y crea
              reservas espejo.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus /> Agregar feed
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <NewExternalForm
            units={units}
            onCreated={() => {
              setShowForm(false);
              onChange();
            }}
          />
        )}

        {externals.length === 0 ? (
          <EmptyState
            illustration="sync"
            title="Sin feeds externos"
            description="Pegá la URL iCal de Booking, Airbnb o Google Calendar arriba para empezar a sincronizar."
          />
        ) : (
          <div className="mt-4 space-y-2">
            {externals.map((cal) => (
              <ExternalRow key={cal.id} cal={cal} unitLabel={unitLabel} onChange={onChange} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExternalRow({
  cal,
  unitLabel,
  onChange,
}: {
  cal: ExternalCalendar;
  unitLabel: (id: string) => string;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<'sync' | 'delete' | null>(null);
  const confirm = useConfirm();

  const handleSync = async () => {
    setBusy('sync');
    try {
      await api(`/api/calendars/external/${cal.id}/sync`, { method: 'POST' });
      toast.success('Sincronización en cola');
      // El estado real se actualiza tras el job; esperamos breve y recargamos.
      setTimeout(onChange, 1500);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `¿Eliminar el feed "${cal.name}"?`,
      description: 'Las reservas ya importadas se mantienen. La sincronización se detiene.',
      confirmLabel: 'Eliminar feed',
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await api(`/api/calendars/external/${cal.id}`, { method: 'DELETE' });
      toast.success('Feed eliminado');
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{cal.name}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">
              {PROVIDER_LABEL[cal.provider]}
            </span>
            {cal.enabled === 0 && (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-900">
                Pausado
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{unitLabel(cal.unitId)}</p>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={cal.icalUrl}>
            {cal.icalUrl}
          </p>
          <p className="mt-1 text-xs">
            Cada {cal.pollIntervalMinutes} min · último sync: {formatRelative(cal.lastSyncedAt)}
            {cal.lastSyncStatus === 'error' && (
              <span className="ml-2 text-rose-600">⚠ {cal.lastSyncError ?? 'error'}</span>
            )}
            {cal.lastEventCount > 0 && (
              <span className="ml-2 text-muted-foreground">· {cal.lastEventCount} eventos</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            title="Sincronizar ahora"
            onClick={handleSync}
            disabled={busy !== null}
          >
            {busy === 'sync' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Eliminar"
            onClick={handleDelete}
            disabled={busy !== null}
          >
            {busy === 'delete' ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NewExternalForm({ units, onCreated }: { units: Unit[]; onCreated: () => void }) {
  const [loading, setLoading] = useState(false);
  const form = useForm<ExternalForm>({
    resolver: zodResolver(externalForm),
    defaultValues: {
      unitId: '',
      provider: 'airbnb',
      name: '',
      icalUrl: '',
      pollIntervalMinutes: 15,
    },
  });

  const onSubmit = async (values: ExternalForm) => {
    setLoading(true);
    try {
      await api('/api/calendars/external', {
        method: 'POST',
        json: { ...values, enabled: true },
      });
      toast.success('Feed agregado, comienza a sincronizar en breve');
      form.reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mb-4 space-y-3 rounded-md border bg-muted/30 p-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="unitId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unidad</FormLabel>
                <FormControl>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    {...field}
                  >
                    <option value="">Elegí…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Proveedor</FormLabel>
                <FormControl>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    {...field}
                  >
                    <option value="airbnb">Airbnb</option>
                    <option value="booking">Booking.com</option>
                    <option value="gcal">Google Calendar</option>
                    <option value="ical">iCal genérico</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre interno</FormLabel>
              <FormControl>
                <Input placeholder="Airbnb · Cabaña Aurora" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="icalUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL iCal</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://www.airbnb.com/calendar/ical/..."
                  className="font-mono text-xs"
                  {...field}
                />
              </FormControl>
              <FormDescription>Copialo del calendario de Airbnb / Booking / GCal.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="pollIntervalMinutes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Frecuencia (min)</FormLabel>
              <FormControl>
                <Input type="number" min={5} max={1440} {...field} />
              </FormControl>
              <FormDescription>
                Cada cuántos minutos consultamos el feed. Default 15.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          Guardar feed
        </Button>
      </form>
    </Form>
  );
}

// ─── Export tokens ─────────────────────────────────────
function ExportTokensSection({
  tokens,
  units,
  unitLabel,
  onChange,
}: {
  tokens: ExportToken[];
  units: Unit[];
  unitLabel: (id: string) => string;
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Exportar (Impacto → Booking · Airbnb · GCal)</CardTitle>
            <CardDescription>
              Generá una URL iCal pública por unidad. Pegala en el otro canal para que vea tus
              bookings.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus /> Generar token
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <NewTokenForm
            units={units}
            onCreated={() => {
              setShowForm(false);
              onChange();
            }}
          />
        )}

        {tokens.length === 0 ? (
          <EmptyState
            illustration="sync"
            title="Sin tokens generados"
            description="Generá una URL iCal pública por unidad para que Booking, Airbnb o GCal lean tus reservas."
          />
        ) : (
          <div className="mt-4 space-y-2">
            {tokens
              .filter((t) => !t.revokedAt)
              .map((tok) => (
                <TokenRow key={tok.id} tok={tok} unitLabel={unitLabel} onChange={onChange} />
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TokenRow({
  tok,
  unitLabel,
  onChange,
}: {
  tok: ExportToken;
  unitLabel: (id: string) => string;
  onChange: () => void;
}) {
  const url = `${API_URL}/ical/${tok.token}.ics`;
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success('URL copiada');
  };

  const handleRevoke = async () => {
    const ok = await confirm({
      title: '¿Revocar este token?',
      description: 'Las URLs ya entregadas a otros canales dejarán de funcionar inmediatamente.',
      confirmLabel: 'Revocar',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/calendars/tokens/${tok.id}`, { method: 'DELETE' });
      toast.success('Token revocado');
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{tok.label || 'Sin etiqueta'}</span>
          </div>
          <p className="text-xs text-muted-foreground">{unitLabel(tok.unitId)}</p>
          <p className="mt-1 truncate font-mono text-xs" title={url}>
            {url}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Último acceso: {formatRelative(tok.lastAccessedAt)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="icon" variant="ghost" title="Copiar URL" onClick={handleCopy}>
            <Copy />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Revocar"
            onClick={handleRevoke}
            disabled={busy}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NewTokenForm({ units, onCreated }: { units: Unit[]; onCreated: () => void }) {
  const [loading, setLoading] = useState(false);
  const form = useForm<TokenForm>({
    resolver: zodResolver(tokenForm),
    defaultValues: { unitId: '', label: '' },
  });

  const onSubmit = async (values: TokenForm) => {
    setLoading(true);
    try {
      await api('/api/calendars/tokens', {
        method: 'POST',
        json: { unitId: values.unitId, label: values.label || undefined },
      });
      toast.success('Token generado');
      form.reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mb-4 space-y-3 rounded-md border bg-muted/30 p-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="unitId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unidad</FormLabel>
                <FormControl>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    {...field}
                  >
                    <option value="">Elegí…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Etiqueta (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="Para Booking" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          Generar
        </Button>
      </form>
    </Form>
  );
}
