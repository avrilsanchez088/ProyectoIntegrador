/**
 * Configuración de i18n. §2.11 del audit.
 *
 * Decisión 2026-05-06 (CLAUDE.md §3): UI en español neutro LATAM como base
 * (`es`), con overrides regionales para AR / UY. El bot del huésped puede
 * usar el del país detectado por el teléfono.
 *
 * Implementación:
 *  - Sin dep `next-intl` instalada todavía (pendiente de `pnpm install`).
 *  - Cuando se instale, este file alimenta `i18n/request.ts` y el middleware.
 *  - Los archivos `messages/*.json` ya están listos.
 *  - Mientras tanto, los componentes pueden importar `useTranslations()`
 *    desde `@/i18n/runtime` que devuelve un fallback que matchea las keys.
 */

export const SUPPORTED_LOCALES = ['es', 'es-AR', 'es-UY'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

/** Heurística para inferir locale desde país (tenant_settings.country). */
export function localeFromCountry(country: string | null | undefined): Locale {
  if (country === 'AR') return 'es-AR';
  if (country === 'UY') return 'es-UY';
  return DEFAULT_LOCALE;
}

/**
 * Carga sincrónica del bundle de mensajes. En el futuro `next-intl` lo hace
 * via `getRequestConfig`; por ahora es plain JSON import.
 */
export async function loadMessages(locale: Locale) {
  switch (locale) {
    case 'es-AR':
      return (await import('../../messages/es-AR.json')).default;
    case 'es-UY':
      return (await import('../../messages/es-UY.json')).default;
    default:
      return (await import('../../messages/es.json')).default;
  }
}
