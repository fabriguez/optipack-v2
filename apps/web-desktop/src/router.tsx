import { createBrowserRouter, Outlet, type RouteObject } from 'react-router-dom';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7';
import { DashboardShell } from '@/components/layout/DashboardShell';
import PlaceholderPage from '@/pages/PlaceholderPage';
import Gallery from '@/pages/Gallery';
import LoginPage from '@/pages/auth/LoginPage';
import DashboardHome from '@/pages/dashboard/DashboardHome';

// Racine : NuqsAdapter (etat URL via react-router) au-dessus de toutes les
// routes, requis par useFilters/useServerPagination (nuqs).
function RootLayout() {
  return (
    <NuqsAdapter>
      <Outlet />
    </NuqsAdapter>
  );
}

// Collecte automatique des routes de chaque module porte : chaque
// src/pages/<module>/routes.tsx exporte `export const routes = RouteObject[]`.
// import.meta.glob (eager) les agrege sans edition centrale -> chaque module
// (et chaque agent de portage) reste independant.
const routeModules = import.meta.glob('./pages/*/routes.tsx', { eager: true }) as Record<
  string,
  { routes?: RouteObject[] }
>;
const moduleRoutes: RouteObject[] = Object.values(routeModules).flatMap((m) => m.routes ?? []);

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/gallery', element: <Gallery /> },
      {
        path: '/',
        element: <DashboardShell />,
        children: [
          { index: true, element: <DashboardHome /> },
          // Routes de tous les modules portes (collectees par glob).
          ...moduleRoutes,
          // Catch-all : routes pas encore portees -> placeholder.
          { path: '*', element: <PlaceholderPage /> },
        ],
      },
    ],
  },
]);
