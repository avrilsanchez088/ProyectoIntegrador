'use client';

import { cn } from '@impacto/ui/utils';
import { type InputHTMLAttributes, forwardRef } from 'react';

/**
 * Switch component — accesible con keyboard (Space/Enter).
 *
 * Implementación a mano sin Radix Switch (no instalado). Cumple ARIA del
 * pattern button-toggle. Cuando entre Radix se reemplaza preservando la API.
 */

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, checked, disabled, id, label, ...rest },
  ref,
) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2',
        disabled && 'cursor-not-allowed opacity-50',
        !disabled && 'cursor-pointer',
      )}
      htmlFor={id}
    >
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1',
          className,
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            'inline-block size-4 rounded-full bg-background shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </span>
      <input
        id={id}
        ref={ref}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-checked={checked ? 'true' : 'false'}
        className="peer sr-only"
        {...rest}
      />
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
});
