'use client';

import { type ApiError, api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Input } from '@impacto/ui/input';
import { Skeleton } from '@impacto/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  Building2,
  CalendarDays,
  Cog,
  Database,
  Download,
  Lock,
  Megaphone,
  Search,
  Shield,
  Siren,
  Snowflake,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Panel admin para staff Impacto (propuesta 100.1 / 114.1).
 *
 * Solo accesible para emails en `STAFF_EMAILS` env var. Muestra:
 *  - stats globales del producto
 *  - lista de tenants con counts básicos
 *
 * No es parte del dashboard del cliente — vive bajo `/admin/*` separado.
 * Si la API responde 403, mostramos página de "no autorizado".
 */

interface AdminStats {
  tenants_total: number;
  tenants_active: number;
  bookings_total: number;
  bookings_30d: number;
  properties_total: number;
  users_total: number;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
  plan: string | null;
  members_count: number;
  properties_count: number;
  units_count: number;
  bookings_total: number;
  bookings_active: number;
  last_booking_at: string | null;
}

interface TrialRow {
  id: string;
  name: string;
  slug: string | null;
  plan: string | null;
  trial_ends_at: string;
  days_left: number;
}

interface FrozenRow {
  id: string;
  name: string;
  slug: string | null;
  frozen_at: string | null;
  frozen_reason: string | null;
  plan: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';

export default function AdminPage() {
  // Búsqueda full-text de tenants (propuesta 154.4 ronda 13). Debounce 250ms
  // para no martillar la API a cada tecla.
  const [searchInput, setSearchInput] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const statsQuery = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api<{ data: AdminStats }>('/api/admin/stats'),
    retry: false,
    staleTime: 60_000,
  });
  const tenantsQuery = useQuery({
    queryKey: ['admin', 'tenants', searchDebounced],
    queryFn: () =>
      api<{ data: TenantRow[] }>(
        searchDebounced
          ? `/api/admin/tenants?q=${encodeURIComponent(searchDebounced)}`
          : '/api/admin/tenants',
      ),
    retry: false,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const trialsQuery = useQuery({
    queryKey: ['admin', 'trials-expiring'],
    queryFn: () => api<{ data: TrialRow[] }>('/api/admin/trials-expiring?days=14'),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const frozenQuery = useQuery({
    queryKey: ['admin', 'tenants-frozen'],
    queryFn: () => api<{ data: FrozenRow[] }>('/api/admin/tenants/frozen'),
    retry: false,
    staleTime: 60_000,
  });

  const isForbidden =
    (statsQuery.error && (statsQuery.error as ApiError).status === 403) ||
    (tenantsQuery.error && (tenantsQuery.error as ApiError).status === 403);

  if (isForbidden) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <Lock className="size-5" aria-hidden="true" />
            </div>
            <CardTitle>Acceso restringido</CardTitle>
            <CardDescription>
              Esta página es solo para staff de Impacto. Tu email no figura en la whitelist.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const stats = statsQuery.data?.data;
  const tenants = tenantsQuery.data?.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8 flex items-end justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Admin · Impacto-internal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Tenants y métricas globales</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={'/admin/announcements' as never}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Megaphone className="size-4" aria-hidden="true" />
            Anuncios
          </Link>
          <Link
            href={'/admin/slow-queries' as never}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Database className="size-4" aria-hidden="true" />
            Slow queries
          </Link>
          <Link
            href={'/admin/gdpr' as never}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Shield className="size-4" aria-hidden="true" />
            GDPR
          </Link>
          <Link
            href={'/admin/workers' as never}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Cog className="size-4" aria-hidden="true" />
            Workers
          </Link>
          <Link
            href={'/admin/incidents' as never}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Siren className="size-4" aria-hidden="true" />
            Incidents
          </Link>
        </div>
      </header>

      {/* Stats grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Tenants totales"
          value={stats?.tenants_total}
          isLoading={statsQuery.isPending}
        />
        <StatCard
          label="Tenants activos (30d)"
          value={stats?.tenants_active}
          isLoading={statsQuery.isPending}
        />
        <StatCard
          label="Properties"
          value={stats?.properties_total}
          isLoading={statsQuery.isPending}
        />
        <StatCard label="Users" value={stats?.users_total} isLoading={statsQuery.isPending} />
        <StatCard
          label="Bookings totales"
          value={stats?.bookings_total}
          isLoading={statsQuery.isPending}
        />
        <StatCard
          label="Bookings 30d"
          value={stats?.bookings_30d}
          isLoading={statsQuery.isPending}
        />
      </div>

      {/* Frozen tenants (propuesta 162.6 ronda 14) */}
      {frozenQuery.data?.data && frozenQuery.data.data.length > 0 && (
        <Card className="mb-6 border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Snowflake className="size-5" aria-hidden="true" />
              Workspaces congelados ({frozenQuery.data.data.length})
            </CardTitle>
            <CardDescription>
              Activos pero con mutaciones bloqueadas. Ordenados por frozen_at DESC.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {frozenQuery.data.data.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/tenants/${t.id}` as never}
                      className="font-medium hover:underline"
                    >
                      {t.name}
                    </Link>
                    {t.frozen_reason && (
                      <p className="break-words text-xs text-muted-foreground">{t.frozen_reason}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {t.frozen_at ? new Date(t.frozen_at).toLocaleDateString('es-AR') : '—'}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Trials próximos a expirar (propuesta 154.7 ronda 13) */}
      {trialsQuery.data?.data && trialsQuery.data.data.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <AlarmClock className="size-5" aria-hidden="true" />
                Trials expirando ({trialsQuery.data.data.length})
              </CardTitle>
              <CardDescription>Próximos 14 días. Buen momento para outreach.</CardDescription>
            </div>
            <a
              href={`${API_URL}/api/admin/trials-expiring.csv?days=14`}
              className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-muted"
              download
            >
              <Download className="size-3" aria-hidden="true" />
              CSV
            </a>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {trialsQuery.data.data.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link
                      href={`/admin/tenants/${t.id}` as never}
                      className="font-medium hover:underline"
                    >
                      {t.name}
                    </Link>
                    {t.slug && <p className="text-xs text-muted-foreground">{t.slug}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {t.days_left} {t.days_left === 1 ? 'día' : 'días'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.trial_ends_at).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tenants list */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Workspaces</CardTitle>
              <CardDescription>
                {searchDebounced
                  ? `Resultados para "${searchDebounced}"`
                  : 'Últimos 200 ordenados por fecha de creación.'}{' '}
                Click para ver detalle.
              </CardDescription>
            </div>
            <a
              href={`${API_URL}/api/admin/tenants.csv${
                searchDebounced ? `?q=${encodeURIComponent(searchDebounced)}` : ''
              }`}
              className="inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
              download
            >
              <Download className="size-3" aria-hidden="true" />
              Export CSV
            </a>
          </div>
          <div className="relative max-w-md">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Buscar por nombre o slug…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
              aria-label="Buscar tenants"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {tenantsQuery.isPending ? (
            <div className="space-y-2 p-4">
              {['a', 'b', 'c', 'd'].map((k) => (
                <Skeleton key={k} className="h-12 w-full" />
              ))}
            </div>
          ) : tenants.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">Sin tenants todavía.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-muted-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left">
                  <th>Nombre</th>
                  <th className="text-right">Members</th>
                  <th className="text-right">Properties</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">Bookings</th>
                  <th>Plan</th>
                  <th>Última reserva</th>
                  <th>Creado</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b last:border-b-0 [&>td]:px-4 [&>td]:py-2">
                    <td>
                      <Link
                        href={`/admin/tenants/${t.id}` as never}
                        className="font-medium hover:underline"
                      >
                        {t.name}
                      </Link>
                      {t.slug && <p className="text-xs text-muted-foreground">{t.slug}</p>}
                    </td>
                    <td className="text-right">
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3 text-muted-foreground" aria-hidden="true" />
                        {t.members_count}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="size-3 text-muted-foreground" aria-hidden="true" />
                        {t.properties_count}
                      </span>
                    </td>
                    <td className="text-right">{t.units_count}</td>
                    <td className="text-right">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3 text-muted-foreground" aria-hidden="true" />
                        {t.bookings_active} / {t.bookings_total}
                      </span>
                    </td>
                    <td>
                      {t.plan ? (
                        <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono uppercase">
                          {t.plan}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">trial</span>
                      )}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {t.last_booking_at
                        ? new Date(t.last_booking_at).toLocaleDateString('es-AR')
                        : '—'}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString('es-AR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="mt-1 h-8 w-16" />
        ) : (
          <p className="mt-1 text-2xl font-semibold">
            {value !== undefined ? value.toLocaleString('es-AR') : '—'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
