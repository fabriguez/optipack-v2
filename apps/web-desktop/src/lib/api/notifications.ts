import { apiClient } from './client';

/** Canal d'envoi d'une notification. */
export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH' | 'IN_APP';

/** Statut de la file d'envoi. */
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'READ';

/** Piece jointe associee a une notification. */
export interface NotificationAttachment {
  url: string;
  filename: string;
  caption?: string;
  type?: string;
}

/** Notification telle que renvoyee par l'admin (vue tenant). */
export interface AdminNotification {
  id: string;
  type: NotificationChannel;
  status: NotificationStatus;
  eventKind: string | null;
  recipient: string | null;
  error: string | null;
  attachments: NotificationAttachment[] | null;
  title: string;
  message: string;
  createdAt: string;
  sentAt: string | null;
  retryCount: number;
  lastRetryAt: string | null;
  client: { id: string; fullName: string; phone: string } | null;
  agency: { id: string; name: string } | null;
  metadata?: Record<string, unknown> | null;
}

/** Filtres communs a la liste et aux stats admin. */
export interface AdminNotificationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** Canal (CSV autorise). */
  type?: string;
  /** Statut (CSV autorise). */
  status?: string;
  clientId?: string;
  /** Objet/evenement (CSV autorise). */
  eventKind?: string;
  /** YYYY-MM-DD */
  dateFrom?: string;
  /** YYYY-MM-DD */
  dateTo?: string;
}

export interface AdminListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminNotificationStats {
  total: number;
  byStatus: Partial<Record<NotificationStatus, number>>;
  byChannel: Partial<Record<NotificationChannel, number>>;
}

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

  /** Liste paginee scope tenant pour le centre de notifications. */
  adminList: (params?: AdminNotificationParams) =>
    apiClient
      .get<{ success: boolean; data: AdminNotification[]; meta: AdminListMeta }>(
        '/notifications/admin',
        { params },
      )
      .then((r) => r.data),

  /** Compteurs agreges (par statut / par canal) pour l'en-tete file d'attente. */
  adminStats: (params?: AdminNotificationParams) =>
    apiClient
      .get<{ success: boolean; data: AdminNotificationStats }>(
        '/notifications/admin/stats',
        { params },
      )
      .then((r) => r.data),

  /** Renvoie une notification echouee / en attente sur son canal. */
  retry: (id: string) =>
    apiClient
      .post<{ success: boolean; message: string }>(`/notifications/${id}/retry`)
      .then((r) => r.data),
};
