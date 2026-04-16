import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CHAT_REPOSITORY } from '../../application/interfaces/IChatRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class ChatController {
  static async listConversations(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(CHAT_REPOSITORY);
      const { clientId, status, assignedUserId } = req.query;
      const result = await repo.findConversations(
        {
          agencyIds: req.user!.agencyIds,
          clientId: clientId as string | undefined,
          status: status as string | undefined,
          assignedUserId: assignedUserId as string | undefined,
        },
        req.query,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(CHAT_REPOSITORY);
      const conversation = await repo.findConversationById(req.params.id);
      if (!conversation) throw new NotFoundError('Conversation', req.params.id);
      res.json({ success: true, data: conversation });
    } catch (err) {
      next(err);
    }
  }

  static async createConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(CHAT_REPOSITORY);
      const { clientId, agencyId } = req.body;
      const conversation = await repo.createConversation({
        client: { connect: { id: clientId } },
        agency: { connect: { id: agencyId } },
        assignedUser: { connect: { id: req.user!.userId } },
      });
      res.status(201).json({ success: true, data: conversation });
    } catch (err) {
      next(err);
    }
  }

  static async closeConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(CHAT_REPOSITORY);
      const existing = await repo.findConversationById(req.params.id);
      if (!existing) throw new NotFoundError('Conversation', req.params.id);
      const conversation = await repo.closeConversation(req.params.id);
      res.json({ success: true, data: conversation });
    } catch (err) {
      next(err);
    }
  }

  static async listMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(CHAT_REPOSITORY);
      const existing = await repo.findConversationById(req.params.id);
      if (!existing) throw new NotFoundError('Conversation', req.params.id);
      const result = await repo.findMessages(req.params.id, req.query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(CHAT_REPOSITORY);
      const existing = await repo.findConversationById(req.params.id);
      if (!existing) throw new NotFoundError('Conversation', req.params.id);
      const chatMessage = await repo.createMessage({
        conversation: { connect: { id: req.params.id } },
        senderUser: { connect: { id: req.user!.userId } },
        senderType: 'USER',
        message: req.body.message,
      });
      res.status(201).json({ success: true, data: chatMessage });
    } catch (err) {
      next(err);
    }
  }

  static async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(CHAT_REPOSITORY);
      const existing = await repo.findConversationById(req.params.id);
      if (!existing) throw new NotFoundError('Conversation', req.params.id);
      await repo.markMessagesAsRead(req.params.id, req.user!.userId);
      res.json({ success: true, message: 'Messages marques comme lus' });
    } catch (err) {
      next(err);
    }
  }
}
