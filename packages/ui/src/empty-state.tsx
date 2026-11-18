import { cn } from '@impacto/ui/utils';
import type { Route } from 'next';
import Link from 'next/link';
import { Button } from './button';

/**
 * Empty state reutilizable con ilustración SVG inline.
 *
 * Pattern: en lugar de un Card vacío con "Sin X todavía", mostramos una
 * ilustración + título corto + descripción + CTA. Es más invitante y deja
 * claro qué hacer a continuación.
 *
 * Las ilustraciones son SVG inline minimalistas — sin assets externos,
 * cero requests, dark mode automático con `currentColor`.
 */

type IllustrationKey = 'calendar' | 'properties' | 'block' | 'sync' | 'policy' | 'inbox' | 'units';

interface EmptyStateProps {
  illustration: IllustrationKey;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: Route;
  className?: string;
}

export function EmptyState({
  illustration,
  title,
  description,
  actionLabel,
  actionHref,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-4 text-muted-foreground/60">
        <Illustration name={illustration} />
      </div>
      <h3 className="mb-1 text-base font-semibold tracking-tight">{title}</h3>
      <p className="mb-5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && actionHref && (
        <Button asChild>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}

function Illustration({ name }: { name: IllustrationKey }) {
  const common = {
    width: 96,
    height: 96,
    viewBox: '0 0 96 96',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;

  switch (name) {
    case 'calendar':
      return (
        <svg {...common} aria-hidden="true">
          <title>Calendario</title>
          <rect x="14" y="22" width="68" height="58" rx="6" />
          <path d="M14 38h68" />
          <path d="M30 14v14M66 14v14" />
          <circle cx="32" cy="54" r="2" fill="currentColor" />
          <circle cx="48" cy="54" r="2" fill="currentColor" />
          <circle cx="64" cy="54" r="2" fill="currentColor" />
          <circle cx="32" cy="68" r="2" fill="currentColor" />
          <circle cx="48" cy="68" r="2" fill="currentColor" />
        </svg>
      );
    case 'properties':
      return (
        <svg {...common} aria-hidden="true">
          <title>Propiedades</title>
          <path d="M16 80V42L48 18l32 24v38" />
          <path d="M16 80h64" />
          <rect x="38" y="56" width="20" height="24" />
          <path d="M48 18v8" />
          <circle cx="48" cy="68" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'units':
      return (
        <svg {...common} aria-hidden="true">
          <title>Unidades</title>
          <rect x="12" y="36" width="32" height="44" rx="3" />
          <rect x="52" y="20" width="32" height="60" rx="3" />
          <path d="M20 50h16M20 60h16M20 70h16" />
          <path d="M60 32h16M60 44h16M60 56h16M60 68h16" />
        </svg>
      );
    case 'block':
      return (
        <svg {...common} aria-hidden="true">
          <title>Bloqueo</title>
          <circle cx="48" cy="48" r="32" />
          <path d="M26 26l44 44" />
          <path d="M40 48h16" strokeWidth="2" />
        </svg>
      );
    case 'sync':
      return (
        <svg {...common} aria-hidden="true">
          <title>Sincronizar</title>
          <path d="M68 26a26 26 0 1 0 6 16" />
          <path d="M76 14v16h-16" />
          <circle cx="48" cy="48" r="6" fill="currentColor" opacity="0.2" />
        </svg>
      );
    case 'policy':
      return (
        <svg {...common} aria-hidden="true">
          <title>Política</title>
          <path d="M28 16h32l12 12v52H28z" />
          <path d="M60 16v12h12" />
          <path d="M38 44h20M38 54h20M38 64h12" />
        </svg>
      );
    case 'inbox':
      return (
        <svg {...common} aria-hidden="true">
          <title>Inbox vacío</title>
          <path d="M16 50l8-26h48l8 26" />
          <path d="M16 50v22a4 4 0 0 0 4 4h56a4 4 0 0 0 4-4V50" />
          <path d="M16 50h20l4 8h16l4-8h20" />
        </svg>
      );
  }
}
