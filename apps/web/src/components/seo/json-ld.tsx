/**
 * JSON-LD structured data para Google y Meta. Renderiza scripts inline
 * con `application/ld+json`. Sin client-side cost — sólo es texto en HTML.
 *
 * Schemas incluidos:
 * - SoftwareApplication: el SaaS Impacto en sí
 * - Organization: la empresa
 * - WebSite con SearchAction (cuando agreguemos /blog interno)
 *
 * Las FAQ schemas viven en su propia página (es buena práctica que matcheen
 * con el contenido visible) — usar `<FaqJsonLd />` en componentes específicos.
 */

const PUBLIC_URL =
  process.env.NEXT_PUBLIC_WEB_URL ?? process.env.PUBLIC_WEB_URL ?? 'http://localhost:3100';

const softwareApplication = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Impacto',
  description:
    'SaaS de reservas vía WhatsApp para alojamientos chicos y medianos en LATAM. Bot AI que cotiza y reserva, calendario único Booking + Airbnb + Google, atribución a Meta Ads.',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Property Management Software',
  operatingSystem: 'Web',
  url: PUBLIC_URL,
  inLanguage: ['es-AR', 'es-UY', 'es-ES'],
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'USD',
    lowPrice: '0',
    highPrice: '99',
    offerCount: '3',
  },
  featureList: [
    'Bot de WhatsApp con IA',
    'Calendario único con sincronización Booking, Airbnb y Google Calendar',
    'Atribución de reservas a Meta Ads vía CAPI',
    'Cobros con Mercado Pago',
    'Reglas de precios por temporada y unidad',
    'Multi-tenant con roles',
  ],
};

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Impacto',
  legalName: 'Impacto Audiovisuales',
  url: PUBLIC_URL,
  logo: `${PUBLIC_URL}/logo.png`,
  description: 'SaaS de reservas vía WhatsApp para alojamientos LATAM.',
  areaServed: ['AR', 'UY'],
  sameAs: [],
};

const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Impacto',
  url: PUBLIC_URL,
  inLanguage: 'es',
  publisher: {
    '@type': 'Organization',
    name: 'Impacto',
    url: PUBLIC_URL,
  },
};

export function JsonLd() {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD pattern estándar
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD pattern estándar
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD pattern estándar
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  );
}

/**
 * Genera structured data para una sección FAQ. Renderizalo en la misma página
 * donde están las preguntas visibles (Google requiere paridad).
 */
export function FaqJsonLd({ items }: { items: { question: string; answer: string }[] }) {
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD pattern estándar
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
    />
  );
}
