import { injectable } from 'tsyringe';
import type { ChatConversation, ChatMessage, Prisma } from '@prisma/client';
import type { IChatRepository } from '../../../application/interfaces/IChatRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { safeOrderBy } from '../../../domain/utils/safeOrderBy';

// Colonnes scalaires triables (allowlist anti sort-injection).
const CONVERSATION_SORTABLE = ['id', 'status', 'createdAt', 'closedAt'];
const MESSAGE_SORTABLE = ['id', 'createdAt', 'readAt'];

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
      scopeWhere?: object | null;
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
      // Scope agence (etape 2) : merge en AND par-dessus le filtre agencyIds existant.
      ...(filters.scopeWhere && { AND: [filters.scopeWhere as Prisma.ChatConversationWhereInput] }),
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
        orderBy: safeOrderBy(sortBy, sortOrder, CONVERSATION_SORTABLE, 'createdAt'),
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
        orderBy: safeOrderBy(sortBy, sortOrder ?? 'asc', MESSAGE_SORTABLE, 'createdAt'),
        include: {
          senderUser: { select: { id: true, firstName: true, lastName: true, email: true } },
          senderClient: { select: { id: true, fullName: true, phone: true } },
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
        senderClient: { select: { id: true, fullName: true, phone: true } },
      },
    });
  }

  async markMessagesAsRead(
    conversationId: string,
    readerId: string,
    readerType: 'USER' | 'CLIENT' = 'USER',
  ): Promise<void> {
    // Marque comme lus les messages que CE lecteur n'a pas envoyes.
    const notSelf =
      readerType === 'USER'
        ? { senderUserId: { not: readerId } }
        : { senderClientId: { not: readerId } };
    await prisma.chatMessage.updateMany({
      where: {
        conversationId,
        ...notSelf,
        isRead: false,
      },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
