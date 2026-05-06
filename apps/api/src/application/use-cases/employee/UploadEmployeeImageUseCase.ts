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

type Slot = 'selfie' | 'locationPlan' | 'idDocument' | 'idDocumentBack';

const URL_FIELD: Record<Slot, 'selfieUrl' | 'locationPlanUrl' | 'idDocumentUrl' | 'idDocumentBackUrl'> = {
  selfie: 'selfieUrl',
  locationPlan: 'locationPlanUrl',
  idDocument: 'idDocumentUrl',
  idDocumentBack: 'idDocumentBackUrl',
};
const KEY_FIELD: Record<Slot, 'selfieKey' | 'locationPlanKey' | 'idDocumentKey' | 'idDocumentBackKey'> = {
  selfie: 'selfieKey',
  locationPlan: 'locationPlanKey',
  idDocument: 'idDocumentKey',
  idDocumentBack: 'idDocumentBackKey',
};

@injectable()
export class UploadEmployeeImageUseCase {
  constructor(private storage: StorageService) {}

  async execute(employeeId: string, slot: Slot, file: Express.Multer.File) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        selfieKey: true,
        locationPlanKey: true,
        idDocumentKey: true,
        idDocumentBackKey: true,
      },
    });
    if (!employee) throw new NotFoundError('Employe', employeeId);
    if (!file) throw new BusinessError('Aucun fichier fourni');

    const ext = extFromMime(file.mimetype);
    const key = this.storage.buildKey(`employees/${employeeId}/${slot}`, ext);
    await this.storage.uploadBuffer(key, file.buffer, file.mimetype);

    const imageUrl = absoluteApiUrl(`/api/v1/employees/${employeeId}/image/${slot}?v=${Date.now()}`);

    const oldKey = (employee as any)[KEY_FIELD[slot]] as string | null;
    if (oldKey) {
      this.storage.deleteObject(oldKey).catch(() => {});
    }

    return prisma.employee.update({
      where: { id: employeeId },
      data: {
        [URL_FIELD[slot]]: imageUrl,
        [KEY_FIELD[slot]]: key,
      } as any,
    });
  }
}
