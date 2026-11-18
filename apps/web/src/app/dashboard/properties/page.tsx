'use client';

import { RequireWorkspace } from '@/components/dashboard/require-workspace';
import { AsyncList } from '@/components/ui/async-list';
import { api } from '@/lib/api';
import type { ApiList, Property } from '@impacto/shared';
import { Button } from '@impacto/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import Link from 'next/link';

/**
 * Pattern reference: page de listado migrada a TanStack Query (G7.1) +
 * RequireWorkspace (G9.2) + AsyncList (G8.1).
 *
 * Comparación con la versión anterior:
 *   antes: 130 líneas con triple ternary loading/error/empty/data
 *   ahora: 60 líneas, declarativo, con cache 30s y refetch manual.
 */
export default function PropertiesPage() {
  return <RequireWorkspace>{({ orgId }) => <PropertiesView orgId={orgId} />}</RequireWorkspace>;
}

function PropertiesView({ orgId }: { orgId: string }) {
  const propertiesQuery = useQuery({
    queryKey: ['properties', orgId],
    queryFn: () => api<ApiList<Property>>('/api/properties').then((r) => r.data),
    staleTime: 30_000,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Propiedades</h1>
          <p className="text-muted-foreground">
            Tus alojamientos. Cada uno tiene sus propias unidades.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/properties/new">
            <Plus /> Nueva propiedad
          </Link>
        </Button>
      </div>

      <AsyncList
        query={propertiesQuery}
        empty={{
          illustration: 'properties',
          title: 'Tu primera propiedad',
          description:
            'Cargá un alojamiento (puede ser un complejo, un hotel, una casa). Después agregás las unidades reservables adentro.',
          actionLabel: 'Crear propiedad',
          actionHref: '/dashboard/properties/new',
        }}
      >
        {(properties) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => (
              <Link key={p.id} href={`/dashboard/properties/${p.id}`}>
                <Card className="h-full transition-colors hover:border-primary">
                  <CardHeader>
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                      <Building2 className="size-5" aria-hidden="true" />
                    </div>
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                    <CardDescription>
                      {[p.city, p.country].filter(Boolean).join(' · ') || 'Sin ubicación'}
                      <span className="ml-2 inline-block rounded bg-muted px-1.5 py-0.5 text-xs uppercase">
                        {p.propertyType}
                      </span>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </AsyncList>
    </div>
  );
}
