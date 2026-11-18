'use client';

import { api } from '@/lib/api';
import { Skeleton } from '@impacto/ui/skeleton';
import { CalendarCheck, CalendarClock, DollarSign, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

/**
 * Strip de 4 KPIs en el dashboard home.
 *
 * Calculados client-side desde la lista de bookings — sin API extra.
 * Cuando crezca el volumen, mover esto a un endpoint `/api/stats` cacheado.
 *
 * KPIs:
 *   1. Reservas activas (confirmed + checked_in + tentative)
 *   2. Check-ins próximos 7 días
 *   3. Ingresos confirmados los próximos 30 días (USD)
 *   4. Tentativas pendientes de confirmar
 */

interface Booking {
  id: string;
  status: 'tentative' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
  checkIn: string;
  totalCents: number;
  currency: string;
}

export function KpiStrip() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ data: Booking[] }>('/api/bookings')
      .then((res) => {
        if (!cancelled) setBookings(res.data);
      })
      .catch(() => {
        if (!cancelled) setBookings([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (bookings === null) {
    return (
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {['a', 'b', 'c', 'd'].map((k) => (
          <Skeleton key={k} className="h-24" />
        ))}
      </div>
    );
  }

  if (bookings.length === 0) {
    // Sin reservas todavía — no mostramos KPIs vacíos, dejamos que el
    // SetupChecklist guíe primero.
    return null;
  }

  const now = Date.now();
  const oneWeek = now + 7 * 24 * 60 * 60 * 1000;
  const oneMonth = now + 30 * 24 * 60 * 60 * 1000;

  const activeCount = bookings.filter((b) =>
    ['tentative', 'confirmed', 'checked_in'].includes(b.status),
  ).length;

  const upcomingCheckIns = bookings.filter((b) => {
    if (!['confirmed', 'tentative'].includes(b.status)) return false;
    const t = new Date(b.checkIn).getTime();
    return t >= now && t <= oneWeek;
  }).length;

  const monthRevenueCents = bookings
    .filter((b) => {
      if (b.status !== 'confirmed' && b.status !== 'checked_in') return false;
      const t = new Date(b.checkIn).getTime();
      return t >= now - 30 * 24 * 60 * 60 * 1000 && t <= oneMonth;
    })
    .reduce((acc, b) => acc + b.totalCents, 0);

  const tentativesPending = bookings.filter((b) => b.status === 'tentative').length;

  return (
    <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={<CalendarCheck className="size-5" />}
        label="Reservas activas"
        value={activeCount.toString()}
        tone="emerald"
      />
      <KpiCard
        icon={<CalendarClock className="size-5" />}
        label="Check-ins próximos 7 días"
        value={upcomingCheckIns.toString()}
        tone="blue"
      />
      <KpiCard
        icon={<DollarSign className="size-5" />}
        label="Ingresos · 30 días"
        value={formatUsd(monthRevenueCents / 100)}
        tone="violet"
      />
      <KpiCard
        icon={<TrendingUp className="size-5" />}
        label="Tentativas a confirmar"
        value={tentativesPending.toString()}
        tone={tentativesPending > 0 ? 'amber' : 'muted'}
      />
    </div>
  );
}

type Tone = 'emerald' | 'blue' | 'violet' | 'amber' | 'muted';

const TONE_CLASSES: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  muted: 'bg-muted text-muted-foreground',
};

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border bg-card p-4"
    >
      <div
        className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}
      >
        {icon}
      </div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </motion.div>
  );
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
