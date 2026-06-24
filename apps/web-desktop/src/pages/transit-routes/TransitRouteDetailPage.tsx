import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Route, MapPin, Clock, DollarSign, Plane, Ship, Truck, Edit } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { TransitRouteFormDialog } from './TransitRouteFormDialog';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@transitsoftservices/shared';

const TYPE_CONFIG: Record<string, { label: string; variant: 'info' | 'warning' | 'success'; icon: any }> = {
  AIR: { label: 'Aerien', variant: 'info', icon: Plane },
  SEA: { label: 'Maritime', variant: 'warning', icon: Ship },
  LAND: { label: 'Terrestre', variant: 'success', icon: Truck },
};

/** Formatte la valeur ajoutee : "+2 000 FCFA" (AMOUNT), "+10%" (PERCENT) ou "Aucune". */
function formatAddedValue(value: number | string | null | undefined, type: string | null | undefined): string {
  const n = Number(value);
  if (!type || !Number.isFinite(n) || n <= 0) return 'Aucune';
  return type === 'PERCENT' ? `+${n}%` : `+${formatAmount(n)}`;
}

export default function TransitRouteDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['transit-routes', id],
    queryFn: () => apiClient.get(`/transit-routes/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const [showEdit, setShowEdit] = useState(false);

  const route = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!route) return <p className="p-6 text-gray-500">Route introuvable</p>;

  const typeConfig = TYPE_CONFIG[route.type] || TYPE_CONFIG.LAND;
  const TypeIcon = typeConfig.icon;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{route.name}</h1>
                <AppBadge variant={typeConfig.variant}>{typeConfig.label}</AppBadge>
                <AppBadge variant={route.isActive ? 'success' : 'error'}>{route.isActive ? 'Active' : 'Inactive'}</AppBadge>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {route.departureCity}, {route.departureCountry} &rarr; {route.arrivalCity}, {route.arrivalCountry}
              </p>
            </div>
          </div>
          <AppButton variant="outline" onClick={() => setShowEdit(true)}>
            <Edit className="h-4 w-4" />
            Modifier
          </AppButton>
        </div>

        <TransitRouteFormDialog open={showEdit} onClose={() => setShowEdit(false)} route={route} />

        {/* Route visual */}
        <AppCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
                <MapPin className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Depart</p>
                <p className="text-lg font-bold text-gray-900">{route.departureCity}</p>
                <p className="text-sm text-gray-500">{route.departureCountry}</p>
              </div>
            </div>

            <div className="flex flex-col items-center px-6">
              <TypeIcon className="h-8 w-8 text-primary-400" />
              <div className="mt-1 h-0.5 w-24 bg-gray-200 relative">
                <div className="absolute inset-0 bg-primary-400 rounded-full" />
              </div>
              {route.estimatedDurationDays > 0 && (
                <p className="text-xs text-gray-400 mt-1">{route.estimatedDurationDays} jours</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs text-gray-400 text-right">Arrivee</p>
                <p className="text-lg font-bold text-gray-900 text-right">{route.arrivalCity}</p>
                <p className="text-sm text-gray-500 text-right">{route.arrivalCountry}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50">
                <MapPin className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
        </AppCard>

        {/* Detail cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <DollarSign className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Prix / kg</p>
                <p className="text-lg font-bold text-gray-900">{formatAmount(Number(route.pricePerKg))}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <DollarSign className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Prix / volume</p>
                <p className="text-lg font-bold text-gray-900">{formatAmount(Number(route.pricePerVolume))}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Clock className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Duree estimee</p>
                <p className="text-lg font-bold text-gray-900">{route.estimatedDurationDays} jour{route.estimatedDurationDays > 1 ? 's' : ''}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Route className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Type de transport</p>
                <p className="text-lg font-bold text-gray-900">{typeConfig.label}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <DollarSign className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Valeur ajoutee</p>
                <p className="text-lg font-bold text-gray-900">{formatAddedValue(route.addedValue, route.addedValueType)}</p>
              </div>
            </div>
          </AppCard>
        </div>
      </div>
    </PageTransition>
  );
}
