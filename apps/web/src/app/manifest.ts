import type { MetadataRoute } from 'next';

/**
 * PWA manifest. Hospitality + B2B + uso diario es caso ideal de PWA:
 * dueños/recepcionistas vuelven 10x/día al inbox.
 *
 * Icons en `public/icons/` — placeholder; reemplazar cuando haya logo final.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Impacto · Reservas vía WhatsApp',
    short_name: 'Impacto',
    description: 'SaaS de reservas para alojamientos LATAM',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0a0a0a',
    lang: 'es',
    orientation: 'portrait-primary',
    categories: ['business', 'productivity', 'travel'],
    icons: [
      // Vector logo. Cualquier tamaño escala bien — soluciona §2.6 mientras
      // no haya iconos PNG finales.
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      // PNG raster (placeholders — reemplazar cuando haya logo final).
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
