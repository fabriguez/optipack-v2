'use client';

import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { OfflineQueuedError } from '@/lib/api/offlineQueue';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
        // Intercepteur global pour les mutations : si l'erreur est un
        // OfflineQueuedError, on remplace le toast d'erreur standard par un
        // toast info "ajoutee a la file" qui reflete la realite UX.
        // Les pages peuvent toujours surcharger via leur propre onError.
        mutationCache: new MutationCache({
          onError(error, _variables, _context, mutation) {
            if (error instanceof OfflineQueuedError) {
              // Skip si la mutation a deja un onError personnalise (le caller
              // veut gerer lui-meme).
              if (!mutation.options.onError) {
                toast.info('Action enregistree hors ligne. Sera renvoyee a la reconnexion.');
              }
            }
          },
        }),
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
