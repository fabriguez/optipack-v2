import ClientsPage from './ClientsPage';
import ClientDetailPage from './ClientDetailPage';
import ClientsKycPage from './ClientsKycPage';

// Routes du module Clients (collectees par router.tsx via import.meta.glob).
// kyc avant :id pour priorite du segment statique.
export const routes = [
  { path: 'clients', element: <ClientsPage /> },
  { path: 'clients/kyc', element: <ClientsKycPage /> },
  { path: 'clients/:id', element: <ClientDetailPage /> },
];
