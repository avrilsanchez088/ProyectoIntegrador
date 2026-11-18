'use client';

import { ApiError, api } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useConfirm } from '@impacto/ui/confirm-dialog';
import { EmptyState } from '@impacto/ui/empty-state';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@impacto/ui/form';
import { Input } from '@impacto/ui/input';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { SEASON_LABEL, SEASON_TONE, type Season, formatDate } from '../_lib/types';

const seasonForm = z
  .object({
    name: z.string().min(2).max(100),
    seasonType: z.enum(['high', 'medium', 'low', 'special']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
    sortOrder: z.coerce.number().int().default(0),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'Fin debe ser mayor o igual al inicio',
    path: ['endDate'],
  });
type SeasonFormValues = z.infer<typeof seasonForm>;

export function SeasonsSection({
  propertyId,
  seasons,
  onChange,
}: {
  propertyId: string;
  seasons: Season[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Temporadas</CardTitle>
            <CardDescription>Rangos de fechas con tipo (alta/media/baja/especial).</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus aria-hidden="true" /> Nueva temporada
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <NewSeasonForm
            propertyId={propertyId}
            onCreated={() => {
              setShowForm(false);
              onChange();
            }}
          />
        )}
        {seasons.length === 0 ? (
          <EmptyState
            illustration="calendar"
            title="Todavía no hay temporadas"
            description="Cargá tu primer rango (ej: Alta · verano 2026) para empezar a asignar tarifas."
          />
        ) : (
          <div className="space-y-2">
            {seasons.map((s) => (
              <SeasonRow key={s.id} season={s} onDelete={onChange} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SeasonRow({ season, onDelete }: { season: Season; onDelete: () => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const handleDelete = async () => {
    const ok = await confirm({
      title: `¿Eliminar la temporada "${season.name}"?`,
      description: 'Las tarifas asociadas a esta temporada también se eliminan.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/seasons/${season.id}`, { method: 'DELETE' });
      toast.success('Temporada eliminada');
      onDelete();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-md border p-3 text-sm">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{season.name}</span>
          <span className={`rounded px-1.5 py-0.5 text-xs ${SEASON_TONE[season.seasonType]}`}>
            {SEASON_LABEL[season.seasonType]}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDate(season.startDate)} → {formatDate(season.endDate)}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={handleDelete}
        disabled={busy}
        aria-label={`Eliminar temporada ${season.name}`}
      >
        {busy ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

function NewSeasonForm({
  propertyId,
  onCreated,
}: {
  propertyId: string;
  onCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const form = useForm<SeasonFormValues>({
    resolver: zodResolver(seasonForm),
    defaultValues: { name: '', seasonType: 'medium', startDate: '', endDate: '', sortOrder: 0 },
  });

  const onSubmit = async (values: SeasonFormValues) => {
    setLoading(true);
    try {
      await api('/api/seasons', { method: 'POST', json: { ...values, propertyId } });
      toast.success('Temporada creada');
      form.reset();
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(err.message ?? 'El rango se superpone con otra temporada.');
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Error');
      }
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input placeholder="Alta · verano 2026" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="seasonType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <FormControl>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    {...field}
                  >
                    <option value="high">Alta</option>
                    <option value="medium">Media</option>
                    <option value="low">Baja</option>
                    <option value="special">Especial (feriados, etc.)</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startDate"
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
            name="endDate"
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
        </div>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
          Guardar temporada
        </Button>
      </form>
    </Form>
  );
}
