/**
 * Tests para el middleware de protección de rutas.
 * Comprueba que rutas públicas pasan, privadas redirigen, y autenticadas
 * son redirigidas fuera de las páginas de auth.
 */
import { describe, expect, it, vi } from 'vitest';
import { middleware } from './middleware';

function makeRequest(pathname: string, hasCookie = false) {
  const url = `http://localhost:3100${pathname}`;
  return {
    nextUrl: new URL(url),
    url,
    cookies: {
      has: vi.fn(
        (name: string) =>
          hasCookie &&
          (name === 'better-auth.session_token' || name === '__Secure-better-auth.session_token'),
      ),
    },
  } as unknown as Parameters<typeof middleware>[0];
}

describe('middleware', () => {
  describe('public routes', () => {
    it('lets / through without auth', () => {
      const res = middleware(makeRequest('/'));
      expect(res.status).toBe(200);
    });

    it('lets /sign-in through without auth', () => {
      const res = middleware(makeRequest('/sign-in'));
      expect(res.status).toBe(200);
    });

    it('lets /sign-up through without auth', () => {
      const res = middleware(makeRequest('/sign-up'));
      expect(res.status).toBe(200);
    });
  });

  describe('protected routes', () => {
    it('redirects /dashboard to /sign-in when no session', () => {
      const res = middleware(makeRequest('/dashboard'));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/sign-in');
      expect(res.headers.get('location')).toContain('redirect=%2Fdashboard');
    });

    it('redirects /onboarding/workspace to /sign-in when no session', () => {
      const res = middleware(makeRequest('/onboarding/workspace'));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/sign-in');
    });

    it('lets /dashboard through when session cookie is present', () => {
      const res = middleware(makeRequest('/dashboard', true));
      expect(res.status).toBe(200);
    });
  });

  describe('logged-in user on auth pages', () => {
    it('redirects /sign-in → /dashboard when already authenticated', () => {
      const res = middleware(makeRequest('/sign-in', true));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/dashboard');
    });

    it('redirects /sign-up → /dashboard when already authenticated', () => {
      const res = middleware(makeRequest('/sign-up', true));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/dashboard');
    });
  });
});
