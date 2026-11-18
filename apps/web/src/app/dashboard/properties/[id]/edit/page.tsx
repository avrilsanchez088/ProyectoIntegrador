'use client';

import { PhotoDropzone } from '@/components/dashboard/photo-dropzone';
import { ApiError, api } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { type UpdatePropertyInput, updatePropertySchema } from '@impacto/shared';
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
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

type Property = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  propertyType: string;
  city: string | null;
  state: string | null;
  country: string | null;
  addressLine: string | null;
  latitude: string | null;
  longitude: string | null;
};

export default function EditPropertyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const form = useForm<UpdatePropertyInput>({
    resolver: zodResolver(updatePropertySchema),
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: form es estable, sólo re-fetch al cambiar id
  useEffect(() => {
    api<{ data: Property }>(`/api/properties/${params.id}`)
      .then((res) => {
        const p = res.data;
        form.reset({
          name: p.name,
          slug: p.slug,
          description: p.description ?? '',
          propertyType: p.propertyType as UpdatePropertyInput['propertyType'],
          addressLine: p.addressLine ?? '',
          city: p.city ?? '',
          state: p.state ?? '',
          country: (p.country ?? 'UY') as UpdatePropertyInput['country'],
        });
      })
      .catch((err: ApiError) => {
        if (err.status === 404) setNotFound(true);
        else toast.error(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const onSubmit = async (values: UpdatePropertyInput) => {
    setLoading(true);
    try {
      await api(`/api/properties/${params.id}`, { method: 'PATCH', json: values });
      toast.success('Propiedad actualizada');
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
          <Link href="/dashboard/properties">
            <ArrowLeft /> Volver
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">No encontramos esta propiedad</CardTitle>
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
          <ArrowLeft /> Volver al detalle
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Editar propiedad</CardTitle>
          <CardDescription>
            Cambiá los datos del alojamiento. El slug afecta URLs públicas — cambialo solo si es
            necesario.
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
                    <FormDescription>Solo minúsculas, números y guiones.</FormDescription>
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
                        value={field.value ?? 'cabanas'}
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
                      <Textarea rows={3} {...field} value={field.value ?? ''} />
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
                        <Input {...field} value={field.value ?? ''} />
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
                          value={field.value ?? 'UY'}
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
                      <Input {...field} value={field.value ?? ''} />
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
          <CardTitle>Fotos de la propiedad</CardTitle>
          <CardDescription>
            Fachada, exterior, áreas comunes. Las fotos por unidad se cargan en la página de cada
            unidad.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoDropzone scope={{ propertyId: params.id }} />
        </CardContent>
      </Card>
    </div>
  );
}
