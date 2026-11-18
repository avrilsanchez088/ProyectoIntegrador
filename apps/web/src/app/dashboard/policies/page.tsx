'use client';

import { ApiError, api } from '@/lib/api';
import type { ApiList, Unit } from '@impacto/shared';
import { Skeleton } from '@impacto/ui/skeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { Policy, PricingRule } from './_lib/types';

/**
 * Policies + rules page con lazy-load de secciones (propuesta 112.2 ronda 9)
 * + tabs URL-driven (propuesta 112.1 ronda 9). El user que solo quiere ver
 * cancellation policies no descarga el form gigante de pricing rules.
 *
 * URL state: `?section=policies | rules`. Default: `policies`.
 */

const PoliciesSection = dynamic(
  () => import('./_components/policies-section').then((m) => m.PoliciesSection),
  { loading: () => <SectionSkeleton />, ssr: false },
);
const RulesSection = dynamic(
  () => import('./_components/rules-section').then((m) => m.RulesSection),
  { loading: () => <SectionSkeleton />, ssr: false },
);

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export default function PoliciesPage() {
  const params = useSearchParams();
  const section = params.get('section') === 'rules' ? 'rules' : 'policies';
  const queryClient = useQueryClient();

  const policiesQuery = useQuery({
    queryKey: ['cancellation-policies'],
    queryFn: () => api<{ data: Policy[] }>('/api/policies/cancellation').then((r) => r.data),
    staleTime: 60_000,
    enabled: section === 'policies',
  });
  const rulesQuery = useQuery({
    queryKey: ['pricing-rules'],
    queryFn: () => api<{ data: PricingRule[] }>('/api/policies/rules').then((r) => r.data),
    staleTime: 60_000,
    enabled: section === 'rules',
  });
  const unitsQuery = useQuery({
    queryKey: ['units', 'list'],
    queryFn: () => api<ApiList<Unit>>('/api/units').then((r) => r.data),
    staleTime: 60_000,
  });

  const policies = policiesQuery.data;
  const rules = rulesQuery.data;
  const units = unitsQuery.data ?? [];

  const fetchError = policiesQuery.error ?? rulesQuery.error ?? unitsQuery.error;
  useEffect(() => {
    if (fetchError) {
      toast.error(fetchError instanceof ApiError ? fetchError.message : 'Error');
    }
  }, [fetchError]);

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ['cancellation-policies'] });
    queryClient.invalidateQueries({ queryKey: ['pricing-rules'] });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Políticas y reglas</h1>
        <p className="text-muted-foreground">
          Cancelaciones y reglas de pricing extras (mínimo de noches, descuentos, weekend premium).
        </p>
      </div>

      {/* Tabs URL-driven */}
      <nav className="mb-6 flex gap-1 border-b" aria-label="Secciones de políticas">
        <TabLink section="policies" current={section}>
          Cancelación
        </TabLink>
        <TabLink section="rules" current={section}>
          Reglas pricing
        </TabLink>
      </nav>

      {section === 'policies' &&
        (policies === undefined ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : (
          <PoliciesSection policies={policies} units={units} onChange={reload} />
        ))}

      {section === 'rules' &&
        (rules === undefined ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : (
          <RulesSection rules={rules} units={units} onChange={reload} />
        ))}
    </div>
  );
}

function TabLink({
  section,
  current,
  children,
}: {
  section: 'policies' | 'rules';
  current: string;
  children: React.ReactNode;
}) {
  const active = section === current;
  return (
    <a
      href={`?section=${section}`}
      className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-b-2 border-primary text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </a>
  );
}
