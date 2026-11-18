'use client';

import { api } from '@/lib/api';
import type { ApiList, Property } from '@impacto/shared';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * Mini-switcher visible en el sidebar cuando un workspace tiene 2+
 * properties (§3.6 del audit). Permite saltar rápido entre detalles
 * sin volver al listado.
 *
 * Si solo hay 1 property → no se renderiza.
 * Si hay 0 → muestra link "Crear primera propiedad".
 *
 * Persistimos la última property visitada en localStorage `impacto.lastProp`
 * para volver al mismo contexto al recargar.
 */

const STORAGE_KEY = 'impacto.lastProp';

export function PropertySwitcher() {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const propertiesQuery = useQuery({
    queryKey: ['properties', 'list'],
    queryFn: () => api<ApiList<Property>>('/api/properties').then((r) => r.data),
    staleTime: 60_000,
  });

  const properties = propertiesQuery.data ?? [];

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && properties.find((p) => p.id === stored)) {
      setSelectedId(stored);
    } else if (properties[0]) {
      setSelectedId(properties[0].id);
    }
  }, [properties]);

  // Cerrar al click afuera.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Si no hay properties → no rendereamos (el SetupChecklist ya guía).
  if (propertiesQuery.isPending) return null;
  if (properties.length === 0) return null;
  // Solo 1 property → no necesita switcher.
  if (properties.length === 1) return null;

  const selected = properties.find((p) => p.id === selectedId) ?? properties[0];

  return (
    <div ref={ref} className="relative mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-2 text-left text-xs transition-colors hover:bg-muted"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Cambiar de propiedad"
      >
        <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 truncate font-medium">{selected?.name}</span>
        <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover shadow-md">
          {properties.map((p) => {
            const isSelected = p.id === selectedId;
            return (
              <li key={p.id} aria-selected={isSelected}>
                <Link
                  href={`/dashboard/properties/${p.id}`}
                  onClick={() => {
                    setSelectedId(p.id);
                    localStorage.setItem(STORAGE_KEY, p.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 px-2 py-2 text-xs hover:bg-muted"
                >
                  <Building2
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{p.name}</span>
                  {isSelected && <Check className="size-3 text-primary" aria-hidden="true" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
