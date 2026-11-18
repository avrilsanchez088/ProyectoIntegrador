'use client';

import { api } from '@/lib/api';
import { Card, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Checklist persistente que aparece en /dashboard home mientras el dueño
 * no tiene cargado lo mínimo para que el bot funcione end-to-end.
 *
 * Se autodescubre: hace fetch de counts, calcula qué pasos están done.
 * Cuando todos están done, el card desaparece.
 *
 * Pasos:
 *   1. Workspace (always done si llegamos acá — el layout exige org activa)
 *   2. Property (al menos 1)
 *   3. Unit (al menos 1)
 *   4. Season + Rate (al menos 1 tarifa con season — sin esto el bot no cotiza)
 *   5. Cancellation policy default (recomendado, no bloqueante)
 *
 * Persistimos "dismissed" en localStorage para usuarios que ya configuraron
 * todo via API/seed y no quieren ver el card.
 */

interface Step {
  done: boolean;
  title: string;
  desc: string;
  href: string;
}

const STORAGE_KEY = 'impacto.setup.dismissed';

export function SetupChecklist({ propertyId }: { propertyId?: string }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1') {
      setDismissed(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ data: Array<{ id: string }> }>('/api/properties'),
      api<{ data: Array<{ id: string; propertyId: string }> }>('/api/units'),
      api<{ data: Array<{ id: string; unitId: string }> }>('/api/rates'),
      api<{ data: Array<{ id: string; isDefault: number }> }>('/api/policies/cancellation'),
    ])
      .then(([props, units, rates, policies]) => {
        if (cancelled) return;
        const firstPropertyId = propertyId ?? props.data[0]?.id;
        const propertiesUrl = '/dashboard/properties/new';
        const unitsUrl = firstPropertyId
          ? `/dashboard/properties/${firstPropertyId}/units/new`
          : propertiesUrl;
        const pricingUrl = firstPropertyId
          ? `/dashboard/properties/${firstPropertyId}/pricing`
          : propertiesUrl;
        const policiesUrl = '/dashboard/policies';

        setSteps([
          {
            done: props.data.length > 0,
            title: 'Crear primera propiedad',
            desc: 'Tu alojamiento (complejo, hotel, casa).',
            href: propertiesUrl,
          },
          {
            done: units.data.length > 0,
            title: 'Agregar primera unidad',
            desc: 'La cabaña/habitación que se reserva.',
            href: unitsUrl,
          },
          {
            done: rates.data.length > 0,
            title: 'Definir temporada + tarifa',
            desc: 'Sin tarifa el bot no puede cotizar.',
            href: pricingUrl,
          },
          {
            done: policies.data.some((p) => p.isDefault === 1),
            title: 'Política de cancelación default',
            desc: 'Para que el bot sepa cuánto reintegrar al cancelar.',
            href: policiesUrl,
          },
        ]);
      })
      .catch(() => {
        if (!cancelled) setSteps(null);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setDismissed(true);
  };

  if (!steps || dismissed) return null;
  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  const completed = steps.filter((s) => s.done).length;
  const progress = (completed / steps.length) * 100;

  return (
    <motion.div
      data-tour="checklist"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="mb-8 overflow-hidden border-blue-200 bg-gradient-to-br from-blue-50 to-purple-50 dark:border-blue-900 dark:from-blue-950/30 dark:to-purple-950/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white">
                <Sparkles className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base">Configurá Impacto en 4 pasos</CardTitle>
                <CardDescription>
                  Una vez listo, el bot ya puede cotizar y reservar 24/7.
                </CardDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-muted-foreground hover:text-foreground"
              title="No mostrar más"
            >
              Ocultar
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-600 to-purple-600"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {completed} de {steps.length} completados
          </p>
        </CardHeader>

        <div className="space-y-2 px-6 pb-6">
          {steps.map((step, idx) => (
            <Link
              key={step.title}
              // `step.href` se compone dinamicamente con el propertyId activo,
              // typedRoutes no lo puede validar estaticamente — cast a Route.
              href={step.href as Route}
              className={`flex items-center gap-3 rounded-md p-2 transition-colors ${
                step.done ? 'opacity-60' : 'hover:bg-white/60 dark:hover:bg-white/5'
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">Paso {idx + 1}</span>
                  <span className={step.done ? 'line-through' : 'font-medium'}>{step.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{step.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
