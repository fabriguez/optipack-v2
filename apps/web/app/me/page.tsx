'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppTabs } from '@/components/ui/AppTabs';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { UserCircle, Plane, ListChecks, CreditCard, Clock, FileText } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABEL: Record<string, string> = {
  PRESENT: 'Present',
  LATE: 'Retard',
  ABSENT: 'Absent',
  ON_LEAVE: 'Conge',
  HOLIDAY: 'Ferie',
};
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'error',
  ON_LEAVE: 'default',
  HOLIDAY: 'default',
};
const LEAVE_TYPE_OPTIONS = [
  { value: 'PAID', label: 'Conge paye' },
  { value: 'UNPAID', label: 'Sans solde' },
  { value: 'SICK', label: 'Maladie' },
  { value: 'MATERNITY', label: 'Maternite' },
  { value: 'PATERNITY', label: 'Paternite' },
  { value: 'EXCEPTIONAL', label: 'Exceptionnel' },
];
const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function MePage() {
  const { data: profileData, isLoading } = useQuery({
    queryKey: ['me', 'employee'],
    queryFn: () => apiClient.get('/me/employee').then((r) => r.data),
  });

  const employee = profileData?.data;

  if (isLoading) return <DashboardSkeleton />;
  if (!employee) {
    return (
      <AppCard>
        <p className="py-8 text-center text-sm text-gray-500">
          Aucun profil employe rattache a votre compte. Contactez votre superviseur.
        </p>
      </AppCard>
    );
  }

  return (
    <div className="space-y-6">
      <AppCard>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50">
            <UserCircle className="h-8 w-8 text-primary-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{employee.fullName}</h1>
              {employee.isAgencyManager && (
                <AppBadge variant="success">Chef d&apos;agence</AppBadge>
              )}
              {!employee.isActive && <AppBadge variant="error">Inactif</AppBadge>}
            </div>
            <p className="text-sm text-gray-600">
              {employee.position}
              {employee.agency && ` · ${employee.agency.name}`}
              {employee.contractType && ` · ${employee.contractType}`}
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>Salaire base</p>
            <p className="text-lg font-bold text-primary-700">{formatAmount(Number(employee.baseSalary))}</p>
          </div>
        </div>
      </AppCard>

      <AppTabs
        tabs={[
          { value: 'profile', label: 'Profil', icon: <UserCircle className="h-4 w-4" />, content: <ProfileTab employee={employee} /> },
          { value: 'shifts', label: 'Planning', icon: <Clock className="h-4 w-4" />, content: <ShiftsTab /> },
          { value: 'attendance', label: 'Pointage', icon: <ListChecks className="h-4 w-4" />, content: <AttendanceTab /> },
          { value: 'leaves', label: 'Conges', icon: <Plane className="h-4 w-4" />, content: <LeavesTab /> },
          { value: 'payslips', label: 'Salaires', icon: <CreditCard className="h-4 w-4" />, content: <PayslipsTab /> },
          { value: 'documents', label: 'Documents', icon: <FileText className="h-4 w-4" />, content: <DocumentsTab /> },
        ]}
      />
    </div>
  );
}

function ProfileTab({ employee }: { employee: any }) {
  return (
    <AppCard>
      <h3 className="mb-3 text-base font-semibold">Mes informations</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Info label="Telephone" value={employee.phone || '-'} />
        <Info label="N. identite" value={employee.idNumber || '-'} />
        <Info label="Date d'embauche" value={formatDate(employee.startDate)} />
        <Info label="Niveau d'etudes" value={employee.educationLevel || '-'} />
        <Info label="Specialite" value={employee.specialty || '-'} />
        <Info label="Superieur direct" value={employee.manager?.fullName || '-'} />
      </div>
    </AppCard>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

function ShiftsTab() {
  const { data } = useQuery({
    queryKey: ['me', 'shifts'],
    queryFn: () => apiClient.get('/me/shifts').then((r) => r.data),
  });
  const items: any[] = data?.data ?? [];
  return (
    <AppCard>
      <h3 className="mb-3 text-base font-semibold">Mon planning hebdomadaire</h3>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Aucun planning defini.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="pb-2">Jour</th>
              <th className="pb-2">Service</th>
              <th className="pb-2">Heures</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((s) => (
              <tr key={s.id}>
                <td className="py-2 font-medium">{DAYS[s.dayOfWeek]}</td>
                <td className="py-2">
                  {s.isWorking ? <AppBadge variant="success">Travail</AppBadge> : <AppBadge variant="default">Repos</AppBadge>}
                </td>
                <td className="py-2 font-mono text-xs">
                  {s.isWorking ? `${s.startTime} - ${s.endTime}` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppCard>
  );
}

function AttendanceTab() {
  const { data } = useQuery({
    queryKey: ['me', 'attendance'],
    queryFn: () => apiClient.get('/me/attendance').then((r) => r.data),
  });
  const items: any[] = data?.data ?? [];
  return (
    <AppCard>
      <h3 className="mb-3 text-base font-semibold">Mon historique de pointage</h3>
      <p className="mb-3 text-xs text-gray-500">
        Le pointage est enregistre par votre superviseur. Si vous constatez une erreur,
        signalez-la a votre chef d&apos;agence.
      </p>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Aucun pointage.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="pb-2">Date</th>
              <th className="pb-2">Statut</th>
              <th className="pb-2">Arrivee</th>
              <th className="pb-2">Retard</th>
              <th className="pb-2">Motif</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((a) => (
              <tr key={a.id}>
                <td className="py-2">{formatDate(a.date)}</td>
                <td className="py-2">
                  <AppBadge variant={STATUS_VARIANT[a.status] ?? 'default'}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </AppBadge>
                </td>
                <td className="py-2 font-mono">{a.checkInTime || '-'}</td>
                <td className="py-2">{a.lateMinutes != null ? `${a.lateMinutes} min` : '-'}</td>
                <td className="py-2 text-gray-600">{a.reason || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppCard>
  );
}

function LeavesTab() {
  const qc = useQueryClient();
  const [type, setType] = useState('PAID');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');

  const { data } = useQuery({
    queryKey: ['me', 'leaves'],
    queryFn: () => apiClient.get('/me/leaves').then((r) => r.data),
  });
  const items: any[] = data?.data ?? [];

  const requestMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/me/leaves', {
        type,
        fromDate: from,
        toDate: to,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success('Demande envoyee');
      setFrom('');
      setTo('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['me', 'leaves'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  return (
    <div className="space-y-4">
      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Demander un conge</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <AppSelect label="Type" options={LEAVE_TYPE_OPTIONS} value={type} onValueChange={setType} />
          <AppInput label="Du" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <AppInput label="Au" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <AppInput label="Motif" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="mt-3 flex justify-end">
          <AppButton
            onClick={() => requestMutation.mutate()}
            loading={requestMutation.isPending}
            disabled={!from || !to}
          >
            Envoyer
          </AppButton>
        </div>
      </AppCard>

      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Mes demandes</h3>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune demande.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="pb-2">Type</th>
                <th className="pb-2">Du</th>
                <th className="pb-2">Au</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((l) => (
                <tr key={l.id}>
                  <td className="py-2">{l.type}</td>
                  <td className="py-2">{formatDate(l.fromDate)}</td>
                  <td className="py-2">{formatDate(l.toDate)}</td>
                  <td className="py-2">
                    <AppBadge
                      variant={
                        l.status === 'APPROVED'
                          ? 'success'
                          : l.status === 'REJECTED'
                            ? 'error'
                            : l.status === 'PENDING'
                              ? 'warning'
                              : 'default'
                      }
                    >
                      {l.status}
                    </AppBadge>
                  </td>
                  <td className="py-2 text-xs text-gray-600">
                    {l.validatedBy && `${l.validatedBy.firstName} ${l.validatedBy.lastName}`}
                    {l.validationComment && (
                      <span className="block italic text-gray-500">{l.validationComment}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AppCard>
    </div>
  );
}

function PayslipsTab() {
  const { data } = useQuery({
    queryKey: ['me', 'payslips'],
    queryFn: () => apiClient.get('/me/payslips').then((r) => r.data),
  });
  const items: any[] = data?.data ?? [];
  return (
    <AppCard>
      <h3 className="mb-3 text-base font-semibold">Mes bulletins de salaire</h3>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Aucun bulletin.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="pb-2">Periode</th>
              <th className="pb-2">Brut</th>
              <th className="pb-2">Retenues</th>
              <th className="pb-2">Net paye</th>
              <th className="pb-2">Statut</th>
              <th className="pb-2">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((p) => (
              <tr key={p.id}>
                <td className="py-2 font-medium">{p.period}</td>
                <td className="py-2 font-mono">{formatAmount(Number(p.grossSalary))}</td>
                <td className="py-2 font-mono text-red-600">
                  {p.deductionsTotal != null && Number(p.deductionsTotal) > 0
                    ? `-${formatAmount(Number(p.deductionsTotal))}`
                    : '-'}
                </td>
                <td className="py-2 font-mono font-bold text-primary-700">
                  {formatAmount(Number(p.netSalary))}
                </td>
                <td className="py-2">
                  <AppBadge variant={p.isPaid ? 'success' : 'warning'}>
                    {p.isPaid ? `Paye le ${p.paidAt ? formatDate(p.paidAt) : '-'}` : 'En attente'}
                  </AppBadge>
                </td>
                <td className="py-2 text-xs text-gray-600">{p.paymentNote || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppCard>
  );
}

function DocumentsTab() {
  const { data } = useQuery({
    queryKey: ['me', 'documents'],
    queryFn: () => apiClient.get('/me/documents').then((r) => r.data),
  });
  const items: any[] = data?.data ?? [];
  return (
    <AppCard>
      <h3 className="mb-3 text-base font-semibold">Mes documents</h3>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Aucun document.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2 text-sm">
              <FileText className="h-4 w-4 text-primary-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{d.label}</p>
                <p className="text-xs text-gray-500">
                  {d.type}
                  {d.validUntil && ` · valide jusqu'au ${formatDate(d.validUntil)}`}
                </p>
              </div>
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary-700 hover:underline"
              >
                Voir
              </a>
            </li>
          ))}
        </ul>
      )}
    </AppCard>
  );
}
