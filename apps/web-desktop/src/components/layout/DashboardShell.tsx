import { Outlet } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { DashboardLayout } from './DashboardLayout';
import { ModuleGuard } from './ModuleGuard';
import { PermissionGate } from './PermissionGate';

// Coquille du dashboard : garde auth + chrome (sidebar/topbar) + garde module + garde ABAC.
// Equivaut a app/(dashboard)/layout.tsx du web. Les pages s'affichent dans l'<Outlet/>.
export function DashboardShell() {
  return (
    <RequireAuth>
      <DashboardLayout>
        <ModuleGuard>
          <PermissionGate>
            <Outlet />
          </PermissionGate>
        </ModuleGuard>
      </DashboardLayout>
    </RequireAuth>
  );
}
