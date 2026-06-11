import CarriersPage from './CarriersPage';
import CarrierDetailPage from './CarrierDetailPage';

export const routes = [
  { path: 'carriers', element: <CarriersPage /> },
  { path: 'carriers/:id', element: <CarrierDetailPage /> },
];
