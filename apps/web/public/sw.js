/* global self, caches, fetch */
/**
 * Service worker mínimo para Impacto PWA (§2.7 del audit).
 *
 * Cuando se introduzca @serwist/next o next-pwa este archivo se reemplaza por
 * uno generado. Mientras tanto, esta versión a mano provee:
 *   - precache de la shell (offline fallback)
 *   - estrategia stale-while-revalidate para fetches GET
 *   - bypass de /api/* (siempre network-first, sin cache)
 *
 * Versionado: cambiar CACHE_VERSION rompe caches viejos.
 */

const CACHE_VERSION = 'impacto-v1';
const SHELL_URLS = ['/', '/dashboard', '/sign-in', '/sign-up', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {
        // Si falla el precache (offline al instalar), no bloquear el install.
      }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo cachear GET del mismo origen.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // /api/* y /webhooks/*: nunca cachear — datos en vivo.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/webhooks/')) return;

  // /ical/*: tampoco — tokens públicos rotables.
  if (url.pathname.startsWith('/ical/')) return;

  // Stale-while-revalidate para todo lo demás.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          // Solo cacheamos respuestas OK.
          if (response.ok && response.status < 400) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});

// Web Push (skeleton — activar cuando lleguen credenciales VAPID en M13).
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Impacto', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Impacto', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/dashboard' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const found = clients.find((c) => c.url.includes(url));
      if (found) return found.focus();
      return self.clients.openWindow(url);
    }),
  );
});
