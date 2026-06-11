import PaymentsPage from './PaymentsPage';
import PaymentDetailPage from './PaymentDetailPage';

export const routes = [
  { path: 'payments', element: <PaymentsPage /> },
  { path: 'payments/:id', element: <PaymentDetailPage /> },
];
