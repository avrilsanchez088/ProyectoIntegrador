'use client';

import { RequireWorkspace } from '@/components/dashboard/require-workspace';
import { type ApiError, api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BookOpen, CheckCircle2, ExternalLink, Loader2, Radio } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function SyncPage() {
  return <RequireWorkspace>{() => <SyncView />}</RequireWorkspace>;
}

function SyncView() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Radio className="size-7" aria-hidden="true" />
          Conectar canales
        </h1>
        <p className="text-sm text-muted-foreground">
          Conectá tus canales de reservas, comunicación y cobro para automatizar tu alojamiento.
        </p>
      </header>

      {/* Canales de reservas */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Canales de reservas</h2>
          <p className="text-sm text-muted-foreground">
            Sincronizá tu calendario para evitar el doble booking. Las reservas se actualizan en
            tiempo real.
          </p>
        </div>
        <BookingComCard />
        <AirbnbCard />
      </section>

      {/* Canal de comunicación */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Canal de comunicación</h2>
          <p className="text-sm text-muted-foreground">
            El bot responde consultas automáticamente y guía al cliente hasta confirmar la reserva.
          </p>
        </div>
        <ComingSoonCard
          emoji="💬"
          name="WhatsApp Business"
          description="El bot responde preguntas frecuentes, verifica disponibilidad y genera links de pago automáticamente."
        />
      </section>

      {/* Métodos de cobro */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Métodos de cobro</h2>
          <p className="text-sm text-muted-foreground">
            Conectá tu cuenta para recibir pagos directamente. Impacto nunca toca tu dinero.
          </p>
        </div>
        <ComingSoonCard
          emoji="💙"
          name="MercadoPago"
          description="Generá links de pago automáticos. El cliente paga directo a tu cuenta de MercadoPago."
        />
        <ComingSoonCard
          emoji="🅿️"
          name="PayPal"
          description="Alternativa internacional. Ideal para recibir pagos de turistas extranjeros."
        />
      </section>
    </div>
  );
}

function ComingSoonCard({
  emoji,
  name,
  description,
}: {
  emoji: string;
  name: string;
  description: string;
}) {
  return (
    <Card className="opacity-70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-2xl">{emoji}</span>
          {name}
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Próximamente
          </span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled variant="outline" size="sm">
          Conectar {name}
        </Button>
      </CardContent>
    </Card>
  );
}

function BookingComCard() {
  const queryClient = useQueryClient();
  const [hotelId, setHotelId] = useState('');
  const [step, setStep] = useState<'idle' | 'guide' | 'done'>('idle');

  const connectMutation = useMutation({
    mutationFn: () =>
      api('/api/sync/channex', {
        method: 'POST',
        json: { config: { channel: 'booking', hotelId } },
      }),
    onSuccess: () => {
      toast.success('¡Booking.com conectado! La sincronización comienza en minutos.');
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['sync'] });
    },
    onError: (err: ApiError) =>
      toast.error(err.message ?? 'No pudimos conectar. Verificá el Hotel ID e intentá de nuevo.'),
  });

  if (step === 'done') {
    return <ConnectedCard title="Booking.com conectado" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-2xl">🅱️</span>
          Booking.com
        </CardTitle>
        <CardDescription>
          Sincronización en tiempo real. Las reservas de Booking aparecen automáticamente en
          Impacto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'idle' && <Button onClick={() => setStep('guide')}>Conectar Booking.com</Button>}

        {step === 'guide' && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-md border bg-muted/30 p-4">
              <p className="text-sm font-medium">Seguí estos pasos en Booking.com:</p>
              <ol className="space-y-3 text-sm">
                <GuideStep number={1}>
                  <div>
                    <p>Entrá a tu extranet de Booking.com</p>
                    <a
                      href="https://admin.booking.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary"
                    >
                      admin.booking.com <ExternalLink className="size-3" />
                    </a>
                  </div>
                </GuideStep>

                <GuideStep number={2}>
                  <p>
                    Andá a <strong>Cuenta → Conectividad → Proveedores de conectividad</strong>
                  </p>
                </GuideStep>

                <GuideStep number={3}>
                  <p>
                    Buscá <strong>"Channex"</strong> en la lista y hacé click en Conectar
                  </p>
                </GuideStep>

                <GuideStep number={4}>
                  <p>
                    Aceptá los términos y copiá tu <strong>Hotel ID</strong> (lo ves arriba en la
                    barra de navegación)
                  </p>
                </GuideStep>

                <GuideStep number={5}>
                  <div className="flex-1 space-y-1">
                    <label
                      htmlFor="booking-hotel-id"
                      className="block text-xs font-medium text-muted-foreground"
                    >
                      Pegá tu Hotel ID acá:
                    </label>
                    <input
                      id="booking-hotel-id"
                      type="text"
                      value={hotelId}
                      onChange={(e) => setHotelId(e.target.value)}
                      placeholder="Ej: 1234567"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </GuideStep>
              </ol>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                La conexión puede tardar hasta 24-48hs en activarse del lado de Booking.com. Te
                notificamos cuando esté lista.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('idle')}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={!hotelId.trim() || connectMutation.isPending}
                onClick={() => connectMutation.mutate()}
              >
                {connectMutation.isPending && <Loader2 className="size-3 animate-spin" />}
                Confirmar conexión
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AirbnbCard() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'idle' | 'guide' | 'done'>('idle');

  const connectMutation = useMutation({
    mutationFn: () =>
      api('/api/sync/channex', {
        method: 'POST',
        json: { config: { channel: 'airbnb' } },
      }),
    onSuccess: () => {
      toast.success('¡Airbnb conectado! La sincronización comienza en minutos.');
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['sync'] });
    },
    onError: (err: ApiError) =>
      toast.error(err.message ?? 'No pudimos conectar. Intentá de nuevo.'),
  });

  if (step === 'done') {
    return <ConnectedCard title="Airbnb conectado" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-2xl">🏠</span>
          Airbnb
        </CardTitle>
        <CardDescription>
          Sincronización en tiempo real. Las reservas de Airbnb aparecen automáticamente en Impacto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'idle' && <Button onClick={() => setStep('guide')}>Conectar Airbnb</Button>}

        {step === 'guide' && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-md border bg-muted/30 p-4">
              <p className="text-sm font-medium">Seguí estos pasos:</p>
              <ol className="space-y-3 text-sm">
                <GuideStep number={1}>
                  <div>
                    <p>Entrá a tu cuenta de Airbnb como anfitrión</p>
                    <a
                      href="https://www.airbnb.com/hosting"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary"
                    >
                      airbnb.com/hosting <ExternalLink className="size-3" />
                    </a>
                  </div>
                </GuideStep>

                <GuideStep number={2}>
                  <p>
                    Andá a{' '}
                    <strong>
                      Anuncios → Herramientas de anfitrión → Software de gestión de propiedades
                    </strong>
                  </p>
                </GuideStep>

                <GuideStep number={3}>
                  <p>
                    Buscá <strong>"Channex"</strong> y hacé click en <strong>Conectar</strong>
                  </p>
                </GuideStep>

                <GuideStep number={4}>
                  <p>Autorizá el acceso y volvé acá</p>
                </GuideStep>
              </ol>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-sky-300 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950/20">
              <BookOpen className="mt-0.5 size-4 shrink-0 text-sky-600" />
              <p className="text-xs text-sky-800 dark:text-sky-200">
                Si ya tenés otro channel manager conectado en Airbnb, primero desconectalo antes de
                continuar.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('idle')}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={connectMutation.isPending}
                onClick={() => connectMutation.mutate()}
              >
                {connectMutation.isPending && <Loader2 className="size-3 animate-spin" />}
                Ya autoricé el acceso
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Subcomponente reutilizable para los items de la lista de pasos
function GuideStep({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {number}
      </span>
      {children}
    </li>
  );
}

// Subcomponente reutilizable para el estado 'conectado'
function ConnectedCard({ title }: { title: string }) {
  return (
    <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20">
      <CardContent className="flex items-center gap-3 p-6">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <div>
          <p className="font-semibold text-emerald-900 dark:text-emerald-100">{title}</p>
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Tu disponibilidad y precios se sincronizan automáticamente.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
