/**
 * Cliente HTTP minimalista para llamar a la API de Impacto.
 * Maneja credenciales (cookies de Better Auth), errores, JSON automático
 * y conditional GET con ETag (propuesta 98.1 ronda 8).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Cache de ETag → body para soportar conditional GET. Cuando la API
 * devuelve 304, devolvemos el body cached. Evita re-parsing + reduce
 * payload servidor→cliente.
 *
 * In-memory por session — no persiste entre reloads. Para persist usar
 * `localStorage` (TBD si la latencia lo amerita).
 */
const etagCache = new Map<string, { etag: string; body: unknown; ts: number }>();
const ETAG_TTL_MS = 5 * 60 * 1000; // 5min — coherente con `Cache-Control: max-age` típico

export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const method = (init?.method ?? 'GET').toUpperCase();
  const cacheKey = `${method}:${path}`;

  // Conditional GET: si tenemos un ETag cached para este path, lo enviamos.
  // Solo aplica a GET sin body (otros métodos cambian state).
  const cached = method === 'GET' ? etagCache.get(cacheKey) : null;

  // Construir headers como Record<string, string> plano para evitar conflicts
  // con HeadersInit (que puede ser Headers | string[][] | Record).
  const finalHeaders: Record<string, string> = {};
  if (json !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (cached && cached.ts + ETAG_TTL_MS > Date.now()) {
    finalHeaders['If-None-Match'] = cached.etag;
  }
  if (headers) {
    // Normalizar HeadersInit del caller a entries.
    const callerHeaders = new Headers(headers);
    callerHeaders.forEach((value, key) => {
      finalHeaders[key] = value;
    });
  }

  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: finalHeaders,
    body: json !== undefined ? JSON.stringify(json) : init?.body,
    ...rest,
  });

  // 304 Not Modified → devolver el cached body. La API ahorró la query y
  // nosotros el parse + transfer.
  if (res.status === 304 && cached) {
    return cached.body as T;
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(
      // biome-ignore lint/suspicious/noExplicitAny: error body is loose
      (body as any)?.message ?? (body as any)?.error ?? res.statusText,
      res.status,
      body,
    );
  }

  // Si la API devolvió ETag, cachear para próximo GET.
  if (method === 'GET') {
    const etag = res.headers.get('etag');
    if (etag) {
      etagCache.set(cacheKey, { etag, body, ts: Date.now() });
    }
  } else {
    // Cualquier mutation invalida el cache de ETags relacionados.
    // Estrategia simple: limpiar todos. Más elegante sería invalidar por
    // prefix de path pero simple-stupid funciona.
    etagCache.clear();
  }

  return body as T;
}
