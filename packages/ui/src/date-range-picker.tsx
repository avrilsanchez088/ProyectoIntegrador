'use client';

import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { cn } from '@impacto/ui/utils';

/**
 * DateRangePicker simple — 2 inputs `type="date"` lado a lado con
 * validación de orden + helper UI (preset ranges).
 *
 * Implementación a mano sin react-day-picker (no instalado todavía). API
 * preserva el shape para que cuando se instale, sea drop-in.
 *
 * Propuesta 69.2 ronda 6.
 */

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (range: { startDate: string; endDate: string }) => void;
  startLabel?: string;
  endLabel?: string;
  /** Min date (ISO yyyy-mm-dd). */
  min?: string;
  /** Max date. */
  max?: string;
  className?: string;
  startId?: string;
  endId?: string;
  /** Mostrar shortcuts (Hoy, +7 días, +30 días). Default true. */
  showPresets?: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  startLabel = 'Desde',
  endLabel = 'Hasta',
  min,
  max,
  className,
  startId = 'date-range-start',
  endId = 'date-range-end',
  showPresets = true,
}: DateRangePickerProps) {
  const setStart = (v: string) => {
    // Si la nueva start es posterior a end, ajustar end al mismo día.
    const next = endDate && v > endDate ? { startDate: v, endDate: v } : { startDate: v, endDate };
    onChange(next);
  };
  const setEnd = (v: string) => {
    if (v < startDate) return; // ignore invalid
    onChange({ startDate, endDate: v });
  };

  const applyPreset = (days: number) => {
    const start = todayIso();
    const end = addDays(start, days);
    onChange({ startDate: start, endDate: end });
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={startId}>{startLabel}</Label>
          <Input
            id={startId}
            type="date"
            value={startDate}
            min={min}
            max={max}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={endId}>{endLabel}</Label>
          <Input
            id={endId}
            type="date"
            value={endDate}
            min={startDate || min}
            max={max}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </div>
      </div>
      {showPresets && (
        <div className="flex flex-wrap gap-1 text-xs">
          <span className="text-muted-foreground">Rangos rápidos:</span>
          <button
            type="button"
            onClick={() => applyPreset(2)}
            className="text-primary hover:underline"
          >
            Próximas 48hs
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            type="button"
            onClick={() => applyPreset(7)}
            className="text-primary hover:underline"
          >
            7 días
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            type="button"
            onClick={() => applyPreset(30)}
            className="text-primary hover:underline"
          >
            30 días
          </button>
        </div>
      )}
    </div>
  );
}
