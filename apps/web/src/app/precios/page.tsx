import { Faq } from '@/components/marketing/faq';
import { PublicFooter } from '@/components/marketing/public-footer';
import { PublicNav } from '@/components/marketing/public-nav';
import { Reveal } from '@/components/marketing/reveal';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { ArrowRight, Check, Minus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Precios — desde gratis para tu primera unidad',
  description:
    'Plan Free para 1 unidad y 100 mensajes/mes, Pro USD 29 hasta 5 unidades, Business USD 99 hasta 30 unidades. Sin tarjeta de crédito. Cancelable cuando quieras.',
  alternates: { canonical: '/precios' },
  openGraph: {
    title: 'Precios — Impacto',
    description: 'Empezá gratis con 1 unidad. Pro desde USD 29. Sin tarjeta para arrancar.',
    url: '/precios',
  },
};

interface Plan {
  name: string;
  price: string;
  priceSuffix: string;
  description: string;
  highlight?: boolean;
  cta: string;
  ctaHref: '/sign-up' | 'mailto:hola@impacto.app';
  features: { label: string; included: boolean | string }[];
}

const PLANS: Plan[] = [
  {
    name: 'Free',
    price: 'USD 0',
    priceSuffix: 'para siempre',
    description: 'Probá Impacto con tu primera unidad. Sin tarjeta de crédito.',
    cta: 'Crear cuenta gratis',
    ctaHref: '/sign-up',
    features: [
      { label: 'Hasta 1 unidad reservable', included: true },
      { label: '100 mensajes WhatsApp/mes', included: true },
      { label: 'Sincronización Booking + Airbnb', included: true },
      { label: 'Cobros con Mercado Pago', included: true },
      { label: 'Dashboard + reportes básicos', included: true },
      { label: 'Atribución a Meta Ads', included: false },
      { label: 'Soporte por email', included: '48h' },
    ],
  },
  {
    name: 'Pro',
    price: 'USD 29',
    priceSuffix: 'por mes',
    description: 'Para alojamientos chicos con flujo regular de reservas.',
    highlight: true,
    cta: 'Empezar prueba',
    ctaHref: '/sign-up',
    features: [
      { label: 'Hasta 5 unidades reservables', included: true },
      { label: '1.000 mensajes WhatsApp/mes', included: true },
      { label: 'Sincronización Booking + Airbnb + GCal', included: true },
      { label: 'Cobros con Mercado Pago + Stripe', included: true },
      { label: 'Reportes avanzados + ROAS', included: true },
      { label: 'Atribución a Meta Ads (CAPI)', included: true },
      { label: 'Soporte por WhatsApp', included: '24h' },
    ],
  },
  {
    name: 'Business',
    price: 'USD 99',
    priceSuffix: 'por mes',
    description: 'Para complejos medianos con múltiples unidades y staff.',
    cta: 'Hablar con ventas',
    ctaHref: 'mailto:hola@impacto.app',
    features: [
      { label: 'Hasta 30 unidades reservables', included: true },
      { label: '5.000 mensajes WhatsApp/mes', included: true },
      { label: 'Multi-property + multi-tenant', included: true },
      { label: 'Roles y permisos avanzados', included: true },
      { label: 'API access + webhooks', included: true },
      { label: 'Custom branding del bot', included: true },
      { label: 'Soporte prioritario', included: '4h' },
    ],
  },
];

const COMPARE_ROWS = [
  { feature: 'Unidades reservables', free: '1', pro: '5', business: '30' },
  { feature: 'Mensajes WhatsApp/mes', free: '100', pro: '1.000', business: '5.000' },
  { feature: 'Booking + Airbnb sync', free: true, pro: true, business: true },
  { feature: 'Mercado Pago', free: true, pro: true, business: true },
  { feature: 'Stripe', free: false, pro: true, business: true },
  { feature: 'Atribución Meta Ads (CAPI)', free: false, pro: true, business: true },
  { feature: 'Multi-property', free: false, pro: false, business: true },
  { feature: 'Roles y permisos', free: 'Owner solo', pro: '4 roles', business: '4 roles + custom' },
  { feature: 'API access', free: false, pro: false, business: true },
  { feature: 'SLA de soporte', free: '48h email', pro: '24h WhatsApp', business: '4h prioritario' },
] as const;

export default function PricingPage() {
  return (
    <>
      <PublicNav />
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 py-16 text-center sm:py-24">
          <Reveal>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-secondary-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Empezá gratis · sin tarjeta
            </div>
            <h1 className="mb-4 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Precios{' '}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                simples y transparentes.
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Pagás solo cuando creces. Cancelás cuando querés. Sin lock-in ni costos ocultos.
            </p>
          </Reveal>
        </section>

        {/* Plans */}
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 0.08}>
                <PlanCard plan={plan} />
              </Reveal>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Todos los planes en USD. Cobrable en pesos AR/UY al tipo de cambio del día.
          </p>
        </section>

        {/* Compare table */}
        <section className="mx-auto max-w-5xl px-6 py-16">
          <Reveal>
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Compará en detalle
              </h2>
              <p className="mt-3 text-muted-foreground">
                Todas las features lado a lado. ¿Tenés dudas? Escribinos.
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="[&>th]:px-4 [&>th]:py-3">
                    <th className="text-left text-muted-foreground">Característica</th>
                    <th className="text-center">Free</th>
                    <th className="bg-blue-50/50 text-center font-semibold dark:bg-blue-950/20">
                      Pro
                    </th>
                    <th className="text-center">Business</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row) => (
                    <tr
                      key={row.feature}
                      className="border-b last:border-b-0 [&>td]:px-4 [&>td]:py-3"
                    >
                      <td>{row.feature}</td>
                      <CompareCell value={row.free} />
                      <CompareCell value={row.pro} highlight />
                      <CompareCell value={row.business} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </section>

        {/* FAQ (re-uses landing FAQ) */}
        <section id="faq">
          <Reveal>
            <Faq />
          </Reveal>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-3xl px-6 py-20 text-center">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              ¿Listo para que el bot atienda tus reservas?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Crear cuenta gratis toma 2 minutos. Tu primera unidad es gratis para siempre.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="brand">
                <Link href="/sign-up">
                  Crear cuenta gratis <ArrowRight className="ml-2" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="mailto:hola@impacto.app">Hablar con ventas</a>
              </Button>
            </div>
          </Reveal>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <Card
      className={`relative h-full transition-all ${
        plan.highlight
          ? 'border-blue-500 shadow-lg shadow-blue-500/10 dark:border-blue-400'
          : 'hover:-translate-y-1 hover:shadow-md'
      }`}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
          Más popular
        </span>
      )}
      <CardHeader>
        <CardTitle className="text-2xl">{plan.name}</CardTitle>
        <div className="mt-3">
          <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
          <span className="ml-2 text-sm text-muted-foreground">{plan.priceSuffix}</span>
        </div>
        <CardDescription className="mt-2">{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <Button asChild variant={plan.highlight ? 'brand' : 'outline'} size="lg" className="w-full">
          {plan.ctaHref.startsWith('mailto:') ? (
            <a href={plan.ctaHref}>{plan.cta}</a>
          ) : (
            <Link href={plan.ctaHref}>{plan.cta}</Link>
          )}
        </Button>
        <ul className="mt-6 space-y-2.5 text-sm">
          {plan.features.map((f) => (
            <li key={f.label} className="flex items-start gap-2">
              {f.included ? (
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <Minus className="mt-0.5 size-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
              )}
              <span className={f.included ? '' : 'text-muted-foreground line-through'}>
                {f.label}
                {typeof f.included === 'string' && (
                  <span className="ml-1 text-xs text-muted-foreground">({f.included})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CompareCell({ value, highlight }: { value: boolean | string; highlight?: boolean }) {
  const cls = highlight ? 'bg-blue-50/50 dark:bg-blue-950/20' : '';
  if (value === true) {
    return (
      <td className={`text-center ${cls}`}>
        <Check className="mx-auto size-4 text-emerald-600" aria-label="Sí" />
      </td>
    );
  }
  if (value === false) {
    return (
      <td className={`text-center ${cls}`}>
        <Minus className="mx-auto size-4 text-zinc-300 dark:text-zinc-700" aria-label="No" />
      </td>
    );
  }
  return <td className={`text-center font-medium ${cls}`}>{value}</td>;
}
