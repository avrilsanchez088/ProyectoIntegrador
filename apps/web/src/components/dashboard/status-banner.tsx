'use client';

import { api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Status banner para mantenimientos / anuncios globales (propuesta 128.2
 * ronda 10).
 *
 * Lee `/api/health/announcements` que devuelve un array de avisos activos:
 *   [{ id, severity, message, expiresAt }]
 *
 * El user puede dismissar uno hasta `expiresAt` (localStorage). Si el
 * endpoint no existe (M2), no se muestra nada.
 */

type Severity = 'info' | 'warning' | 'urgent';

interface Announcement {
  id: string;
  severity: Severity;
  message: string;
  expiresAt: string | null;
  href?: string | null;
}

const SEVERITY_STYLES: Record<Severity, { icon: typeof Info; bg: string }> = {
  info: {
    icon: Info,
    bg: 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900',
  },
  urgent: {
    icon: AlertCircle,
    bg: 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900',
  },
};

const STORAGE_KEY = 'impacto.dismissedAnnouncements';

function getDismissed(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function setDismissed(map: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function StatusBanner() {
  const queryClient = useQueryClient();
  const [dismissedLocal, setDismissedLocal] = useState<Record<string, number>>({});
  const viewedRef = useRef(new Set<string>());

  useEffect(() => {
    setDismissedLocal(getDismissed());
  }, []);

  const query = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api<{ data: Announcement[] }>('/api/health/announcements'),
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Lista de announcements dismissed cross-device (propuesta 143.5 ronda 12).
  // Si el endpoint falla (sin auth, etc.), `data` es []. Nunca bloquea render.
  const dismissedServerQuery = useQuery({
    queryKey: ['announcements', 'dismissed'],
    queryFn: () => api<{ data: string[] }>('/api/announcements/dismissed'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const dismissedServer = new Set(dismissedServerQuery.data?.data ?? []);

  // Mark-view tracking (propuesta 143.4 ronda 12). Best-effort, no espera.
  useEffect(() => {
    if (!query.data) return;
    for (const a of query.data.data) {
      if (viewedRef.current.has(a.id)) continue;
      viewedRef.current.add(a.id);
      void api(`/api/announcements/${a.id}/view`, { method: 'POST' }).catch(() => {});
    }
  }, [query.data]);

  const dismissMutation = useMutation({
    mutationFn: (id: string) => api(`/api/announcements/${id}/dismiss`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements', 'dismissed'] });
    },
  });

  if (query.error || !query.data) return null;

  const now = Date.now();
  const visible = query.data.data.filter((a) => {
    if (a.expiresAt && new Date(a.expiresAt).getTime() < now) return false;
    if (dismissedServer.has(a.id)) return false;
    const dismissAt = dismissedLocal[a.id];
    if (dismissAt && dismissAt > now) return false;
    return true;
  });

  if (visible.length === 0) return null;

  const dismiss = (a: Announcement) => {
    // Doble write: localStorage (instant feedback) + server (cross-device).
    const expires = a.expiresAt ? new Date(a.expiresAt).getTime() : now + 365 * 24 * 60 * 60 * 1000;
    const next = { ...dismissedLocal, [a.id]: expires };
    setDismissed(next);
    setDismissedLocal(next);
    dismissMutation.mutate(a.id);
  };

  const trackClick = (a: Announcement) => {
    void api(`/api/announcements/${a.id}/click`, { method: 'POST' }).catch(() => {});
  };

  return (
    <div className="space-y-1">
      {visible.map((a) => {
        const { icon: Icon, bg } = SEVERITY_STYLES[a.severity];
        return (
          <div
            key={a.id}
            role="status"
            className={`flex items-center gap-3 border-b px-4 py-2 text-sm ${bg}`}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              {a.message}
              {a.href && (
                <a
                  href={a.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 underline"
                  onClick={() => trackClick(a)}
                >
                  Ver más
                </a>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => dismiss(a)}
              aria-label="Cerrar aviso"
              className="h-7 w-7"
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
