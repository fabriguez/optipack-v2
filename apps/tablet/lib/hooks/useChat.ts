import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '@/lib/api/chat';
import type { PaginationInput } from '@transitsoftservices/shared';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';

export function useConversations(params?: Partial<PaginationInput> & { status?: string; clientId?: string }) {
  return useQuery({
    queryKey: ['chat-conversations', params],
    queryFn: () => chatApi.listConversations(params),
    refetchInterval: 10000,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: ['chat-conversation', id],
    queryFn: () => chatApi.getConversation(id!),
    enabled: !!id,
  });
}

export function useMessages(conversationId: string | null, params?: Partial<PaginationInput>) {
  return useQuery({
    queryKey: ['chat-messages', conversationId, params],
    queryFn: () => chatApi.listMessages(conversationId!, params),
    enabled: !!conversationId,
    refetchInterval: 5000,
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { clientId: string; agencyId: string }) => chatApi.createConversation(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      toast.success('Conversation creee');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la creation de la conversation')),
  });
}

export function useCloseConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatApi.closeConversation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      qc.invalidateQueries({ queryKey: ['chat-conversation'] });
      toast.success('Conversation fermee');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la fermeture')),
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, message }: { conversationId: string; message: string }) =>
      chatApi.sendMessage(conversationId, message),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['chat-messages', variables.conversationId] });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de l\'envoi du message')),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
  });
}
