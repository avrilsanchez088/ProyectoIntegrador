import { PublicFooter } from '@/components/marketing/public-footer';
import { PublicNav } from '@/components/marketing/public-nav';
import { Reveal } from '@/components/marketing/reveal';
import { WhatsAppDemo } from '@/components/marketing/whatsapp-demo';
import { Button } from '@impacto/ui/button';
import { Skeleton } from '@impacto/ui/skeleton';
import dynamic from 'next/dynamic';

// Below-the-fold: lazy-load para mejorar LCP del hero.
// Comparison es server-component, RoiCalculator y Faq son client.
// Skeleton placeholder con altura cercana a la real para evitar CLS.
const RoiCalculator = dynamic(
  () => import('@/components/marketing/roi-calculator').then((m) => m.RoiCalculator),
  { loading: () => <Skeleton className="mx-auto h-96 max-w-4xl" /> },
);
const Comparison = dynamic(
  () => import('@/components/marketing/comparison').then((m) => m.Comparison),
  { loading: () => <Skeleton className="mx-auto h-96 max-w-5xl" /> },
);
const Faq = dynamic(() => import('@/components/marketing/faq').then((m) => m.Faq), {
  loading: () => <Skeleton className="mx-auto h-96 max-w-3xl" />,
});
import { Card, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CreditCard,
  MessageCircle,
  Sparkles,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      <PublicNav />
      <main>
        {/* ─── Hero ─── */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-blue-950/20 dark:via-background dark:to-purple-950/20" />

          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
            <Reveal>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-secondary-foreground">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Hecho en LATAM, para LATAM
              </div>

              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Dejá de perder reservas{' '}
                <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  mientras dormís.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                El bot de WhatsApp con IA que cotiza, reserva y cobra seña 24/7. Sincroniza Booking,
                Airbnb y Google Calendar en un solo lugar. Para alojamientos chicos y medianos en
                Argentina y Uruguay.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" variant="brand">
                  <Link href="/sign-up">
                    Crear cuenta gratis <ArrowRight className="ml-2" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#como-funciona">Ver cómo funciona</a>
                </Button>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-emerald-600" />
                  Sin tarjeta de crédito
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="size-3.5 text-amber-500" />
                  Onboarding 10 min
                </span>
                <span>1 unidad gratis para siempre</span>
              </div>
            </Reveal>

            <Reveal delay={0.15} y={24}>
              <WhatsAppDemo />
            </Reveal>
          </div>
        </section>

        {/* ─── Cómo funciona / 4 features ─── */}
        <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Una sola consola, todos los canales
            </h2>
            <p className="mt-3 text-muted-foreground">
              El bot atiende, el calendario sincroniza, vos cobrás. Sin saltar entre apps.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Reveal delay={0}>
              <FeatureCard
                icon={<MessageCircle />}
                title="Bot WhatsApp 24/7"
                desc="Responde, cotiza, recomienda unidades y cobra seña sin que toques el teclado."
              />
            </Reveal>
            <Reveal delay={0.1}>
              <FeatureCard
                icon={<Calendar />}
                title="Calendario único"
                desc="Sincronizá Booking, Airbnb y Google Calendar. Anti-overbooking a nivel base de datos."
              />
            </Reveal>
            <Reveal delay={0.2}>
              <FeatureCard
                icon={<CreditCard />}
                title="Cobros con MP"
                desc="Mercado Pago integrado para seña + cobros finales. Stripe para huéspedes internacionales."
              />
            </Reveal>
            <Reveal delay={0.3}>
              <FeatureCard
                icon={<BarChart3 />}
                title="Atribución Meta"
                desc="Cada reserva confirmada vuelve a Meta como Purchase real. Tu ROAS finalmente medible."
              />
            </Reveal>
          </div>
        </section>

        {/* ─── ROI Calculator ─── */}
        <Reveal>
          <RoiCalculator />
        </Reveal>

        {/* ─── Comparison table ─── */}
        <section id="comparativa">
          <Reveal>
            <Comparison />
          </Reveal>
        </section>

        {/* ─── FAQ ─── */}
        <section id="faq">
          <Reveal>
            <Faq />
          </Reveal>
        </section>

        {/* ─── Final CTA ─── */}
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Tu próxima reserva está esperando una respuesta.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Probá Impacto con tu primera unidad gratis. Sin tarjeta. Sin lock-in.
            </p>
            <div className="mt-8">
              <Button asChild size="lg" variant="brand">
                <Link href="/sign-up">
                  Crear cuenta gratis <ArrowRight className="ml-2" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Card className="h-full transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-md">
      <CardHeader>
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 text-blue-600">
          {icon}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
    </Card>
  );
}
