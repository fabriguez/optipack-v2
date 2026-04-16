import type { ChatConversation, ChatMessage, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';

export interface IChatRepository {
  findConversationById(id: string): Promise<ChatConversation | null>;
  findConversations(
    filters: {
      agencyIds: string[];
      clientId?: string;
      status?: string;
      assignedUserId?: string;
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ChatConversation>>;
  createConversation(
    data: Prisma.ChatConversationCreateInput,
  ): Promise<ChatConversation>;
  closeConversation(id: string): Promise<ChatConversation>;
  findMessages(
    conversationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ChatMessage>>;
  createMessage(data: Prisma.ChatMessageCreateInput): Promise<ChatMessage>;
  markMessagesAsRead(conversationId: string, userId: string): Promise<void>;
}

export const CHAT_REPOSITORY = Symbol.for('IChatRepository');
