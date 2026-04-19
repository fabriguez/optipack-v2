'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, User, Package, Building2, Calendar, Clock, CreditCard } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@transitsoftservices/shared';

export default function PenaltyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['penalties', id],
    queryFn: () => apiClient.get(`/penalties/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const penalty = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!penalty) return <p className="p-6 text-gray-500">Penalite introuvable</p>;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Penalite</h1>
              <AppBadge variant={penalty.isPaid ? 'success' : 'error'}>{penalty.isPaid ? 'Payee' : 'Non payee'}</AppBadge>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Depuis le {formatDate(penalty.startDate)}</p>
          </div>
        </div>

        {/* Total amount */}
        <AppCard>
          <div className="text-center py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Montant total de la penalite</p>
            <p className="text-3xl font-bold text-red-600">{formatAmount(Number(penalty.totalAmount))}</p>
            <p className="text-sm text-gray-500 mt-1">
              {penalty.daysAccumulated} jour{penalty.daysAccumulated > 1 ? 's' : ''} x {formatAmount(Number(penalty.dailyRate))} / jour
            </p>
          </div>
        </AppCard>

        {/* Info cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Package className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Colis</p>
                {penalty.parcel ? (
                  <Link href={`/parcels/${penalty.parcel.id}`} className="font-mono text-sm font-medium text-primary-700 hover:underline">
                    {penalty.parcel.trackingNumber}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">{penalty.parcelId}</p>
                )}
              </div>
            </div>
          </AppCard>

          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <User className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Client</p>
                {penalty.client ? (
                  <Link href={`/clients/${penalty.client.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                    {penalty.client.fullName}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">{penalty.clientId}</p>
                )}
              </div>
            </div>
          </AppCard>

          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Building2 className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Agence</p>
                {penalty.agency ? (
                  <Link href={`/agencies/${penalty.agency.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                    {penalty.agency.name}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">{penalty.agencyId}</p>
                )}
              </div>
            </div>
          </AppCard>
        </div>

        {/* Details */}
        <AppCard>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Details de la penalite</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoRow icon={Calendar} label="Date de debut" value={formatDate(penalty.startDate)} />
            <InfoRow icon={CreditCard} label="Taux journalier" value={formatAmount(Number(penalty.dailyRate))} />
            <InfoRow icon={Clock} label="Jours accumules" value={`${penalty.daysAccumulated} jour${penalty.daysAccumulated > 1 ? 's' : ''}`} />
            <InfoRow icon={AlertTriangle} label="Montant total" value={formatAmount(Number(penalty.totalAmount))} />
          </div>
        </AppCard>
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
