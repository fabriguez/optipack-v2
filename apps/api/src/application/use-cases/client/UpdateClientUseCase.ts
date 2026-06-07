import { inject, injectable } from 'tsyringe';
import type { UpdateClientInput } from '@transitsoftservices/shared';
import { CLIENT_REPOSITORY, type IClientRepository } from '../../interfaces/IClientRepository';
import { ConflictError, NotFoundError } from '../../../domain/errors/BusinessError';
import { prisma } from '../../../config/database';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';

@injectable()
export class UpdateClientUseCase {
  constructor(
    @inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
  ) {}

  async execute(id: string, input: UpdateClientInput) {
    const client = await this.clientRepo.findById(id);
    if (!client) {
      throw new NotFoundError('Client', id);
    }

    // Email unique : refuse si un AUTRE client porte deja cet email.
    if (input.email) {
      const clash = await prisma.client.findUnique({ where: { email: input.email } });
      if (clash && clash.id !== id) {
        throw new ConflictError('Un client avec cet email existe deja');
      }
    }

    const updated = await this.clientRepo.update(id, {
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email || null }),
      ...(input.address !== undefined && { address: input.address || null }),
      ...(input.clientType !== undefined && { clientType: input.clientType }),
      ...(input.loyaltyTier !== undefined && { loyaltyTier: input.loyaltyTier }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.emergencyContactName !== undefined && { emergencyContactName: input.emergencyContactName?.trim() || null }),
      ...(input.emergencyContactPhone !== undefined && { emergencyContactPhone: input.emergencyContactPhone?.trim() || null }),
      ...(input.emergencyContactRelation !== undefined && { emergencyContactRelation: input.emergencyContactRelation?.trim() || null }),
      // Agence d'enregistrement optionnelle : agencyId=null deconnecte le lien.
      ...(input.agencyId !== undefined &&
        (input.agencyId
          ? { agency: { connect: { id: input.agencyId } } }
          : { agency: { disconnect: true } })),
    });

    // Temps reel : prevenir le portail client si son palier de fidelite ou son
    // statut partenaire change, pour rafraichir profil + tarifs sans action.
    const loyaltyChanged = input.loyaltyTier !== undefined && input.loyaltyTier !== client.loyaltyTier;
    const typeChanged = input.clientType !== undefined && input.clientType !== client.clientType;
    if (loyaltyChanged || typeChanged) {
      realtimeService.toClient(id, 'client:profile:updated', {
        loyaltyTier: updated.loyaltyTier,
        clientType: updated.clientType,
      });
    }
    if (typeChanged) {
      // Promotion/retrogradation partenaire -> les tarifs dedies changent de visibilite.
      realtimeService.toClient(id, 'client:tariffs:updated', {});
    }

    realtimeService.emitResourceChange(client.organizationId, 'clients', 'updated', id);
    return updated;
  }
}
