'use client';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@impacto/ui/button';
import { Menu, X } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';

/**
 * Top nav reutilizable para páginas marketing (/, /precios, etc).
 * Sticky, blur background, mobile drawer simple.
 */
export function PublicNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="block h-7 w-7 rounded-md bg-gradient-to-br from-blue-600 to-purple-600" />
          Impacto
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 sm:flex">
          <NavLink href="/#como-funciona">Cómo funciona</NavLink>
          <NavLink href="/precios">Precios</NavLink>
          <NavLink href="/#comparativa">Comparativa</NavLink>
          <NavLink href="/#faq">Preguntas</NavLink>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-in">Ingresar</Link>
          </Button>
          <Button asChild size="sm" variant="brand">
            <Link href="/sign-up">Empezar</Link>
          </Button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted sm:hidden"
            aria-label="Menú"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t bg-background sm:hidden">
          <div className="flex flex-col gap-1 p-3">
            <Link
              href="/#como-funciona"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Cómo funciona
            </Link>
            <Link
              href="/precios"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Precios
            </Link>
            <Link
              href="/#comparativa"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Comparativa
            </Link>
            <Link
              href="/#faq"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Preguntas
            </Link>
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Ingresar
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href as Route}
      className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  );
}
