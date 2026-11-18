'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

/**
 * Widget que simula una conversación de WhatsApp donde el bot responde,
 * cotiza y cierra reserva. Es el "aha moment" del producto en la landing.
 *
 * Sin lib externa de chat — render manual con Motion para tener control fino.
 * Reinicia automáticamente cada 30s para que un visitante que haga scroll
 * vuelva a verlo.
 */

interface Msg {
  from: 'guest' | 'bot';
  text: string;
  /** Delay antes de mostrar este mensaje, en ms. */
  delay: number;
}

const SCRIPT: Msg[] = [
  { from: 'guest', text: 'Hola, ¿tenés disponibilidad para el finde del 15?', delay: 600 },
  {
    from: 'bot',
    text: '¡Hola Juan! Sí, te ofrecemos:\n• Cabaña Aurora · 2 pax · USD 180/noche\n• Cabaña Bosque · 4 pax · USD 240/noche',
    delay: 1800,
  },
  { from: 'guest', text: 'La Aurora me interesa. ¿Cuánto sería 2 noches?', delay: 1500 },
  {
    from: 'bot',
    text: '2 noches × USD 180 = USD 360\n+ Limpieza: USD 25\n*Total: USD 385*\n\n¿Querés reservar? Te paso link de seña por Mercado Pago 👇',
    delay: 2200,
  },
  { from: 'guest', text: '¡Sí, dale!', delay: 1200 },
  {
    from: 'bot',
    text: '🔒 mp.com.ar/checkout/AB12X · USD 100 de seña\n\nReserva confirmada al pagar ✅',
    delay: 1500,
  },
];

export function WhatsAppDemo() {
  const [shown, setShown] = useState(0);
  const [tick, setTick] = useState(0);
  const reduce = useReducedMotion();

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick es trigger explícito de reset
  useEffect(() => {
    if (shown >= SCRIPT.length) {
      const t = setTimeout(() => {
        setShown(0);
        setTick((v) => v + 1);
      }, 5000);
      return () => clearTimeout(t);
    }
    const next = SCRIPT[shown];
    if (!next) return;
    const t = setTimeout(() => setShown((v) => v + 1), next.delay);
    return () => clearTimeout(t);
  }, [shown, tick]);

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Phone frame */}
      <div className="overflow-hidden rounded-[2rem] border-8 border-zinc-900 bg-[#075e54] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
            🏡
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Cabañas Meraki</div>
            <div className="text-xs leading-tight text-white/70">en línea</div>
          </div>
        </div>

        {/* Chat */}
        <div
          className="flex h-[420px] flex-col gap-2 overflow-hidden bg-[#e5ddd5] bg-opacity-80 px-3 py-4"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22 viewBox=%220 0 80 80%22%3E%3Cpath fill=%22%23d9d2c8%22 fill-opacity=%220.4%22 d=%22M14 16H9v-2h5V9.87a4 4 0 1 1 2 0V14h5v2h-5v15.95A10 10 0 0 0 23.66 27l-3.46-2 8.2-2.2-2.9 5a12 12 0 0 1-21 0l-2.89-5 8.2 2.2-3.47 2A10 10 0 0 0 14 31.95V16zm40 40h-5v-2h5v-4.13a4 4 0 1 1 2 0V54h5v2h-5v15.95A10 10 0 0 0 63.66 67l-3.46-2 8.2-2.2-2.9 5a12 12 0 0 1-21 0l-2.89-5 8.2 2.2-3.47 2A10 10 0 0 0 54 71.95V56zm-39 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm40-40a2 2 0 1 1 0-4 2 2 0 0 1 0 4z%22/%3E%3C/svg%3E")',
          }}
        >
          {SCRIPT.slice(0, shown).map((msg, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lista fija replayed con tick — re-mounts con cada ciclo
            <Bubble key={`${tick}-${i}`} msg={msg} reduce={!!reduce} />
          ))}
          {shown < SCRIPT.length && shown > 0 && SCRIPT[shown]?.from === 'bot' && (
            <TypingIndicator />
          )}
        </div>
      </div>

      {/* Glow effect */}
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-[3rem] bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-transparent blur-3xl" />
    </div>
  );
}

function Bubble({ msg, reduce }: { msg: Msg; reduce: boolean }) {
  const isBot = msg.from === 'bot';
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}
    >
      <div
        className={`max-w-[80%] whitespace-pre-line rounded-lg px-3 py-2 text-sm shadow ${
          isBot
            ? 'rounded-tl-none bg-white text-zinc-900'
            : 'rounded-tr-none bg-[#dcf8c6] text-zinc-900'
        }`}
      >
        {formatBoldRunes(msg.text)}
        <div className="mt-1 text-right text-[10px] text-zinc-500">{nowHHMM()}</div>
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
      <div className="rounded-lg rounded-tl-none bg-white px-4 py-3 shadow">
        <div className="flex gap-1">
          <Dot delay={0} />
          <Dot delay={0.2} />
          <Dot delay={0.4} />
        </div>
      </div>
    </motion.div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <motion.span
      className="block h-2 w-2 rounded-full bg-zinc-400"
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay, ease: 'easeInOut' }}
    />
  );
}

/** Renderiza *texto* como bold dentro de los mensajes (estilo WhatsApp). */
function formatBoldRunes(text: string): React.ReactNode {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    const k = `${i}-${part}`;
    if (part.startsWith('*') && part.endsWith('*')) {
      return <strong key={k}>{part.slice(1, -1)}</strong>;
    }
    return <span key={k}>{part}</span>;
  });
}

function nowHHMM(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}
