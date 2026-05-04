import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { StorageService } from '../../../infrastructure/storage/StorageService';

type Slot = 'selfie' | 'locationPlan' | 'idDocument';

const KEY_FIELD: Record<Slot, 'selfieKey' | 'locationPlanKey' | 'idDocumentKey'> = {
  selfie: 'selfieKey',
  locationPlan: 'locationPlanKey',
  idDocument: 'idDocumentKey',
};

@injectable()
export class GetEmployeeImageUseCase {
  constructor(private storage: StorageService) {}

  async execute(employeeId: string, slot: Slot) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, selfieKey: true, locationPlanKey: true, idDocumentKey: true },
    });
    if (!employee) return null;

    const key = (employee as any)[KEY_FIELD[slot]] as string | null;
    if (!key) return null;

    return this.storage.getObject(key);
  }
}
