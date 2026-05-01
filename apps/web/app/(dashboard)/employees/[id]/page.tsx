'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UserCircle, Building2, Phone, CreditCard, Calendar, Briefcase, Hash, Edit } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { EmployeeFormDialog } from '../EmployeeFormDialog';

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['employees', id],
    queryFn: () => apiClient.get(`/employees/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const [showEdit, setShowEdit] = useState(false);

  const employee = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!employee) return <p className="p-6 text-gray-500">Employe introuvable</p>;

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
                <h1 className="text-2xl font-bold text-gray-900">{employee.fullName}</h1>
                <AppBadge variant={employee.isActive ? 'success' : 'error'}>{employee.isActive ? 'Actif' : 'Inactif'}</AppBadge>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{employee.position}</p>
            </div>
          </div>
          <AppButton variant="outline" onClick={() => setShowEdit(true)}>
            <Edit className="h-4 w-4" />
            Modifier
          </AppButton>
        </div>

        <EmployeeFormDialog open={showEdit} onClose={() => setShowEdit(false)} employee={employee} />

        {/* Info cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Briefcase className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Poste</p>
                <p className="text-sm font-medium text-gray-900">{employee.position}</p>
                {employee.level && <p className="text-xs text-gray-500">Niveau: {employee.level}</p>}
              </div>
            </div>
          </AppCard>

          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <CreditCard className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Salaire de base</p>
                <p className="text-lg font-bold text-gray-900">{formatAmount(Number(employee.baseSalary))}</p>
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
                {employee.agency ? (
                  <Link href={`/agencies/${employee.agency.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                    {employee.agency.name}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">{employee.agencyId}</p>
                )}
              </div>
            </div>
          </AppCard>
        </div>

        {/* Details */}
        <AppCard>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Informations detaillees</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoRow icon={UserCircle} label="Nom complet" value={employee.fullName} />
            <InfoRow icon={Phone} label="Telephone" value={employee.phone || '-'} />
            <InfoRow icon={Hash} label="Numero d'identite" value={employee.idNumber || '-'} />
            <InfoRow icon={Calendar} label="Date de debut" value={formatDate(employee.startDate)} />
            {employee.endDate && (
              <InfoRow icon={Calendar} label="Date de fin" value={formatDate(employee.endDate)} />
            )}
            <InfoRow icon={CreditCard} label="Salaire de base" value={formatAmount(Number(employee.baseSalary))} />
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
