import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface AttachmentInput {
  url: string;
  storageKey?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  caption?: string;
}

interface SubmitInput {
  attendanceId: string;
  text: string;
  attachments?: AttachmentInput[];
}

@injectable()
export class SubmitAttendanceJustificationUseCase {
  async execute(input: SubmitInput, userId: string) {
    if (!input.text || input.text.trim().length < 3) {
      throw new BusinessError('Texte de justification requis (min. 3 caracteres)');
    }
    const att = await prisma.attendance.findUnique({ where: { id: input.attendanceId } });
    if (!att) throw new NotFoundError('Pointage', input.attendanceId);

    // Une justification ne s'applique qu'a un retard ou une absence.
    if (att.status !== 'LATE' && att.status !== 'ABSENT') {
      throw new BusinessError('Justification applicable uniquement sur LATE/ABSENT');
    }

    return prisma.attendanceJustification.create({
      data: {
        attendanceId: input.attendanceId,
        submittedByUserId: userId,
        text: input.text.trim(),
        status: 'PENDING',
        attachments: input.attachments && input.attachments.length > 0
          ? {
              create: input.attachments.map((a) => ({
                url: a.url,
                storageKey: a.storageKey ?? null,
                fileName: a.fileName ?? null,
                contentType: a.contentType ?? null,
                size: a.size ?? null,
                caption: a.caption ?? null,
              })),
            }
          : undefined,
      },
      include: { attachments: true },
    });
  }
}

@injectable()
export class ReviewAttendanceJustificationUseCase {
  async execute(
    justificationId: string,
    decision: 'APPROVED' | 'REJECTED',
    userId: string,
    comment?: string,
  ) {
    const j = await prisma.attendanceJustification.findUnique({
      where: { id: justificationId },
    });
    if (!j) throw new NotFoundError('Justification', justificationId);
    if (j.status !== 'PENDING') {
      throw new BusinessError('Justification deja revue');
    }
    return prisma.attendanceJustification.update({
      where: { id: justificationId },
      data: {
        status: decision,
        reviewedByUserId: userId,
        reviewedAt: new Date(),
        reviewComment: comment ?? null,
      },
      include: { attachments: true },
    });
  }
}

@injectable()
export class ListAttendanceJustificationsUseCase {
  /** Filtre par agence (status PENDING par defaut) pour interface du chef d'agence. */
  async execute(agencyId: string, status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return prisma.attendanceJustification.findMany({
      where: {
        status: status ?? 'PENDING',
        attendance: { employee: { agencyId } },
      },
      include: {
        attachments: true,
        attendance: {
          include: {
            employee: { select: { id: true, fullName: true, position: true } },
          },
        },
        submittedBy: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
