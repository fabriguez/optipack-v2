'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, UserCircle, Building2, Phone, CreditCard, Calendar, Briefcase, Hash, Edit,
  Clock, ListChecks, Plane, Gavel, Star,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppTabs } from '@/components/ui/AppTabs';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { EmployeeFormDialog } from '../EmployeeFormDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { EmployeeShiftsTab } from './EmployeeShiftsTab';
import { EmployeeAttendanceTab } from './EmployeeAttendanceTab';
import { EmployeeLeavesTab } from './EmployeeLeavesTab';
import { EmployeeDisciplineTab } from './EmployeeDisciplineTab';
import { EmployeeReviewsTab } from './EmployeeReviewsTab';
import { EmployeeDocumentsTab } from './EmployeeDocumentsTab';
import { EmployeePayslipsTab } from './EmployeePayslipsTab';
import { FileText, Receipt } from 'lucide-react';

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [confirmResend, setConfirmResend] = useState(false);

  const resendMutation = useMutation({
    mutationFn: () => apiClient.post(`/employees/${id}/resend-credentials`),
    onSuccess: (r) => {
      const email = r?.data?.data?.email ?? '';
      toast.success(`Identifiants envoyes${email ? ` a ${email}` : ''}. Le mot de passe a ete reinitialise.`);
      setConfirmResend(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec envoi identifiants'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['employees', id],
    queryFn: () => apiClient.get(`/employees/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const employee = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!employee) return <p className="p-6 text-gray-500">Employe introuvable</p>;

  const profileTab = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AppCard>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
              <Briefcase className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Poste</p>
              <p className="text-sm font-medium text-gray-900">{employee.position}</p>
              {employee.contractType && <p className="text-xs text-gray-500">{employee.contractType}</p>}
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
          <InfoRow icon={Briefcase} label="Niveau d'etudes" value={employee.educationLevel || '-'} />
          <InfoRow icon={Briefcase} label="Specialite" value={employee.specialty || '-'} />
          <InfoRow icon={UserCircle} label="Superieur direct" value={employee.manager?.fullName || '-'} />
        </div>
      </AppCard>

      {(employee.emergencyContactName || employee.emergencyContactPhone) && (
        <AppCard>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact d&apos;urgence</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <InfoRow icon={UserCircle} label="Nom" value={employee.emergencyContactName || '-'} />
            <InfoRow icon={Phone} label="Telephone" value={employee.emergencyContactPhone || '-'} />
            <InfoRow icon={UserCircle} label="Lien" value={employee.emergencyContactRelation || '-'} />
          </div>
        </AppCard>
      )}
    </div>
  );

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{employee.fullName}</h1>
                <AppBadge variant={employee.isActive ? 'success' : 'error'}>{employee.isActive ? 'Actif' : 'Inactif'}</AppBadge>
                {employee.isAgencyManager && (
                  <span className="text-[10px] font-semibold px-2 py-1 rounded bg-primary-50 text-primary-700">
                    Chef d&apos;agence
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{employee.position}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {employee.isActive && (
              <AppButton variant="outline" onClick={() => setConfirmResend(true)}>
                <Mail className="h-4 w-4" />
                Envoyer identifiants
              </AppButton>
            )}
            {employee.isActive && (
              <AppButton variant="outline" onClick={() => setShowEdit(true)}>
                <Edit className="h-4 w-4" />
                Modifier
              </AppButton>
            )}
          </div>
        </div>

        {!employee.isActive && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
            <p className="font-semibold text-red-800">Contrat rompu</p>
            <p className="mt-1 text-red-700">
              Cet employe est inactif depuis le {employee.endDate ? formatDate(employee.endDate) : '-'}.
              {employee.termination?.reason && (
                <> Motif : <span className="italic">{employee.termination.reason}</span>.</>
              )}
              {' '}Aucune action (modification, sanction, paiement, statut chef, nouvelle rupture) n&apos;est possible.
              La masse salariale de l&apos;agence a ete recalculee.
            </p>
          </div>
        )}

        <EmployeeFormDialog open={showEdit} onClose={() => setShowEdit(false)} employee={employee} />

        <ConfirmDialog
          open={confirmResend}
          onClose={() => setConfirmResend(false)}
          onConfirm={() => resendMutation.mutate()}
          title="Envoyer les identifiants portail"
          message={`Un email avec un NOUVEAU mot de passe sera envoye a ${employee.user?.email || employee.client?.email || employee.email || '(email a renseigner)'}. Le precedent mot de passe sera invalide. Confirmer ?`}
          confirmLabel="Envoyer"
          loading={resendMutation.isPending}
        />

        <AppTabs tabs={[
          { value: 'profile', label: 'Profil', icon: <UserCircle className="h-4 w-4" />, content: profileTab },
          { value: 'documents', label: 'Documents', icon: <FileText className="h-4 w-4" />, content: <EmployeeDocumentsTab employeeId={id} /> },
          { value: 'shifts', label: 'Planning', icon: <Clock className="h-4 w-4" />, content: <EmployeeShiftsTab employeeId={id} /> },
          { value: 'attendance', label: 'Pointage', icon: <ListChecks className="h-4 w-4" />, content: <EmployeeAttendanceTab employeeId={id} /> },
          { value: 'leaves', label: 'Conges', icon: <Plane className="h-4 w-4" />, content: <EmployeeLeavesTab employeeId={id} /> },
          { value: 'discipline', label: 'Discipline', icon: <Gavel className="h-4 w-4" />, content: <EmployeeDisciplineTab employeeId={id} employee={employee} /> },
          { value: 'payslips', label: 'Bulletins', icon: <Receipt className="h-4 w-4" />, content: <EmployeePayslipsTab employeeId={id} employeeName={employee.fullName} /> },
          { value: 'reviews', label: 'Evaluation', icon: <Star className="h-4 w-4" />, content: <EmployeeReviewsTab employeeId={id} agencyId={employee.agencyId} /> },
        ]} />
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
