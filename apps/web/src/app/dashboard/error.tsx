'use client';

import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Error boundary del segmento /dashboard. Next.js lo usa cuando un page o
 * layout server component tira. Muestra una card con acciones de recovery.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard error]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-12">
      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <CardTitle>Algo salió mal</CardTitle>
          <CardDescription>
            {error.message || 'No pudimos cargar esta sección. Probá de nuevo.'}
            {error.digest ? (
              <span className="mt-2 block font-mono text-xs">ID: {error.digest}</span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={reset} variant="default">
            <RefreshCw /> Reintentar
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">
              <Home /> Volver al inicio
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
