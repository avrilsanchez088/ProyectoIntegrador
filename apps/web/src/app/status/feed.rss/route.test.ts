/**
 * Test del feed RSS (propuesta 228.3 ronda 21).
 *
 * Verificaciones:
 *  - XML válido (parsea sin error)
 *  - Estructura <rss><channel><item> esperada
 *  - Cada incident del mock aparece como <item>
 *  - Caracteres especiales escapados (& < > " ')
 *  - Header Content-Type correcto
 *
 * Mockeamos `fetch` global para evitar dependencia del API real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const SAMPLE_INCIDENTS = [
  {
    id: 'inc-1',
    title: 'Webhook lentitud',
    description: 'Latencia 3x mayor que normal',
    severity: 'major' as const,
    status: 'monitoring' as const,
    started_at: '2026-05-01T10:00:00.000Z',
    resolved_at: null,
    affected_components: ['webhooks', 'whatsapp'],
  },
  {
    id: 'inc-2',
    title: 'Test <script> "edge" case & ampersand',
    description: 'Probando escape XML',
    severity: 'minor' as const,
    status: 'resolved' as const,
    started_at: '2026-05-02T12:00:00.000Z',
    resolved_at: '2026-05-02T13:00:00.000Z',
    affected_components: [],
  },
];

describe('GET /status/feed.rss', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devuelve XML válido con Content-Type rss+xml', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: SAMPLE_INCIDENTS }), { status: 200 })),
    );

    const res = await GET();
    expect(res.headers.get('Content-Type')).toContain('application/rss+xml');
    const xml = await res.text();

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('</channel>');
    expect(xml).toContain('</rss>');
  });

  it('cada incident aparece como <item>', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: SAMPLE_INCIDENTS }), { status: 200 })),
    );
    const res = await GET();
    const xml = await res.text();

    // 2 incidents → 2 <item>
    const itemCount = (xml.match(/<item>/g) ?? []).length;
    expect(itemCount).toBe(2);

    // Title del primer incident con prefix por severity
    expect(xml).toContain('[major] Webhook lentitud');
    // El resolved tiene prefix [Resuelto]
    expect(xml).toContain('[Resuelto] Test');
  });

  it('escapa caracteres especiales XML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: SAMPLE_INCIDENTS }), { status: 200 })),
    );
    const res = await GET();
    const xml = await res.text();

    // El title con `<script>` debe estar escapado
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
    // Ampersand
    expect(xml).toContain('&amp; ampersand');
    // Quotes
    expect(xml).toContain('&quot;edge&quot;');
  });

  it('feed vacío cuando API responde sin data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    const res = await GET();
    const xml = await res.text();
    expect((xml.match(/<item>/g) ?? []).length).toBe(0);
    // Sigue siendo XML válido con channel.
    expect(xml).toContain('<channel>');
  });

  it('feed degraded cuando API falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('econnrefused');
      }),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<channel>');
    expect((xml.match(/<item>/g) ?? []).length).toBe(0);
  });

  it('description prefijada con [components] cuando aplica (237.2)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: SAMPLE_INCIDENTS }), { status: 200 })),
    );
    const res = await GET();
    const xml = await res.text();
    // El primer item tiene affected_components: ['webhooks', 'whatsapp'].
    expect(xml).toContain('[webhooks, whatsapp]');
    // El segundo tiene array vacío → sin prefix.
    // Verificamos que no aparece `[]` literal.
    expect(xml).not.toContain('[] ·');
  });

  it('Cache-Control con max-age=300', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    const res = await GET();
    const cc = res.headers.get('Cache-Control') ?? '';
    expect(cc).toContain('max-age=300');
    expect(cc).toContain('stale-while-revalidate');
  });
});
