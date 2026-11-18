import { type NextRequest, NextResponse } from 'next/server';

/**
 * Middleware: protege rutas privadas chequeando que exista la cookie de sesión.
 *
 * Best practice (Next.js 15 + Better Auth):
 * - Acá NO hacemos llamadas a la API ni a la DB para validar la sesión.
 * - Solo chequeamos presencia de cookie. Si no hay → redirect a /sign-in.
 * - La validación real (sesión expirada, revocada) ocurre en cada route handler
 *   o server component que la necesite.
 *
 * https://better-auth.com/docs/integrations/next
 */

const PUBLIC_ROUTES = ['/', '/sign-in', '/sign-up', '/forgot-password', '/reset-password'];
/** Prefijos públicos: cualquier sub-ruta también pasa sin sesión. */
const PUBLIC_PREFIXES = ['/accept-invitation', '/precios'];
const SESSION_COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
}

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = hasSessionCookie(req);

  // Usuario logueado intentando entrar a sign-in/sign-up → mandar a dashboard
  if (hasSession && (pathname === '/sign-in' || pathname === '/sign-up')) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // Ruta pública → seguir
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Cualquier otra ruta requiere sesión
  if (!hasSession) {
    const url = new URL('/sign-in', req.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Aplica a todo menos assets estáticos y la API de Better Auth.
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
};
