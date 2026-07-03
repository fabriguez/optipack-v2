import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

export interface OpeningHourInput {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
}

/**
 * Remplace integralement les plages horaires d'une agence (operation idempotente).
 * Format HH:mm validee cote API. dayOfWeek 0..6 (dimanche..samedi).
 */
@injectable()
export class SetAgencyOpeningHoursUseCase {
  async execute(agencyId: string, hours: OpeningHourInput[], organizationId: string) {
    const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency || agency.organizationId !== organizationId) {
      throw new NotFoundError('Agence', agencyId);
    }

    for (const h of hours) {
      if (h.dayOfWeek < 0 || h.dayOfWeek > 6) {
        throw new BusinessError(`dayOfWeek invalide : ${h.dayOfWeek} (attendu 0..6)`);
      }
      if (h.isOpen) {
        if (!isHHMM(h.openTime) || !isHHMM(h.closeTime)) {
          throw new BusinessError(`Heure invalide pour le jour ${h.dayOfWeek} (format attendu HH:mm)`);
        }
        if (h.openTime >= h.closeTime) {
          throw new BusinessError(`L'heure de fermeture doit etre apres l'heure d'ouverture (jour ${h.dayOfWeek})`);
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      await tx.agencyOpeningHours.deleteMany({ where: { agencyId } });
      if (hours.length > 0) {
        await tx.agencyOpeningHours.createMany({
          data: hours.map((h) => ({
            agencyId,
            dayOfWeek: h.dayOfWeek,
            openTime: h.openTime || '00:00',
            closeTime: h.closeTime || '00:00',
            isOpen: h.isOpen,
          })),
        });
      }
      return tx.agencyOpeningHours.findMany({
        where: { agencyId },
        orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
      });
    });
  }
}

function isHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
