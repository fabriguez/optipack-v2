import { apiClient } from './client';
import type { PaginationInput } from '@transitsoftservices/shared';

/** Endpoints personnel (mirror web /employees). */
export const employeesApi = {
  list: (params?: Partial<PaginationInput> & { agencyId?: string; status?: string }) =>
    apiClient.get('/employees', { params }).then((r) => r.data),
  getById: (id: string) => apiClient.get(`/employees/${id}`).then((r) => r.data),
  create: (data: unknown) => apiClient.post('/employees', data).then((r) => r.data),
  update: (id: string, data: unknown) => apiClient.patch(`/employees/${id}`, data).then((r) => r.data),
  delete: (id: string) => apiClient.delete(`/employees/${id}`).then((r) => r.data),
  resendCredentials: (id: string) => apiClient.post(`/employees/${id}/resend-credentials`, {}).then((r) => r.data),

  pay: (id: string, data: unknown) => apiClient.post(`/employees/${id}/pay`, data).then((r) => r.data),
  payslips: (id: string) => apiClient.get(`/employees/${id}/payslips`).then((r) => r.data),
  deductions: (id: string) => apiClient.get(`/employees/${id}/deductions`).then((r) => r.data),
  createDeduction: (id: string, data: unknown) => apiClient.post(`/employees/${id}/deductions`, data).then((r) => r.data),
  cancelDeduction: (deductionId: string, reason: string) => apiClient.post(`/employees/deductions/${deductionId}/cancel`, { reason }).then((r) => r.data),

  sanctions: (id: string) => apiClient.get(`/employees/${id}/sanctions`).then((r) => r.data),
  createSanction: (id: string, data: unknown) => apiClient.post(`/employees/${id}/sanctions`, data).then((r) => r.data),
  terminate: (id: string, data: unknown) => apiClient.post(`/employees/${id}/terminate`, data).then((r) => r.data),

  shifts: (id: string) => apiClient.get(`/employees/${id}/shifts`).then((r) => r.data),
  saveShifts: (id: string, shifts: unknown) => apiClient.put(`/employees/${id}/shifts`, { shifts }).then((r) => r.data),

  attendance: (id: string) => apiClient.get(`/employees/${id}/attendance`).then((r) => r.data),
  markAttendance: (id: string, data: unknown) => apiClient.post(`/employees/${id}/attendance`, data).then((r) => r.data),
  checkOut: (id: string, data: unknown) => apiClient.post(`/employees/${id}/attendance/check-out`, data).then((r) => r.data),

  leaves: (id: string) => apiClient.get(`/employees/${id}/leaves`).then((r) => r.data),
  createLeave: (id: string, data: unknown) => apiClient.post(`/employees/${id}/leaves`, data).then((r) => r.data),
  validateLeave: (leaveId: string, data: unknown) => apiClient.post(`/employees/leaves/${leaveId}/validate`, data).then((r) => r.data),

  documents: (id: string) => apiClient.get(`/employees/${id}/documents`).then((r) => r.data),
  createDocument: (id: string, data: unknown) => apiClient.post(`/employees/${id}/documents`, data).then((r) => r.data),
  deleteDocument: (docId: string) => apiClient.delete(`/employees/documents/${docId}`).then((r) => r.data),

  reviews: (id: string) => apiClient.get(`/employees/${id}/reviews`).then((r) => r.data),
  createReview: (id: string, data: unknown) => apiClient.post(`/employees/${id}/reviews`, data).then((r) => r.data),
  reviewConfig: (agencyId: string) => apiClient.get(`/employees/agency/${agencyId}/review-config`).then((r) => r.data),
  attendanceStats: (id: string, from: string, to: string) => apiClient.get(`/employees/${id}/attendance/stats`, { params: { from, to } }).then((r) => r.data),

  uploadImage: (id: string, slot: string, file: { uri: string; name: string; mimeType: string }) => {
    const fd = new FormData();
    fd.append('image', { uri: file.uri, name: file.name, type: file.mimeType } as never);
    return apiClient.post(`/employees/${id}/image/${slot}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
};
