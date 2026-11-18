'use client';

import { ApiError, api } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { type CreateUnitInput, createUnitSchema } from '@impacto/shared';
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
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
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

export default function NewUnitPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<CreateUnitInput>({
    resolver: zodResolver(createUnitSchema),
    defaultValues: {
      propertyId: params.id,
      name: '',
      slug: '',
      maxGuests: 2,
      bedrooms: 1,
      bathrooms: 1,
      unitType: 'cabin',
      description: '',
      amenities: [],
      petsAllowed: 'no',
    },
  });

  // Auto-slug del nombre.
  const watchedName = form.watch('name');
  const watchedSlug = form.watch('slug');
  const lastNameRef = useState({ name: '', slug: '' })[0];
  if (watchedName !== lastNameRef.name) {
    if (!watchedSlug || watchedSlug === slugify(lastNameRef.name)) {
      form.setValue('slug', slugify(watchedName));
    }
    lastNameRef.name = watchedName;
    lastNameRef.slug = watchedSlug;
  }

  const onSubmit = async (values: CreateUnitInput) => {
    setLoading(true);
    try {
      const created = await api<{ data: { id: string } }>('/api/units', {
        method: 'POST',
        json: values,
      });
      // Toast action "Ver detalle" (propuesta 243.1 ronda 22).
      toast.success('Unidad creada', {
        action: {
          label: 'Ver unidad',
          onClick: () =>
            router.push(`/dashboard/properties/${params.id}/units/${created.data.id}` as never),
        },
      });
      router.push(`/dashboard/properties/${params.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No pudimos crear la unidad');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/dashboard/properties/${params.id}`}>
          <ArrowLeft /> Volver a la propiedad
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nueva unidad</CardTitle>
          <CardDescription>
            Una unidad reservable: cabaña, habitación, departamento. El bot consulta disponibilidad
            por unidad.
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
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Cabaña Aurora" {...field} />
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
                      <Input placeholder="cabana-aurora" {...field} />
                    </FormControl>
                    <FormDescription>Único dentro de la propiedad.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unitType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        {...field}
                      >
                        <option value="cabin">Cabaña</option>
                        <option value="room">Habitación</option>
                        <option value="apartment">Apartamento</option>
                        <option value="studio">Studio</option>
                        <option value="suite">Suite</option>
                        <option value="dorm">Dorm compartido</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="maxGuests"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pax máx.</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bedrooms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dormitorios</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bathrooms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Baños</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="petsAllowed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mascotas</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        {...field}
                      >
                        <option value="no">No se aceptan</option>
                        <option value="yes">Sí, permitidas</option>
                        <option value="consult">Consultar caso por caso</option>
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
                        rows={3}
                        placeholder="Cabaña con jacuzzi, vista al bosque..."
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                Crear unidad
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
