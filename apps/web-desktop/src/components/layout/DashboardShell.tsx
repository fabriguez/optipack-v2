import { Outlet } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { DashboardLayout } from './DashboardLayout';
import { ModuleGuard } from './ModuleGuard';

// Coquille du dashboard : garde auth + chrome (sidebar/topbar) + garde module.
// Equivaut a app/(dashboard)/layout.tsx du web. Les pages s'affichent dans
// l'<Outlet/>. (Le sync socket de la meta tenant viendra avec le port realtime.)
export function DashboardShell() {
  return (
    <RequireAuth>
      <DashboardLayout>
        <ModuleGuard>
          <Outlet />
        </ModuleGuard>
      </DashboardLayout>
    </RequireAuth>
  );
}
