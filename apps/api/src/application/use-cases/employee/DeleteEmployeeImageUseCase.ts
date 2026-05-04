import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { StorageService } from '../../../infrastructure/storage/StorageService';
import { NotFoundError } from '../../../domain/errors/BusinessError';

type Slot = 'selfie' | 'locationPlan' | 'idDocument';

const URL_FIELD: Record<Slot, 'selfieUrl' | 'locationPlanUrl' | 'idDocumentUrl'> = {
  selfie: 'selfieUrl',
  locationPlan: 'locationPlanUrl',
  idDocument: 'idDocumentUrl',
};
const KEY_FIELD: Record<Slot, 'selfieKey' | 'locationPlanKey' | 'idDocumentKey'> = {
  selfie: 'selfieKey',
  locationPlan: 'locationPlanKey',
  idDocument: 'idDocumentKey',
};

@injectable()
export class DeleteEmployeeImageUseCase {
  constructor(private storage: StorageService) {}

  async execute(employeeId: string, slot: Slot) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, selfieKey: true, locationPlanKey: true, idDocumentKey: true },
    });
    if (!employee) throw new NotFoundError('Employe', employeeId);

    const key = (employee as any)[KEY_FIELD[slot]] as string | null;
    if (key) {
      await this.storage.deleteObject(key).catch(() => {});
    }

    return prisma.employee.update({
      where: { id: employeeId },
      data: {
        [URL_FIELD[slot]]: null,
        [KEY_FIELD[slot]]: null,
      } as any,
    });
  }
}
