'use client';

import { useTheme } from '@/components/theme-provider';
import { signOut } from '@/lib/auth-client';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@impacto/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@impacto/ui/dialog';
import {
  Building2,
  CalendarClock,
  CalendarDays,
  Calendar as CalendarIcon,
  Cog,
  Database,
  FileText,
  HelpCircle,
  Home,
  LogOut,
  Megaphone,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Sun,
  User,
  Users,
} from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Command palette ⌘K (Ctrl+K en Windows). Atajos rápidos para navegar y
 * ejecutar acciones sin tocar el mouse.
 *
 * Listo para extenderse: cuando agreguemos buscar reservas/huéspedes/etc,
 * lo conectamos acá con queries en vivo.
 */

interface NavItem {
  group: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: Route;
  shortcut?: string;
  action?: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const router = useRouter();
  const { resolvedTheme, toggle } = useTheme();

  // Atajos de teclado: ⌘K / Ctrl+K abre el palette; ⇧+? abre el listado de shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === '?' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        // No interceptar mientras el usuario tipea en un input/textarea/contenteditable.
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const items: NavItem[] = [
    // Navegación
    { group: 'Navegación', label: 'Inicio', icon: Home, href: '/dashboard' },
    { group: 'Navegación', label: 'Calendario', icon: CalendarIcon, href: '/dashboard/calendar' },
    { group: 'Navegación', label: 'Reservas', icon: CalendarDays, href: '/dashboard/bookings' },
    { group: 'Navegación', label: 'Bloqueos', icon: CalendarClock, href: '/dashboard/blocks' },
    {
      group: 'Navegación',
      label: 'Calendarios externos',
      icon: RefreshCw,
      href: '/dashboard/calendars',
    },
    { group: 'Navegación', label: 'Propiedades', icon: Building2, href: '/dashboard/properties' },
    {
      group: 'Navegación',
      label: 'Políticas y reglas',
      icon: FileText,
      href: '/dashboard/policies',
    },
    { group: 'Navegación', label: 'Equipo', icon: Users, href: '/dashboard/team' },
    { group: 'Navegación', label: 'Audit log', icon: HelpCircle, href: '/dashboard/audit' },
    // Staff / admin (propuesta 194.3 ronda 17). Si el user no es staff, el
    // backend igual devuelve 403 — discoverable sin filtrar acá.
    { group: 'Staff', label: 'Panel admin', icon: Settings, href: '/admin', shortcut: 'G A' },
    {
      group: 'Staff',
      label: 'Anuncios globales',
      icon: Megaphone,
      href: '/admin/announcements',
      shortcut: 'G M',
    },
    { group: 'Staff', label: 'Workers', icon: Cog, href: '/admin/workers', shortcut: 'G W' },
    {
      group: 'Staff',
      label: 'Slow queries',
      icon: Database,
      href: '/admin/slow-queries',
      shortcut: 'G Q',
    },
    { group: 'Staff', label: 'GDPR requests', icon: Shield, href: '/admin/gdpr', shortcut: 'G G' },
    // Acciones rápidas
    {
      group: 'Acciones rápidas',
      label: 'Nueva reserva',
      icon: Plus,
      href: '/dashboard/bookings/new',
      shortcut: 'N R',
    },
    {
      group: 'Acciones rápidas',
      label: 'Nueva propiedad',
      icon: Plus,
      href: '/dashboard/properties/new',
      shortcut: 'N P',
    },
    // Cuenta
    { group: 'Cuenta', label: 'Perfil', icon: User, href: '/dashboard/profile' },
    { group: 'Cuenta', label: 'Configuración', icon: Settings, href: '/dashboard/settings' },
    {
      group: 'Cuenta',
      label: resolvedTheme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
      icon: resolvedTheme === 'dark' ? Sun : Moon,
      action: toggle,
      shortcut: '⇧ D',
    },
    {
      group: 'Cuenta',
      label: 'Cerrar sesión',
      icon: LogOut,
      action: async () => {
        await signOut();
        router.push('/');
      },
    },
    {
      group: 'Cuenta',
      label: 'Ver atajos de teclado',
      icon: HelpCircle,
      action: () => setShortcutsOpen(true),
      shortcut: '?',
    },
  ];

  const grouped = items.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group]?.push(item);
    return acc;
  }, {});

  const handleSelect = (item: NavItem) => {
    setOpen(false);
    setTimeout(() => {
      if (item.href) router.push(item.href);
      else if (item.action) item.action();
    }, 50);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg" hideClose>
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <Command shouldFilter>
            <CommandInput
              placeholder="Buscar páginas, acciones, reservas (ej: RES-XYZ)..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>Sin resultados.</CommandEmpty>
              {/* Acción dinámica: si el input parece un código de reserva
                  (mayúsculas/dígitos/guion), ofrecer atajo a list con search.
                  Propuesta 32.4 / 115.2. */}
              {/^[A-Z][A-Z0-9-]{2,}$/.test(search) && (
                <CommandGroup heading="Búsqueda">
                  <CommandItem
                    value={`buscar-${search}`}
                    onSelect={() => {
                      setOpen(false);
                      setTimeout(() => {
                        router.push(`/dashboard/bookings?q=${encodeURIComponent(search)}` as never);
                      }, 50);
                    }}
                  >
                    <span className="font-mono text-xs text-muted-foreground">→</span>
                    <span>
                      Buscar reserva <strong className="font-mono">{search}</strong>
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
              {Object.entries(grouped).map(([group, groupItems], idx) => (
                <div key={group}>
                  {idx > 0 && <CommandSeparator />}
                  <CommandGroup heading={group}>
                    {groupItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <CommandItem
                          key={`${group}-${item.label}`}
                          value={`${group} ${item.label}`}
                          onSelect={() => handleSelect(item)}
                        >
                          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                          <span>{item.label}</span>
                          {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </div>
              ))}
            </CommandList>
          </Command>
          {/* Footer con leyenda de teclas (G8.7). */}
          <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>
                <kbd className="rounded border bg-background px-1 font-mono">↑↓</kbd> moverse
              </span>
              <span>
                <kbd className="rounded border bg-background px-1 font-mono">↵</kbd> seleccionar
              </span>
              <span>
                <kbd className="rounded border bg-background px-1 font-mono">Esc</kbd> cerrar
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTimeout(() => setShortcutsOpen(true), 50);
              }}
              className="hover:text-foreground"
            >
              <kbd className="rounded border bg-background px-1 font-mono">?</kbd> atajos
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}

function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const cmd = isMac ? '⌘' : 'Ctrl';

  const groups: Array<{ title: string; rows: Array<{ keys: string[]; label: string }> }> = [
    {
      title: 'Generales',
      rows: [
        { keys: [cmd, 'K'], label: 'Abrir command palette' },
        { keys: ['?'], label: 'Ver esta lista de atajos' },
        { keys: ['⇧', 'D'], label: 'Cambiar tema claro/oscuro' },
        { keys: ['Esc'], label: 'Cerrar diálogos' },
      ],
    },
    {
      title: 'Acciones rápidas (desde el palette)',
      rows: [
        { keys: ['N', 'R'], label: 'Nueva reserva' },
        { keys: ['N', 'P'], label: 'Nueva propiedad' },
      ],
    },
    {
      title: 'Navegación rápida (g + tecla)',
      rows: [
        { keys: ['G', 'D'], label: 'Dashboard' },
        { keys: ['G', 'B'], label: 'Reservas' },
        { keys: ['G', 'C'], label: 'Calendario' },
        { keys: ['G', 'P'], label: 'Propiedades' },
        { keys: ['G', 'T'], label: 'Equipo' },
        { keys: ['G', 'U'], label: 'Audit log' },
        { keys: ['G', 'N'], label: 'Notificaciones' },
        { keys: ['G', 'S'], label: 'Settings' },
      ],
    },
    {
      title: 'Staff (g + tecla)',
      rows: [
        { keys: ['G', 'A'], label: 'Panel admin' },
        { keys: ['G', 'M'], label: 'Anuncios' },
        { keys: ['G', 'W'], label: 'Workers' },
        { keys: ['G', 'Q'], label: 'Slow queries' },
        { keys: ['G', 'G'], label: 'GDPR requests' },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Atajos de teclado</DialogTitle>
        <div className="space-y-4 text-sm">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.title}
              </h3>
              <ul className="space-y-1.5">
                {g.rows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-3">
                    <span>{row.label}</span>
                    <span className="flex items-center gap-1">
                      {row.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Botón hint para mostrar que existe ⌘K. Va en el header.
 */
export function CommandPaletteTrigger() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  const dispatchKey = () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }),
    );
  };

  return (
    <button
      type="button"
      onClick={dispatchKey}
      className="hidden items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted md:inline-flex"
      aria-label="Abrir command palette"
    >
      <span>Buscar</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
        {isMac ? '⌘' : 'Ctrl'} K
      </kbd>
    </button>
  );
}
