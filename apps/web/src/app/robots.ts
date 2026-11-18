import type { MetadataRoute } from 'next';

const PUBLIC_URL =
  process.env.NEXT_PUBLIC_WEB_URL ?? process.env.PUBLIC_WEB_URL ?? 'http://localhost:3100';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/sign-in', '/sign-up', '/onboarding/'],
      },
    ],
    sitemap: `${PUBLIC_URL}/sitemap.xml`,
    host: PUBLIC_URL,
  };
}
