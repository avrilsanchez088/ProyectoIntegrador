'use client';

import { ApiError, api } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Switch } from '@impacto/ui/switch';
import { Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { type Policy, type PolicyFormValues, type Unit, policyForm } from '../_lib/types';

export function PoliciesSection({
  policies,
  units,
  onChange,
}: {
  policies: Policy[];
  units: Unit[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Políticas de cancelación</h2>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus aria-hidden="true" /> Nueva política
        </Button>
      </div>
      <div className="space-y-3">
        {showForm && (
          <NewPolicyForm
            units={units}
            onCreated={() => {
              setShowForm(false);
              onChange();
            }}
          />
        )}
        {policies.length === 0 ? (
          <EmptyState
            illustration="policy"
            title="Sin políticas todavía"
            description="Marcá una como default y aplicará a todas las reservas que no tengan política específica."
          />
        ) : (
          policies.map((p) => (
            <PolicyCard key={p.id} policy={p} units={units} onChange={onChange} />
          ))
        )}
      </div>
    </section>
  );
}

function PolicyCard({
  policy,
  units,
  onChange,
}: {
  policy: Policy;
  units: Unit[];
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<'delete' | 'default' | null>(null);
  const confirm = useConfirm();
  const unitName = useMemo(() => {
    const map = new Map(units.map((u) => [u.id, u.name]));
    return policy.unitId ? (map.get(policy.unitId) ?? '?') : null;
  }, [units, policy.unitId]);

  const sortedTiers = [...(policy.tiers.tiers ?? [])].sort((a, b) => b.daysBefore - a.daysBefore);

  const handleDelete = async () => {
    const ok = await confirm({
      title: `¿Eliminar la política "${policy.name}"?`,
      description: 'Las reservas existentes mantienen el snapshot de su política original.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await api(`/api/policies/cancellation/${policy.id}`, { method: 'DELETE' });
      toast.success('Política eliminada');
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
      setBusy(null);
    }
  };

  const handleSetDefault = async () => {
    setBusy('default');
    try {
      await api(`/api/policies/cancellation/${policy.id}`, {
        method: 'PATCH',
        json: { isDefault: true },
      });
      toast.success('Marcada como default');
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {policy.name}
              {policy.isDefault === 1 && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  Default
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {unitName
                ? `Aplica solo a: ${unitName}`
                : 'Política del workspace (todas las unidades)'}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {policy.isDefault === 0 && (
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSetDefault}
                disabled={busy !== null}
                title="Marcar como default"
                aria-label={`Marcar ${policy.name} como política default`}
              >
                {busy === 'default' ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Star aria-hidden="true" />
                )}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={handleDelete}
              disabled={busy !== null}
              aria-label={`Eliminar política ${policy.name}`}
            >
              {busy === 'delete' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="border-b text-muted-foreground">
            <tr className="[&>th]:pb-1 [&>th]:text-left">
              <th>Días antes del check-in</th>
              <th className="text-right">Refund</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            {sortedTiers.map((t, idx) => (
              <tr key={`${t.daysBefore}-${idx}`} className="border-b last:border-b-0 [&>td]:py-1.5">
                <td>≥ {t.daysBefore} días</td>
                <td className="text-right font-medium">{t.refundPercent}%</td>
                <td className="text-xs text-muted-foreground">{t.description ?? ''}</td>
              </tr>
            ))}
            <tr>
              <td className="py-1.5 text-muted-foreground">Sin tier que aplique</td>
              <td className="text-right font-medium">{policy.tiers.defaultRefundPercent ?? 0}%</td>
              <td />
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function NewPolicyForm({ units, onCreated }: { units: Unit[]; onCreated: () => void }) {
  const [loading, setLoading] = useState(false);

  const form = useForm<PolicyFormValues>({
    resolver: zodResolver(policyForm),
    defaultValues: {
      name: '',
      unitId: null,
      isDefault: false,
      defaultRefundPercent: 0,
      tiers: [
        { daysBefore: 30, refundPercent: 100, description: '' },
        { daysBefore: 14, refundPercent: 50, description: '' },
        { daysBefore: 7, refundPercent: 25, description: '' },
      ],
    },
  });

  const tiers = useFieldArray({ control: form.control, name: 'tiers' });

  const onSubmit = async (values: PolicyFormValues) => {
    setLoading(true);
    try {
      await api('/api/policies/cancellation', {
        method: 'POST',
        json: {
          name: values.name,
          unitId: values.unitId || null,
          isDefault: values.isDefault,
          tiers: {
            tiers: values.tiers.map((t) => ({
              daysBefore: t.daysBefore,
              refundPercent: t.refundPercent,
              description: t.description?.trim() ? t.description : undefined,
            })),
            defaultRefundPercent: values.defaultRefundPercent,
          },
        },
      });
      toast.success('Política creada');
      form.reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nueva política</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Política estándar 2026" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aplica a</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      >
                        <option value="">Todo el workspace</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            Solo: {u.name}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <FormLabel>Tiers (orden no importa, se ordenan por días desc.)</FormLabel>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => tiers.append({ daysBefore: 0, refundPercent: 0, description: '' })}
                >
                  <Plus aria-hidden="true" /> Agregar tier
                </Button>
              </div>
              <div className="space-y-2">
                {tiers.fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="grid grid-cols-12 gap-2 rounded-md border bg-muted/30 p-2"
                  >
                    <FormField
                      control={form.control}
                      name={`tiers.${idx}.daysBefore`}
                      render={({ field: f }) => (
                        <FormItem className="col-span-3">
                          <FormLabel className="text-xs">Días antes</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} max={365} {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`tiers.${idx}.refundPercent`}
                      render={({ field: f }) => (
                        <FormItem className="col-span-2">
                          <FormLabel className="text-xs">Refund %</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} max={100} step="0.01" {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`tiers.${idx}.description`}
                      render={({ field: f }) => (
                        <FormItem className="col-span-6">
                          <FormLabel className="text-xs">Descripción (opcional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ej: cancelación con 30 días o más"
                              {...f}
                              value={f.value ?? ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="col-span-1 flex items-end">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => tiers.remove(idx)}
                        disabled={tiers.fields.length <= 1}
                        title="Eliminar tier"
                        aria-label={`Eliminar tier ${idx + 1}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <FormField
              control={form.control}
              name="defaultRefundPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Refund % cuando ningún tier aplica</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} step="0.01" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Típicamente 0 (sin reintegro si la cancelación está fuera de los tiers).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      aria-label="Marcar como default"
                    />
                  </FormControl>
                  <FormLabel className="!mt-0 cursor-pointer">
                    Marcar como default del workspace
                  </FormLabel>
                </FormItem>
              )}
            />

            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
              Guardar política
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
