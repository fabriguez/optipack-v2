import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { StorageService } from '../../../infrastructure/storage/StorageService';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class DeleteAgencyImageUseCase {
  constructor(private storage: StorageService) {}

  async execute(agencyId: string, organizationId: string) {
    const agency = await prisma.agency.findUnique({
      where: { id: agencyId },
      select: { id: true, imageKey: true, organizationId: true },
    });
    if (!agency || agency.organizationId !== organizationId) {
      throw new NotFoundError('Agence', agencyId);
    }

    if (agency.imageKey) {
      await this.storage.deleteObject(agency.imageKey);
    }

    return prisma.agency.update({
      where: { id: agencyId },
      data: { imageUrl: null, imageKey: null },
    });
  }
}
