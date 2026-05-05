'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Building2, Warehouse, Users, MapPin, Phone, Mail, Globe, Edit,
  Plus, Package, CreditCard, Receipt, UserCog, Eye, Vault, Container, Trash2, Wallet,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useDeleteAgency } from '@/lib/hooks/useAgencies';
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
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AgencyFormDialog } from '../AgencyFormDialog';
import { WarehouseFormDialog } from '../../warehouses/WarehouseFormDialog';
import { ClientFormDialog } from '../../clients/ClientFormDialog';
import { EmployeeFormDialog } from '../../employees/EmployeeFormDialog';
import { PayEmployeeDialog } from '../../employees/PayEmployeeDialog';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { AgencyChargesTab } from './AgencyChargesTab';
import { AgencyBreakdownTab } from './AgencyBreakdownTab';
import { AgencyDailyReportsTab } from './AgencyDailyReportsTab';
import { AgencyAvatar } from '@/components/shared/AgencyAvatar';
import { ImageDropzone } from '@/components/shared/ImageDropzone';
import { AgencyOpeningHoursEditor } from '@/components/shared/AgencyOpeningHoursEditor';
import { XlsxImportDialog } from '@/components/shared/XlsxImportDialog';
import { XlsxExportButton } from '@/components/shared/XlsxExportButton';
import { AppDialog } from '@/components/ui/AppDialog';
import { agenciesApi } from '@/lib/api/agencies';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Clock, FileText, BarChart3, Upload } from 'lucide-react';

export default function AgencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading } = useAgency(id);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const deleteMutation = useDeleteAgency();
  const [showCreateWarehouse, setShowCreateWarehouse] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showCreateEmployee, setShowCreateEmployee] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showImportEmployees, setShowImportEmployees] = useState(false);
  const qc = useQueryClient();

  const refreshAgency = () => {
    qc.invalidateQueries({ queryKey: ['agencies', id] });
    qc.invalidateQueries({ queryKey: ['agencies'] });
  };

  const handleAgencyImageUpload = async (file: File) => {
    setImageBusy(true);
    try {
      await agenciesApi.uploadImage(id, file);
      toast.success('Image mise a jour');
      refreshAgency();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec de l\'upload');
    }
    setImageBusy(false);
  };

  const handleAgencyImageDelete = async () => {
    setImageBusy(true);
    try {
      await agenciesApi.deleteImage(id);
      toast.success('Image supprimee');
      refreshAgency();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Suppression impossible');
    }
    setImageBusy(false);
  };

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

  const { data: disbursementsData } = useQuery({
    queryKey: ['disbursements', 'agency', id],
    queryFn: () => apiClient.get('/disbursements', { params: { agencyId: id, limit: 10 } }).then((r) => r.data),
    enabled: !!id,
  });

  const agency = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!agency) return <p className="p-6 text-gray-500">Agence introuvable</p>;

  const agencyRef = { id: agency.id, name: agency.name, city: agency.city ?? null };

  const cash = cashData?.data;

  const warehouseColumns = [
    { key: 'name', label: 'Nom', render: (row: any) => <Link href={`/warehouses/${row.id}`} className="font-medium text-primary-700 hover:underline">{row.name}</Link> },
    { key: 'location', label: 'Emplacement' },
    { key: '_count', label: 'Colis', render: (row: any) => row._count?.parcels ?? 0 },
    { key: 'actions', label: '', className: 'w-10', render: (row: any) => <RowActions actions={[{ label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/warehouses/${row.id}`) }]} /> },
  ];

  const clientColumns = [
    { key: 'fullName', label: 'Nom', render: (row: any) => <Link href={`/clients/${row.id}`} className="font-medium text-primary-700 hover:underline">{row.fullName}</Link> },
    { key: 'phone', label: 'Telephone' },
    { key: 'loyaltyTier', label: 'Fidelite', render: (row: any) => <AppBadge>{row.loyaltyTier}</AppBadge> },
    { key: 'actions', label: '', className: 'w-10', render: (row: any) => <RowActions actions={[{ label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/clients/${row.id}`) }]} /> },
  ];

  const [payEmployee, setPayEmployee] = useState<any | null>(null);

  const employeeColumns = [
    { key: 'fullName', label: 'Nom', render: (row: any) => <span className="font-medium">{row.fullName}</span> },
    { key: 'position', label: 'Poste' },
    { key: 'phone', label: 'Telephone', render: (row: any) => row.phone || '-' },
    { key: 'baseSalary', label: 'Salaire', render: (row: any) => formatAmount(Number(row.baseSalary)) },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions
          actions={[
            { label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/employees/${row.id}`) },
            { label: 'Payer salaire', icon: <CreditCard className="h-4 w-4" />, onClick: () => setPayEmployee(row) },
          ]}
        />
      ),
    },
  ];

  const disbursementColumns = [
    { key: 'reference', label: 'Reference', render: (row: any) => <Link href={`/disbursements/${row.id}`} className="font-mono text-xs text-primary-700 hover:underline">{row.reference}</Link> },
    { key: 'reason', label: 'Motif', render: (row: any) => <span className="truncate max-w-50 block">{row.reason}</span> },
    { key: 'orderer', label: 'Ordonnateur' },
    { key: 'amount', label: 'Montant', render: (row: any) => <span className="font-bold text-red-600">-{formatAmount(Number(row.amount))}</span> },
    { key: 'isVoided', label: 'Statut', render: (row: any) => <AppBadge variant={row.isVoided ? 'error' : 'success'}>{row.isVoided ? 'Annule' : 'Valide'}</AppBadge> },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDate(row.createdAt) },
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

      <RelationTable
        title={`Sorties / Decaissements (${disbursementsData?.meta?.total || 0})`}
        columns={disbursementColumns}
        data={disbursementsData?.data || []}
        seeAllHref={`/disbursements?agencyId=${id}`}
      />
    </div>
  );

  const personnelTab = (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <XlsxExportButton endpoint="employees" params={{ agencyId: id }} fileName="personnel" label="Exporter (XLSX)" />
        <AppButton size="sm" variant="outline" onClick={() => setShowImportEmployees(true)}>
          <Upload className="h-3.5 w-3.5" />
          Importer (XLSX)
        </AppButton>
      </div>
      <RelationTable
        title={`Employes (${employeesData?.data?.length || 0})`}
        columns={employeeColumns}
        data={employeesData?.data || []}
        onAdd={() => setShowCreateEmployee(true)}
        addLabel="Ajouter employe"
      />
    </div>
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
            <button
              type="button"
              onClick={() => setShowImageDialog(true)}
              className="group relative"
              title="Modifier l'image de l'agence"
            >
              <AgencyAvatar agency={agency} size={56} rounded="lg" />
              <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </span>
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
          <div className="flex items-center gap-2">
            <AppButton variant="outline" onClick={() => setShowEdit(true)}>
              <Edit className="h-4 w-4" />
              Modifier
            </AppButton>
            <AppButton variant="outline" onClick={() => setShowDelete(true)}>
              <Trash2 className="h-4 w-4 text-red-600" />
              Supprimer
            </AppButton>
          </div>
        </div>

        {/* Tabs */}
        <AppTabs tabs={[
          { value: 'overview', label: 'Vue d\'ensemble', icon: <Building2 className="h-4 w-4" />, content: overviewTab },
          { value: 'finance', label: 'Finance', icon: <CreditCard className="h-4 w-4" />, content: financeTab },
          { value: 'breakdown', label: 'Repartition', icon: <BarChart3 className="h-4 w-4" />, content: <AgencyBreakdownTab agencyId={id} /> },
          { value: 'charges', label: 'Charges', icon: <Wallet className="h-4 w-4" />, content: <AgencyChargesTab agencyId={id} /> },
          { value: 'personnel', label: 'Personnel', icon: <UserCog className="h-4 w-4" />, content: personnelTab },
          { value: 'reports', label: 'Observations', icon: <FileText className="h-4 w-4" />, content: <AgencyDailyReportsTab agencyId={id} /> },
          { value: 'hours', label: 'Horaires', icon: <Clock className="h-4 w-4" />, content: <AgencyOpeningHoursEditor agencyId={id} /> },
        ]} />

        {/* Dialogs */}
        <AgencyFormDialog open={showEdit} onClose={() => setShowEdit(false)} agency={agency} />
        <ConfirmDialog
          open={showDelete}
          onClose={() => setShowDelete(false)}
          onConfirm={() => {
            deleteMutation.mutate(agency.id, {
              onSuccess: () => {
                toast.success('Agence desactivee');
                router.push('/agencies');
              },
              onError: () => toast.error('Erreur lors de la suppression'),
            });
          }}
          title="Supprimer l'agence"
          message={`L'agence "${agency.name}" sera desactivee. Vous pourrez la reactiver plus tard.`}
          confirmLabel="Supprimer"
          variant="destructive"
          loading={deleteMutation.isPending}
        />
        <WarehouseFormDialog
          open={showCreateWarehouse}
          onClose={() => setShowCreateWarehouse(false)}
          defaultAgency={agencyRef}
        />
        <ClientFormDialog
          open={showCreateClient}
          onClose={() => setShowCreateClient(false)}
          defaultAgency={agencyRef}
        />
        <EmployeeFormDialog
          open={showCreateEmployee}
          onClose={() => setShowCreateEmployee(false)}
          defaultAgency={agencyRef}
        />
        <PayEmployeeDialog
          open={!!payEmployee}
          onClose={() => setPayEmployee(null)}
          employee={payEmployee}
        />

        <XlsxImportDialog
          open={showImportEmployees}
          onClose={() => setShowImportEmployees(false)}
          endpoint={`agencies/${id}/employees`}
          title="Importer le personnel (XLSX avec photos)"
          hint="Le fichier doit contenir au minimum 'Nom complet' et 'Poste'. Les colonnes 'Selfie', 'Plan localisation', 'Document identite' acceptent des images embarquees qui seront uploadees automatiquement."
          onDone={() => qc.invalidateQueries({ queryKey: ['employees'] })}
        />

        <AppDialog
          open={showImageDialog}
          onClose={() => setShowImageDialog(false)}
          title="Image de l'agence"
          size="md"
          footer={
            <AppButton variant="ghost" onClick={() => setShowImageDialog(false)}>
              Fermer
            </AppButton>
          }
        >
          <ImageDropzone
            value={agency.imageUrl ?? null}
            onFile={async (f) => {
              await handleAgencyImageUpload(f);
            }}
            onClear={agency.imageUrl ? handleAgencyImageDelete : undefined}
            uploading={imageBusy}
            height={260}
          />
        </AppDialog>
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
