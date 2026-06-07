import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { prisma } from '../../config/database';
import { StreamChatService } from '../../infrastructure/chat/StreamChatService';
import { NotFoundError } from '../../domain/errors/BusinessError';

/**
 * Endpoints d'authentification Stream Chat (support client temps reel).
 * Le secret reste serveur : on renvoie seulement apiKey + token + ids.
 */
export class StreamChatController {
  /**
   * POST /client-portal/support/token  (auth client)
   * Upsert le user Stream du client, garantit son channel support, renvoie
   * apiKey + token + userId + channelId pour init le SDK cote app.
   */
  static async clientToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, fullName: true, agencyId: true, imageUrl: true },
      });
      if (!client) throw new NotFoundError('Client', clientId);

      const stream = container.resolve(StreamChatService);
      const userId = StreamChatService.clientUserId(client.id);
      const token = await stream.upsertUser({
        id: userId,
        name: client.fullName,
        role: 'user',
        image: client.imageUrl,
      });
      const channelId = await stream.getOrCreateSupportChannel({
        clientId: client.id,
        clientName: client.fullName,
        agencyId: client.agencyId,
      });

      res.json({
        success: true,
        data: { apiKey: stream.apiKey, token, userId, channelId },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /chat/stream/token  (auth staff)
   * Upsert le user Stream de l'agent (role admin -> peut interroger tous les
   * channels support, filtres par agence cote front), renvoie token + agencyIds.
   */
  static async staffToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId: staffId, agencyIds } = req.user!;
      const user = await prisma.user.findUnique({
        where: { id: staffId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!user) throw new NotFoundError('User', staffId);

      const stream = container.resolve(StreamChatService);
      const userId = StreamChatService.staffUserId(user.id);
      const token = await stream.upsertUser({
        id: userId,
        name: `${user.firstName} ${user.lastName}`.trim(),
        role: 'admin',
      });

      res.json({
        success: true,
        data: { apiKey: stream.apiKey, token, userId, agencyIds },
      });
    } catch (err) {
      next(err);
    }
  }
}
