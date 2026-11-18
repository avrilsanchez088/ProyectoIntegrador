'use client';

import { PhotoDropzone } from '@/components/dashboard/photo-dropzone';
import { ApiError, api } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { type UpdateUnitInput, updateUnitSchema } from '@impacto/shared';
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

type Unit = {
  id: string;
  propertyId: string;
  name: string;
  slug: string;
  unitType: 'cabin' | 'room' | 'apartment' | 'studio' | 'suite' | 'dorm';
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  /** En DB es int 0/1/2; lo recibimos así. */
  petsAllowed: number;
  description: string | null;
};

const PETS_FROM_INT: Record<number, 'no' | 'yes' | 'consult'> = {
  0: 'no',
  1: 'yes',
  2: 'consult',
};

export default function EditUnitPage() {
  const params = useParams<{ id: string; unitId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const form = useForm<UpdateUnitInput>({
    resolver: zodResolver(updateUnitSchema),
    defaultValues: {
      name: '',
      slug: '',
      unitType: 'cabin',
      maxGuests: 2,
      bedrooms: 1,
      bathrooms: 1,
      petsAllowed: 'no',
      description: '',
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: form es estable, sólo re-fetch al cambiar unitId
  useEffect(() => {
    api<{ data: Unit }>(`/api/units/${params.unitId}`)
      .then((res) => {
        const u = res.data;
        form.reset({
          name: u.name,
          slug: u.slug,
          unitType: u.unitType,
          maxGuests: u.maxGuests,
          bedrooms: u.bedrooms,
          bathrooms: u.bathrooms,
          petsAllowed: PETS_FROM_INT[u.petsAllowed] ?? 'no',
          description: u.description ?? '',
        });
      })
      .catch((err: ApiError) => {
        if (err.status === 404) setNotFound(true);
        else toast.error(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.unitId]);

  const onSubmit = async (values: UpdateUnitInput) => {
    setLoading(true);
    try {
      await api(`/api/units/${params.unitId}`, { method: 'PATCH', json: values });
      toast.success('Unidad actualizada');
      router.push(`/dashboard/properties/${params.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No pudimos actualizar');
    } finally {
      setLoading(false);
    }
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href={`/dashboard/properties/${params.id}`}>
            <ArrowLeft /> Volver
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">No encontramos esta unidad</CardTitle>
            <CardDescription>Quizás fue eliminada o no tenés acceso.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/dashboard/properties/${params.id}`}>
          <ArrowLeft /> Volver a la propiedad
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Editar unidad</CardTitle>
          <CardDescription>
            Cambiar el slug afecta URLs públicas — usalo solo si es realmente necesario.
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
                      <Input {...field} value={field.value ?? ''} />
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
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
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
                        value={field.value ?? 'cabin'}
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
                        value={field.value ?? 'no'}
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
                  <Link href={`/dashboard/properties/${params.id}`}>Cancelar</Link>
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Fotos de la unidad</CardTitle>
          <CardDescription>
            Las fotos se procesan en background (thumbnails 256/1024 + strip EXIF). Aparecen aquí
            cuando están listas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoDropzone scope={{ unitId: params.unitId }} />
        </CardContent>
      </Card>
    </div>
  );
}
