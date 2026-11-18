'use client';

import { api } from '@/lib/api';
import { Button } from '@impacto/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@impacto/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Loader2 } from 'lucide-react';
import Link from 'next/link';

/**
 * OverlapDialog — UI de resolución de conflictos cuando POST /api/bookings
 * o un block returnan 409 (G3.4 / §3.4 del audit).
 *
 * Antes era un toast genérico "Hay un conflicto en esas fechas". Ahora
 * mostramos:
 *  - lista de bookings/blocks que solapan el rango propuesto
 *  - acciones rápidas: ir al detalle, cambiar fechas, cancelar
 *
 * Consulta `/api/availability?unitId=&from=&to=` para enumerar los items
 * conflictivos.
 */

interface OverlapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Datos del intento que falló para que el dialog muestre lo solicitado. */
  attempt: { unitId: string; checkIn: string; checkOut: string } | null;
  /** Mensaje server-side del 409 (overlap | overlap_db | blocked). */
  message?: string;
  /** Callback cuando el usuario decide cambiar las fechas (foco en form). */
  onAdjustDates?: () => void;
}

type AvailabilityItem = {
  id: string;
  start: string;
  end: string;
  status?: string;
  reason?: string;
  kind: 'booking' | 'block';
};

type AvailabilityRes = {
  data: { bookings: AvailabilityItem[]; blocks: AvailabilityItem[] };
};

const REASON_LABEL: Record<string, string> = {
  maintenance: 'Mantenimiento',
  owner_stay: 'Estadía dueño',
  hold: 'Reserva en espera',
  closure: 'Cierre',
  other: 'Otro',
};

const STATUS_LABEL: Record<string, string> = {
  tentative: 'Tentativa',
  confirmed: 'Confirmada',
  checked_in: 'Check-in',
  checked_out: 'Check-out',
};

function formatRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `${fmt.format(s)} → ${fmt.format(e)}`;
}

export function OverlapDialog({
  open,
  onOpenChange,
  attempt,
  message,
  onAdjustDates,
}: OverlapDialogProps) {
  const query = useQuery({
    queryKey: ['availability-overlap', attempt?.unitId, attempt?.checkIn, attempt?.checkOut],
    queryFn: () =>
      api<AvailabilityRes>(
        `/api/availability?unitId=${attempt?.unitId}&from=${attempt?.checkIn}&to=${attempt?.checkOut}`,
      ),
    enabled: open && !!attempt,
    staleTime: 5_000,
  });

  const items: AvailabilityItem[] = query.data
    ? [...query.data.data.bookings, ...query.data.data.blocks]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Conflicto de disponibilidad</DialogTitle>
        <DialogDescription>
          {message ??
            'Las fechas elegidas se superponen con una reserva o bloqueo existente. Ajustá el rango o resolvé el item en conflicto antes de continuar.'}
        </DialogDescription>

        <div className="mt-2 max-h-72 overflow-y-auto rounded-md border bg-muted/30 p-2">
          {query.isPending ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No encontramos items que solapen — puede que el conflicto se haya resuelto. Probá
              enviar de nuevo.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="font-medium">
                        {item.kind === 'booking'
                          ? `Reserva ${STATUS_LABEL[item.status ?? ''] ?? item.status ?? ''}`
                          : `Bloqueo · ${REASON_LABEL[item.reason ?? ''] ?? item.reason}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatRange(item.start, item.end)}
                      </p>
                    </div>
                  </div>
                  {item.kind === 'booking' ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/dashboard/bookings/${item.id}`}>Abrir</Link>
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/dashboard/blocks">Ver bloqueo</Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {onAdjustDates && (
            <Button
              variant="default"
              onClick={() => {
                onOpenChange(false);
                onAdjustDates();
              }}
            >
              Cambiar fechas
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
