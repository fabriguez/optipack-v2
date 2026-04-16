import { apiClient } from './client';

export const notificationsApi = {
  list: (params?: { page?: number; limit?: number; status?: string; search?: string }) =>
    apiClient.get('/notifications', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get(`/notifications/${id}`).then((r) => r.data),
  markAsRead: (id: string) =>
    apiClient.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllAsRead: () =>
    apiClient.post('/notifications/read-all').then((r) => r.data),
  getUnreadCount: () =>
    apiClient.get('/notifications/unread-count').then((r) => r.data),
};
