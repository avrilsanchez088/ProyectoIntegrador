import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn — combina clsx + tailwind-merge.
 * Centralizado en `@impacto/ui` para que apps no dupliquen este helper.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
