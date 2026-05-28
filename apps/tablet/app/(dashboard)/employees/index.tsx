import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { EmployeeFormDialog } from './EmployeeFormDialog';

interface Employee {
  id: string;
  fullName: string;
  phone?: string | null;
  position?: string | { name?: string } | null;
  agency?: { name?: string } | null;
  isActive?: boolean;
}

function positionName(p: Employee['position']): string {
  if (!p) return '';
  if (typeof p === 'string') return p;
  return p.name ?? '';
}

export default function EmployeesScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<Employee>
        title="Personnel"
        subtitle="Annuaire des employes"
        queryKey={['employees']}
        fetcher={(params) => apiClient.get('/employees', { params }).then((r) => r.data)}
        keyExtractor={(e) => e.id}
        createPermission="employee.manage"
        onCreate={() => setOpen(true)}
        renderRow={(e) => (
          <ListRow
            title={e.fullName}
            subtitle={positionName(e.position)}
            metadata={[e.agency?.name ?? '', e.phone ?? '']}
            badge={e.isActive === false ? { label: 'Inactif', variant: 'error' } : undefined}
          />
        )}
      />
      <EmployeeFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
