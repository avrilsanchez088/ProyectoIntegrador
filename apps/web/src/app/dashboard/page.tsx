'use client';

import { KpiStrip } from '@/components/dashboard/kpi-strip';
import { OnboardingTour, useOnboardingTour } from '@/components/dashboard/onboarding-tour';
import { SetupChecklist } from '@/components/dashboard/setup-checklist';
import { authClient, useSession } from '@/lib/auth-client';
import { Button } from '@impacto/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { ArrowRight, Building2, CalendarDays, HelpCircle, Plus, RefreshCw } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data: orgs } = authClient.useListOrganizations();
  const activeOrg = session?.session.activeOrganizationId;
  const currentOrg = orgs?.find((o) => o.id === activeOrg) ?? orgs?.[0];

  if (!session) return null;

  // Sin workspace → mostrar onboarding minimal.
  if (!currentOrg) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">¡Hola, {session.user.name}!</h1>
        <p className="mb-8 text-muted-foreground">
          Antes de empezar, creá tu workspace (espacio de trabajo del alojamiento).
        </p>
        <Card>
          <CardHeader>
            <CardTitle>Crear tu primer workspace</CardTitle>
            <CardDescription>
              Un workspace agrupa todas las propiedades de un mismo dueño. Toma 30 segundos.
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <Button asChild>
              <Link href="/onboarding/workspace">
                <Plus /> Crear workspace
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return <DashboardHome session={session} currentOrgName={currentOrg.name} />;
}

function DashboardHome({
  session,
  currentOrgName,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: Better Auth session shape variable
  session: any;
  currentOrgName: string;
}) {
  const tour = useOnboardingTour(true);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">¡Hola, {session.user.name}!</h1>
        <Button size="sm" variant="ghost" onClick={tour.start}>
          <HelpCircle aria-hidden="true" /> Ver tour
        </Button>
      </div>
      <p className="mb-8 text-muted-foreground">
        Estás trabajando en <span className="font-medium text-foreground">{currentOrgName}</span>.
      </p>

      <SetupChecklist />

      <KpiStrip />

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickAction
          href="/dashboard/bookings/new"
          icon={<CalendarDays />}
          title="Cargar reserva manual"
          desc="Reserva tomada por teléfono u otro canal"
        />
        <QuickAction
          href="/dashboard/properties/new"
          icon={<Building2 />}
          title="Nueva propiedad"
          desc="Registrar otro alojamiento en este workspace"
        />
        <QuickAction
          href="/dashboard/calendars"
          icon={<RefreshCw />}
          title="Conectar Booking / Airbnb"
          desc="Sincronizar feeds iCal externos"
        />
      </div>

      <OnboardingTour open={tour.open} onClose={tour.close} />
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  desc,
}: {
  href: Route;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
        <CardHeader>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              {icon}
            </div>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
