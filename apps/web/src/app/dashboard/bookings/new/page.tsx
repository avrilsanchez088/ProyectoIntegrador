'use client';

import { OverlapDialog } from '@/components/dashboard/overlap-dialog';
import { ApiError, api } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@impacto/ui/form';
import { Input } from '@impacto/ui/input';
import { Textarea } from '@impacto/ui/textarea';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

/**
 * Schema del form (interfaz humana). Mapeamos a `createBookingSchema` antes
 * de mandar a la API: convertimos check-in/check-out (date + hora) a ISO con
 * timezone, y derivamos el `code`.
 */
const formSchema = z
  .object({
    unitId: z.string().uuid('Elegí una unidad'),
    code: z
      .string()
      .min(3, 'Mínimo 3 caracteres')
      .max(40)
      .regex(/^[A-Z0-9-]+$/, 'Solo mayúsculas, números y guiones'),
    checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
    checkInTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default('14:00'),
    checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
    checkOutTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default('11:00'),
    guestsCount: z.coerce.number().int().min(1).max(50),
    petsCount: z.coerce.number().int().min(0).max(20).default(0),
    guestName: z.string().max(120).optional(),
    guestEmail: z.string().email('Email inválido').optional().or(z.literal('')),
    guestPhone: z.string().max(40).optional(),
    notes: z.string().max(1000).optional(),
    source: z.enum(['direct', 'manual', 'airbnb', 'booking', 'gcal', 'ical']).default('manual'),
    status: z.enum(['tentative', 'confirmed']).default('confirmed'),
  })
  .refine((d) => `${d.checkOutDate}T${d.checkOutTime}` > `${d.checkInDate}T${d.checkInTime}`, {
    message: 'Check-out debe ser posterior a check-in',
    path: ['checkOutDate'],
  });

type FormValues = z.infer<typeof formSchema>;

type Property = { id: string; name: string };
type Unit = { id: string; name: string; propertyId: string };

function genCode(): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `RES-${ts}`;
}

export default function NewBookingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Pre-rellenado desde query params (botón Duplicar de booking detail +
  // click en celda vacía del calendar mensual).
  const prefillUnitId = searchParams.get('unitId') ?? '';
  const prefillDate = searchParams.get('date') ?? '';
  const prefillGuestName = searchParams.get('guestName') ?? '';
  const prefillGuestEmail = searchParams.get('guestEmail') ?? '';
  const prefillGuestPhone = searchParams.get('guestPhone') ?? '';
  const prefillGuestsCount = Number(searchParams.get('guestsCount')) || 2;
  const prefillPetsCount = Number(searchParams.get('petsCount')) || 0;
  const [loading, setLoading] = useState(false);
  const [props, setProps] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [overlap, setOverlap] = useState<{
    unitId: string;
    checkIn: string;
    checkOut: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([api<{ data: Property[] }>('/api/properties'), api<{ data: Unit[] }>('/api/units')])
      .then(([p, u]) => {
        setProps(p.data);
        setUnits(u.data);
      })
      .catch((err: ApiError) => toast.error(err.message));
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      unitId: prefillUnitId,
      code: genCode(),
      checkInDate: prefillDate,
      checkInTime: '14:00',
      checkOutDate: '',
      checkOutTime: '11:00',
      guestsCount: prefillGuestsCount,
      petsCount: prefillPetsCount,
      guestName: prefillGuestName,
      guestEmail: prefillGuestEmail,
      guestPhone: prefillGuestPhone,
      notes: '',
      source: 'manual',
      status: 'confirmed',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    // Convertir a ISO con offset local del browser. La API normaliza a tz del
    // workspace al cotizar (G4.9). Declarado fuera del try porque el catch
    // del 409 lo reusa para hidratar el OverlapDialog.
    const checkIn = new Date(`${values.checkInDate}T${values.checkInTime}`).toISOString();
    const checkOut = new Date(`${values.checkOutDate}T${values.checkOutTime}`).toISOString();
    try {
      const payload = {
        unitId: values.unitId,
        code: values.code,
        checkIn,
        checkOut,
        guestsCount: values.guestsCount,
        petsCount: values.petsCount,
        guestName: values.guestName || undefined,
        guestEmail: values.guestEmail || undefined,
        guestPhone: values.guestPhone || undefined,
        notes: values.notes || undefined,
        source: values.source,
        status: values.status,
      };

      const created = await api<{ data: { id: string } }>('/api/bookings', {
        method: 'POST',
        json: payload,
      });
      // Toast con action "Ver detalle" (propuesta 234.1 ronda 21). Si el
      // user no clickea, el toast se cierra solo.
      toast.success('Reserva creada', {
        action: {
          label: 'Ver detalle',
          onClick: () => router.push(`/dashboard/bookings/${created.data.id}` as never),
        },
      });
      router.push('/dashboard/bookings');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // En vez de un toast genérico, abrimos el OverlapDialog con los items
          // que solapan + acciones (G3.4).
          setOverlap({
            unitId: values.unitId,
            checkIn,
            checkOut,
            message: err.message ?? 'Las fechas elegidas se superponen.',
          });
        } else if (err.status === 422) {
          toast.error(
            `No se pudo cotizar: ${(err.body as { reason?: string })?.reason ?? 'datos inválidos'}`,
          );
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error('No pudimos crear la reserva');
      }
    } finally {
      setLoading(false);
    }
  };

  const propertyName = (id: string) => props.find((p) => p.id === id)?.name ?? '?';

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/dashboard/bookings">
          <ArrowLeft /> Volver
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nueva reserva</CardTitle>
          <CardDescription>
            Cargá una reserva tomada por teléfono o cualquier canal manual. El precio se calcula
            automáticamente con las tarifas y reglas de la unidad.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidad</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        {...field}
                      >
                        <option value="">Elegí una unidad…</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {propertyName(u.propertyId)} · {u.name}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código</FormLabel>
                    <FormControl>
                      <Input placeholder="RES-AB12X" {...field} />
                    </FormControl>
                    <FormDescription>
                      Identificador legible. Se autogenera; podés sobrescribirlo.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                      <Input placeholder="Juan Pérez" {...field} value={field.value ?? ''} />
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
                        <Input
                          type="email"
                          placeholder="huesped@ejemplo.com"
                          {...field}
                          value={field.value ?? ''}
                        />
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
                        <Input placeholder="+598 99 123 456" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        {...field}
                      >
                        <option value="confirmed">Confirmada</option>
                        <option value="tentative">Tentativa (no bloquea)</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas internas</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Llega tarde, pidió cuna, etc."
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
                Crear reserva
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <OverlapDialog
        open={overlap !== null}
        onOpenChange={(o) => !o && setOverlap(null)}
        attempt={
          overlap
            ? { unitId: overlap.unitId, checkIn: overlap.checkIn, checkOut: overlap.checkOut }
            : null
        }
        message={overlap?.message}
        onAdjustDates={() => {
          setOverlap(null);
          setTimeout(() => form.setFocus('checkInDate'), 100);
        }}
      />
    </div>
  );
}
