'use client';

import { authClient, useSession } from '@/lib/auth-client';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'needs_login'; invitationId: string }
  | { kind: 'ready'; invitationId: string; orgName?: string }
  | { kind: 'accepted' }
  | { kind: 'error'; message: string };

/**
 * Aterrizaje del link de invitación: /accept-invitation/[id]
 *
 * Flujo:
 * 1. Si no hay sesión → mostrar CTA "Iniciá sesión" o "Creá cuenta", preservando el id en query.
 * 2. Si hay sesión → llamar a authClient.organization.acceptInvitation.
 * 3. Si OK → toast + redirect a /dashboard.
 */
export default function AcceptInvitationPage() {
  const params = useParams<{ id: string }>();
  const invitationId = params.id;
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      setView({ kind: 'needs_login', invitationId });
      return;
    }
    setView({ kind: 'ready', invitationId });
  }, [isPending, session, invitationId]);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      const res = await authClient.organization.acceptInvitation({ invitationId });
      // biome-ignore lint/suspicious/noExplicitAny: better-auth response shape variable
      if ((res as any).error) {
        // biome-ignore lint/suspicious/noExplicitAny: same as above
        const msg = (res as any).error.message ?? 'No se pudo aceptar la invitación.';
        setView({ kind: 'error', message: msg });
        toast.error(msg);
        return;
      }
      setView({ kind: 'accepted' });
      toast.success('¡Te uniste al workspace!');
      router.push('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado.';
      setView({ kind: 'error', message: msg });
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Invitación a un workspace</CardTitle>
            <CardDescription>
              {view.kind === 'needs_login'
                ? 'Iniciá sesión o creá una cuenta para aceptar.'
                : view.kind === 'accepted'
                  ? 'Te uniste correctamente. Te llevamos al dashboard...'
                  : view.kind === 'error'
                    ? view.message
                    : 'Hacé click en aceptar para sumarte al equipo.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {view.kind === 'loading' && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {view.kind === 'needs_login' && (
              <div className="grid gap-2">
                <Button asChild>
                  <Link href={`/sign-in?redirect=/accept-invitation/${invitationId}`}>
                    Iniciar sesión
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/sign-up?redirect=/accept-invitation/${invitationId}`}>
                    Crear cuenta
                  </Link>
                </Button>
              </div>
            )}

            {view.kind === 'ready' && (
              <Button onClick={handleAccept} disabled={submitting} className="w-full">
                {submitting && <Loader2 className="animate-spin" />}
                Aceptar invitación
              </Button>
            )}

            {view.kind === 'error' && (
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard">Ir al dashboard</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
