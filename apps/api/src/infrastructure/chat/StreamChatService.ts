import { injectable } from 'tsyringe';
import { StreamChat } from 'stream-chat';
import { config } from '../../config';
import { createChildLogger } from '../../config/logger';
import { BusinessError } from '../../domain/errors/BusinessError';

const logger = createChildLogger('StreamChat');

/**
 * Service Stream Chat (getstream.io) pour le support client temps reel.
 *
 * Modele :
 *  - Client portail  -> user Stream `client_<clientId>`, role `user`
 *    (ne voit que SES channels via appartenance).
 *  - Agent backoffice -> user Stream `user_<userId>`, role `admin`
 *    (peut interroger/watch tous les channels support, filtres par agence).
 *  - Channel support  -> `messaging:support-<clientId>`, donnees custom
 *    { agency_id, client_name } pour que le backoffice filtre par agence.
 *
 * apiSecret reste cote serveur : il signe les tokens et autorise les ops admin
 * (upsert user, create channel). Les apps recoivent uniquement apiKey + token.
 */
@injectable()
export class StreamChatService {
  private client: StreamChat | null = null;

  isConfigured(): boolean {
    return Boolean(config.stream.apiKey && config.stream.apiSecret);
  }

  /** apiKey public renvoyee aux apps pour initialiser leur SDK. */
  get apiKey(): string {
    return config.stream.apiKey;
  }

  private getClient(): StreamChat {
    if (!this.isConfigured()) {
      throw new BusinessError(
        'Stream Chat non configure (STREAM_API_KEY / STREAM_API_SECRET manquants).',
      );
    }
    if (!this.client) {
      this.client = StreamChat.getInstance(config.stream.apiKey, config.stream.apiSecret);
    }
    return this.client;
  }

  static clientUserId(clientId: string): string {
    return `client_${clientId}`;
  }

  static staffUserId(userId: string): string {
    return `user_${userId}`;
  }

  static supportChannelId(clientId: string): string {
    return `support-${clientId}`;
  }

  /** Cree/actualise un user Stream et renvoie son token JWT. */
  async upsertUser(params: {
    id: string;
    name: string;
    role: 'user' | 'admin';
    image?: string | null;
  }): Promise<string> {
    const client = this.getClient();
    await client.upsertUser({
      id: params.id,
      name: params.name,
      role: params.role,
      ...(params.image ? { image: params.image } : {}),
    });
    return client.createToken(params.id);
  }

  /**
   * Garantit l'existence du channel support d'un client (idempotent).
   * Le client en est membre ; les agents (role admin) y accedent par filtre.
   */
  async getOrCreateSupportChannel(params: {
    clientId: string;
    clientName: string;
    agencyId?: string | null;
  }): Promise<string> {
    const client = this.getClient();
    const clientUid = StreamChatService.clientUserId(params.clientId);
    const channelId = StreamChatService.supportChannelId(params.clientId);
    const channel = client.channel('messaging', channelId, {
      members: [clientUid],
      created_by_id: clientUid,
      // Donnees custom : le backoffice filtre les channels support par agence.
      agency_id: params.agencyId ?? undefined,
      client_id: params.clientId,
      client_name: params.clientName,
      is_support: true,
    } as Record<string, unknown>);
    await channel.create();
    return channelId;
  }

  /** Poste un message systeme (ex : notification automatique) dans un channel. */
  async postSystemMessage(channelId: string, text: string): Promise<void> {
    try {
      const client = this.getClient();
      const channel = client.channel('messaging', channelId);
      await channel.sendMessage({ text, user_id: 'system' } as Record<string, unknown>);
    } catch (err) {
      logger.warn({ err, channelId }, 'postSystemMessage echec (non bloquant)');
    }
  }
}
