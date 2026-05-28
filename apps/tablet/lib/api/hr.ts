import { apiClient } from './client';

// ----- Positions -----
export interface PositionDTO {
  id: string;
  organizationId: string;
  agencyId: string | null;
  name: string;
  description: string | null;
  hierarchyLevel: number;
  isSystem: boolean;
  isActive: boolean;
  permissions?: { permission: PermissionDTO }[];
  _count?: { employees: number };
}

export interface PermissionDTO {
  id: string;
  key: string;
  label: string;
  description: string | null;
  category: string;
  isSystem: boolean;
}

export const positionsApi = {
  list: (agencyId?: string) =>
    apiClient.get('/positions', { params: { agencyId } }).then((r) => r.data),
  getById: (id: string) => apiClient.get(`/positions/${id}`).then((r) => r.data),
  create: (data: {
    name: string;
    description?: string;
    hierarchyLevel?: number;
    agencyId?: string | null;
    permissionKeys?: string[];
  }) => apiClient.post('/positions', data).then((r) => r.data),
  update: (
    id: string,
    data: { name?: string; description?: string; hierarchyLevel?: number; isActive?: boolean },
  ) => apiClient.patch(`/positions/${id}`, data).then((r) => r.data),
  delete: (id: string) => apiClient.delete(`/positions/${id}`).then((r) => r.data),
  setPermissions: (id: string, permissionKeys: string[]) =>
    apiClient.put(`/positions/${id}/permissions`, { permissionKeys }).then((r) => r.data),
};

// ----- Permissions -----
export const permissionsApi = {
  list: () => apiClient.get('/permissions').then((r) => r.data),
  forUser: (userId: string) => apiClient.get(`/permissions/users/${userId}`).then((r) => r.data),
  setOverride: (userId: string, permissionKey: string, granted: boolean, reason?: string) =>
    apiClient
      .post(`/permissions/users/${userId}/overrides`, { permissionKey, granted, reason })
      .then((r) => r.data),
  removeOverride: (userId: string, permissionKey: string) =>
    apiClient
      .delete(`/permissions/users/${userId}/overrides/${permissionKey}`)
      .then((r) => r.data),
};

// ----- Work Schedules -----
export interface WorkScheduleDayDTO {
  id?: string;
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  isWorking: boolean;
}

export interface WorkScheduleDTO {
  id: string;
  name: string;
  description: string | null;
  timezone: string | null;
  isActive: boolean;
  days: WorkScheduleDayDTO[];
  _count?: { agencies: number; employees: number };
}

export const workSchedulesApi = {
  list: () => apiClient.get('/work-schedules').then((r) => r.data),
  getById: (id: string) => apiClient.get(`/work-schedules/${id}`).then((r) => r.data),
  create: (data: { name: string; description?: string; timezone?: string; days?: WorkScheduleDayDTO[] }) =>
    apiClient.post('/work-schedules', data).then((r) => r.data),
  update: (
    id: string,
    data: { name?: string; description?: string; timezone?: string; isActive?: boolean },
  ) => apiClient.patch(`/work-schedules/${id}`, data).then((r) => r.data),
  delete: (id: string) => apiClient.delete(`/work-schedules/${id}`).then((r) => r.data),
  setDays: (id: string, days: WorkScheduleDayDTO[]) =>
    apiClient.put(`/work-schedules/${id}/days`, { days }).then((r) => r.data),
  assignToAgency: (agencyId: string, scheduleId: string | null) =>
    apiClient
      .put(`/work-schedules/agencies/${agencyId}/assign/${scheduleId ?? 'null'}`)
      .then((r) => r.data),
  assignToEmployee: (employeeId: string, scheduleId: string | null) =>
    apiClient
      .put(`/work-schedules/employees/${employeeId}/assign/${scheduleId ?? 'null'}`)
      .then((r) => r.data),
};

// ----- Holidays -----
export type HolidayScope = 'GLOBAL' | 'AGENCY' | 'EMPLOYEE';

export interface HolidayDTO {
  id: string;
  scope: HolidayScope;
  agencyId: string | null;
  employeeId: string | null;
  name: string;
  fromDate: string;
  toDate: string;
  isRecurring: boolean;
  reason: string | null;
}

export const holidaysApi = {
  list: (params?: { scope?: HolidayScope; agencyId?: string; employeeId?: string }) =>
    apiClient.get('/holidays', { params }).then((r) => r.data),
  create: (data: {
    scope: HolidayScope;
    agencyId?: string | null;
    employeeId?: string | null;
    name: string;
    fromDate: string;
    toDate: string;
    isRecurring?: boolean;
    reason?: string;
  }) => apiClient.post('/holidays', data).then((r) => r.data),
  delete: (id: string) => apiClient.delete(`/holidays/${id}`).then((r) => r.data),
};
