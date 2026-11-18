import { Providers } from '@/components/providers';
import { JsonLd } from '@/components/seo/json-ld';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { themeScript } from '@/components/theme-provider';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const PUBLIC_URL =
  process.env.NEXT_PUBLIC_WEB_URL ?? process.env.PUBLIC_WEB_URL ?? 'http://localhost:3100';

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_URL),
  title: {
    default: 'Impacto · Reservas vía WhatsApp para alojamientos LATAM',
    template: '%s · Impacto',
  },
  description:
    'El sistema comercial para alojamientos chicos y medianos en Argentina y Uruguay. Bot de WhatsApp que reserva, calendario único Booking + Airbnb + Google, atribución a Meta Ads.',
  keywords: [
    'software para cabañas',
    'PMS hostal',
    'channel manager Uruguay',
    'sistema de reservas WhatsApp',
    'software alquiler temporario Argentina',
    'evitar overbooking Booking Airbnb',
    'gestión cabañas',
    'motor de reservas Mercado Pago',
  ],
  authors: [{ name: 'Impacto Audiovisuales' }],
  creator: 'Impacto Audiovisuales',
  publisher: 'Impacto',
  applicationName: 'Impacto',
  category: 'Business Software',
  alternates: {
    canonical: '/',
    languages: {
      'es-AR': '/',
      'es-UY': '/',
      es: '/',
      'x-default': '/',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    alternateLocale: ['es_UY', 'es_ES'],
    url: PUBLIC_URL,
    siteName: 'Impacto',
    title: 'Impacto · Reservas vía WhatsApp para alojamientos LATAM',
    description:
      'Bot de WhatsApp que cotiza y reserva 24/7. Calendario único con Booking + Airbnb + Google. Atribución real a Meta Ads. Hecho en LATAM.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Impacto · Reservas vía WhatsApp',
    description:
      'Bot WhatsApp + calendario único + atribución Meta. Para alojamientos chicos y medianos en LATAM.',
    creator: '@impacto',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-video-preview': -1,
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
    other: {
      'facebook-domain-verification': process.env.NEXT_PUBLIC_META_VERIFICATION ?? '',
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  colorScheme: 'light dark',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning className={inter.variable}>
      <head>
        {/* Anti-FOUC: aplica .dark antes de hydrate. Inline para que corra sync. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: pattern estándar para evitar FOUC
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-background"
        >
          Saltar al contenido
        </a>
        <JsonLd />
        <ServiceWorkerRegister />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <Toaster
          richColors
          closeButton
          theme="system"
          /* En desktop bottom-right; en mobile top-center para no chocar con el bottom-nav del dashboard (G8.8). */
          position="bottom-right"
          mobileOffset={{ top: '1rem' }}
          offset={{ bottom: '5.5rem' }}
        />
      </body>
    </html>
  );
}
