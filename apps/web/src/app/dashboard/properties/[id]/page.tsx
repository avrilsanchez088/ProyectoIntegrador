'use client';

import { type ApiError, api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { EmptyState } from '@impacto/ui/empty-state';
import { Skeleton } from '@impacto/ui/skeleton';
import { ArrowLeft, BedDouble, DollarSign, Loader2, Pencil, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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
};

type Unit = {
  id: string;
  name: string;
  slug: string;
  unitType: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  petsAllowed: number;
  description: string | null;
};

const UNIT_TYPE_LABEL: Record<string, string> = {
  cabin: 'Cabaña',
  room: 'Habitación',
  apartment: 'Apartamento',
  studio: 'Studio',
  suite: 'Suite',
  dorm: 'Dorm',
};

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ data: Property }>(`/api/properties/${params.id}`)
      .then((res) => setProperty(res.data))
      .catch((err: ApiError) => {
        setError(err.message);
        toast.error(err.message);
      });
    api<{ data: Unit[] }>(`/api/units?propertyId=${params.id}`)
      .then((res) => setUnits(res.data))
      .catch((err: ApiError) => {
        toast.error(err.message);
        setUnits([]);
      });
  }, [params.id]);

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/dashboard/properties">
          <ArrowLeft /> Volver
        </Link>
      </Button>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">No encontramos esta propiedad</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : !property ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-40" />
            </div>
          </div>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{property.name}</h1>
              <p className="text-muted-foreground">
                {[property.city, property.country].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={`/dashboard/properties/${params.id}/edit`}>
                  <Pencil /> Editar
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/dashboard/properties/${params.id}/pricing`}>
                  <DollarSign /> Tarifas y temporadas
                </Link>
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detalles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Field label="Slug" value={property.slug} />
              <Field label="Tipo" value={property.propertyType} />
              <Field label="Dirección" value={property.addressLine ?? '—'} />
              <Field label="Descripción" value={property.description ?? '—'} />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Unidades</CardTitle>
                  <CardDescription>
                    Cabañas, habitaciones, deptos. Cada una se reserva por separado.
                  </CardDescription>
                </div>
                <Button asChild size="sm">
                  <Link href={`/dashboard/properties/${params.id}/units/new`}>
                    <Plus /> Nueva unidad
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {units === null ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {['a', 'b'].map((k) => (
                    <Skeleton key={k} className="h-20 w-full" />
                  ))}
                </div>
              ) : units.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay unidades. Crea la primera para empezar a recibir reservas.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {units.map((u) => (
                    <div key={u.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <BedDouble className="size-4 text-muted-foreground" />
                          <span className="font-medium">{u.name}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">
                            {UNIT_TYPE_LABEL[u.unitType] ?? u.unitType}
                          </span>
                        </div>
                        <Button asChild size="icon" variant="ghost" title="Editar unidad">
                          <Link href={`/dashboard/properties/${params.id}/units/${u.id}/edit`}>
                            <Pencil />
                          </Link>
                        </Button>
                      </div>
                      <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="size-3" /> hasta {u.maxGuests}
                        </span>
                        <span>
                          {u.bedrooms} 🛏 · {u.bathrooms} 🛁
                        </span>
                        {u.petsAllowed === 1 && <span>🐾 OK</span>}
                        {u.petsAllowed === 2 && <span>🐾 consultar</span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
