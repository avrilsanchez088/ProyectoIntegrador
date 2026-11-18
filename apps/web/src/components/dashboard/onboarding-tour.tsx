'use client';

import { Button } from '@impacto/ui/button';
import { useEffect, useState } from 'react';

/**
 * Tour onboarding básico con popovers (§2.9 del audit).
 *
 * Antes promiseaba Driver.js / Shepherd / etc. (CLAUDE.md §12). Esta versión
 * no introduce dependencia nueva: monta un overlay sobre `<body>`, dibuja un
 * recorte alrededor del elemento target via `data-tour-target` y muestra una
 * pequeña card con texto + botones.
 *
 * Persistencia: localStorage `impacto.tour.dismissed` y `impacto.tour.completed`.
 *
 * Disparadores:
 *  - Auto: en /dashboard la primera vez que el usuario tiene una org pero
 *    SetupChecklist está incompleto.
 *  - Manual: `<button onClick={() => startTour()}>` en cualquier lado.
 */

interface Step {
  selector: string; // CSS selector del target
  title: string;
  description: string;
}

const TOUR_STEPS: Step[] = [
  {
    selector: '[data-tour="checklist"]',
    title: 'Tu checklist de configuración',
    description:
      'Estos son los pasos que faltan para que el bot esté operativo. Al completarlos desaparece esta card.',
  },
  {
    selector: '[data-tour="cmdk"]',
    title: 'Buscador rápido (⌘ K)',
    description:
      'Abrí el command palette con ⌘K (Ctrl+K en Windows) para navegar y crear cosas sin mouse. Tipeá "?" para ver atajos.',
  },
  {
    selector: '[data-tour="bell"]',
    title: 'Notificaciones in-app',
    description:
      'Cuando llegue una reserva o un mensaje vas a verlo acá. Configurá los sonidos en Configuración → Sonidos del inbox.',
  },
  {
    selector: '[data-tour="theme"]',
    title: 'Modo claro/oscuro',
    description: 'Cambiá el tema visual cuando quieras. Tu preferencia se recuerda.',
  },
];

const DISMISS_KEY = 'impacto.tour.dismissed';
const COMPLETED_KEY = 'impacto.tour.completed';

function getRect(el: Element | null) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function OnboardingTour({
  open: controlledOpen,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<ReturnType<typeof getRect>>(null);

  const step = TOUR_STEPS[stepIdx];

  useEffect(() => {
    if (!controlledOpen || !step) return;
    const update = () => {
      const target = document.querySelector(step.selector);
      setRect(getRect(target));
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    update();
    const onScroll = () => update();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', update);
    };
  }, [controlledOpen, step]);

  if (!controlledOpen || !step) return null;

  const close = (completed: boolean) => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
      if (completed) localStorage.setItem(COMPLETED_KEY, '1');
    } catch {
      /* ignore */
    }
    setStepIdx(0);
    onClose();
  };

  const next = () => {
    if (stepIdx + 1 < TOUR_STEPS.length) setStepIdx((i) => i + 1);
    else close(true);
  };

  const prev = () => {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  };

  return (
    <div
      className="fixed inset-0 z-100 pointer-events-none"
      role="dialog"
      aria-label={`Tour onboarding: paso ${stepIdx + 1} de ${TOUR_STEPS.length}`}
    >
      {/* Overlay con "spotlight" (un rect transparente sobre el target) */}
      <svg
        className="absolute inset-0 h-full w-full pointer-events-auto"
        onClick={() => close(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
            e.preventDefault();
            close(false);
          }
        }}
        aria-hidden="true"
        tabIndex={-1}
      >
        <title>Overlay tour</title>
        <defs>
          <mask id="impacto-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - 6}
                y={rect.top - 6}
                width={rect.width + 12}
                height={rect.height + 12}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#impacto-tour-mask)" />
      </svg>

      {/* Card de instrucciones */}
      <div
        className="absolute pointer-events-auto z-101"
        style={
          rect
            ? {
                top: Math.min(rect.top + rect.height + 12, window.innerHeight - 200),
                left: Math.min(Math.max(rect.left, 16), window.innerWidth - 360),
              }
            : { top: 80, left: 80 }
        }
      >
        <div className="w-85 rounded-lg border bg-popover p-4 shadow-xl">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Paso {stepIdx + 1} de {TOUR_STEPS.length}
          </p>
          <h3 className="mt-1 text-base font-semibold">{step.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={() => close(false)}>
              Saltar tour
            </Button>
            <div className="flex gap-2">
              {stepIdx > 0 && (
                <Button size="sm" variant="outline" onClick={prev}>
                  Atrás
                </Button>
              )}
              <Button size="sm" onClick={next}>
                {stepIdx + 1 === TOUR_STEPS.length ? 'Listo' : 'Siguiente'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook que decide si auto-mostrar el tour la primera vez.
 * Convención: solo en /dashboard, solo si no se descartó/completó antes.
 */
export function useOnboardingTour(autoTrigger: boolean) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!autoTrigger) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) || localStorage.getItem(COMPLETED_KEY)) return;
    } catch {
      /* ignore */
    }
    // Pequeño delay para que se monte la UI antes de pintar el spotlight.
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [autoTrigger]);

  return {
    open,
    start: () => setOpen(true),
    close: () => setOpen(false),
  };
}
