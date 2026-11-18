'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Vim-style keyboard navigation (propuesta 156.2 ronda 13).
 *
 * Combinaciones soportadas:
 *   g a → /admin
 *   g s → /dashboard/settings
 *   g t → /dashboard/team
 *   g d → /dashboard
 *   g i → /dashboard/inbox (cuando exista)
 *   g b → /dashboard/bookings
 *   g p → /dashboard/properties
 *
 * Window 800ms entre las dos teclas. Se cancela si el usuario escribe en
 * un input/textarea/contenteditable.
 */

const ROUTES: Record<string, string> = {
  a: '/admin',
  s: '/dashboard/settings',
  t: '/dashboard/team',
  d: '/dashboard',
  b: '/dashboard/bookings',
  p: '/dashboard/properties',
  c: '/dashboard/calendar',
  n: '/dashboard/notifications',
  u: '/dashboard/audit',
  // Staff-side shortcuts (propuesta 194.2 ronda 17). Si no es staff, el
  // backend respondió 403; el push igual ocurre y el user ve "acceso
  // restringido", lo cual es OK — discoverable.
  w: '/admin/workers',
  g: '/admin/gdpr',
  q: '/admin/slow-queries',
  m: '/admin/announcements',
};

const CHORD_TIMEOUT_MS = 800;

export function KeyboardNav() {
  const router = useRouter();
  const waitingForSecond = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // No interceptar si el user está typing en input/textarea/contenteditable.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if ((target as HTMLElement).isContentEditable) return;
      }
      // Modifier keys = no chord.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (waitingForSecond.current) {
        const route = ROUTES[e.key.toLowerCase()];
        waitingForSecond.current = false;
        if (timer.current) clearTimeout(timer.current);
        if (route) {
          e.preventDefault();
          // biome-ignore lint/suspicious/noExplicitAny: typed routes
          router.push(route as any);
        }
        return;
      }

      if (e.key === 'g') {
        waitingForSecond.current = true;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          waitingForSecond.current = false;
        }, CHORD_TIMEOUT_MS);
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
