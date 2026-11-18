'use client';

/**
 * Hook `useT` — wrapper sobre `useTranslations` de next-intl para preservar
 * la API que ya usan los call-sites del proyecto.
 *
 * Uso:
 *   const t = useT();
 *   <h1>{t('bookings.title')}</h1>
 *   <p>{t('errors.overlap')}</p>
 *
 * next-intl proper se integra en `app/layout.tsx` via NextIntlClientProvider
 * + `i18n/request.ts`. Locale por defecto: `es` (español neutro LATAM).
 * Archivos de mensajes en `apps/web/messages/{es,es-AR,es-UY}.json`.
 *
 * Cuando agreguemos un selector de locale, no hay que tocar los call-sites —
 * next-intl resuelve por contexto.
 */

import { useTranslations } from 'next-intl';

export function useT() {
  // Sin namespace = path completo desde la raíz del JSON.
  const t = useTranslations();
  return (key: string, vars?: Record<string, string | number>): string => {
    try {
      // next-intl acepta un segundo arg de variables ICU/{var}.
      return t(key as never, vars as never);
    } catch {
      // Si la key no existe, devolvemos la key cruda — visualmente notorio.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[i18n] missing key: ${key}`);
      }
      return key;
    }
  };
}
