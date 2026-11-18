'use client';

import { ApiError, api } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@impacto/ui/form';
import { Input } from '@impacto/ui/input';
import { Textarea } from '@impacto/ui/textarea';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

type Booking = {
  id: string;
  unitId: string;
  code: string;
  status: 'tentative' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
  checkIn: string;
  checkOut: string;
  guestsCount: number;
  petsCount: number;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  notes: string | null;
};

const formSchema = z
  .object({
    checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
    checkInTime: z.string().regex(/^\d{2}:\d{2}$/),
    checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
    checkOutTime: z.string().regex(/^\d{2}:\d{2}$/),
    guestsCount: z.coerce.number().int().min(1).max(50),
    petsCount: z.coerce.number().int().min(0).max(20),
    guestName: z.string().max(120).optional(),
    guestEmail: z.string().email().optional().or(z.literal('')),
    guestPhone: z.string().max(40).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((d) => `${d.checkOutDate}T${d.checkOutTime}` > `${d.checkInDate}T${d.checkInTime}`, {
    message: 'Check-out debe ser posterior a check-in',
    path: ['checkOutDate'],
  });
type FormValues = z.infer<typeof formSchema>;

/** Convierte ISO con timezone a date+time en hora local del browser. */
function splitIsoLocal(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function EditBookingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [notFound, setNotFound] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      checkInDate: '',
      checkInTime: '14:00',
      checkOutDate: '',
      checkOutTime: '11:00',
      guestsCount: 2,
      petsCount: 0,
      guestName: '',
      guestEmail: '',
      guestPhone: '',
      notes: '',
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: form es estable, sólo re-fetch al cambiar id
  useEffect(() => {
    api<{ data: Booking }>(`/api/bookings/${params.id}`)
      .then((res) => {
        const b = res.data;
        setBooking(b);
        const ci = splitIsoLocal(b.checkIn);
        const co = splitIsoLocal(b.checkOut);
        form.reset({
          checkInDate: ci.date,
          checkInTime: ci.time,
          checkOutDate: co.date,
          checkOutTime: co.time,
          guestsCount: b.guestsCount,
          petsCount: b.petsCount,
          guestName: b.guestName ?? '',
          guestEmail: b.guestEmail ?? '',
          guestPhone: b.guestPhone ?? '',
          notes: b.notes ?? '',
        });
      })
      .catch((err: ApiError) => {
        if (err.status === 404) setNotFound(true);
        else toast.error(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const checkIn = new Date(`${values.checkInDate}T${values.checkInTime}`).toISOString();
      const checkOut = new Date(`${values.checkOutDate}T${values.checkOutTime}`).toISOString();
      await api(`/api/bookings/${params.id}`, {
        method: 'PATCH',
        json: {
          checkIn,
          checkOut,
          guestsCount: values.guestsCount,
          petsCount: values.petsCount,
          guestName: values.guestName || undefined,
          guestEmail: values.guestEmail || undefined,
          guestPhone: values.guestPhone || undefined,
          notes: values.notes || undefined,
        },
      });
      toast.success('Reserva actualizada');
      router.push(`/dashboard/bookings/${params.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error('Las fechas nuevas chocan con otra reserva o bloqueo.');
      } else {
        toast.error(err instanceof ApiError ? err.message : 'No pudimos actualizar');
      }
    } finally {
      setLoading(false);
    }
  };

  if (notFound) {
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
            <CardDescription>Quizás fue eliminada o no tenés acceso.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/dashboard/bookings/${params.id}`}>
          <ArrowLeft /> Volver al detalle
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>
            Editar <span className="font-mono">{booking.code}</span>
          </CardTitle>
          <CardDescription>
            Cambiar fechas o pax recotiza la reserva: el total queda como está hasta que confirmes
            desde la sección de pagos. Si las nuevas fechas chocan con otra reserva, se rechaza.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="checkInDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check-in</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="checkInTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="checkOutDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check-out</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="checkOutTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="guestsCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Huéspedes</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={50} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="petsCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mascotas</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={20} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="guestName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del huésped</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="guestEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="guestPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas internas</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="animate-spin" />}
                  Guardar cambios
                </Button>
                <Button asChild variant="ghost" type="button">
                  <Link href={`/dashboard/bookings/${params.id}`}>Cancelar</Link>
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
