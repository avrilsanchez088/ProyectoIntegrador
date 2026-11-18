import type { MetadataRoute } from 'next';

const PUBLIC_URL =
  process.env.NEXT_PUBLIC_WEB_URL ?? process.env.PUBLIC_WEB_URL ?? 'http://localhost:3100';

/**
 * Sitemap público. Por ahora sólo páginas estáticas marketing-side.
 * El dashboard (/dashboard, /sign-in, /sign-up) NO va al sitemap — son privadas.
 *
 * Cuando agreguemos /blog dinámico, mappear acá las posts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${PUBLIC_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: {
        languages: {
          'es-AR': PUBLIC_URL,
          'es-UY': PUBLIC_URL,
        },
      },
    },
    {
      url: `${PUBLIC_URL}/precios`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
  ];
}
