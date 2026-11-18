'use client';

import { useTheme } from '@/components/theme-provider';
import { Button } from '@impacto/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Toggle de tema. Single-click flips light↔dark; hold-to-explain via title.
 *
 * Renderiza un placeholder durante SSR para que coincida con el HTML inicial
 * y no haya hydration mismatch (resolvedTheme depende del cliente).
 */
export function ThemeToggle() {
  const { resolvedTheme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Cambiar tema" title="Cambiar tema">
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={resolvedTheme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={resolvedTheme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
    >
      {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
