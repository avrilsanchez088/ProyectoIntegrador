'use client';

import { ApiError, api } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ApiList, Property, Unit } from '@impacto/shared';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useConfirm } from '@impacto/ui/confirm-dialog';
import { EmptyState } from '@impacto/ui/empty-state';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@impacto/ui/form';
import { Input } from '@impacto/ui/input';
import { Skeleton } from '@impacto/ui/skeleton';
import { Textarea } from '@impacto/ui/textarea';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

type AvailabilityKind = 'booking' | 'block';

type AvailabilityItem = {
  id: string;
  start: string;
  end: string;
  kind: AvailabilityKind;
  reason?: string;
  status?: string;
};

const REASON_LABEL: Record<string, string> = {
  maintenance: 'Mantenimiento',
  owner_stay: 'Estadía del dueño',
  hold: 'Hold',
  closure: 'Cierre',
  other: 'Otro',
};

const formSchema = z
  .object({
    unitId: z.string().uuid('Elegí una unidad'),
    startsDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startsTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default('00:00'),
    endsDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default('23:59'),
    reason: z
      .enum(['maintenance', 'owner_stay', 'hold', 'closure', 'other'])
      .default('maintenance'),
    notes: z.string().max(1000).optional(),
  })
  .refine((d) => `${d.endsDate}T${d.endsTime}` > `${d.startsDate}T${d.startsTime}`, {
    message: 'El fin debe ser posterior al inicio',
    path: ['endsDate'],
  });
type FormValues = z.infer<typeof formSchema>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BlocksPage() {
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
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

  const props = propsQuery.data ?? [];
  const units = unitsQuery.data ?? [];

  // Auto-select primer unit cuando termina de cargar la lista.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo dispara al cambiar las units cargadas
  useEffect(() => {
    if (!selectedUnit && units[0]) {
      setSelectedUnit(units[0].id);
    }
  }, [units]);

  const itemsQuery = useQuery({
    queryKey: ['availability', selectedUnit],
    queryFn: async () => {
      const now = new Date();
      const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        unitId: selectedUnit,
        from: now.toISOString(),
        to: oneYear.toISOString(),
      });
      const res = await api<{
        data: { bookings: AvailabilityItem[]; blocks: AvailabilityItem[] };
      }>(`/api/availability?${params}`);
      return [
        ...res.data.bookings.map((b) => ({ ...b, kind: 'booking' as const })),
        ...res.data.blocks.map((b) => ({ ...b, kind: 'block' as const })),
      ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    },
    enabled: Boolean(selectedUnit),
    staleTime: 15_000,
  });

  const items = itemsQuery.data ?? null;

  const propertyName = useMemo(() => {
    const map = new Map(props.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? '?';
  }, [props]);

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ['availability', selectedUnit] });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Bloqueos de disponibilidad</h1>
          <p className="text-muted-foreground">
            Mantenimiento, estadía del dueño, cierres temporarios. No son reservas, solo ocupan el
            slot.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} disabled={!selectedUnit}>
          <Plus /> Nuevo bloqueo
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="unit-select" className="text-sm text-muted-foreground">
          Unidad:
        </label>
        <select
          id="unit-select"
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={selectedUnit}
          onChange={(e) => setSelectedUnit(e.target.value)}
        >
          <option value="">Elegí…</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {propertyName(u.propertyId)} · {u.name}
            </option>
          ))}
        </select>
      </div>

      {showForm && selectedUnit && (
        <NewBlockForm
          unitId={selectedUnit}
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {!selectedUnit ? (
        <EmptyState
          illustration="units"
          title="Sin unidad seleccionada"
          description="Elegí una unidad arriba para ver y administrar bloqueos."
        />
      ) : items === null ? (
        <div className="space-y-2">
          {['a', 'b', 'c', 'd'].map((k) => (
            <Skeleton key={k} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          illustration="block"
          title="Disponibilidad limpia"
          description="Esta unidad no tiene reservas ni bloqueos en los próximos 12 meses."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" /> Próximos 12 meses
            </CardTitle>
            <CardDescription>
              Reservas y bloqueos de la unidad. Los bloqueos se pueden eliminar; las reservas se
              editan desde su detalle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((item) => (
              <ItemRow key={`${item.kind}-${item.id}`} item={item} onDelete={reload} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ItemRow({ item, onDelete }: { item: AvailabilityItem; onDelete: () => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const handleDelete = async () => {
    const ok = await confirm({
      title: '¿Eliminar este bloqueo?',
      description: 'La unidad volverá a estar disponible en ese rango.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/availability/blocks/${item.id}`, { method: 'DELETE' });
      toast.success('Bloqueo eliminado');
      onDelete();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
      setBusy(false);
    }
  };

  const isBooking = item.kind === 'booking';
  const tone = isBooking
    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800'
    : 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800';

  return (
    <div className={`flex items-center justify-between rounded-md border p-3 text-sm ${tone}`}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-white/60 px-1.5 py-0.5 text-xs uppercase dark:bg-white/10">
            {isBooking ? 'Reserva' : 'Bloqueo'}
          </span>
          {item.reason && (
            <span className="text-xs">{REASON_LABEL[item.reason] ?? item.reason}</span>
          )}
          {item.status && <span className="text-xs text-muted-foreground">· {item.status}</span>}
        </div>
        <p className="mt-1">
          {formatDate(item.start)} <span className="text-muted-foreground">→</span>{' '}
          {formatDate(item.end)}
        </p>
      </div>
      {!isBooking && (
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDelete}
          disabled={busy}
          title="Eliminar bloqueo"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      )}
    </div>
  );
}

function NewBlockForm({ unitId, onCreated }: { unitId: string; onCreated: () => void }) {
  const [loading, setLoading] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      unitId,
      startsDate: '',
      startsTime: '00:00',
      endsDate: '',
      endsTime: '23:59',
      reason: 'maintenance',
      notes: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const startsAt = new Date(`${values.startsDate}T${values.startsTime}`).toISOString();
      const endsAt = new Date(`${values.endsDate}T${values.endsTime}`).toISOString();
      await api('/api/availability/blocks', {
        method: 'POST',
        json: {
          unitId,
          startsAt,
          endsAt,
          reason: values.reason,
          notes: values.notes || undefined,
        },
      });
      toast.success('Bloqueo creado');
      form.reset();
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error('Hay una reserva en ese rango. No se puede bloquear.');
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Nuevo bloqueo</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startsDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Desde</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startsTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="endsDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hasta</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endsTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      {...field}
                    >
                      <option value="maintenance">Mantenimiento</option>
                      <option value="owner_stay">Estadía del dueño</option>
                      <option value="hold">Hold</option>
                      <option value="closure">Cierre temporario</option>
                      <option value="other">Otro</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              Crear bloqueo
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
