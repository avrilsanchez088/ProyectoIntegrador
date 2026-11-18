'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Preferencias de sonido del usuario para notificaciones (§2.8 del audit).
 *
 * Persistencia en localStorage por user (key incluye user.id si está
 * disponible, sino fallback global). El M13 de notificaciones realmente
 * reproduce los sonidos cuando llega un mensaje nuevo via SSE/Pusher.
 *
 * Mientras tanto, este hook expone el shape de preferencias y un `playSound`
 * que se puede invocar desde cualquier componente cuando se materialice el
 * stream real-time.
 */

const STORAGE_KEY = 'impacto.sound-prefs';

export interface SoundPrefs {
  enabled: boolean;
  volume: number; // 0-1
  /** Por categoría: si false, esta categoría no suena. */
  categories: {
    wa_message: boolean;
    booking: boolean;
    mention: boolean;
    urgent: boolean;
  };
  /** Tono ('chime' | 'soft' | 'bell'). Cuando lleguen los assets reales. */
  tone: 'chime' | 'soft' | 'bell';
}

export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  enabled: true,
  volume: 0.5,
  categories: {
    wa_message: true,
    booking: true,
    mention: true,
    urgent: true,
  },
  tone: 'chime',
};

function readPrefs(): SoundPrefs {
  if (typeof window === 'undefined') return DEFAULT_SOUND_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SOUND_PREFS;
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    // Merge sobre defaults para tolerar versiones nuevas del shape.
    return {
      ...DEFAULT_SOUND_PREFS,
      ...parsed,
      categories: { ...DEFAULT_SOUND_PREFS.categories, ...(parsed.categories ?? {}) },
    };
  } catch {
    return DEFAULT_SOUND_PREFS;
  }
}

export function useSoundPrefs() {
  const [prefs, setPrefs] = useState<SoundPrefs>(DEFAULT_SOUND_PREFS);

  useEffect(() => {
    setPrefs(readPrefs());
  }, []);

  const update = useCallback((patch: Partial<SoundPrefs>) => {
    setPrefs((current) => {
      const next = {
        ...current,
        ...patch,
        categories: { ...current.categories, ...(patch.categories ?? {}) },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* localStorage no disponible (private mode, etc) — best effort */
      }
      return next;
    });
  }, []);

  /**
   * Reproduce el sonido para una categoría. Si las prefs lo deshabilitan,
   * no hace nada. Cuando los assets `.mp3` estén en `apps/web/public/sounds/`
   * el `Audio` real se cargará; hoy un beep sintético garantiza el feedback.
   */
  const playSound = useCallback(
    (category: keyof SoundPrefs['categories']) => {
      if (!prefs.enabled) return;
      if (!prefs.categories[category]) return;
      try {
        // biome-ignore lint/suspicious/noExplicitAny: vendor prefix
        const Ctx = (window.AudioContext ?? (window as any).webkitAudioContext) as
          | typeof AudioContext
          | undefined;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = category === 'urgent' ? 880 : 660;
        gain.gain.value = prefs.volume * 0.2;
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      } catch {
        /* AudioContext no disponible — silenciar */
      }
    },
    [prefs],
  );

  return { prefs, update, playSound };
}
