import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agencyDetailApi } from '@/lib/api/agencyDetail';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';

// --- Relations ---
export const useAgencyWarehouses = (id: string) =>
  useQuery({ queryKey: ['warehouses', 'agency', id], queryFn: () => agencyDetailApi.warehouses(id), enabled: !!id });
export const useAgencyClients = (id: string) =>
  useQuery({ queryKey: ['clients', 'agency', id], queryFn: () => agencyDetailApi.clients(id), enabled: !!id });
export const useAgencyEmployees = (id: string) =>
  useQuery({ queryKey: ['employees', 'agency', id], queryFn: () => agencyDetailApi.employees(id), enabled: !!id });
export const useAgencyPayments = (id: string) =>
  useQuery({ queryKey: ['payments', 'agency', id], queryFn: () => agencyDetailApi.payments(id), enabled: !!id });
export const useAgencyDisbursements = (id: string) =>
  useQuery({ queryKey: ['disbursements', 'agency', id], queryFn: () => agencyDetailApi.disbursements(id), enabled: !!id });
export const useAgencyCashRegister = (id: string) =>
  useQuery({ queryKey: ['cash-register', id], queryFn: () => agencyDetailApi.cashRegister(id), enabled: !!id });

// --- Charges ---
export const useAgencyCharges = (id: string, period?: string) =>
  useQuery({ queryKey: ['agencies', id, 'charges', period], queryFn: () => agencyDetailApi.charges(id, period), enabled: !!id });

export function useChargeMutations(agencyId: string, period?: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['agencies', agencyId, 'charges'] });
  const create = useMutation({
    mutationFn: (data: unknown) => agencyDetailApi.createCharge(agencyId, data),
    onSuccess: () => { invalidate(); toast.success('Charge ajoutee'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => agencyDetailApi.updateCharge(id, data),
    onSuccess: () => { invalidate(); toast.success('Charge mise a jour'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => agencyDetailApi.deleteCharge(id),
    onSuccess: () => { invalidate(); toast.success('Charge supprimee'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const pay = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => agencyDetailApi.payCharge(id, data),
    onSuccess: () => { invalidate(); toast.success('Paiement enregistre'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  void period;
  return { create, update, remove, pay };
}

// --- Repartition ---
export const useAgencyBreakdown = (id: string, from?: string, to?: string) =>
  useQuery({ queryKey: ['agencies', id, 'breakdown', from, to], queryFn: () => agencyDetailApi.breakdown(id, from, to), enabled: !!id });

// --- Rapports journaliers ---
export const useAgencyDailyReports = (id: string) =>
  useQuery({ queryKey: ['agencies', id, 'daily-reports'], queryFn: () => agencyDetailApi.dailyReports(id), enabled: !!id });

export function useDailyReportMutations(agencyId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['agencies', agencyId, 'daily-reports'] });
  const generate = useMutation({
    mutationFn: (date?: string) => agencyDetailApi.generateDailyReport(agencyId, date),
    onSuccess: () => { invalidate(); toast.success('Rapport genere'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => agencyDetailApi.updateDailyReport(id, data),
    onSuccess: () => { invalidate(); toast.success('Rapport mis a jour'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const email = useMutation({
    mutationFn: (id: string) => agencyDetailApi.emailDailyReport(id),
    onSuccess: () => toast.success('Rapport envoye par email'),
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  return { generate, update, email };
}

// --- Pointage ---
export const useAgencyAttendance = (id: string, date?: string) =>
  useQuery({ queryKey: ['employees', 'attendance', id, date], queryFn: () => agencyDetailApi.attendanceToday(id, date), enabled: !!id });

export function useAttendanceMutations(agencyId: string, date?: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['employees', 'attendance', agencyId] });
  const mark = useMutation({
    mutationFn: ({ employeeId, data }: { employeeId: string; data: unknown }) => agencyDetailApi.markAttendance(employeeId, data),
    onSuccess: () => { invalidate(); toast.success('Pointage enregistre'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const checkOut = useMutation({
    mutationFn: ({ employeeId, data }: { employeeId: string; data: unknown }) => agencyDetailApi.checkOutAttendance(employeeId, data),
    onSuccess: () => { invalidate(); toast.success('Sortie enregistree'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  void date;
  return { mark, checkOut };
}

// --- Conges ---
export const useAgencyPendingLeaves = (id: string) =>
  useQuery({ queryKey: ['employees', 'leaves', 'pending', id], queryFn: () => agencyDetailApi.pendingLeaves(id), enabled: !!id });

export function useValidateLeave(agencyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leaveId, data }: { leaveId: string; data: unknown }) => agencyDetailApi.validateLeave(leaveId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees', 'leaves', 'pending', agencyId] }); toast.success('Demande traitee'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
}

// --- Grille eval ---
export const useAgencyReviewConfig = (id: string) =>
  useQuery({ queryKey: ['employees', 'review-config', id], queryFn: () => agencyDetailApi.reviewConfig(id), enabled: !!id });

export function useSaveReviewConfig(agencyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => agencyDetailApi.saveReviewConfig(agencyId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees', 'review-config', agencyId] }); toast.success('Grille enregistree'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
}

// --- Stats RH ---
export const useAgencyHrStats = (id: string, month?: string) =>
  useQuery({ queryKey: ['employees', 'hr-stats', id, month], queryFn: () => agencyDetailApi.hrStats(id, month), enabled: !!id });

// --- Horaires ---
export const useAgencyOpeningHours = (id: string) =>
  useQuery({ queryKey: ['agencies', id, 'opening-hours'], queryFn: () => agencyDetailApi.openingHours(id), enabled: !!id });

export function useSaveOpeningHours(agencyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hours: unknown) => agencyDetailApi.saveOpeningHours(agencyId, hours),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agencies', agencyId, 'opening-hours'] }); toast.success('Horaires enregistres'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
}

// --- Actions employe ---
export function useEmployeeActions(agencyId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['employees'] });
  const setManagerFlag = useMutation({
    mutationFn: ({ employeeId, value }: { employeeId: string; value: boolean }) => agencyDetailApi.setManagerFlag(employeeId, value),
    onSuccess: (_d, v) => { invalidate(); toast.success(v.value ? "Promu chef d'agence" : "Retire du role chef"); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const pay = useMutation({
    mutationFn: ({ employeeId, data }: { employeeId: string; data: unknown }) => agencyDetailApi.payEmployee(employeeId, data),
    onSuccess: () => { invalidate(); toast.success('Salaire paye'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const deduct = useMutation({
    mutationFn: ({ employeeId, data }: { employeeId: string; data: unknown }) => agencyDetailApi.addDeduction(employeeId, data),
    onSuccess: () => { invalidate(); toast.success('Retenue enregistree'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  void agencyId;
  return { setManagerFlag, pay, deduct };
}
