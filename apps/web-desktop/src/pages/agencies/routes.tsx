import AgenciesPage from './AgenciesPage';
import AgencyDetailPage from './AgencyDetailPage';

export const routes = [
  { path: 'agencies', element: <AgenciesPage /> },
  { path: 'agencies/:id', element: <AgencyDetailPage /> },
];
