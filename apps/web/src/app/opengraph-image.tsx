import { ImageResponse } from 'next/og';

/**
 * OG image dinámica usando next/og. 1200×630 — estándar para WhatsApp,
 * Facebook, Twitter, LinkedIn. Renderiza SVG vía edge runtime.
 *
 * Cuando haya logo + brand finales, reemplazar el contenido visual.
 */

// `runtime = 'edge'` rompía el prerender en next/og v15 con error
// "Invalid URL" cuando el @vercel/og intenta cargar la fuente via
// fileURLToPath. Lo dejamos como nodejs runtime; OG image se genera
// on-demand sin penalty de build.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Impacto · Reservas vía WhatsApp para alojamientos LATAM';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1e1b4b 100%)',
        padding: '80px',
        color: 'white',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '24px',
          fontWeight: 600,
          opacity: 0.9,
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #2563eb 0%, #9333ea 100%)',
          }}
        />
        Impacto
      </div>

      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <div
          style={{
            fontSize: '72px',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          }}
        >
          Reservas por WhatsApp,
        </div>
        <div
          style={{
            fontSize: '72px',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            background: 'linear-gradient(90deg, #60a5fa 0%, #c084fc 100%)',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          medibles y automatizadas.
        </div>
        <div
          style={{
            marginTop: '24px',
            fontSize: '28px',
            opacity: 0.7,
            maxWidth: '900px',
          }}
        >
          Para alojamientos chicos y medianos en Argentina y Uruguay.
        </div>
      </div>

      <div
        style={{
          marginTop: '40px',
          display: 'flex',
          gap: '32px',
          fontSize: '20px',
          opacity: 0.6,
        }}
      >
        <span>Bot WhatsApp</span>
        <span>·</span>
        <span>Calendario único</span>
        <span>·</span>
        <span>Atribución Meta</span>
      </div>
    </div>,
    { ...size },
  );
}
