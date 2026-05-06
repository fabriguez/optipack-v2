import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { StorageService } from '../../../infrastructure/storage/StorageService';

type Slot = 'selfie' | 'locationPlan' | 'idDocument' | 'idDocumentBack';

const KEY_FIELD: Record<Slot, 'selfieKey' | 'locationPlanKey' | 'idDocumentKey' | 'idDocumentBackKey'> = {
  selfie: 'selfieKey',
  locationPlan: 'locationPlanKey',
  idDocument: 'idDocumentKey',
  idDocumentBack: 'idDocumentBackKey',
};

@injectable()
export class GetEmployeeImageUseCase {
  constructor(private storage: StorageService) {}

  async execute(employeeId: string, slot: Slot) {
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
    if (!employee) return null;

    const key = (employee as any)[KEY_FIELD[slot]] as string | null;
    if (!key) return null;

    return this.storage.getObject(key);
  }
}
