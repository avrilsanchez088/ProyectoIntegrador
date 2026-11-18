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
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  DAYS,
  type DayKey,
  type PricingRule,
  type PricingRuleConfig,
  type RuleFormValues,
  type Unit,
  ruleForm,
} from '../_lib/types';

export function RulesSection({
  rules,
  units,
  onChange,
}: {
  rules: PricingRule[];
  units: Unit[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Reglas de pricing</h2>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus aria-hidden="true" /> Nueva regla
        </Button>
      </div>
      <div className="space-y-3">
        {showForm && (
          <NewRuleForm
            units={units}
            onCreated={() => {
              setShowForm(false);
              onChange();
            }}
          />
        )}
        {rules.length === 0 ? (
          <EmptyState
            illustration="policy"
            title="Sin reglas configuradas"
            description="Configurá mínimo de noches por día, descuentos por estadía larga o de último momento, y horarios de check-in/out."
          />
        ) : (
          rules.map((r) => <RuleCard key={r.id} rule={r} units={units} onChange={onChange} />)
        )}
      </div>
    </section>
  );
}

function RuleCard({
  rule,
  units,
  onChange,
}: {
  rule: PricingRule;
  units: Unit[];
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<'delete' | 'toggle' | null>(null);
  const confirm = useConfirm();
  const unitName = useMemo(() => {
    const map = new Map(units.map((u) => [u.id, u.name]));
    return rule.unitId ? (map.get(rule.unitId) ?? '?') : null;
  }, [units, rule.unitId]);

  const cfg = rule.config;

  const handleDelete = async () => {
    const ok = await confirm({
      title: `¿Eliminar la regla "${rule.name}"?`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await api(`/api/policies/rules/${rule.id}`, { method: 'DELETE' });
      toast.success('Regla eliminada');
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
      setBusy(null);
    }
  };

  const handleToggle = async () => {
    setBusy('toggle');
    try {
      await api(`/api/policies/rules/${rule.id}`, {
        method: 'PATCH',
        json: { enabled: rule.enabled === 0 },
      });
      toast.success(rule.enabled === 0 ? 'Regla activada' : 'Regla pausada');
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
              {rule.name}
              {rule.enabled === 0 && (
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  Pausada
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {unitName ? `Solo: ${unitName}` : 'Aplica a todo el workspace'}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={handleToggle} disabled={busy !== null}>
              {busy === 'toggle' ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {rule.enabled === 0 ? 'Activar' : 'Pausar'}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleDelete}
              disabled={busy !== null}
              aria-label={`Eliminar regla ${rule.name}`}
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
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Stat label="Noches mín. (default)" value={`${cfg.minNightsDefault ?? 1}`} />
          {cfg.maxNightsDefault && <Stat label="Noches máx." value={`${cfg.maxNightsDefault}`} />}
          <Stat
            label="Reserva con anticipación máx."
            value={`${cfg.advanceBookingDays ?? 365} días`}
          />
          <Stat label="Anticipación mínima" value={`${cfg.minAdvanceBookingDays ?? 0} días`} />
          {cfg.checkInTime && <Stat label="Check-in" value={cfg.checkInTime} />}
          {cfg.checkOutTime && <Stat label="Check-out" value={cfg.checkOutTime} />}
          {cfg.weekendPremiumPercent !== undefined && cfg.weekendPremiumPercent > 0 && (
            <Stat label="Premium fin de semana" value={`+${cfg.weekendPremiumPercent}%`} />
          )}
          {cfg.lastMinuteDiscount && (
            <Stat
              label="Descuento last-minute"
              value={`-${cfg.lastMinuteDiscount.discountPercent}% si reserva ≤ ${cfg.lastMinuteDiscount.daysBefore}d antes`}
            />
          )}
        </dl>

        {cfg.minNightsByDayOfWeek && Object.keys(cfg.minNightsByDayOfWeek).length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs uppercase text-muted-foreground">Mínimo de noches por día</p>
            <div className="flex gap-1 text-xs">
              {DAYS.map((d) => {
                const v = cfg.minNightsByDayOfWeek?.[d.key];
                return (
                  <span
                    key={d.key}
                    className={`rounded px-2 py-1 ${v ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    {d.label}: {v ?? '—'}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {cfg.lengthOfStayDiscount && cfg.lengthOfStayDiscount.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs uppercase text-muted-foreground">
              Descuento por estadía larga
            </p>
            <ul className="text-sm">
              {cfg.lengthOfStayDiscount.map((tier, idx) => (
                <li key={`${tier.minNights}-${idx}`} className="text-muted-foreground">
                  ≥ {tier.minNights} noches → -{tier.discountPercent}%
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function NewRuleForm({ units, onCreated }: { units: Unit[]; onCreated: () => void }) {
  const [loading, setLoading] = useState(false);

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleForm),
    defaultValues: {
      name: '',
      unitId: null,
      enabled: true,
      minNightsDefault: 1,
      advanceBookingDays: 365,
      minAdvanceBookingDays: 0,
      checkInTime: '',
      checkOutTime: '',
      losTiers: [],
    },
  });
  const losTiers = useFieldArray({ control: form.control, name: 'losTiers' });

  const onSubmit = async (values: RuleFormValues) => {
    setLoading(true);
    try {
      const dow: Partial<Record<DayKey, number>> = {};
      for (const d of DAYS) {
        const v = values[d.key];
        if (v !== undefined && v > 0) dow[d.key] = v;
      }

      const config: PricingRuleConfig = {
        minNightsDefault: values.minNightsDefault,
        advanceBookingDays: values.advanceBookingDays,
        minAdvanceBookingDays: values.minAdvanceBookingDays,
      };
      if (values.maxNightsDefault) config.maxNightsDefault = values.maxNightsDefault;
      if (values.checkInTime) config.checkInTime = values.checkInTime;
      if (values.checkOutTime) config.checkOutTime = values.checkOutTime;
      if (values.weekendPremiumPercent !== undefined && values.weekendPremiumPercent > 0) {
        config.weekendPremiumPercent = values.weekendPremiumPercent;
      }
      if (Object.keys(dow).length > 0) config.minNightsByDayOfWeek = dow;
      if (values.lastMinuteDays && values.lastMinutePercent) {
        config.lastMinuteDiscount = {
          daysBefore: values.lastMinuteDays,
          discountPercent: values.lastMinutePercent,
        };
      }
      if (values.losTiers.length > 0) {
        config.lengthOfStayDiscount = values.losTiers.map((t) => ({
          minNights: t.minNights,
          discountPercent: t.discountPercent,
        }));
      }

      await api('/api/policies/rules', {
        method: 'POST',
        json: {
          name: values.name,
          unitId: values.unitId || null,
          enabled: values.enabled,
          config,
        },
      });
      toast.success('Regla creada');
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
        <CardTitle className="text-base">Nueva regla</CardTitle>
        <CardDescription>
          Todos los campos son opcionales salvo nombre, mín. noches y ventana de reserva.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Reglas estándar" {...field} />
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
              <p className="mb-2 text-xs uppercase text-muted-foreground">Límites de estadía</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <FormField
                  control={form.control}
                  name="minNightsDefault"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Noches mín.</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={30} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxNightsDefault"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Noches máx.</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? undefined : Number(e.target.value),
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="advanceBookingDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anticipación máx. (días)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={730} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="minAdvanceBookingDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anticipación mín.</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={365} {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">0 = same-day OK.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase text-muted-foreground">Horarios</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="checkInTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check-in</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="checkOutTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check-out</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase text-muted-foreground">
                Mínimo de noches por día (opcional, override del default)
              </p>
              <div className="grid grid-cols-7 gap-2">
                {DAYS.map((d) => (
                  <FormField
                    key={d.key}
                    control={form.control}
                    name={d.key}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{d.label}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={30}
                            placeholder="—"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === '' ? undefined : Number(e.target.value),
                              )
                            }
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase text-muted-foreground">Premium / descuentos</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="weekendPremiumPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Premium fin de semana (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          placeholder="0"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? undefined : Number(e.target.value),
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Aplica a viernes y sábado.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastMinuteDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last-minute días antes</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          placeholder="—"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? undefined : Number(e.target.value),
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastMinutePercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last-minute %</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={50}
                          step="0.01"
                          placeholder="—"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? undefined : Number(e.target.value),
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase text-muted-foreground">
                  Descuento por estadía larga
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => losTiers.append({ minNights: 5, discountPercent: 5 })}
                >
                  <Plus aria-hidden="true" /> Agregar tier
                </Button>
              </div>
              <div className="space-y-2">
                {losTiers.fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="grid grid-cols-12 gap-2 rounded-md border bg-muted/30 p-2"
                  >
                    <FormField
                      control={form.control}
                      name={`losTiers.${idx}.minNights`}
                      render={({ field: f }) => (
                        <FormItem className="col-span-5">
                          <FormLabel className="text-xs">Mín. noches</FormLabel>
                          <FormControl>
                            <Input type="number" min={2} {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`losTiers.${idx}.discountPercent`}
                      render={({ field: f }) => (
                        <FormItem className="col-span-5">
                          <FormLabel className="text-xs">Descuento %</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} max={50} step="0.01" {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="col-span-2 flex items-end">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => losTiers.remove(idx)}
                        aria-label={`Eliminar tier de descuento ${idx + 1}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
              Guardar regla
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
