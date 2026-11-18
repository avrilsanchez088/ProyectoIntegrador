'use client';

import { motion, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';

/**
 * Wrapper que anima la entrada de cada page del dashboard al cambiar de ruta.
 * Usa `pathname` como key para forzar remount + animación.
 *
 * Solo `opacity` (sin Y/scale) — sutil, no distrae, no toca layout.
 * Respeta `prefers-reduced-motion`.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
