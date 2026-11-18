// Twitter card reusa la misma OG image — Twitter acepta el formato 1200×630.
// Re-exportamos el default por separado de los config exports (segun docs
// Next.js, todos los config segments deben ser exports literales en el archivo).
import Image from './opengraph-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Impacto · Reservas vía WhatsApp para alojamientos LATAM';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default Image;
