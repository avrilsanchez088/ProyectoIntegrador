'use client';

/**
 * Página pública para solicitudes ARCO/GDPR (propuestas 158.1 + 158.2 ronda 13).
 *
 * Diseño:
 *  - Sin auth (huéspedes no tienen account en el sistema).
 *  - El form pide email + organizationId + action + notes.
 *  - El organizationId típicamente viene en la URL (link que el alojamiento
 *    pone en su email firmado): `/privacy/requests?org=<id>`.
 */

import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Shield } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';

// Next.js 15 exige Suspense alrededor de useSearchParams para no romper SSG.
// Wrappeamos el client component que lo consume.
export default function GdprRequestPage() {
  return (
    <Suspense
      fallback={<div className="mx-auto max-w-xl px-6 py-12 text-muted-foreground">Cargando…</div>}
    >
      <GdprRequestForm />
    </Suspense>
  );
}

function GdprRequestForm() {
  const search = useSearchParams();
  const orgFromUrl = search.get('org') ?? '';

  const [email, setEmail] = useState('');
  const [organizationId, setOrganizationId] = useState(orgFromUrl);
  const [action, setAction] = useState<'export' | 'delete'>('export');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState<{
    id: string;
    message: string;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/gdpr/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          email,
          action,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? 'Error');
      }
      return data;
    },
    onSuccess: (res) => {
      setSubmitted({ id: res.data.id, message: res.data.message });
    },
  });

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20">
          <CardHeader>
            <CheckCircle2 className="size-8 text-emerald-600" aria-hidden="true" />
            <CardTitle>Solicitud registrada</CardTitle>
            <CardDescription>{submitted.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">ID de seguimiento: {submitted.id}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <Card>
        <CardHeader>
          <Shield className="size-8 text-muted-foreground" aria-hidden="true" />
          <CardTitle>Solicitud sobre tus datos personales</CardTitle>
          <CardDescription>
            Por GDPR / ARCO podés pedir que el alojamiento te envíe una copia de la información que
            tiene sobre vos (export) o que la anonimice (eliminación). Procesamos en hasta 7 días
            hábiles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label htmlFor="gdpr-org">ID del alojamiento</Label>
              <Input
                id="gdpr-org"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                placeholder="organization id"
                required
                readOnly={!!orgFromUrl}
                className={orgFromUrl ? 'bg-muted/30' : ''}
              />
              <p className="text-xs text-muted-foreground">
                Lo encontrás en el email que recibiste o en la web del alojamiento.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="gdpr-email">Tu email</Label>
              <Input
                id="gdpr-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="vos@ejemplo.com"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="gdpr-action">Tipo de solicitud</Label>
              <select
                id="gdpr-action"
                value={action}
                onChange={(e) => setAction(e.target.value as 'export' | 'delete')}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="export">Quiero una copia de mis datos</option>
                <option value="delete">Quiero que eliminen mis datos</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="gdpr-notes">Notas (opcional)</Label>
              <textarea
                id="gdpr-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Algo más que quieras aclarar…"
                className="flex w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              />
            </div>

            {mutation.error && (
              <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                {(mutation.error as Error).message}
              </div>
            )}

            <Button type="submit" disabled={mutation.isPending || !email || !organizationId}>
              {mutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Enviar solicitud
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
