'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Package, MapPin, User, Truck, FileText, Clock,
  CreditCard, Edit, History, Warehouse, Route,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppTabs } from '@/components/ui/AppTabs';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useParcel } from '@/lib/hooks/useParcels';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate, formatDateTime } from '@optipack/shared';

const STATUS_STEPS = ['IN_STOCK', 'LOADING', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'DELIVERED'];
const STEP_LABELS: Record<string, string> = {
  IN_STOCK: 'En stock', LOADING: 'Chargement', IN_TRANSIT: 'En transit',
  ARRIVED: 'Arrive', RECEIVED: 'Receptionne', DELIVERED: 'Livre',
};

const ACTION_LABELS: Record<string, string> = {
  STATUS_CHANGE_IN_STOCK: 'Mis en stock',
  STATUS_CHANGE_LOADING: 'Charge dans conteneur',
  STATUS_CHANGE_IN_TRANSIT: 'Depart en transit',
  STATUS_CHANGE_ARRIVED: 'Arrive a destination',
  STATUS_CHANGE_RECEIVED: 'Receptionne',
  STATUS_CHANGE_DELIVERED: 'Livre au destinataire',
  LOADED_INTO_CONTAINER: 'Charge dans conteneur',
  CONTAINER_DEPARTED: 'Conteneur parti',
  CONTAINER_ARRIVED: 'Conteneur arrive',
  UNLOADED_RECEIVED: 'Decharge - recu',
  UNLOADED_NOT_FOUND: 'Decharge - non trouve',
  UNLOADED_MODIFIED: 'Decharge - modifie',
  CREATED: 'Colis enregistre',
};

export default function ParcelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading } = useParcel(id);

  const { data: historyData } = useQuery({
    queryKey: ['parcels', id, 'history'],
    queryFn: () => apiClient.get(`/parcels/${id}/history`).then((r) => r.data),
    enabled: !!id,
  });

  const parcel = data?.data;
  const history = historyData?.data || [];

  if (isLoading) return <DashboardSkeleton />;
  if (!parcel) return <p className="p-6 text-gray-500">Colis introuvable</p>;

  const currentStep = STATUS_STEPS.indexOf(parcel.status);

  const infoTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <AppCard className="lg:col-span-2">
        <AppCardHeader title="Informations du colis" />
        <div className="grid grid-cols-2 gap-3">
          <InfoRow icon={Package} label="Designation" value={parcel.designation} />
          <InfoRow icon={Package} label="Masse" value={`${Number(parcel.weight).toFixed(1)} kg`} />
          <InfoRow icon={MapPin} label="Destination" value={parcel.destination} />
          <InfoRow icon={MapPin} label="Origine" value={parcel.origin || '-'} />
          <LinkRow icon={User} label="Client" value={parcel.client?.fullName || '-'} href={parcel.client ? `/clients/${parcel.client.id}` : undefined} />
          <LinkRow icon={User} label="Destinataire" value={parcel.recipient?.fullName || '-'} href={undefined} />
          <LinkRow icon={Warehouse} label="Magasin" value={parcel.warehouse?.name || '-'} href={parcel.warehouse ? `/warehouses/${parcel.warehouse.id}` : undefined} />
          <LinkRow icon={Route} label="Route" value={parcel.transitRoute?.name || '-'} href={undefined} />
          <InfoRow icon={Clock} label="Enregistre le" value={formatDate(parcel.createdAt)} />
          <InfoRow icon={Clock} label="Arrive le" value={parcel.arrivalDate ? formatDate(parcel.arrivalDate) : '-'} />
        </div>
        {parcel.observation && (
          <div className="mt-4 rounded-xl bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Observation</p>
            <p className="text-sm text-gray-700">{parcel.observation}</p>
          </div>
        )}
      </AppCard>

      <div className="space-y-6">
        <AppCard>
          <AppCardHeader title="Facture" />
          {parcel.invoice ? (
            <div className="space-y-3">
              <Row label="Reference" value={parcel.invoice.reference} mono />
              <Row label="Montant" value={formatAmount(Number(parcel.price))} bold />
              <Row label="Statut">
                <StatusBadge status={parcel.invoice.status} type="invoice" />
              </Row>
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <Link href={`/invoices/${parcel.invoice.id}`}>
                  <AppButton variant="outline" className="w-full" size="sm">
                    <FileText className="h-4 w-4" />
                    Voir la facture
                  </AppButton>
                </Link>
                {parcel.invoice.status !== 'PAID' && (
                  <Link href={`/payments?invoiceId=${parcel.invoice.id}`}>
                    <AppButton className="w-full" size="sm">
                      <CreditCard className="h-4 w-4" />
                      Enregistrer paiement
                    </AppButton>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Aucune facture</p>
          )}
        </AppCard>

        {parcel.container && (
          <AppCard>
            <AppCardHeader title="Conteneur" />
            <div className="space-y-3">
              <Row label="Designation" value={parcel.container.designation} mono />
              <div className="pt-3 border-t border-gray-100">
                <Link href={`/containers/${parcel.container.id}`}>
                  <AppButton variant="outline" className="w-full" size="sm">
                    <Truck className="h-4 w-4" />
                    Voir le conteneur
                  </AppButton>
                </Link>
              </div>
            </div>
          </AppCard>
        )}
      </div>
    </div>
  );

  const historyTab = (
    <AppCard>
      <AppCardHeader title={`Historique (${history.length} evenements)`} />
      {history.length === 0 ? (
        <div className="flex flex-col items-center py-8">
          <History className="h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm text-gray-400">Aucun historique</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-2 bottom-2 w-px bg-gray-200" />

          <div className="space-y-0">
            {history.map((entry: any, i: number) => (
              <div key={entry.id} className="relative flex gap-4 py-3">
                {/* Dot */}
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center">
                  <div className={`h-3 w-3 rounded-full border-2 ${
                    i === 0 ? 'border-primary-500 bg-primary-500' : 'border-gray-300 bg-white'
                  }`} />
                </div>

                {/* Content */}
                <div className="flex-1 rounded-xl bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">
                      {ACTION_LABELS[entry.action] || entry.action}
                    </p>
                    <span className="text-xs text-gray-400">{formatDateTime(entry.createdAt)}</span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {entry.statusBefore && entry.statusAfter && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <AppBadge variant="default">{STEP_LABELS[entry.statusBefore] || entry.statusBefore}</AppBadge>
                        <span className="text-gray-400">→</span>
                        <AppBadge variant="success">{STEP_LABELS[entry.statusAfter] || entry.statusAfter}</AppBadge>
                      </div>
                    )}
                    {entry.user && (
                      <span className="text-xs text-gray-500">
                        par {entry.user.firstName} {entry.user.lastName}
                      </span>
                    )}
                  </div>

                  {entry.comment && (
                    <p className="mt-1.5 text-xs text-gray-500 italic">{entry.comment}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppCard>
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
                <h1 className="text-2xl font-bold text-gray-900">{parcel.designation}</h1>
                <StatusBadge status={parcel.status} type="parcel" />
              </div>
              <p className="font-mono text-sm text-primary-600 mt-0.5">{parcel.trackingNumber}</p>
            </div>
          </div>
          <AppButton variant="outline">
            <Edit className="h-4 w-4" />
            Modifier
          </AppButton>
        </div>

        {/* Progress steps */}
        <AppCard>
          <div className="flex items-center justify-between px-2">
            {STATUS_STEPS.map((step, i) => {
              const isCompleted = i <= currentStep;
              const isCurrent = i === currentStep;
              return (
                <div key={step} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      isCompleted ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-400'
                    } ${isCurrent ? 'ring-4 ring-primary-100 scale-110' : ''}`}>
                      {i + 1}
                    </div>
                    <span className={`mt-2 text-[10px] font-medium ${isCompleted ? 'text-primary-700' : 'text-gray-400'}`}>
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`mx-2 h-0.5 flex-1 rounded-full ${i < currentStep ? 'bg-primary-500' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </AppCard>

        {/* Tabs */}
        <AppTabs
          tabs={[
            { value: 'info', label: 'Informations', icon: <Package className="h-4 w-4" />, content: infoTab },
            { value: 'history', label: `Historique (${history.length})`, icon: <History className="h-4 w-4" />, content: historyTab },
          ]}
        />
      </div>
    </PageTransition>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
      <Icon className="h-4 w-4 text-gray-400 shrink-0" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function LinkRow({ icon: Icon, label, value, href }: { icon: any; label: string; value: string; href?: string }) {
  const content = (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 transition-colors hover:bg-primary-50/50">
      <Icon className="h-4 w-4 text-gray-400 shrink-0" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
        <p className={`text-sm font-medium ${href ? 'text-primary-700 underline-offset-2' : 'text-gray-900'}`}>{value}</p>
      </div>
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function Row({ label, value, mono, bold, children }: { label: string; value?: string; mono?: boolean; bold?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      {children || (
        <span className={`text-sm ${mono ? 'font-mono' : ''} ${bold ? 'text-lg font-bold text-primary-700' : 'font-medium text-gray-900'}`}>
          {value}
        </span>
      )}
    </div>
  );
}
