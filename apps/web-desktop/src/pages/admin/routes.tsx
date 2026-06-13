import AdminLoyaltyPage from './AdminLoyaltyPage';
import AdminPersonnelPage from './personnel/AdminPersonnelPage';
import AdminPersonnelPostesPage from './personnel/AdminPersonnelPostesPage';
import AdminPersonnelPermissionsPage from './personnel/AdminPersonnelPermissionsPage';
import AdminPersonnelExceptionsPage from './personnel/AdminPersonnelExceptionsPage';
import AdminPersonnelPlanningsPage from './personnel/AdminPersonnelPlanningsPage';
import AdminPersonnelJoursNonOuvresPage from './personnel/AdminPersonnelJoursNonOuvresPage';

export const routes = [
  { path: 'admin/loyalty', element: <AdminLoyaltyPage /> },
  { path: 'admin/personnel', element: <AdminPersonnelPage /> },
  { path: 'admin/personnel/postes', element: <AdminPersonnelPostesPage /> },
  { path: 'admin/personnel/permissions', element: <AdminPersonnelPermissionsPage /> },
  { path: 'admin/personnel/exceptions', element: <AdminPersonnelExceptionsPage /> },
  { path: 'admin/personnel/plannings', element: <AdminPersonnelPlanningsPage /> },
  { path: 'admin/personnel/jours-non-ouvres', element: <AdminPersonnelJoursNonOuvresPage /> },
];
