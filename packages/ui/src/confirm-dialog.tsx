'use client';

import { Button } from '@impacto/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@impacto/ui/dialog';
import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { AlertTriangle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * `<ConfirmProvider>` + `useConfirm()` — reemplaza el `confirm()` nativo del
 * browser por un dialog controlado con shadcn/ui.
 *
 * Uso:
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: '¿Cancelar reserva?',
 *     description: 'Libera la disponibilidad y el huésped recibe notificación.',
 *     confirmLabel: 'Cancelar reserva',
 *     destructive: true,
 *   });
 *   if (!ok) return;
 *
 * Ventajas vs `confirm()`:
 *   - Estilo consistente y dark-mode aware
 *   - Soporta destructive (botón rojo)
 *   - No bloquea el thread principal
 *   - Animación de entrada
 *   - Cierra con Esc / click afuera
 */

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * Si está presente, el usuario debe tipear este texto exacto antes de
   * habilitar el botón confirm. Propuesta 231.1 ronda 21. Útil para
   * actions críticas (delete account, drop tenant).
   */
  confirmText?: string;
  /**
   * Si está presente, el botón confirm queda disabled los primeros N
   * segundos del dialog abierto, con countdown en el label. Propuesta
   * 240.4 ronda 22. Para acciones extremadamente irreversibles.
   */
  countdownSeconds?: number;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);
  // Refs para autofocus según destructive (propuesta 225.1 ronda 20).
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmTextInputRef = useRef<HTMLInputElement>(null);
  // Estado del input de typed-confirm (propuesta 231.1 ronda 21).
  const [typedConfirm, setTypedConfirm] = useState('');
  // Countdown remaining (propuesta 240.4 ronda 22).
  const [countdown, setCountdown] = useState(0);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise((resolve) => {
      setTypedConfirm('');
      setCountdown(options.countdownSeconds ?? 0);
      setState({ options, resolve });
    });
  }, []);

  // Countdown tick — decrementa cada segundo cuando hay state activo.
  useEffect(() => {
    if (!state || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [state, countdown]);

  const handleClose = useCallback(
    (result: boolean) => {
      state?.resolve(result);
      setState(null);
      setTypedConfirm('');
    },
    [state],
  );

  // Autofocus: si hay confirmText → focus al input. Sino, destructive →
  // Cancel (safer default), no destructive → Confirm.
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => {
      if (state.options.confirmText) {
        confirmTextInputRef.current?.focus();
      } else if (state.options.destructive) {
        cancelBtnRef.current?.focus();
      } else {
        confirmBtnRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(t);
  }, [state]);

  const confirmTextOk =
    !state?.options.confirmText || typedConfirm.trim() === state.options.confirmText.trim();
  const countdownOk = countdown <= 0;
  const canConfirm = confirmTextOk && countdownOk;

  // Enter desde cualquier elemento del dialog → confirma SOLO si typed
  // confirm OK. Esc lo maneja Dialog automáticamente (onOpenChange).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    // Si está en textarea → siempre dejar pasar (newline).
    if (tag === 'textarea') return;
    // Si está en el input de typed-confirm → submit cuando OK.
    if (tag === 'input') {
      if (canConfirm) {
        e.preventDefault();
        handleClose(true);
      }
      return;
    }
    if (!canConfirm) return;
    e.preventDefault();
    handleClose(true);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!state} onOpenChange={(open) => !open && handleClose(false)}>
        <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
          <div className="flex items-start gap-3">
            {state?.options.destructive && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertTriangle className="size-5" />
              </div>
            )}
            <div className="flex-1">
              <DialogTitle>{state?.options.title}</DialogTitle>
              {state?.options.description && (
                <DialogDescription className="mt-2">{state.options.description}</DialogDescription>
              )}
            </div>
          </div>
          {state?.options.confirmText && (
            <div className="mt-3 space-y-1">
              <Label htmlFor="confirm-typed">
                Para confirmar, escribí{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {state.options.confirmText}
                </code>
              </Label>
              <div className="relative">
                <Input
                  ref={confirmTextInputRef}
                  id="confirm-typed"
                  value={typedConfirm}
                  onChange={(e) => setTypedConfirm(e.target.value)}
                  autoComplete="off"
                  placeholder={state.options.confirmText}
                  aria-invalid={typedConfirm.length > 0 && !confirmTextOk}
                  className={
                    // Visual feedback (propuesta 244.1 ronda 22).
                    typedConfirm.length === 0
                      ? ''
                      : confirmTextOk
                        ? 'border-emerald-500 pr-9 ring-1 ring-emerald-500/30 focus-visible:ring-emerald-500/40'
                        : 'border-rose-400 pr-9 ring-1 ring-rose-400/30 focus-visible:ring-rose-400/40'
                  }
                />
                {typedConfirm.length > 0 && (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm ${
                      confirmTextOk
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-500 dark:text-rose-400'
                    }`}
                  >
                    {confirmTextOk ? '✓' : '×'}
                  </span>
                )}
              </div>
              {typedConfirm.length > 0 && !confirmTextOk && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  No coincide. Debe ser exactamente <code>{state.options.confirmText}</code>.
                </p>
              )}
            </div>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button ref={cancelBtnRef} variant="ghost" onClick={() => handleClose(false)}>
              {state?.options.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button
              ref={confirmBtnRef}
              variant={state?.options.destructive ? 'destructive' : 'default'}
              onClick={() => handleClose(true)}
              disabled={!canConfirm}
            >
              {state?.options.confirmLabel ?? 'Confirmar'}
              {countdown > 0 && (
                <span className="ml-1 tabular-nums opacity-80">({countdown}s)</span>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fallback al confirm nativo si no hay provider — evita romper en tests.
    return async ({ title, description }) => {
      return window.confirm(`${title}${description ? `\n\n${description}` : ''}`);
    };
  }
  return ctx;
}
