'use client';

import { ApiError, api } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { type CreatePropertyInput, createPropertySchema } from '@impacto/shared';
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
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: stripping combining diacritics \u2014 idiom est\u00e1ndar tras NFD normalize
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
  );
}

export default function NewPropertyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<CreatePropertyInput>({
    resolver: zodResolver(createPropertySchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      propertyType: 'cabanas',
      addressLine: '',
      city: '',
      state: '',
      country: 'UY',
    },
  });

  const onSubmit = async (values: CreatePropertyInput) => {
    setLoading(true);
    try {
      const created = await api<{ data: { id: string } }>('/api/properties', {
        method: 'POST',
        json: values,
      });
      // Toast action "Ver detalle" (propuesta 243.1 ronda 22).
      toast.success('Propiedad creada', {
        action: {
          label: 'Ver detalle',
          onClick: () => router.push(`/dashboard/properties/${created.data.id}` as never),
        },
      });
      router.push('/dashboard/properties');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No pudimos crear la propiedad';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Auto-slug del nombre mientras tipea: actualiza el slug solo si el usuario
  // no lo editó manualmente (cuando el slug actual es el slugify del name
  // anterior, o está vacío). Pattern idiomático con useEffect (G6.3 / §6.3).
  const watchedName = form.watch('name');
  useEffect(() => {
    const currentSlug = form.getValues('slug');
    const isDirty = form.getFieldState('slug').isDirty;
    // Si el usuario tocó manualmente el slug, no lo sobreescribimos.
    if (isDirty && currentSlug && currentSlug !== slugify(watchedName)) return;
    const next = slugify(watchedName);
    if (next !== currentSlug) {
      form.setValue('slug', next, { shouldDirty: false });
    }
  }, [watchedName, form]);

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/dashboard/properties">
          <ArrowLeft /> Volver a propiedades
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nueva propiedad</CardTitle>
          <CardDescription>
            Una propiedad es un alojamiento (complejo, hotel, casa). Las unidades reservables
            (cabañas, habitaciones) las agregás después.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del alojamiento</FormLabel>
                    <FormControl>
                      <Input placeholder="Meraki Cabañas - Mar de las Pampas" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug (URL)</FormLabel>
                    <FormControl>
                      <Input placeholder="meraki-mar-de-las-pampas" {...field} />
                    </FormControl>
                    <FormDescription>
                      Solo minúsculas, números y guiones. Se autocompleta del nombre.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="propertyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        {...field}
                      >
                        <option value="cabanas">Cabañas / complejo</option>
                        <option value="hotel">Hotel</option>
                        <option value="hosteria">Hostería</option>
                        <option value="apart">Apart hotel</option>
                        <option value="departamento">Departamento</option>
                        <option value="hostel">Hostel</option>
                        <option value="casa">Casa</option>
                        <option value="otro">Otro</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Cabañas frente al bosque..."
                        rows={3}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ciudad</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Mar de las Pampas"
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
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>País</FormLabel>
                      <FormControl>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                          {...field}
                        >
                          <option value="UY">Uruguay</option>
                          <option value="AR">Argentina</option>
                          <option value="CL">Chile</option>
                          <option value="BR">Brasil</option>
                          <option value="PY">Paraguay</option>
                          <option value="BO">Bolivia</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="addressLine"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input placeholder="Calle 5 esq. 10" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                Crear propiedad
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
