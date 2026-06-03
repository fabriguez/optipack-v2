import { inject, injectable } from 'tsyringe';
import type { CreateClientInput } from '@transitsoftservices/shared';
import { CLIENT_REPOSITORY, type IClientRepository } from '../../interfaces/IClientRepository';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { ConflictError, NotFoundError } from '../../../domain/errors/BusinessError';
import { provisionClientPortalAccess } from '../../services/ClientPortalAccessService';
import { prisma } from '../../../config/database';

@injectable()
export class CreateClientUseCase {
  constructor(
    @inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
  ) {}

  async execute(input: CreateClientInput, organizationId: string) {
    // Agence d'enregistrement optionnelle : un client appartient a
    // l'organisation, pas a une agence. Si fournie, on valide qu'elle existe.
    if (input.agencyId) {
      const agency = await this.agencyRepo.findById(input.agencyId);
      if (!agency) {
        throw new NotFoundError('Agence', input.agencyId);
      }
    }

    const existing = await this.clientRepo.findByPhone(input.phone);
    if (existing) {
      throw new ConflictError('Un client avec ce numero de telephone existe deja');
    }

    // Email unique : refuse les doublons (les clients sans email ne sont pas
    // concernes -- plusieurs NULL autorises).
    if (input.email) {
      const emailClash = await prisma.client.findUnique({ where: { email: input.email } });
      if (emailClash) {
        throw new ConflictError('Un client avec cet email existe deja');
      }
    }

    const client = await this.clientRepo.create({
      fullName: input.fullName,
      phone: input.phone,
      email: input.email || null,
      address: input.address || null,
      organizationId,
      emergencyContactName: input.emergencyContactName?.trim() || null,
      emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
      emergencyContactRelation: input.emergencyContactRelation?.trim() || null,
      ...(input.agencyId && { agency: { connect: { id: input.agencyId } } }),
      ...(input.clientType && { clientType: input.clientType }),
      ...(input.loyaltyTier && { loyaltyTier: input.loyaltyTier }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });

    // Client cree depuis le backoffice : on provisionne son acces portail et on
    // lui envoie ses identifiants par mail. Les clients qui s'inscrivent
    // eux-memes via /register passent par un autre flux (mot de passe choisi)
    // et ne recoivent donc pas ce mail.
    await provisionClientPortalAccess({
      clientId: client.id,
      fullName: client.fullName,
      phone: client.phone,
      email: client.email,
      isPortalActive: (client as { isPortalActive?: boolean }).isPortalActive ?? false,
      organizationId,
    });

    return client;
  }
}
