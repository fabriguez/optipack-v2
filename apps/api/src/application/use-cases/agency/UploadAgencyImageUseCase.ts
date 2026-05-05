import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { StorageService } from '../../../infrastructure/storage/StorageService';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { extFromMime } from '../../../presentation/middleware/upload';

function absoluteApiUrl(path: string): string {
  const base = config.apiUrl?.replace(/\/$/, '') || '';
  if (/^https?:\/\//i.test(base)) return `${base}${path}`;
  return path;
}

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

    // URL absolue (basee sur API_URL) pour rester correcte meme si le navigateur
    // est sur un domaine different. Inclut un cache-buster.
    const imageUrl = absoluteApiUrl(`/api/v1/agencies/${agencyId}/image?v=${Date.now()}`);

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
