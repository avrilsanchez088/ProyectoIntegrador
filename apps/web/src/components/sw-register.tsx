'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker `/sw.js` en el browser. Solo en producción
 * (en dev hot-reload no juega bien con SW). §2.7 del audit.
 *
 * Cuando se mueva a @serwist/next este componente se reemplaza por
 * `import { register } from "@serwist/next"`.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Best-effort: si el SW falla en registrarse, la app sigue funcionando.
      });
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
