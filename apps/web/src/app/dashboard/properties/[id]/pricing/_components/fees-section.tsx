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
import { Switch } from '@impacto/ui/switch';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CHARGE_TYPE_LABEL, FEE_TYPE_LABEL, type Fee, type Unit, formatMoney } from '../_lib/types';

const feeForm = z.object({
  unitId: z.string().uuid(),
  name: z.string().min(2).max(100),
  feeType: z.enum(['cleaning', 'deposit', 'pet', 'extra_guest', 'transfer', 'other']),
  chargeType: z.enum(['fixed', 'per_night', 'per_guest', 'per_pet', 'percent_of_total']),
  amount: z.coerce.number().min(0),
  refundable: z.boolean().default(false),
  optional: z.boolean().default(false),
});
type FeeFormValues = z.infer<typeof feeForm>;

export function FeesSection({
  units,
  fees,
  onChange,
}: {
  units: Unit[];
  fees: Fee[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const unitName = useMemo(() => {
    const map = new Map(units.map((u) => [u.id, u.name]));
    return (id: string) => map.get(id) ?? id.slice(0, 8);
  }, [units]);

  const formatFeeAmount = (fee: Fee): string => {
    if (fee.chargeType === 'percent_of_total') {
      return `${(fee.amountCents / 100).toFixed(2)}%`;
    }
    return formatMoney(fee.amountCents);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Cargos extras (fees)</CardTitle>
            <CardDescription>
              Limpieza, depósito, mascota, traslado. Configurables por unidad. Se aplican
              automáticamente al cotizar.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowForm((v) => !v)} disabled={units.length === 0}>
            <Plus aria-hidden="true" /> Nuevo fee
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {units.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Necesitás al menos una unidad para agregar fees.
          </p>
        ) : (
          <>
            {showForm && (
              <NewFeeForm
                units={units}
                onCreated={() => {
                  setShowForm(false);
                  onChange();
                }}
              />
            )}
            {fees.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay fees configurados todavía.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                      <th>Unidad</th>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>Cobro</th>
                      <th className="text-right">Monto</th>
                      <th className="text-center">Flags</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((f) => (
                      <FeeRow
                        key={f.id}
                        fee={f}
                        unitName={unitName(f.unitId)}
                        amountLabel={formatFeeAmount(f)}
                        onDelete={onChange}
                      />
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

function FeeRow({
  fee,
  unitName,
  amountLabel,
  onDelete,
}: {
  fee: Fee;
  unitName: string;
  amountLabel: string;
  onDelete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const handleDelete = async () => {
    const ok = await confirm({
      title: `¿Eliminar el fee "${fee.name}"?`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/policies/fees/${fee.id}`, { method: 'DELETE' });
      toast.success('Fee eliminado');
      onDelete();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
      setBusy(false);
    }
  };

  return (
    <tr className="border-b last:border-b-0 [&>td]:px-3 [&>td]:py-2">
      <td>{unitName}</td>
      <td className="font-medium">{fee.name}</td>
      <td className="text-xs uppercase text-muted-foreground">{FEE_TYPE_LABEL[fee.feeType]}</td>
      <td className="text-xs text-muted-foreground">{CHARGE_TYPE_LABEL[fee.chargeType]}</td>
      <td className="text-right font-medium">{amountLabel}</td>
      <td className="text-center text-xs">
        {fee.refundable === 1 && (
          <span className="mr-1 rounded bg-emerald-100 px-1 py-0.5 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            reembolsable
          </span>
        )}
        {fee.optional === 1 && (
          <span className="rounded bg-blue-100 px-1 py-0.5 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            opcional
          </span>
        )}
      </td>
      <td className="text-right">
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDelete}
          disabled={busy}
          aria-label={`Eliminar fee ${fee.name}`}
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 aria-hidden="true" />
          )}
        </Button>
      </td>
    </tr>
  );
}

function NewFeeForm({ units, onCreated }: { units: Unit[]; onCreated: () => void }) {
  const [loading, setLoading] = useState(false);
  const form = useForm<FeeFormValues>({
    resolver: zodResolver(feeForm),
    defaultValues: {
      unitId: units[0]?.id ?? '',
      name: '',
      feeType: 'cleaning',
      chargeType: 'fixed',
      amount: 0,
      refundable: false,
      optional: false,
    },
  });

  const chargeType = form.watch('chargeType');
  const isPercent = chargeType === 'percent_of_total';

  const onSubmit = async (values: FeeFormValues) => {
    setLoading(true);
    try {
      const amountCents = Math.round(values.amount * 100);
      await api('/api/policies/fees', {
        method: 'POST',
        json: {
          unitId: values.unitId,
          name: values.name,
          feeType: values.feeType,
          chargeType: values.chargeType,
          amountCents,
          refundable: values.refundable,
          optional: values.optional,
        },
      });
      toast.success('Fee creado');
      form.reset({ ...form.getValues(), name: '', amount: 0 });
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input placeholder="Limpieza final" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="feeType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <FormControl>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    {...field}
                  >
                    <option value="cleaning">Limpieza</option>
                    <option value="deposit">Depósito de seguridad</option>
                    <option value="pet">Mascota</option>
                    <option value="extra_guest">Huésped extra</option>
                    <option value="transfer">Traslado</option>
                    <option value="other">Otro</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="chargeType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cómo se cobra</FormLabel>
                <FormControl>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    {...field}
                  >
                    <option value="fixed">Monto fijo</option>
                    <option value="per_night">Por noche</option>
                    <option value="per_guest">Por huésped</option>
                    <option value="per_pet">Por mascota</option>
                    <option value="percent_of_total">% del total</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isPercent ? 'Porcentaje (%)' : 'Monto (USD)'}</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min={0} {...field} />
              </FormControl>
              <FormDescription className="text-xs">
                {isPercent
                  ? 'Ej: 10 = 10% sobre el total de la reserva.'
                  : 'En dólares. Ej: 25 = USD 25.'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-4">
          <FormField
            control={form.control}
            name="refundable"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    aria-label="Reembolsable"
                  />
                </FormControl>
                <FormLabel className="!mt-0 cursor-pointer">Reembolsable</FormLabel>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="optional"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    aria-label="Opcional"
                  />
                </FormControl>
                <FormLabel className="!mt-0 cursor-pointer">
                  Opcional (el huésped puede declinar)
                </FormLabel>
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
          Guardar fee
        </Button>
      </form>
    </Form>
  );
}
