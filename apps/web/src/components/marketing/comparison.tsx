import { Check, X } from 'lucide-react';

/**
 * Tabla comparativa honesta vs competidores. Datos extraídos de research:
 * - Pxsol: precio variable opaco (fijo + 0.5-2% por reserva)
 * - Cloudbeds: cotización privada, ~USD 200+, soporte EN-first
 * - Lodgify: EUR 31-49, sin WhatsApp Business API nativo
 *
 * Mantener honesta: si una columna miente, perdemos credibilidad.
 */

interface Competitor {
  name: string;
  highlight?: boolean;
  priceFromUsd: string;
  whatsappNative: boolean;
  esLatam: boolean;
  mercadoPago: boolean;
  iCalSync: boolean;
  metaAds: boolean;
}

const COMPETITORS: Competitor[] = [
  {
    name: 'Impacto',
    highlight: true,
    priceFromUsd: 'Free para 1 unidad',
    whatsappNative: true,
    esLatam: true,
    mercadoPago: true,
    iCalSync: true,
    metaAds: true,
  },
  {
    name: 'Cloudbeds',
    priceFromUsd: '~200+ (cotización)',
    whatsappNative: false,
    esLatam: false,
    mercadoPago: false,
    iCalSync: true,
    metaAds: false,
  },
  {
    name: 'Lodgify',
    priceFromUsd: '~35+ (EUR 31-49)',
    whatsappNative: false,
    esLatam: false,
    mercadoPago: false,
    iCalSync: true,
    metaAds: false,
  },
  {
    name: 'Pxsol',
    priceFromUsd: 'Mix fijo + % por reserva',
    whatsappNative: false,
    esLatam: true,
    mercadoPago: true,
    iCalSync: true,
    metaAds: false,
  },
];

const ROWS: {
  label: string;
  key: keyof Omit<Competitor, 'name' | 'highlight' | 'priceFromUsd'>;
}[] = [
  { label: 'WhatsApp Business API + bot AI nativo', key: 'whatsappNative' },
  { label: 'Soporte y UI en español neutro LATAM', key: 'esLatam' },
  { label: 'Mercado Pago integrado', key: 'mercadoPago' },
  { label: 'Sync iCal Booking + Airbnb + Google', key: 'iCalSync' },
  { label: 'Atribución a Meta Ads (CAPI)', key: 'metaAds' },
];

export function Comparison() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Compará lo que cuesta tener todo en uno
        </h2>
        <p className="mt-3 text-muted-foreground">
          Datos públicos al 2026. Sin trampas: si tu PMS actual hace algo mejor, decinos.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-4 text-left font-medium text-muted-foreground" />
              {COMPETITORS.map((c) => (
                <th
                  key={c.name}
                  className={`px-4 py-4 text-center font-semibold ${
                    c.highlight
                      ? 'bg-gradient-to-b from-blue-50 to-transparent dark:from-blue-950/30'
                      : ''
                  }`}
                >
                  {c.name}
                  {c.highlight && (
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">
                      Recomendado
                    </span>
                  )}
                </th>
              ))}
            </tr>
            <tr className="border-b text-muted-foreground">
              <td className="px-4 py-3 text-left text-xs uppercase tracking-wider">Precio desde</td>
              {COMPETITORS.map((c) => (
                <td
                  key={c.name}
                  className={`px-4 py-3 text-center text-xs ${c.highlight ? 'bg-blue-50/50 font-medium dark:bg-blue-950/20' : ''}`}
                >
                  {c.priceFromUsd}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-b last:border-b-0">
                <td className="px-4 py-3 text-left">{row.label}</td>
                {COMPETITORS.map((c) => (
                  <td
                    key={c.name}
                    className={`px-4 py-3 text-center ${c.highlight ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                  >
                    {c[row.key] ? (
                      <Check className="mx-auto size-5 text-emerald-600" aria-label="Sí" />
                    ) : (
                      <X
                        className="mx-auto size-5 text-zinc-300 dark:text-zinc-700"
                        aria-label="No"
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Fuentes: páginas de pricing públicas + reseñas de Capterra y G2 al 2026.
      </p>
    </section>
  );
}
