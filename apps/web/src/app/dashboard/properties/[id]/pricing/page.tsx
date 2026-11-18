'use client';

import { ApiError, api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Skeleton } from '@impacto/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { Fee, Rate, Season, Unit } from './_lib/types';

/**
 * Lazy-load de las 3 secciones (propuesta 39.1 ronda 4 / 53 ronda 5).
 * El user que sólo quiere ver Fees no descarga código de Seasons + Rates.
 * Reduce bundle ~30% en este page.
 */
const SeasonsSection = dynamic(
  () => import('./_components/seasons-section').then((m) => m.SeasonsSection),
  { loading: () => <SectionSkeleton />, ssr: false },
);
const RatesSection = dynamic(
  () => import('./_components/rates-section').then((m) => m.RatesSection),
  { loading: () => <SectionSkeleton />, ssr: false },
);
const FeesSection = dynamic(() => import('./_components/fees-section').then((m) => m.FeesSection), {
  loading: () => <SectionSkeleton />,
  ssr: false,
});

function SectionSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border p-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/**
 * Pricing page: composición de las 3 secciones (Seasons / Rates / Fees).
 *
 * Pre-refactor (§8.2 del audit): un único archivo de 1048 líneas con todos
 * los subcomponentes inline. Post-refactor: ~100 líneas acá + 3 archivos en
 * `_components/` que pueden testearse y lazy-loadearse independientemente.
 *
 * El reload se hace via `refetch()` de cada query cuando un subform
 * crea/elimina, así toda la pantalla refresca consistente.
 */
type PricingTab = 'seasons' | 'rates' | 'fees';

export default function PricingPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const search = useSearchParams();
  const tabParam = search.get('section');
  const tab: PricingTab = tabParam === 'rates' || tabParam === 'fees' ? tabParam : 'seasons';

  const seasonsQuery = useQuery({
    queryKey: ['seasons', propertyId],
    queryFn: () =>
      api<{ data: Season[] }>(`/api/seasons?propertyId=${propertyId}`).then((r) =>
        r.data.sort((a, b) => a.startDate.localeCompare(b.startDate)),
      ),
    staleTime: 30_000,
  });

  const unitsQuery = useQuery({
    queryKey: ['units', 'property', propertyId],
    queryFn: () => api<{ data: Unit[] }>(`/api/units?propertyId=${propertyId}`).then((r) => r.data),
    staleTime: 60_000,
  });

  // Rates y fees se filtran client-side a las units de esta property.
  const unitIds = new Set((unitsQuery.data ?? []).map((u) => u.id));
  const unitIdsKey = [...unitIds].sort().join(',');
  const ratesQuery = useQuery({
    queryKey: ['rates', 'property', propertyId, unitIdsKey],
    queryFn: () =>
      api<{ data: Rate[] }>('/api/rates').then((r) => r.data.filter((x) => unitIds.has(x.unitId))),
    enabled: unitsQuery.data !== undefined,
    staleTime: 30_000,
  });
  const feesQuery = useQuery({
    queryKey: ['fees', 'property', propertyId, unitIdsKey],
    queryFn: () =>
      api<{ data: Fee[] }>('/api/policies/fees').then((r) =>
        r.data.filter((x) => unitIds.has(x.unitId)),
      ),
    enabled: unitsQuery.data !== undefined,
    staleTime: 30_000,
  });

  const reload = () => {
    seasonsQuery.refetch();
    unitsQuery.refetch();
    ratesQuery.refetch();
    feesQuery.refetch();
  };

  // Reportar errores de fetch como toast (no bloquean la página).
  const fetchError = seasonsQuery.error ?? unitsQuery.error ?? ratesQuery.error ?? feesQuery.error;
  useEffect(() => {
    if (fetchError) {
      toast.error(fetchError instanceof ApiError ? fetchError.message : 'Error cargando pricing');
    }
  }, [fetchError]);

  const isLoading =
    seasonsQuery.isPending || unitsQuery.isPending || ratesQuery.isPending || feesQuery.isPending;

  return (
    <div className="mx-auto max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft aria-hidden="true" /> Volver a la propiedad
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Tarifas y temporadas</h1>
        <p className="text-muted-foreground">
          Definí las temporadas (rangos de fecha) y el precio por noche que cada unidad tiene en
          cada una.
        </p>
      </div>

      {/* Tabs URL-driven (propuesta 112.1 ronda 9). */}
      <nav className="mb-6 flex gap-1 border-b" aria-label="Secciones de pricing">
        <PricingTabLink propertyId={propertyId} section="seasons" current={tab}>
          Temporadas
        </PricingTabLink>
        <PricingTabLink propertyId={propertyId} section="rates" current={tab}>
          Tarifas
        </PricingTabLink>
        <PricingTabLink propertyId={propertyId} section="fees" current={tab}>
          Fees
        </PricingTabLink>
      </nav>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : (
        <>
          {tab === 'seasons' && (
            <SeasonsSection
              propertyId={propertyId}
              seasons={seasonsQuery.data ?? []}
              onChange={reload}
            />
          )}
          {tab === 'rates' && (
            <RatesSection
              seasons={seasonsQuery.data ?? []}
              units={unitsQuery.data ?? []}
              rates={ratesQuery.data ?? []}
              onChange={reload}
            />
          )}
          {tab === 'fees' && (
            <FeesSection
              units={unitsQuery.data ?? []}
              fees={feesQuery.data ?? []}
              onChange={reload}
            />
          )}
        </>
      )}
    </div>
  );
}

function PricingTabLink({
  propertyId,
  section,
  current,
  children,
}: {
  propertyId: string;
  section: PricingTab;
  current: PricingTab;
  children: React.ReactNode;
}) {
  const active = section === current;
  return (
    <Link
      href={`/dashboard/properties/${propertyId}/pricing?section=${section}` as never}
      className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-b-2 border-primary text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
