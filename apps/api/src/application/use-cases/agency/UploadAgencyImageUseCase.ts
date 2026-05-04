import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { StorageService } from '../../../infrastructure/storage/StorageService';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { extFromMime } from '../../../presentation/middleware/upload';

@injectable()
export class UploadAgencyImageUseCase {
  constructor(private storage: StorageService) {}

  async execute(agencyId: string, file: Express.Multer.File) {
    const agency = await prisma.agency.findUnique({
      where: { id: agencyId },
      select: { id: true, imageKey: true },
    });
    if (!agency) throw new NotFoundError('Agence', agencyId);
    if (!file) throw new BusinessError('Aucun fichier fourni');

    const ext = extFromMime(file.mimetype);
    const key = this.storage.buildKey(`agencies/${agencyId}`, ext);
    await this.storage.uploadBuffer(key, file.buffer, file.mimetype);

    // URL servie par notre API (relative pour fonctionner derriere reverse proxy).
    // Le frontend prefixe avec NEXT_PUBLIC_API_URL si necessaire.
    const imageUrl = `/api/v1/agencies/${agencyId}/image?v=${Date.now()}`;

    // Best-effort : supprime l'ancienne image si elle etait stockee chez nous
    if (agency.imageKey) {
      this.storage.deleteObject(agency.imageKey).catch(() => {});
    }

    return prisma.agency.update({
      where: { id: agencyId },
      data: { imageUrl, imageKey: key },
    });
  }
}
