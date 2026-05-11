import type { Server as SocketServer } from 'socket.io';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('Realtime');

/**
 * Service realtime via socket.io. Singleton qui expose les emissions vers
 * les rooms organisees par cible (user, client, agency, organization).
 *
 * Rooms standard :
 *   - user:<userId>          : tout pour un utilisateur (agent)
 *   - client:<clientId>      : tout pour un client (portail client)
 *   - agency:<agencyId>      : tout pour les utilisateurs de l'agence
 *   - org:<organizationId>   : broadcast tenant entier
 *
 * Auth : voir attachSocketAuth(). Sans auth valide, le socket ne joint aucune
 * room et ne recoit donc rien.
 */
class RealtimeServiceImpl {
  private io: SocketServer | null = null;

  attach(io: SocketServer): void {
    this.io = io;
    logger.info('Realtime service attache au socket.io server');
  }

  /** Emet vers la room d'un utilisateur connecte. */
  toUser(userId: string, event: string, payload: unknown): void {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, payload);
  }

  /** Emet vers la room d'un client (portail client). */
  toClient(clientId: string, event: string, payload: unknown): void {
    if (!this.io) return;
    this.io.to(`client:${clientId}`).emit(event, payload);
  }

  /** Emet a tous les utilisateurs d'une agence. */
  toAgency(agencyId: string, event: string, payload: unknown): void {
    if (!this.io) return;
    this.io.to(`agency:${agencyId}`).emit(event, payload);
  }

  /** Broadcast tenant entier. */
  toOrganization(organizationId: string, event: string, payload: unknown): void {
    if (!this.io) return;
    this.io.to(`org:${organizationId}`).emit(event, payload);
  }
}

export const realtimeService = new RealtimeServiceImpl();
