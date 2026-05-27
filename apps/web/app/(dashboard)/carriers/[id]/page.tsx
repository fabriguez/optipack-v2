'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit, Trash2, Truck, User, Phone, Mail, MapPin, Container as ContainerIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { apiClient } from '@/lib/api/client';
import { useCarrier, useDeleteCarrier } from '@/lib/hooks/useCarriers';
import { CarrierFormDialog, type CarrierLike } from '../../containers/CarrierFormDialog';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { StatusBadge } from '@/components/shared/StatusBadge';

const TYPE_LABELS: Record<string, string> = {
  AIR: 'Aerien',
  SEA: 'Maritime',
  LAND: 'Terrestre',
  MULTI: 'Multi-modal',
};

export default function CarrierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const deleteMutation = useDeleteCarrier();

  const { data, isLoading } = useCarrier(id);
  const carrier = data?.data;

  // Conteneurs lies (liste via /containers?carrierId=).
  const { data: containersData } = useQuery({
    queryKey: ['containers', { carrierId: id }],
    queryFn: () => apiClient.get('/containers', { params: { carrierId: id, limit: 50 } }).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (!carrier) return <p className="p-6 text-gray-500">Transporteur introuvable</p>;

  const containers: any[] = containersData?.data ?? [];

  const formCarrier: CarrierLike = {
    id: carrier.id,
    name: carrier.name,
    contactName: carrier.contactName,
    phone: carrier.phone,
    email: carrier.email,
    address: carrier.address,
    carrierType: carrier.carrierType,
    notes: carrier.notes,
  };

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
                <h1 className="text-2xl font-bold text-gray-900">{carrier.name}</h1>
                <AppBadge variant={carrier.isActive ? 'success' : 'error'}>
                  {carrier.isActive ? 'Actif' : 'Inactif'}
                </AppBadge>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                Cree le {formatDate(carrier.createdAt)}
                {carrier.carrierType && ` · ${TYPE_LABELS[carrier.carrierType] ?? carrier.carrierType}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <AppButton variant="outline" onClick={() => setEditOpen(true)}>
              <Edit className="h-4 w-4" />
              Modifier
            </AppButton>
            <AppButton
              variant="outline"
              onClick={() => setConfirmDeactivate(true)}
              disabled={!carrier.isActive}
            >
              <Trash2 className="h-4 w-4" />
              Desactiver
            </AppButton>
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <User className="h-5 w-5 text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Contact</p>
                <p className="text-sm font-medium text-gray-900 truncate">{carrier.contactName || '-'}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Phone className="h-5 w-5 text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Telephone</p>
                <p className="text-sm font-medium text-gray-900 truncate">{carrier.phone || '-'}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Mail className="h-5 w-5 text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-sm font-medium text-gray-900 truncate">{carrier.email || '-'}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <MapPin className="h-5 w-5 text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Adresse</p>
                <p className="text-sm font-medium text-gray-900 truncate">{carrier.address || '-'}</p>
              </div>
            </div>
          </AppCard>
        </div>

        {/* Client associe */}
        {carrier.client && (
          <AppCard>
            <AppCardHeader title="Compte client associe" description="Utilise pour les paiements / dettes du transporteur" />
            <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{carrier.client.fullName}</p>
                <p className="text-xs text-gray-500">{carrier.client.phone}</p>
              </div>
              <Link href={`/clients/${carrier.client.id}`}>
                <AppButton variant="outline" size="sm">
                  Voir le client
                </AppButton>
              </Link>
            </div>
          </AppCard>
        )}

        {/* Notes */}
        {carrier.notes && (
          <AppCard>
            <AppCardHeader title="Notes" />
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{carrier.notes}</p>
          </AppCard>
        )}

        {/* Conteneurs lies */}
        <AppCard>
          <AppCardHeader
            title={`Conteneurs (${containers.length})`}
            description="Conteneurs assignes a ce transporteur"
          />
          {containers.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <ContainerIcon className="h-10 w-10 text-gray-300" />
              <p className="mt-2 text-sm text-gray-400">Aucun conteneur</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="p-2 text-left">Designation</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-left">Trajet</th>
                    <th className="p-2 text-left">Statut</th>
                    <th className="p-2 text-right">Cout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {containers.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/containers/${c.id}`)}>
                      <td className="p-2">
                        <Link href={`/containers/${c.id}`} className="text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.designation}
                        </Link>
                      </td>
                      <td className="p-2 text-gray-700">{TYPE_LABELS[c.type] ?? c.type}</td>
                      <td className="p-2 text-xs text-gray-600">
                        {c.departureAgency?.city || '-'} → {c.arrivalAgency?.city || '-'}
                      </td>
                      <td className="p-2"><StatusBadge status={c.status} type="container" /></td>
                      <td className="p-2 text-right font-semibold text-gray-900">{formatAmount(Number(c.carrierCost ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AppCard>
      </div>

      <CarrierFormDialog open={editOpen} onClose={() => setEditOpen(false)} carrier={formCarrier} />
      <ConfirmDialog
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={async () => {
          await deleteMutation.mutateAsync(id);
          setConfirmDeactivate(false);
        }}
        title="Desactiver le transporteur"
        message="Le transporteur sera masque mais les references historiques (conteneurs, dettes) restent intactes. Vous pourrez le reactiver via une modification."
        confirmLabel="Desactiver"
        variant="destructive"
      />
    </PageTransition>
  );
}
