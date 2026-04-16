import { apiClient } from './client';
import type { PaginationInput } from '@optipack/shared';

export interface ChatConversation {
  id: string;
  clientId: string;
  agencyId: string;
  assignedUserId: string | null;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  closedAt: string | null;
  client: { id: string; fullName: string; phone: string };
  assignedUser: { id: string; firstName: string; lastName: string; email: string } | null;
  agency: { id: string; name: string; code: string };
  _count: { messages: number };
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: 'USER' | 'CLIENT';
  message: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  senderUser: { id: string; firstName: string; lastName: string; email: string } | null;
}

export const chatApi = {
  listConversations: (params?: Partial<PaginationInput> & { status?: string; clientId?: string }) =>
    apiClient.get('/chat', { params }).then((r) => r.data),

  getConversation: (id: string) =>
    apiClient.get(`/chat/${id}`).then((r) => r.data),

  createConversation: (data: { clientId: string; agencyId: string }) =>
    apiClient.post('/chat', data).then((r) => r.data),

  closeConversation: (id: string) =>
    apiClient.post(`/chat/${id}/close`).then((r) => r.data),

  listMessages: (id: string, params?: Partial<PaginationInput>) =>
    apiClient.get(`/chat/${id}/messages`, { params }).then((r) => r.data),

  sendMessage: (id: string, message: string) =>
    apiClient.post(`/chat/${id}/messages`, { message }).then((r) => r.data),

  markRead: (id: string) =>
    apiClient.post(`/chat/${id}/read`).then((r) => r.data),
};
