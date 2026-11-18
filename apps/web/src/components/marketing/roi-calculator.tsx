'use client';

import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@impacto/ui/card';
import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { Calculator, TrendingDown } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

/**
 * Calculadora de "cuánto perdés por no responder a tiempo".
 *
 * Lógica: el dueño promedio recibe N consultas/mes via WhatsApp; cierra ~20%
 * cuando responde rápido y ~5% cuando responde tarde. La diferencia es lo
 * que un bot 24/7 captura. Datos basados en estudios LATAM hospitality.
 */

const RESPONSE_RATE_FAST = 0.22; // 22% — respuesta < 5 min
const RESPONSE_RATE_SLOW = 0.06; // 6% — respuesta > 1h

export function RoiCalculator() {
  const [consultas, setConsultas] = useState(40);
  const [ticketUsd, setTicketUsd] = useState(180);

  const lostMonthly = Math.round(consultas * (RESPONSE_RATE_FAST - RESPONSE_RATE_SLOW) * ticketUsd);
  const lostAnnual = lostMonthly * 12;

  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-secondary-foreground">
          <Calculator className="size-3" />
          Calculadora
        </div>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          ¿Cuántas reservas perdés por no responder a tiempo?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Estimación basada en estudios LATAM: respuesta &lt; 5 min cierra 22% vs 6% si tarda más de
          1 hora.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-2">
          <CardContent className="space-y-5 p-6 md:p-8">
            <div>
              <Label htmlFor="consultas" className="text-sm">
                Consultas por WhatsApp al mes
              </Label>
              <Input
                id="consultas"
                type="number"
                min={1}
                max={2000}
                value={consultas}
                onChange={(e) => setConsultas(Math.max(1, Number(e.target.value) || 0))}
                className="mt-1.5"
              />
              <input
                type="range"
                min={5}
                max={300}
                value={consultas}
                onChange={(e) => setConsultas(Number(e.target.value))}
                className="mt-2 w-full accent-blue-600"
                aria-label="Slider de consultas"
              />
            </div>

            <div>
              <Label htmlFor="ticket" className="text-sm">
                Ticket promedio (USD)
              </Label>
              <Input
                id="ticket"
                type="number"
                min={1}
                value={ticketUsd}
                onChange={(e) => setTicketUsd(Math.max(1, Number(e.target.value) || 0))}
                className="mt-1.5"
              />
              <input
                type="range"
                min={50}
                max={1000}
                step={10}
                value={ticketUsd}
                onChange={(e) => setTicketUsd(Number(e.target.value))}
                className="mt-2 w-full accent-blue-600"
                aria-label="Slider de ticket promedio"
              />
            </div>
          </CardContent>

          <div className="flex flex-col justify-center gap-4 bg-gradient-to-br from-rose-50 to-amber-50 p-6 dark:from-rose-950/30 dark:to-amber-950/20 md:p-8">
            <div className="flex items-center gap-2 text-sm font-medium text-rose-900 dark:text-rose-100">
              <TrendingDown className="size-4" />
              Estás dejando en la mesa
            </div>
            <motion.div
              key={lostMonthly}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl font-bold tracking-tight text-rose-900 dark:text-rose-100"
            >
              {formatUsd(lostMonthly)}
            </motion.div>
            <div className="text-sm text-rose-900/70 dark:text-rose-100/70">
              por mes · <span className="font-semibold">{formatUsd(lostAnnual)}</span> por año
            </div>
            <div className="mt-2">
              <Button asChild size="lg" variant="brand">
                <a href="/sign-up">Probá Impacto gratis</a>
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}
