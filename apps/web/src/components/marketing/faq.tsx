'use client';

import { FaqJsonLd } from '@/components/seo/json-ld';
import { ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

const FAQ_ITEMS = [
  {
    question: '¿Funciona con WhatsApp Business o necesito una cuenta nueva?',
    answer:
      'Funciona con tu número actual. Usamos la WhatsApp Business API (Cloud API de Meta), así que el huésped escribe a tu número y el bot responde como si fueras vos. No vas a perder los chats existentes.',
  },
  {
    question: '¿Sincroniza con Booking y Airbnb sin sobrerreservas?',
    answer:
      'Sí. Importamos por iCal cada 15 minutos (configurable) y la base tiene una restricción a nivel SQL que físicamente impide doble reserva en la misma unidad. Si Booking actualiza con delay, igual está protegido.',
  },
  {
    question: '¿Soporta Mercado Pago? ¿Stripe?',
    answer:
      'Sí, ambos. Mercado Pago es la opción default para LATAM (cobramos seña en pesos AR/UY o USD). Stripe está disponible para huéspedes internacionales o si querés cobrar en USD directo.',
  },
  {
    question: '¿En qué idioma responde el bot?',
    answer:
      'Español neutro LATAM por default. Detecta el idioma del huésped y responde en portugués o inglés cuando aplica. Vos podés cargar tu tono y FAQs en la consola para que suene como vos.',
  },
  {
    question: '¿Qué pasa si el bot no entiende algo?',
    answer:
      'Se escala automáticamente al staff con un toque visual en el inbox y notificación. El huésped no espera horas — el bot responde al toque diciendo que está consultando.',
  },
  {
    question: '¿Cuánto tarda en estar funcionando?',
    answer:
      'Onboarding guiado de ~10 minutos: workspace, propiedad, unidades, tarifas. WhatsApp toma 2-7 días por la verificación de Meta (lo gestionamos nosotros). Mientras tanto podés probar con sandbox.',
  },
  {
    question: '¿Qué pasa con mis datos si me voy?',
    answer:
      'Te exportamos toda tu base (huéspedes, reservas, mensajes) en JSON y CSV cuando quieras. Sin lock-in. Es tu data, no nuestra.',
  },
  {
    question: '¿Hay versión gratis para probar?',
    answer:
      'Sí: 1 unidad reservable + 100 mensajes WhatsApp/mes gratis para siempre. Sin tarjeta de crédito. Si crecés, hay plan Pro.',
  },
];

export function Faq() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <FaqJsonLd items={FAQ_ITEMS} />
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Preguntas frecuentes</h2>
        <p className="mt-3 text-muted-foreground">
          Lo que nos preguntan los dueños antes de probar.
        </p>
      </div>

      <div className="divide-y rounded-xl border bg-card">
        {FAQ_ITEMS.map((item) => (
          <FaqItem key={item.question} {...item} />
        ))}
      </div>
    </section>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        <span className="font-medium">{question}</span>
        <ChevronDown
          className={`size-5 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden"
      >
        <p className="px-5 pb-5 text-sm text-muted-foreground">{answer}</p>
      </motion.div>
    </div>
  );
}
