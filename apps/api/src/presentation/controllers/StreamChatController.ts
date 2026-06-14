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
   * POST /chat/stream/open-with-client  (staff)
   * Cree ou recupere le channel support du client donne, ajoute le staff comme
   * membre (le client recoit les messages de ce staff dans son channel unique),
   * renvoie le channelId pour que le front l'ouvre directement.
   */
  static async openWithClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId: staffId } = req.user!;
      const { clientId } = req.body as { clientId: string };

      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, fullName: true, agencyId: true },
      });
      if (!client) throw new NotFoundError('Client', clientId);

      const user = await prisma.user.findUnique({
        where: { id: staffId },
        select: { id: true },
      });
      if (!user) throw new NotFoundError('User', staffId);

      const stream = container.resolve(StreamChatService);

      // S'assure que le client Stream existe (upsert minimal).
      const clientStreamId = StreamChatService.clientUserId(client.id);
      await stream.upsertUser({ id: clientStreamId, name: client.fullName, role: 'user' });

      const channelId = await stream.getOrCreateSupportChannel({
        clientId: client.id,
        clientName: client.fullName,
        agencyId: client.agencyId,
      });

      // Ajoute le staff au channel pour que le client voit ses messages.
      const staffStreamId = StreamChatService.staffUserId(user.id);
      await stream.addStaffToChannel(channelId, staffStreamId);

      res.json({ success: true, data: { channelId, apiKey: stream.apiKey } });
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
