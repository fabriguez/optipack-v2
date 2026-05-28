import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  positionsApi,
  permissionsApi,
  workSchedulesApi,
  holidaysApi,
  type WorkScheduleDayDTO,
  type HolidayScope,
} from '@/lib/api/hr';

const QK = {
  positions: ['hr', 'positions'] as const,
  permissions: ['hr', 'permissions'] as const,
  schedules: ['hr', 'schedules'] as const,
  holidays: ['hr', 'holidays'] as const,
};

// ----- Positions -----
export function usePositions(agencyId?: string) {
  return useQuery({
    queryKey: [...QK.positions, agencyId ?? 'all'],
    queryFn: () => positionsApi.list(agencyId),
  });
}

export function useCreatePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: positionsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.positions });
      toast.success('Poste cree');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}

export function useUpdatePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof positionsApi.update>[1] }) =>
      positionsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.positions });
      toast.success('Poste mis a jour');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}

export function useDeletePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => positionsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.positions });
      toast.success('Poste supprime');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}

export function useSetPositionPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, keys }: { id: string; keys: string[] }) =>
      positionsApi.setPermissions(id, keys),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.positions });
      toast.success('Matrice de permissions mise a jour');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}

// ----- Permissions -----
export function usePermissionsCatalog() {
  return useQuery({
    queryKey: QK.permissions,
    queryFn: () => permissionsApi.list(),
  });
}

// ----- Work Schedules -----
export function useWorkSchedules() {
  return useQuery({
    queryKey: QK.schedules,
    queryFn: () => workSchedulesApi.list(),
  });
}

export function useCreateWorkSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: workSchedulesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.schedules });
      toast.success('Planning cree');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}

export function useUpdateWorkSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof workSchedulesApi.update>[1] }) =>
      workSchedulesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.schedules });
      toast.success('Planning mis a jour');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}

export function useDeleteWorkSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workSchedulesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.schedules });
      toast.success('Planning supprime');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}

export function useSetScheduleDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, days }: { id: string; days: WorkScheduleDayDTO[] }) =>
      workSchedulesApi.setDays(id, days),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.schedules });
      toast.success('Jours du planning enregistres');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}

// ----- Holidays -----
export function useHolidays(params?: { scope?: HolidayScope; agencyId?: string; employeeId?: string }) {
  return useQuery({
    queryKey: [...QK.holidays, params],
    queryFn: () => holidaysApi.list(params),
  });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: holidaysApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.holidays });
      toast.success('Jour non ouvre cree');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => holidaysApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.holidays });
      toast.success('Supprime');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  });
}
