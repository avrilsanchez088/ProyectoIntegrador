'use client';

import {
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type ApiError, api } from './api';

/**
 * Family de hooks para llamar a la API con TanStack Query.
 *
 * - `useApiList<T>(key, url)` — listado, devuelve T[]
 * - `useApiItem<T>(key, url)` — detalle, devuelve T (o null)
 * - `useApiMutation<I, O>(url, opts)` — POST/PATCH/DELETE con auto-invalidate
 *
 * Centralizar acá evita el boilerplate de extraer `.data` y el patrón de
 * invalidate manual en cada componente (propuestas 70.1 / 70.2 ronda 6).
 */

export function useApiList<T>(
  queryKey: QueryKey,
  url: string,
  options?: Omit<UseQueryOptions<T[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T[]>({
    queryKey,
    queryFn: () => api<{ data: T[] }>(url).then((r) => r.data),
    staleTime: 30_000,
    ...options,
  });
}

/**
 * `useApiItem` — fetch de un detail. Algunas APIs envuelven en `{data: ...}`,
 * otras devuelven el objeto directo — el helper soporta ambos.
 */
export function useApiItem<T>(
  queryKey: QueryKey,
  url: string,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T>({
    queryKey,
    queryFn: async () => {
      const res = await api<{ data: T } | T>(url);
      if (res && typeof res === 'object' && 'data' in res && Object.keys(res).length === 1) {
        return (res as { data: T }).data;
      }
      return res as T;
    },
    staleTime: 30_000,
    ...options,
  });
}

interface ApiMutationOptions<TInput, TOutput>
  extends Omit<UseMutationOptions<TOutput, ApiError, TInput>, 'mutationFn'> {
  /** HTTP method. Default 'POST'. */
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Lista de queryKeys a invalidar en onSuccess. */
  invalidates?: QueryKey[];
  /**
   * Si la URL depende del input (ej. PATCH /api/bookings/:id), pasá una
   * función. Default: usa `url` literal.
   */
  urlFn?: (input: TInput) => string;
}

export function useApiMutation<TInput = void, TOutput = unknown>(
  url: string,
  options: ApiMutationOptions<TInput, TOutput> = {},
) {
  const queryClient = useQueryClient();
  const { method = 'POST', invalidates, urlFn, ...rest } = options;

  return useMutation<TOutput, ApiError, TInput>({
    mutationFn: async (input) => {
      const finalUrl = urlFn ? urlFn(input) : url;
      const res = await api<{ data: TOutput } | TOutput>(finalUrl, {
        method,
        json: method === 'DELETE' ? undefined : (input as unknown),
      });
      if (res && typeof res === 'object' && 'data' in res) {
        return (res as { data: TOutput }).data;
      }
      return res as TOutput;
    },
    onSuccess: (...args) => {
      if (invalidates && invalidates.length > 0) {
        for (const key of invalidates) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      rest.onSuccess?.(...args);
    },
    ...rest,
  });
}
