import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

type DocType = 'DIPLOMA' | 'CV' | 'CONTRACT' | 'ID_DOCUMENT' | 'CERTIFICATE' | 'OTHER';

interface AddInput {
  employeeId: string;
  type: DocType;
  label: string;
  url: string;
  storageKey?: string;
  contentType?: string;
  size?: number;
  validUntil?: Date | string;
}

@injectable()
export class AddEmployeeDocumentUseCase {
  async execute(input: AddInput, userId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError('Employe', input.employeeId);
    if (!input.url) throw new BusinessError('url requis');
    if (!input.label?.trim()) throw new BusinessError('label requis');

    return prisma.employeeDocument.create({
      data: {
        employeeId: input.employeeId,
        type: input.type,
        label: input.label.trim(),
        url: input.url,
        storageKey: input.storageKey ?? null,
        contentType: input.contentType ?? null,
        size: input.size ?? null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        uploadedBy: userId,
      },
    });
  }
}

@injectable()
export class ListEmployeeDocumentsUseCase {
  async execute(employeeId: string) {
    return prisma.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

@injectable()
export class DeleteEmployeeDocumentUseCase {
  async execute(documentId: string) {
    const doc = await prisma.employeeDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundError('Document', documentId);
    await prisma.employeeDocument.delete({ where: { id: documentId } });
    return { id: documentId };
  }
}
