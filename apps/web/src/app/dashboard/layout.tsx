'use client';

import { CommandPalette, CommandPaletteTrigger } from '@/components/dashboard/command-palette';
import { FrozenBanner } from '@/components/dashboard/frozen-banner';
import { KeyboardNav } from '@/components/dashboard/keyboard-nav';
import { NotificationsBell } from '@/components/dashboard/notifications-bell';
import { PageTransition } from '@/components/dashboard/page-transition';
import { PropertySwitcher } from '@/components/dashboard/property-switcher';
import { StatusBanner } from '@/components/dashboard/status-banner';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import { signOut, useSession } from '@/lib/auth-client';
import { Button } from '@impacto/ui/button';
import {
  Building2,
  CalendarClock,
  CalendarDays,
  Calendar as CalendarIcon,
  FileText,
  Home,
  Loader2,
  LogOut,
  Radio,
  RefreshCw,
  Settings as SettingsIcon,
  User,
  Users,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ComponentType, useEffect, useState } from 'react';

interface NavItem {
  href: Route;
  label: string;
  icon: ComponentType<{ className?: string }>;
  match?: (pathname: string) => boolean;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: Home, match: (p) => p === '/dashboard' },
  { href: '/dashboard/calendar', label: 'Calendario', icon: CalendarIcon },
  { href: '/dashboard/bookings', label: 'Reservas', icon: CalendarDays },
  { href: '/dashboard/blocks', label: 'Bloqueos', icon: CalendarClock },
  { href: '/dashboard/sync', label: 'Sincronización', icon: Radio },
  { href: '/dashboard/calendars', label: 'iCal feeds', icon: RefreshCw },
  { href: '/dashboard/properties', label: 'Propiedades', icon: Building2 },
  { href: '/dashboard/policies', label: 'Políticas', icon: FileText },
  { href: '/dashboard/team', label: 'Equipo', icon: Users },
];

/**
 * Hook que cuenta tentativas pendientes para el badge del sidebar.
 * Usa el endpoint dedicado `/api/bookings/counts` (un single GROUP BY) en
 * lugar de bajarse toda la tabla de bookings — antes (G7.2) el navbar leía
 * todas las reservas en cada cambio de ruta solo para contar las tentatives.
 *
 * Refresca al montar y cada vez que cambia la ruta para cubrir confirm/cancel
 * que mueven el count.
 */
function useNavBadges(pathname: string): Record<string, number> {
  const [badges, setBadges] = useState<Record<string, number>>({});

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname es trigger explícito para refetch al navegar
  useEffect(() => {
    // Guard contra race condition al navegar rápido entre rutas: si la
    // respuesta vuelve después de que el effect se re-ejecutó, ignoramos.
    let cancelled = false;
    api<{ data: Record<string, number> }>('/api/bookings/counts')
      .then((res) => {
        if (cancelled) return;
        setBadges({ '/dashboard/bookings': res.data.tentative ?? 0 });
      })
      .catch(() => {
        if (cancelled) return;
        setBadges({});
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return badges;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const badges = useNavBadges(pathname);

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    router.push('/sign-in');
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <CommandPalette />
      <KeyboardNav />
      <StatusBanner />
      <FrozenBanner />
      <header className="flex items-center justify-between border-b px-4 py-3 md:px-6">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          Impacto
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <span data-tour="cmdk">
            <CommandPaletteTrigger />
          </span>
          <span className="hidden text-sm text-muted-foreground lg:inline">
            {session.user.email}
          </span>
          <span data-tour="bell">
            <NotificationsBell />
          </span>
          <span data-tour="theme">
            <ThemeToggle />
          </span>
          <Button asChild variant="ghost" size="icon" title="Perfil" aria-label="Perfil">
            <Link href="/dashboard/profile">
              <User aria-hidden="true" />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            title="Configuración"
            aria-label="Configuración"
          >
            <Link href="/dashboard/settings">
              <SettingsIcon aria-hidden="true" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut aria-hidden="true" />
          </Button>
        </div>
      </header>
      <div className="flex flex-1">
        {/* Sidebar desktop */}
        <aside
          className="hidden w-56 shrink-0 border-r p-3 md:block"
          aria-label="Navegación principal"
        >
          <PropertySwitcher />
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const isActive = item.match ? item.match(pathname) : pathname.startsWith(item.href);
              const Icon = item.icon;
              const badge = badges[item.href] ?? 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-secondary font-medium text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="ml-auto inline-flex h-5 min-w-5s-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main (padding extra abajo en mobile para no tapar bottom nav) */}
        <main id="main" className="flex-1 p-4 pb-24 md:p-6 md:pb-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      {/* Bottom tab bar mobile (oculto en md+). Prioriza 5 items frecuentes;
          el resto se accede vía sidebar en desktop o ⌘K. */}
      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
      >
        {NAV.slice(0, 5).map((item) => {
          const isActive = item.match ? item.match(pathname) : pathname.startsWith(item.href);
          const Icon = item.icon;
          const badge = badges[item.href] ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] transition-colors ${
                isActive ? 'text-foreground' : 'text-muted-foreground'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon className={`size-5 ${isActive ? 'text-primary' : ''}`} />
                {badge > 0 && (
                  <span className="absolute -right-2 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-semibold text-white">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className={isActive ? 'font-medium' : ''}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
