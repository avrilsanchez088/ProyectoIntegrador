/**
 * RSS feed de incidents en /status (propuesta 224.2 ronda 20).
 *
 * Útil para que power-users conecten a Slack RSS bots, feedly, etc.
 * Cache 5min — no es real-time pero suficiente para feeds.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';
const PUBLIC_WEB_URL = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3100';

interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: 'minor' | 'major' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  started_at: string;
  resolved_at: string | null;
  affected_components?: string[] | null;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const revalidate = 300; // 5 min cache

export async function GET() {
  let incidents: Incident[] = [];
  try {
    const res = await fetch(`${API_URL}/api/health/incidents`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: Incident[] };
      incidents = body.data ?? [];
    }
  } catch {
    // sin incidents → feed vacío
  }

  const buildDate = new Date().toUTCString();
  const items = incidents
    .map((inc) => {
      const pubDate = new Date(inc.started_at).toUTCString();
      const link = `${PUBLIC_WEB_URL}/status#incident-${inc.id}`;
      const titlePrefix = inc.status === 'resolved' ? '[Resuelto] ' : `[${inc.severity}] `;
      const descParts: string[] = [];
      // Prefix `[components]` cuando hay (propuesta 237.2 ronda 22).
      if (inc.affected_components && inc.affected_components.length > 0) {
        descParts.push(`[${inc.affected_components.join(', ')}]`);
      }
      if (inc.description) descParts.push(inc.description);
      if (inc.resolved_at) {
        descParts.push(`Resuelto: ${new Date(inc.resolved_at).toLocaleString('es-AR')}`);
      }
      return `<item>
  <title>${escapeXml(titlePrefix + inc.title)}</title>
  <link>${escapeXml(link)}</link>
  <guid isPermaLink="false">${escapeXml(inc.id)}</guid>
  <pubDate>${pubDate}</pubDate>
  <category>${escapeXml(inc.severity)}</category>
  <description>${escapeXml(descParts.filter(Boolean).join(' · '))}</description>
</item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Impacto · Status</title>
  <link>${PUBLIC_WEB_URL}/status</link>
  <description>Eventos de status y degradación operacional</description>
  <language>es</language>
  <lastBuildDate>${buildDate}</lastBuildDate>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    },
  });
}
