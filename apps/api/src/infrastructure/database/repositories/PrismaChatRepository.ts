import { injectable } from 'tsyringe';
import type { ChatConversation, ChatMessage, Prisma } from '@prisma/client';
import type { IChatRepository } from '../../../application/interfaces/IChatRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaChatRepository implements IChatRepository {
  async findConversationById(id: string): Promise<ChatConversation | null> {
    return prisma.chatConversation.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        agency: { select: { id: true, name: true, code: true } },
        _count: { select: { messages: true } },
      },
    });
  }

  async findConversations(
    filters: {
      agencyIds: string[];
      clientId?: string;
      status?: string;
      assignedUserId?: string;
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ChatConversation>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ChatConversationWhereInput = {
      agencyId: { in: filters.agencyIds },
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.status && { status: filters.status as any }),
      ...(filters.assignedUserId && {
        assignedUserId: filters.assignedUserId,
      }),
      ...(search && {
        client: {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        },
      }),
    };

    const [data, total] = await Promise.all([
      prisma.chatConversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: {
          client: { select: { id: true, fullName: true, phone: true } },
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          agency: { select: { id: true, name: true, code: true } },
          _count: { select: { messages: true } },
        },
      }),
      prisma.chatConversation.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createConversation(
    data: Prisma.ChatConversationCreateInput,
  ): Promise<ChatConversation> {
    return prisma.chatConversation.create({
      data,
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        agency: { select: { id: true, name: true, code: true } },
        _count: { select: { messages: true } },
      },
    });
  }

  async closeConversation(id: string): Promise<ChatConversation> {
    return prisma.chatConversation.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        agency: { select: { id: true, name: true, code: true } },
        _count: { select: { messages: true } },
      },
    });
  }

  async findMessages(
    conversationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ChatMessage>> {
    const { page, limit, sortBy, sortOrder } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ChatMessageWhereInput = { conversationId };

    const [data, total] = await Promise.all([
      prisma.chatMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'asc' },
        include: {
          senderUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.chatMessage.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createMessage(
    data: Prisma.ChatMessageCreateInput,
  ): Promise<ChatMessage> {
    return prisma.chatMessage.create({
      data,
      include: {
        senderUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async markMessagesAsRead(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    await prisma.chatMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
