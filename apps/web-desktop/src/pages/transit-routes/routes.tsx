import TransitRoutesPage from './TransitRoutesPage';
import TransitRouteDetailPage from './TransitRouteDetailPage';

export const routes = [
  { path: 'transit-routes', element: <TransitRoutesPage /> },
  { path: 'transit-routes/:id', element: <TransitRouteDetailPage /> },
];
