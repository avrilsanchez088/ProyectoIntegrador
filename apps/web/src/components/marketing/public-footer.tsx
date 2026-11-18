import type { Route } from 'next';
import Link from 'next/link';

/**
 * Footer público para marketing pages. Sitemap-style nav, helps con SEO
 * (Google rastrea links del footer) y trust visual.
 */
export function PublicFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="block h-6 w-6 rounded bg-gradient-to-br from-blue-600 to-purple-600" />
              Impacto
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Reservas vía WhatsApp para alojamientos chicos y medianos en Argentina y Uruguay.
            </p>
          </div>

          {/* Producto */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
              Producto
            </h3>
            <ul className="space-y-2 text-sm">
              <FooterLink href="/#como-funciona">Cómo funciona</FooterLink>
              <FooterLink href="/precios">Precios</FooterLink>
              <FooterLink href="/#comparativa">Comparativa</FooterLink>
              <FooterLink href="/#faq">Preguntas frecuentes</FooterLink>
            </ul>
          </div>

          {/* Recursos */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
              Recursos
            </h3>
            <ul className="space-y-2 text-sm">
              <FooterLink href="/sign-up">Crear cuenta gratis</FooterLink>
              <FooterLink href="/sign-in">Ingresar</FooterLink>
              <li>
                <a
                  href="mailto:hola@impacto.app"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Contacto
                </a>
              </li>
            </ul>
          </div>

          {/* Legal / empresa */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
              Empresa
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <span className="text-muted-foreground">Impacto Audiovisuales</span>
              </li>
              <li>
                <span className="text-muted-foreground">Hecho en LATAM 🇺🇾 🇦🇷</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Impacto · Todos los derechos reservados</span>
          <span>Versión {process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'}</span>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      {/* href dinámico (mailto, anchor, route) — cast a Route para typedRoutes. */}
      <Link href={href as Route} className="text-muted-foreground hover:text-foreground">
        {children}
      </Link>
    </li>
  );
}
