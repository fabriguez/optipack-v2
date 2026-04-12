'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Building2, Warehouse, Users, MapPin, Phone, Mail, Globe, Edit,
  Plus, Package, CreditCard, Receipt, UserCog, Eye, Vault, Container,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppTabs } from '@/components/ui/AppTabs';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { RowActions } from '@/components/shared/RowActions';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useAgency } from '@/lib/hooks/useAgencies';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AgencyFormDialog } from '../AgencyFormDialog';
import { WarehouseFormDialog } from '../../warehouses/WarehouseFormDialog';
import { ClientFormDialog } from '../../clients/ClientFormDialog';
import { EmployeeFormDialog } from '../../employees/EmployeeFormDialog';
import { formatAmount, formatDate } from '@optipack/shared';

export default function AgencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading } = useAgency(id);
  const [showEdit, setShowEdit] = useState(false);
  const [showCreateWarehouse, setShowCreateWarehouse] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showCreateEmployee, setShowCreateEmployee] = useState(false);

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', id],
    queryFn: () => apiClient.get(`/warehouses/agency/${id}`, { params: { limit: 50 } }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'agency', id],
    queryFn: () => apiClient.get('/clients', { params: { agencyId: id, limit: 10 } }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: employeesData } = useQuery({
    queryKey: ['employees', id],
    queryFn: () => apiClient.get(`/employees/agency/${id}`, { params: { limit: 50 } }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: paymentsData } = useQuery({
    queryKey: ['payments', 'agency', id],
    queryFn: () => apiClient.get('/payments', { params: { agencyId: id, limit: 10 } }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: cashData } = useQuery({
    queryKey: ['cash-register', id],
    queryFn: () => apiClient.get(`/cash-registers/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const agency = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!agency) return <p className="p-6 text-gray-500">Agence introuvable</p>;

  const cash = cashData?.data;

  const warehouseColumns = [
    { key: 'name', label: 'Nom', render: (row: any) => <Link href={`/warehouses/${row.id}`} className="font-medium text-primary-700 hover:underline">{row.name}</Link> },
    { key: 'location', label: 'Emplacement' },
    { key: 'type', label: 'Type', render: (row: any) => <AppBadge>{row.type === 'STORAGE' ? 'Stockage' : row.type === 'TRANSIT' ? 'Transit' : 'Livraison'}</AppBadge> },
    { key: '_count', label: 'Colis', render: (row: any) => row._count?.parcels ?? 0 },
    { key: 'actions', label: '', className: 'w-10', render: (row: any) => <RowActions actions={[{ label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/warehouses/${row.id}`) }]} /> },
  ];

  const clientColumns = [
    { key: 'fullName', label: 'Nom', render: (row: any) => <Link href={`/clients/${row.id}`} className="font-medium text-primary-700 hover:underline">{row.fullName}</Link> },
    { key: 'phone', label: 'Telephone' },
    { key: 'loyaltyTier', label: 'Fidelite', render: (row: any) => <AppBadge>{row.loyaltyTier}</AppBadge> },
    { key: 'actions', label: '', className: 'w-10', render: (row: any) => <RowActions actions={[{ label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/clients/${row.id}`) }]} /> },
  ];

  const employeeColumns = [
    { key: 'fullName', label: 'Nom', render: (row: any) => <span className="font-medium">{row.fullName}</span> },
    { key: 'position', label: 'Poste' },
    { key: 'phone', label: 'Telephone', render: (row: any) => row.phone || '-' },
    { key: 'baseSalary', label: 'Salaire', render: (row: any) => formatAmount(Number(row.baseSalary)) },
  ];

  const paymentColumns = [
    { key: 'reference', label: 'Reference', render: (row: any) => <Link href={`/payments/${row.id}`} className="font-mono text-xs text-primary-700 hover:underline">{row.reference}</Link> },
    { key: 'amount', label: 'Montant', render: (row: any) => <span className="font-bold text-primary-700">{formatAmount(Number(row.amount))}</span> },
    { key: 'isVoided', label: 'Statut', render: (row: any) => <AppBadge variant={row.isVoided ? 'error' : 'success'}>{row.isVoided ? 'Annule' : 'Valide'}</AppBadge> },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDate(row.createdAt) },
  ];

  const overviewTab = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard icon={MapPin} label="Adresse" value={agency.address} />
        <InfoCard icon={Phone} label="Telephone" value={agency.phone} />
        <InfoCard icon={Mail} label="Email" value={agency.email || 'Non renseigne'} />
        <InfoCard icon={Vault} label="Solde caisse" value={cash ? formatAmount(Number(cash.currentBalance)) : '-'} />
      </div>

      {/* Warehouses */}
      <RelationTable
        title={`Magasins (${warehousesData?.data?.length || 0})`}
        columns={warehouseColumns}
        data={warehousesData?.data || []}
        onAdd={() => setShowCreateWarehouse(true)}
        addLabel="Ajouter magasin"
      />

      {/* Clients */}
      <RelationTable
        title={`Clients (${clientsData?.meta?.total || 0})`}
        columns={clientColumns}
        data={clientsData?.data || []}
        onAdd={() => setShowCreateClient(true)}
        addLabel="Ajouter client"
        seeAllHref={`/clients?agencyId=${id}`}
      />
    </div>
  );

  const financeTab = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AppCard>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Solde caisse</p>
          <p className="mt-1 text-2xl font-bold text-primary-700">{cash ? formatAmount(Number(cash.currentBalance)) : '-'}</p>
          <p className="text-xs text-gray-400 mt-1">{cash?.isClosed ? 'Cloturee' : 'Ouverte'}</p>
        </AppCard>
        <AppCard>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Entrees du jour</p>
          <p className="mt-1 text-2xl font-bold text-green-600">+{cash ? formatAmount(Number(cash.totalEntries)) : '0'}</p>
        </AppCard>
        <AppCard>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Sorties du jour</p>
          <p className="mt-1 text-2xl font-bold text-red-600">-{cash ? formatAmount(Number(cash.totalExits)) : '0'}</p>
        </AppCard>
      </div>

      <RelationTable
        title={`Paiements recents (${paymentsData?.meta?.total || 0})`}
        columns={paymentColumns}
        data={paymentsData?.data || []}
        seeAllHref={`/payments?agencyId=${id}`}
      />
    </div>
  );

  const personnelTab = (
    <RelationTable
      title={`Employes (${employeesData?.data?.length || 0})`}
      columns={employeeColumns}
      data={employeesData?.data || []}
      onAdd={() => setShowCreateEmployee(true)}
      addLabel="Ajouter employe"
    />
  );

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{agency.name}</h1>
                <span className="font-mono text-xs font-bold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-lg">{agency.code}</span>
                <AppBadge variant={agency.isActive ? 'success' : 'error'}>{agency.isActive ? 'Actif' : 'Inactif'}</AppBadge>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{agency.city}, {agency.country}</p>
            </div>
          </div>
          <AppButton variant="outline" onClick={() => setShowEdit(true)}>
            <Edit className="h-4 w-4" />
            Modifier
          </AppButton>
        </div>

        {/* Tabs */}
        <AppTabs tabs={[
          { value: 'overview', label: 'Vue d\'ensemble', icon: <Building2 className="h-4 w-4" />, content: overviewTab },
          { value: 'finance', label: 'Finance', icon: <CreditCard className="h-4 w-4" />, content: financeTab },
          { value: 'personnel', label: 'Personnel', icon: <UserCog className="h-4 w-4" />, content: personnelTab },
        ]} />

        {/* Dialogs */}
        <AgencyFormDialog open={showEdit} onClose={() => setShowEdit(false)} agency={agency} />
        <WarehouseFormDialog open={showCreateWarehouse} onClose={() => setShowCreateWarehouse(false)} />
        <ClientFormDialog open={showCreateClient} onClose={() => setShowCreateClient(false)} />
        <EmployeeFormDialog open={showCreateEmployee} onClose={() => setShowCreateEmployee(false)} />
      </div>
    </PageTransition>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <AppCard padding="sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50">
          <Icon className="h-5 w-5 text-primary-600" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-gray-400">{label}</p>
          <p className="text-sm font-medium text-gray-900 truncate">{value}</p>
        </div>
      </div>
    </AppCard>
  );
}

function RelationTable({ title, columns, data, onAdd, addLabel, seeAllHref }: {
  title: string;
  columns: any[];
  data: any[];
  onAdd?: () => void;
  addLabel?: string;
  seeAllHref?: string;
}) {
  const router = useRouter();
  return (
    <AppCard>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-2">
          {seeAllHref && (
            <Link href={seeAllHref}>
              <AppButton variant="ghost" size="sm">Voir tout</AppButton>
            </Link>
          )}
          {onAdd && (
            <AppButton size="sm" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" />
              {addLabel || 'Ajouter'}
            </AppButton>
          )}
        </div>
      </div>
      <AppDataTable columns={columns} data={data} />
    </AppCard>
  );
}
