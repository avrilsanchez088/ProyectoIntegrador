'use client';

import { useSession } from '@/lib/auth-client';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Loader2, Plus } from 'lucide-react';
import Link from 'next/link';

/**
 * Wrapper para pages del dashboard que necesitan un workspace activo.
 *
 * Centraliza el guard que se repetía en properties/page, bookings/page,
 * etc. (G9.2). Si la sesión está cargando muestra un Loader; si no hay
 * workspace activo muestra una card con CTA a /onboarding/workspace; si
 * hay sesión + workspace, renderiza children con el orgId garantizado.
 *
 * Uso:
 *   <RequireWorkspace>
 *     {({ orgId, session }) => <PageContent orgId={orgId} />}
 *   </RequireWorkspace>
 */
export function RequireWorkspace({
  children,
}: {
  children: (ctx: {
    orgId: string;
    session: ReturnType<typeof useSession>['data'];
  }) => React.ReactNode;
}) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return null;

  const orgId = session.session.activeOrganizationId;

  if (!orgId) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Sin workspace activo</CardTitle>
            <CardDescription>
              Creá un workspace para empezar a cargar tus alojamientos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/onboarding/workspace">
                <Plus /> Crear workspace
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children({ orgId, session })}</>;
}
