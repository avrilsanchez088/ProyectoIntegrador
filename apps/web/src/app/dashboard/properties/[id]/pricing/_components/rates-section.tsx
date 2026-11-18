'use client';

import { ApiError, api } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useConfirm } from '@impacto/ui/confirm-dialog';
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
import { DollarSign, Loader2, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { type Rate, type Season, type Unit, formatMoney } from '../_lib/types';

const rateForm = z.object({
  unitId: z.string().uuid(),
  seasonId: z.string().uuid(),
  pricePerNightUsd: z.coerce.number().min(0),
  extraGuestUsd: z.coerce.number().min(0).default(0),
  baseGuests: z.coerce.number().int().min(1).default(2),
});
type RateFormValues = z.infer<typeof rateForm>;

export function RatesSection({
  seasons,
  units,
  rates,
  onChange,
}: {
  seasons: Season[];
  units: Unit[];
  rates: Rate[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);

  const grid = useMemo(() => {
    const m = new Map<string, Map<string, Rate>>();
    for (const r of rates) {
      const inner = m.get(r.unitId) ?? new Map<string, Rate>();
      inner.set(r.seasonId, r);
      m.set(r.unitId, inner);
    }
    return m;
  }, [rates]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tarifas por unidad y temporada</CardTitle>
            <CardDescription>
              Precio por noche en USD. El bot consulta esto al cotizar. Sin tarifa para una fecha →
              no se puede reservar.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            disabled={units.length === 0 || seasons.length === 0}
          >
            <Plus aria-hidden="true" /> Nueva tarifa
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {units.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Necesitás al menos una unidad para definir tarifas.
          </p>
        ) : seasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Necesitás al menos una temporada para definir tarifas.
          </p>
        ) : (
          <>
            {showForm && (
              <NewRateForm
                units={units}
                seasons={seasons}
                rates={rates}
                onCreated={() => {
                  setShowForm(false);
                  onChange();
                }}
              />
            )}
            {rates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay tarifas cargadas todavía.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                      <th>Unidad</th>
                      {seasons.map((s) => (
                        <th key={s.id} className="text-right">
                          {s.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => (
                      <tr key={u.id} className="border-b last:border-b-0 [&>td]:px-3 [&>td]:py-2">
                        <td className="font-medium">{u.name}</td>
                        {seasons.map((s) => {
                          const r = grid.get(u.id)?.get(s.id);
                          return (
                            <td key={s.id} className="text-right">
                              {r ? (
                                <RateCell rate={r} onDelete={onChange} />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RateCell({ rate, onDelete }: { rate: Rate; onDelete: () => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const handleDelete = async () => {
    const ok = await confirm({
      title: '¿Eliminar esta tarifa?',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/rates/${rate.id}`, { method: 'DELETE' });
      toast.success('Tarifa eliminada');
      onDelete();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1">
      <span className="font-medium">{formatMoney(rate.pricePerNightCents)}</span>
      {rate.extraGuestPriceCents > 0 && (
        <span className="text-xs text-muted-foreground" title="Por huésped extra">
          +{formatMoney(rate.extraGuestPriceCents)}
        </span>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="text-muted-foreground hover:text-destructive"
        aria-label="Eliminar tarifa"
      >
        {busy ? (
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="size-3" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function NewRateForm({
  units,
  seasons,
  rates,
  onCreated,
}: {
  units: Unit[];
  seasons: Season[];
  rates: Rate[];
  onCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const form = useForm<RateFormValues>({
    resolver: zodResolver(rateForm),
    defaultValues: {
      unitId: units[0]?.id ?? '',
      seasonId: seasons[0]?.id ?? '',
      pricePerNightUsd: 0,
      extraGuestUsd: 0,
      baseGuests: 2,
    },
  });

  const onSubmit = async (values: RateFormValues) => {
    const dup = rates.find((r) => r.unitId === values.unitId && r.seasonId === values.seasonId);
    if (dup) {
      toast.error('Ya existe una tarifa para esta unidad y temporada. Eliminala primero.');
      return;
    }
    setLoading(true);
    try {
      await api('/api/rates', {
        method: 'POST',
        json: {
          unitId: values.unitId,
          seasonId: values.seasonId,
          pricePerNightCents: Math.round(values.pricePerNightUsd * 100),
          extraGuestPriceCents: Math.round(values.extraGuestUsd * 100),
          baseGuests: values.baseGuests,
        },
      });
      toast.success('Tarifa creada');
      form.reset({ ...form.getValues(), pricePerNightUsd: 0, extraGuestUsd: 0 });
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
            name="seasonId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Temporada</FormLabel>
                <FormControl>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    {...field}
                  >
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="pricePerNightUsd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>USD por noche</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" min={0} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="extraGuestUsd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Huésped extra (USD)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" min={0} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="baseGuests"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pax base incluidos</FormLabel>
                <FormControl>
                  <Input type="number" min={1} {...field} />
                </FormControl>
                <FormDescription className="text-xs">
                  A partir de acá cobra el extra.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
          <DollarSign aria-hidden="true" /> Guardar tarifa
        </Button>
      </form>
    </Form>
  );
}
