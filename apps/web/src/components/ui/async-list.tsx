'use client';

import type { ApiError } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { EmptyState } from '@impacto/ui/empty-state';
import { CardSkeleton } from '@impacto/ui/skeleton';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Route } from 'next';

/**
 * Reemplaza el patrón ternario tower (loading → error → empty → data) que
 * estaba duplicado en 5 pages del dashboard (G8.1).
 *
 * Uso:
 *   const q = useQuery({ queryKey: [...], queryFn: ... });
 *   <AsyncList query={q} empty={{ illustration: 'properties', ... }}>
 *     {(items) => items.map(...)}
 *   </AsyncList>
 *
 * El loading muestra `skeletonCount` cards. El error muestra una card con
 * mensaje + botón Reintentar. El empty usa <EmptyState>.
 */

type IllustrationKey = 'calendar' | 'properties' | 'block' | 'sync' | 'policy' | 'inbox' | 'units';

interface EmptyConfig {
  illustration: IllustrationKey;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: Route;
}

interface AsyncListProps<T> {
  query: UseQueryResult<T[]>;
  empty: EmptyConfig;
  /** Cantidad de skeleton cards mientras `isPending`. Default 3. */
  skeletonCount?: number;
  /** Render de la lista con data ya cargada. */
  children: (items: T[]) => React.ReactNode;
  /** className para el wrapper de loading skeletons. */
  loadingClassName?: string;
}

export function AsyncList<T>({
  query,
  empty,
  skeletonCount = 3,
  children,
  loadingClassName = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
}: AsyncListProps<T>) {
  if (query.error) {
    const message = (query.error as ApiError).message ?? 'No pudimos cargar la información.';
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">No pudimos cargar la información</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => query.refetch()}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (query.isPending || !query.data) {
    return (
      <div className={loadingClassName}>
        {Array.from({ length: skeletonCount }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton estable por índice
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (query.data.length === 0) {
    return <EmptyState {...empty} />;
  }

  return <>{children(query.data)}</>;
}
