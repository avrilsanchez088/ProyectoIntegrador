'use client';

import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Theme provider minimalista — sin deps externas.
 *
 * - Lee/escribe `localStorage` con key 'theme' = 'light' | 'dark' | 'system'
 * - Toggle aplica/quita la clase `.dark` en `<html>` (Tailwind v4 detecta esto)
 * - El script anti-FOUC (en root layout) corre antes de React hydrate y
 *   evita el flash blanco al cargar dark mode.
 */

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = 'theme';

function resolveSystem(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyClass(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
    setThemeState(stored);
  }, []);

  useEffect(() => {
    const resolved = theme === 'system' ? resolveSystem() : theme;
    setResolvedTheme(resolved);
    applyClass(resolved);
  }, [theme]);

  // Escuchar cambios del sistema cuando theme = 'system'
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const resolved = resolveSystem();
      setResolvedTheme(resolved);
      applyClass(resolved);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  };

  const toggle = () => {
    // light → dark → system → light
    const next: Theme = resolvedTheme === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback seguro para componentes que se renderizan fuera del provider
    // (ej. tests). No throw.
    return {
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}

/**
 * Script inline que se ejecuta antes de React hydrate.
 * Lee localStorage y aplica `.dark` para evitar FOUC.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
