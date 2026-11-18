'use client';

import { ThemeProvider } from '@/components/theme-provider';
import { getQueryClient } from '@/lib/query-client';
import { ConfirmProvider } from '@impacto/ui/confirm-dialog';
import { QueryClientProvider } from '@tanstack/react-query';

/**
 * Providers globales del cliente. Mounted en el root layout.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
