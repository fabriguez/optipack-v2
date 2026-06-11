import InvoicesPage from './InvoicesPage';
import InvoiceDetailPage from './InvoiceDetailPage';

export const routes = [
  { path: 'invoices', element: <InvoicesPage /> },
  { path: 'invoices/:id', element: <InvoiceDetailPage /> },
];
