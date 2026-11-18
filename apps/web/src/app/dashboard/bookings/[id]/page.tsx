'use client';

import { ApiError, api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { useConfirm } from '@impacto/ui/confirm-dialog';
import { Skeleton } from '@impacto/ui/skeleton';
import { ArrowLeft, Copy, History, Loader2, Pencil, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type LineItem = {
  type: 'nights' | 'extra_guests' | 'fee' | 'discount' | 'premium';
  label: string;
  amountCents: number;
  refundable?: boolean;
};

type QuoteSnapshot = {
  nights?: number;
  avgNightlyRateCents?: number;
  lineItems?: LineItem[];
  computedAt?: string;
};

type Booking = {
  id: string;
  unitId: string;
  code: string;
  source: 'direct' | 'airbnb' | 'booking' | 'gcal' | 'manual' | 'ical';
  status: 'tentative' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
  checkIn: string;
  checkOut: string;
  guestsCount: number;
  petsCount: number;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  notes: string | null;
  subtotalCents: number;
  feesTotalCents: number;
  discountCents: number;
  totalCents: number;
  refundableTotalCents: number;
  currency: string;
  quoteSnapshot: QuoteSnapshot | null;
  externalUid: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_LABEL: Record<Booking['status'], string> = {
  tentative: 'Tentativa',
  confirmed: 'Confirmada',
  checked_in: 'En estadía',
  checked_out: 'Finalizada',
  cancelled: 'Cancelada',
  no_show: 'No-show',
};

const STATUS_TONE: Record<Booking['status'], string> = {
  tentative: 'bg-amber-100 text-amber-900',
  confirmed: 'bg-emerald-100 text-emerald-900',
  checked_in: 'bg-blue-100 text-blue-900',
  checked_out: 'bg-muted text-muted-foreground',
  cancelled: 'bg-rose-100 text-rose-900',
  no_show: 'bg-rose-100 text-rose-900',
};

const SOURCE_LABEL: Record<Booking['source'], string> = {
  direct: 'Directa',
  manual: 'Manual',
  airbnb: 'Airbnb',
  booking: 'Booking',
  gcal: 'GCal',
  ical: 'iCal',
};

const TRANSITIONS: Record<Booking['status'], Booking['status'][]> = {
  tentative: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['checked_out'],
  checked_out: [],
  cancelled: [],
  no_show: [],
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(cents: number, currency: string): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const reload = async () => {
    try {
      const res = await api<{ data: Booking }>(`/api/bookings/${params.id}`);
      setBooking(res.data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error';
      setError(msg);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload usa params.id implícitamente — re-fetch al cambiar booking
  useEffect(() => {
    reload();
  }, [params.id]);

  const setStatus = async (next: Booking['status']) => {
    if (!booking) return;
    if (next === 'cancelled') {
      const ok = await confirm({
        title: '¿Cancelar esta reserva?',
        description:
          'Libera la disponibilidad de la unidad y, según la política, calcula el reintegro.',
        confirmLabel: 'Cancelar reserva',
        cancelLabel: 'Volver',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api(`/api/bookings/${booking.id}`, { method: 'PATCH', json: { status: next } });
      toast.success('Estado actualizado');
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href="/dashboard/bookings">
            <ArrowLeft /> Volver
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">No encontramos esta reserva</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-9 w-24" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-32" />
      </div>
    );
  }

  const lineItems = booking.quoteSnapshot?.lineItems ?? [];
  const transitions = TRANSITIONS[booking.status];

  const isTerminal =
    booking.status === 'cancelled' ||
    booking.status === 'no_show' ||
    booking.status === 'checked_out';

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/bookings">
            <ArrowLeft /> Volver
          </Link>
        </Button>
        <div className="flex gap-2">
          {/* Duplicar — pre-rellena /bookings/new con datos del huésped (propuesta 115.1). */}
          <Button asChild variant="ghost" size="sm">
            <Link
              href={
                `/dashboard/bookings/new?${new URLSearchParams({
                  unitId: booking.unitId,
                  guestName: booking.guestName ?? '',
                  guestEmail: booking.guestEmail ?? '',
                  guestPhone: booking.guestPhone ?? '',
                  guestsCount: String(booking.guestsCount),
                  petsCount: String(booking.petsCount),
                }).toString()}` as never
              }
              title="Crear nueva reserva con datos de este huésped"
            >
              <Copy aria-hidden="true" /> Duplicar
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/dashboard/audit/row/bookings/${booking.id}` as never}
              title="Ver historial completo de cambios"
            >
              <History aria-hidden="true" /> Historial
            </Link>
          </Button>
          {!isTerminal && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/bookings/${booking.id}/edit`}>
                <Pencil aria-hidden="true" /> Editar
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{booking.code}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[booking.status]}`}>
              {STATUS_LABEL[booking.status]}
            </span>
            <span className="text-muted-foreground">· Origen: {SOURCE_LABEL[booking.source]}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold">
            {formatMoney(booking.totalCents, booking.currency)}
          </p>
          {booking.refundableTotalCents > 0 && (
            <p className="text-xs text-muted-foreground">
              Reembolsable: {formatMoney(booking.refundableTotalCents, booking.currency)}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estadía</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Check-in" value={formatDateTime(booking.checkIn)} />
            <Field label="Check-out" value={formatDateTime(booking.checkOut)} />
            <Field
              label="Pax"
              value={`${booking.guestsCount} huésped${booking.guestsCount === 1 ? '' : 'es'}${
                booking.petsCount > 0 ? ` · ${booking.petsCount} 🐾` : ''
              }`}
            />
            {booking.quoteSnapshot?.nights && (
              <Field label="Noches" value={String(booking.quoteSnapshot.nights)} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Huésped</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Nombre" value={booking.guestName ?? '—'} />
            <Field label="Email" value={booking.guestEmail ?? '—'} />
            <Field label="Teléfono" value={booking.guestPhone ?? '—'} />
            {booking.externalUid && (
              <Field
                label="UID externo"
                value={<code className="text-xs">{booking.externalUid}</code>}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {lineItems.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Cotización (snapshot)</CardTitle>
            <CardDescription>
              Generada al crear la reserva
              {booking.quoteSnapshot?.computedAt &&
                ` el ${formatDateTime(booking.quoteSnapshot.computedAt)}`}
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {lineItems.map((li, idx) => (
                  <tr key={`${li.type}-${idx}`} className="border-b last:border-b-0">
                    <td className="py-1.5">
                      {li.label}
                      {li.refundable && (
                        <span className="ml-2 rounded bg-emerald-100 px-1 text-xs text-emerald-900">
                          reembolsable
                        </span>
                      )}
                    </td>
                    <td
                      className={`py-1.5 text-right font-medium ${
                        li.amountCents < 0 ? 'text-emerald-700' : ''
                      }`}
                    >
                      {formatMoney(li.amountCents, booking.currency)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-2 font-semibold">Total</td>
                  <td className="pt-2 text-right font-semibold">
                    {formatMoney(booking.totalCents, booking.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {booking.notes && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Notas internas</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{booking.notes}</CardContent>
        </Card>
      )}

      {booking.cancelledAt && (
        <Card className="mt-4 border-rose-200">
          <CardHeader>
            <CardTitle className="text-base text-rose-900">Cancelada</CardTitle>
            <CardDescription>{formatDateTime(booking.cancelledAt)}</CardDescription>
          </CardHeader>
          {booking.cancelledReason && (
            <CardContent className="text-sm">Motivo: {booking.cancelledReason}</CardContent>
          )}
        </Card>
      )}

      {transitions.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Acciones</CardTitle>
            <CardDescription>Cambiar estado de la reserva.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {transitions.map((next) => (
              <Button
                key={next}
                variant={next === 'cancelled' || next === 'no_show' ? 'outline' : 'default'}
                onClick={() => setStatus(next)}
                disabled={busy}
              >
                {busy && <Loader2 className="animate-spin" />}
                {next === 'cancelled' && <XCircle />}
                Marcar como {STATUS_LABEL[next].toLowerCase()}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Creada {formatDateTime(booking.createdAt)} · Última edición{' '}
        {formatDateTime(booking.updatedAt)}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b py-1.5 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
