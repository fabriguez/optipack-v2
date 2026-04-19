'use client';

import { useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  BarChart3,
  AlertTriangle,
  Wallet,
  Scale,
  Search,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { ExportButton } from '@/components/shared/ExportButton';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { reportsApi, type ReportParams } from '@/lib/api/config';
import { formatAmount } from '@transitsoftservices/shared';

type ReportType = 'parcels' | 'payments' | 'revenue' | 'debts' | 'cash-flow' | 'penalties';

interface ReportConfig {
  id: ReportType;
  title: string;
  description: string;
  icon: typeof FileText;
  needsDates: boolean;
  needsAgency: boolean;
}

const REPORTS: ReportConfig[] = [
  {
    id: 'parcels',
    title: 'Colis',
    description: 'Statistiques et liste des colis par periode',
    icon: FileText,
    needsDates: true,
    needsAgency: true,
  },
  {
    id: 'payments',
    title: 'Paiements',
    description: 'Historique des paiements par agence',
    icon: FileSpreadsheet,
    needsDates: true,
    needsAgency: true,
  },
  {
    id: 'revenue',
    title: 'Revenus',
    description: 'Chiffre d\'affaires par agence et periode',
    icon: BarChart3,
    needsDates: true,
    needsAgency: false,
  },
  {
    id: 'debts',
    title: 'Dettes',
    description: 'Clients debiteurs et soldes restants',
    icon: AlertTriangle,
    needsDates: false,
    needsAgency: true,
  },
  {
    id: 'cash-flow',
    title: 'Tresorerie',
    description: 'Flux de tresorerie: entrees, sorties, solde',
    icon: Wallet,
    needsDates: true,
    needsAgency: true,
  },
  {
    id: 'penalties',
    title: 'Penalites',
    description: 'Penalites appliquees, payees et impayees',
    icon: Scale,
    needsDates: true,
    needsAgency: true,
  },
];

const today = new Date().toISOString().split('T')[0];
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [agencyId, setAgencyId] = useState('');
  const [activeReport, setActiveReport] = useState<ReportType | null>(null);

  const { data: agenciesData } = useAgencies({ limit: 100 });
  const agencies = agenciesData?.data || [];

  const params: ReportParams = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    agencyId: agencyId || undefined,
  };

  const { data: reportData, isLoading, isFetching } = useQuery({
    queryKey: ['report', activeReport, params],
    queryFn: () => {
      if (!activeReport) return null;
      return reportsApi[activeReport === 'cash-flow' ? 'cashFlow' : activeReport](params);
    },
    enabled: !!activeReport,
  });

  const handleGenerate = (reportId: ReportType) => {
    setActiveReport(reportId);
  };

  const report = reportData?.data;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generation et export de rapports.
          </p>
        </div>

        {/* Filters */}
        <AppCard>
          <div className="flex flex-wrap items-end gap-4">
            <AppInput
              label="Date debut"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-44"
            />
            <AppInput
              label="Date fin"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-44"
            />
            <AppSelect
              label="Agence"
              placeholder="Toutes les agences"
              value={agencyId}
              onValueChange={setAgencyId}
              options={[
                { value: '', label: 'Toutes les agences' },
                ...agencies.map((a: any) => ({ value: a.id, label: a.name })),
              ]}
            />
          </div>
        </AppCard>

        {/* Report Cards Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <ReportCard
              key={r.id}
              config={r}
              isActive={activeReport === r.id}
              isLoading={isFetching && activeReport === r.id}
              summary={activeReport === r.id ? report?.summary : null}
              details={activeReport === r.id ? report?.details : null}
              onGenerate={() => handleGenerate(r.id)}
            />
          ))}
        </div>
      </div>
    </PageTransition>
  );
}

// ── Report Card ────────────────────────────────────────────

interface ReportCardProps {
  config: ReportConfig;
  isActive: boolean;
  isLoading: boolean;
  summary: any;
  details: any;
  onGenerate: () => void;
}

function ReportCard({ config, isActive, isLoading, summary, details, onGenerate }: ReportCardProps) {
  const exportData = getExportData(config.id, details);
  const exportColumns = getExportColumns(config.id);

  return (
    <AppCard className={isActive ? 'ring-2 ring-primary-200' : ''}>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50">
            <config.icon className="h-5 w-5 text-primary-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">{config.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{config.description}</p>
          </div>
        </div>

        {/* Summary Stats */}
        {isActive && summary && !isLoading && (
          <div className="border-t border-gray-100 pt-3">
            <SummaryDisplay reportId={config.id} summary={summary} />
          </div>
        )}

        {isActive && isLoading && (
          <div className="border-t border-gray-100 pt-3">
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-gray-100 rounded w-3/4" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <AppButton size="sm" onClick={onGenerate} loading={isLoading}>
            <Search className="h-3.5 w-3.5" />
            Generer
          </AppButton>
          {isActive && exportData.length > 0 && (
            <ExportButton
              data={exportData}
              columns={exportColumns}
              fileName={`rapport-${config.id}`}
            />
          )}
        </div>
      </div>
    </AppCard>
  );
}

// ── Summary Display per Report Type ────────────────────────

function SummaryDisplay({ reportId, summary }: { reportId: ReportType; summary: any }) {
  switch (reportId) {
    case 'parcels':
      return (
        <div className="grid grid-cols-2 gap-2">
          <StatItem label="Total colis" value={summary.totalCount} />
          <StatItem label="Poids total" value={`${summary.totalWeight} kg`} />
          <StatItem label="CA total" value={formatAmount(summary.totalRevenue)} />
          <StatItem label="Statuts" value={`${summary.byStatus?.length || 0} types`} />
        </div>
      );
    case 'payments':
      return (
        <div className="grid grid-cols-2 gap-2">
          <StatItem label="Montant total" value={formatAmount(summary.totalAmount)} />
          <StatItem label="Nombre" value={summary.count} />
          <StatItem label="Remises" value={formatAmount(summary.totalDiscount)} />
          <StatItem label="TVA" value={formatAmount(summary.totalTva)} />
        </div>
      );
    case 'revenue':
      return (
        <div className="grid grid-cols-2 gap-2">
          <StatItem label="CA total" value={formatAmount(summary.totalRevenue)} />
          <StatItem label="Agences" value={summary.agencyCount} />
        </div>
      );
    case 'debts':
      return (
        <div className="grid grid-cols-2 gap-2">
          <StatItem label="Total dettes" value={formatAmount(summary.totalDebt)} />
          <StatItem label="Clients" value={summary.clientCount} />
          <StatItem label="Nombre dettes" value={summary.debtCount} />
        </div>
      );
    case 'cash-flow':
      return (
        <div className="grid grid-cols-2 gap-2">
          <StatItem label="Entrees" value={formatAmount(summary.totalEntries)} />
          <StatItem label="Sorties" value={formatAmount(summary.totalExits)} />
          <StatItem label="Decaissements" value={formatAmount(summary.totalDisbursements)} />
          <StatItem label="Solde net" value={formatAmount(summary.netCashFlow)} />
        </div>
      );
    case 'penalties':
      return (
        <div className="grid grid-cols-2 gap-2">
          <StatItem label="Montant total" value={formatAmount(summary.totalAmount)} />
          <StatItem label="Nombre" value={summary.totalCount} />
          <StatItem label="Payees" value={`${summary.paid?.count || 0} (${formatAmount(summary.paid?.amount || 0)})`} />
          <StatItem label="Impayees" value={`${summary.unpaid?.count || 0} (${formatAmount(summary.unpaid?.amount || 0)})`} />
        </div>
      );
    default:
      return null;
  }
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

// ── Export Helpers ──────────────────────────────────────────

function getExportColumns(reportId: ReportType) {
  switch (reportId) {
    case 'parcels':
      return [
        { key: 'trackingNumber', label: 'Tracking' },
        { key: 'status', label: 'Statut' },
        { key: 'weight', label: 'Poids (kg)' },
        { key: 'price', label: 'Prix' },
        { key: 'client', label: 'Client' },
        { key: 'warehouse', label: 'Entrepot' },
      ];
    case 'payments':
      return [
        { key: 'reference', label: 'Reference' },
        { key: 'amount', label: 'Montant' },
        { key: 'paymentMethod', label: 'Mode' },
        { key: 'agency', label: 'Agence' },
        { key: 'createdAt', label: 'Date' },
      ];
    case 'revenue':
      return [
        { key: 'agencyName', label: 'Agence' },
        { key: 'agencyCode', label: 'Code' },
        { key: 'totalAmount', label: 'Montant total' },
        { key: 'totalDiscount', label: 'Remises' },
        { key: 'count', label: 'Nombre paiements' },
      ];
    case 'debts':
      return [
        { key: 'clientName', label: 'Client' },
        { key: 'clientPhone', label: 'Telephone' },
        { key: 'totalAmount', label: 'Montant total' },
        { key: 'remainingAmount', label: 'Restant' },
        { key: 'debtCount', label: 'Nombre dettes' },
      ];
    case 'cash-flow':
      return [
        { key: 'type', label: 'Type' },
        { key: 'amount', label: 'Montant' },
        { key: 'count', label: 'Nombre' },
      ];
    case 'penalties':
      return [
        { key: 'client', label: 'Client' },
        { key: 'parcel', label: 'Colis' },
        { key: 'totalAmount', label: 'Montant' },
        { key: 'daysAccumulated', label: 'Jours' },
        { key: 'isPaid', label: 'Payee' },
        { key: 'agency', label: 'Agence' },
      ];
    default:
      return [];
  }
}

function getExportData(reportId: ReportType, details: any): Record<string, any>[] {
  if (!details) return [];

  switch (reportId) {
    case 'parcels':
      return Array.isArray(details)
        ? details.map((p: any) => ({
            ...p,
            client: p.client?.fullName || '',
            warehouse: p.warehouse?.name || '',
          }))
        : [];
    case 'payments':
      return Array.isArray(details)
        ? details.map((p: any) => ({
            ...p,
            agency: p.agency?.name || '',
          }))
        : [];
    case 'revenue':
      return Array.isArray(details) ? details : [];
    case 'debts':
      return Array.isArray(details) ? details : [];
    case 'cash-flow':
      if (details && typeof details === 'object' && !Array.isArray(details)) {
        return Object.entries(details).map(([key, val]: [string, any]) => ({
          type: key,
          amount: val.amount,
          count: val.count,
        }));
      }
      return [];
    case 'penalties':
      return Array.isArray(details)
        ? details.map((p: any) => ({
            ...p,
            client: p.client?.fullName || '',
            parcel: p.parcel?.trackingNumber || '',
            agency: p.agency?.name || '',
            isPaid: p.isPaid ? 'Oui' : 'Non',
          }))
        : [];
    default:
      return [];
  }
}
