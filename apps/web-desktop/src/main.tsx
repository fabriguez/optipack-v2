import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from '@/lib/providers/AuthProvider';
import { TenantProvider } from '@/lib/providers/TenantProvider';
import { AppToaster } from '@/components/ui/AppToast';
import './globals.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TenantProvider>
          <App />
          <AppToaster />
        </TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
