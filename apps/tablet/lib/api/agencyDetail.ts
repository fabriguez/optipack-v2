import { apiClient } from './client';

/**
 * Endpoints lies au detail d'une agence (relations + RH + finance). Mirror des
 * appels apiClient faits par la page web apps/web/app/(dashboard)/agencies/[id].
 */
export const agencyDetailApi = {
  // --- Relations ---
  warehouses: (agencyId: string) =>
    apiClient.get(`/warehouses/agency/${agencyId}`, { params: { limit: 50 } }).then((r) => r.data),
  clients: (agencyId: string) =>
    apiClient.get('/clients', { params: { agencyId, limit: 10 } }).then((r) => r.data),
  employees: (agencyId: string) =>
    apiClient.get(`/employees/agency/${agencyId}`, { params: { limit: 50 } }).then((r) => r.data),
  payments: (agencyId: string) =>
    apiClient.get('/payments', { params: { agencyId, limit: 10 } }).then((r) => r.data),
  disbursements: (agencyId: string) =>
    apiClient.get('/disbursements', { params: { agencyId, limit: 10 } }).then((r) => r.data),
  cashRegister: (agencyId: string) =>
    apiClient.get(`/cash-registers/${agencyId}`).then((r) => r.data),

  // --- Charges ---
  charges: (agencyId: string, period?: string) =>
    apiClient.get(`/agencies/${agencyId}/charges`, { params: period ? { period } : undefined }).then((r) => r.data),
  createCharge: (agencyId: string, data: unknown) =>
    apiClient.post(`/agencies/${agencyId}/charges`, data).then((r) => r.data),
  updateCharge: (chargeId: string, data: unknown) =>
    apiClient.patch(`/agencies/charges/${chargeId}`, data).then((r) => r.data),
  deleteCharge: (chargeId: string) =>
    apiClient.delete(`/agencies/charges/${chargeId}`).then((r) => r.data),
  payCharge: (chargeId: string, data: unknown) =>
    apiClient.post(`/agencies/charges/${chargeId}/pay`, data).then((r) => r.data),

  // --- Repartition / breakdown ---
  breakdown: (agencyId: string, from?: string, to?: string) =>
    apiClient.get(`/agencies/${agencyId}/breakdown`, { params: { from, to } }).then((r) => r.data),

  // --- Rapports journaliers ---
  dailyReports: (agencyId: string) =>
    apiClient.get(`/agencies/${agencyId}/daily-reports`).then((r) => r.data),
  generateDailyReport: (agencyId: string, date?: string) =>
    apiClient.post(`/agencies/${agencyId}/daily-reports`, date ? { date } : {}).then((r) => r.data),
  dailyReport: (reportId: string) =>
    apiClient.get(`/agencies/daily-reports/${reportId}`).then((r) => r.data),
  updateDailyReport: (reportId: string, data: unknown) =>
    apiClient.patch(`/agencies/daily-reports/${reportId}`, data).then((r) => r.data),
  emailDailyReport: (reportId: string) =>
    apiClient.post(`/agencies/daily-reports/${reportId}/email`, {}).then((r) => r.data),

  // --- Pointage ---
  attendanceToday: (agencyId: string, date?: string) =>
    apiClient.get(`/employees/agency/${agencyId}/attendance/today`, { params: date ? { date } : undefined }).then((r) => r.data),
  markAttendance: (employeeId: string, data: unknown) =>
    apiClient.post(`/employees/${employeeId}/attendance`, data).then((r) => r.data),
  checkOutAttendance: (employeeId: string, data: unknown) =>
    apiClient.post(`/employees/${employeeId}/attendance/check-out`, data).then((r) => r.data),

  // --- Conges ---
  pendingLeaves: (agencyId: string) =>
    apiClient.get(`/employees/agency/${agencyId}/leaves/pending`).then((r) => r.data),
  validateLeave: (leaveId: string, data: unknown) =>
    apiClient.post(`/employees/leaves/${leaveId}/validate`, data).then((r) => r.data),

  // --- Grille d'evaluation ---
  reviewConfig: (agencyId: string) =>
    apiClient.get(`/employees/agency/${agencyId}/review-config`).then((r) => r.data),
  saveReviewConfig: (agencyId: string, data: unknown) =>
    apiClient.put(`/employees/agency/${agencyId}/review-config`, data).then((r) => r.data),

  // --- Stats RH ---
  hrStats: (agencyId: string, month?: string) =>
    apiClient.get(`/employees/agency/${agencyId}/hr-stats`, { params: month ? { month } : undefined }).then((r) => r.data),

  // --- Horaires d'ouverture ---
  openingHours: (agencyId: string) =>
    apiClient.get(`/agencies/${agencyId}/opening-hours`).then((r) => r.data),
  saveOpeningHours: (agencyId: string, hours: unknown) =>
    apiClient.put(`/agencies/${agencyId}/opening-hours`, { hours }).then((r) => r.data),

  // --- Actions employe ---
  setManagerFlag: (employeeId: string, isAgencyManager: boolean) =>
    apiClient.post(`/employees/${employeeId}/set-manager-flag`, { isAgencyManager }).then((r) => r.data),
  payEmployee: (employeeId: string, data: unknown) =>
    apiClient.post(`/employees/${employeeId}/pay`, data).then((r) => r.data),
  addDeduction: (employeeId: string, data: unknown) =>
    apiClient.post(`/employees/${employeeId}/deductions`, data).then((r) => r.data),
};
