import { cn } from '@impacto/ui/utils';

/**
 * Skeleton placeholder. Reemplaza spinners para cargas largas — la UI no
 * "salta" al cargar la data porque el espacio ya está reservado.
 *
 * Uso:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-12 w-full" />
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

/**
 * Tabla skeleton. Útil para listas mientras llega data.
 */
export function TableSkeleton({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  const rowKeys = Array.from({ length: rows }, (_, i) => `r${i}`);
  const colKeys = Array.from({ length: cols }, (_, i) => `c${i}`);
  return (
    <div className="space-y-2">
      {rowKeys.map((rk) => (
        <div key={rk} className="flex gap-3">
          {colKeys.map((ck, j) => (
            <Skeleton
              key={ck}
              className={`h-8 ${j === 0 ? 'w-24' : j === cols - 1 ? 'w-20' : 'flex-1'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Card skeleton para grids de items (bookings, units, propiedades).
 */
export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}
