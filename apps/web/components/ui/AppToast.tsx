'use client';

import { Toaster as SonnerToaster } from 'sonner';

export function AppToaster() {
  return (
    <SonnerToaster
      position="top-right"
      expand={false}
      richColors
      toastOptions={{
        style: {
          borderRadius: '0.75rem',
          fontSize: '14px',
          padding: '12px 16px',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        },
        classNames: {
          success: 'bg-primary-50 border-primary-200 text-primary-900',
          error: 'bg-red-50 border-red-200 text-red-900',
          warning: 'bg-amber-50 border-amber-200 text-amber-900',
          info: 'bg-blue-50 border-blue-200 text-blue-900',
        },
      }}
    />
  );
}
