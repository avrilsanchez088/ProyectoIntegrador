'use client';

import { type Variants, motion, useReducedMotion } from 'motion/react';

/**
 * Wrapper de animación de entrada al hacer scroll.
 * - Respeta `prefers-reduced-motion`
 * - Sólo anima `opacity` + `transform` (GPU compositor — no toca layout)
 * - `once: true` para que dispare una sola vez (mejor performance + no distrae)
 */

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  /** Distancia inicial en px sobre el eje Y. Negativo = desde arriba. */
  y?: number;
}

export function Reveal({ children, delay = 0, className, y = 16 }: RevealProps) {
  const reduce = useReducedMotion();

  const variants: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : y },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={variants}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
