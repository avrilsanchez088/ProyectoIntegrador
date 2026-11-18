import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

/**
 * Crea un nuevo QueryClient. En el server creamos uno por request.
 * En el cliente reusamos el mismo durante la vida del browser.
 *
 * Política global de errores (browser-only):
 *  - 401 (Unauthorized) → redirect a /sign-in?redirect=<currentPath>.
 *    La sesión expiró o la cookie fue revocada. Sin handler global,
 *    cada page tendría que detectar y manejarlo. Centralizado aquí.
 */
export function makeQueryClient() {
  const handle401 = (err: unknown) => {
    if (typeof window === 'undefined') return;
    if (err instanceof ApiError && err.status === 401) {
      const here = window.location.pathname + window.location.search;
      // Evitar loop si ya estamos en sign-in.
      if (here.startsWith('/sign-in')) return;
      window.location.replace(`/sign-in?redirect=${encodeURIComponent(here)}`);
    }
  };

  return new QueryClient({
    queryCache: new QueryCache({ onError: handle401 }),
    mutationCache: new MutationCache({ onError: handle401 }),
    defaultOptions: {
      queries: {
        // Datos "frescos" durante 30s — evita refetches en navegación rápida.
        staleTime: 30_000,
        // No refetch al cambiar de pestaña por default (lo activamos a propósito en queries específicos).
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

/**
 * Singleton del cliente browser. NO usar en server components.
 */
let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // En el server, una instancia nueva por request (Next.js maneja esto via React's cache).
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
