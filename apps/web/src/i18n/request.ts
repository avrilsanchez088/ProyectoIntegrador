import { getRequestConfig } from 'next-intl/server';

/**
 * next-intl request config — server-side por request.
 *
 * Estrategia (CLAUDE.md §3): UI en español neutro LATAM por defecto. Por
 * ahora un solo locale (`es`); la infraestructura queda lista para sumar
 * `pt` (Brasil) o `en` (admins extranjeros) cuando se necesite — basta
 * agregar otro archivo en `messages/` y exponer el switch en el header.
 *
 * No usamos routing prefijado (`/es/dashboard`) porque hoy es single-locale.
 * Cuando se agreguen idiomas, migrar a [routing](https://next-intl.dev/docs/routing).
 */
export default getRequestConfig(async () => {
  const locale = 'es';
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'America/Montevideo',
    now: new Date(),
  };
});
