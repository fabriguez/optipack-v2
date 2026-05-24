import { injectable } from 'tsyringe';
import type { CreateDebtInput } from '@transitsoftservices/shared';
import { generateReference } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Cree une dette typee (CLIENT / EMPLOYEE / AGENCY / CARRIER).
 *
 * Regles :
 *  - Reference unique generee : DET-<seq> (5 chiffres).
 *  - organizationId derive automatiquement de l'agence.
 *  - Validation metier de l'identifiant typee (le schema zod la fait deja, on
 *    re-securise ici en lisant les entites pour eviter les FKs orphelines).
 *  - Snapshot initial dans DebtHistory (action='CREATED') pour audit.
 *  - remainingAmount = totalAmount au depart, paidAmount = 0.
 *  - subDueDates est stocke tel quel comme JSON (plan de paiement echelonne).
 */
@injectable()
export class CreateDebtUseCase {
  async execute(input: CreateDebtInput, userId: string) {
    // 1. Resoudre l'agence et son organisation.
    const agency = await prisma.agency.findUnique({
      where: { id: input.agencyId },
      select: { id: true, organizationId: true },
    });
    if (!agency) throw new NotFoundError('Agence', input.agencyId);

    // 2. Validation metier des FKs (zod fait la presence ; on verifie l'existence).
    if (input.clientId) {
      const c = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
      if (!c) throw new NotFoundError('Client', input.clientId);
    }
    if (input.employeeId) {
      const e = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } });
      if (!e) throw new NotFoundError('Employe', input.employeeId);
    }
    if (input.carrierId) {
      const c = await prisma.carrier.findUnique({ where: { id: input.carrierId }, select: { id: true } });
      if (!c) throw new NotFoundError('Transporteur', input.carrierId);
    }
    if (input.parcelId) {
      const p = await prisma.parcel.findUnique({ where: { id: input.parcelId }, select: { id: true } });
      if (!p) throw new NotFoundError('Colis', input.parcelId);
    }
    if (input.invoiceId) {
      const i = await prisma.invoice.findUnique({ where: { id: input.invoiceId }, select: { id: true } });
      if (!i) throw new NotFoundError('Facture', input.invoiceId);
    }
    if (input.agencyChargeId) {
      const ch = await prisma.agencyCharge.findUnique({ where: { id: input.agencyChargeId }, select: { id: true } });
      if (!ch) throw new NotFoundError('Charge agence', input.agencyChargeId);
    }

    // 3. Coherence type <-> FK (defense en profondeur).
    switch (input.type) {
      case 'CLIENT':
        if (!input.clientId) throw new BusinessError('clientId requis pour une dette CLIENT.');
        break;
      case 'EMPLOYEE':
        if (!input.employeeId) throw new BusinessError('employeeId requis pour une dette EMPLOYEE.');
        break;
      case 'AGENCY':
        if (!input.agencyChargeId && !input.creditor) {
          throw new BusinessError('agencyChargeId ou creditor requis pour une dette AGENCY.');
        }
        break;
      case 'CARRIER':
        if (!input.carrierId) throw new BusinessError('carrierId requis pour une dette CARRIER.');
        break;
    }

    // 4. Reference unique. Seq sur le compteur global organisation (pas
    //    parfait niveau race-condition, mais reference est aussi unique en DB).
    const count = await prisma.debt.count({ where: { organizationId: agency.organizationId } });
    const reference = generateReference('DET', Date.now());

    // 5. Creation transactionnelle (Debt + DebtHistory initial).
    const debt = await prisma.$transaction(async (tx) => {
      const created = await tx.debt.create({
        data: {
          reference,
          organizationId: agency.organizationId,
          agencyId: input.agencyId,
          type: input.type,
          motif: input.motif,
          description: input.description ?? null,
          totalAmount: input.totalAmount,
          paidAmount: 0,
          remainingAmount: input.totalAmount,
          clientId: input.clientId ?? null,
          employeeId: input.employeeId ?? null,
          carrierId: input.carrierId ?? null,
          parcelId: input.parcelId ?? null,
          invoiceId: input.invoiceId ?? null,
          agencyChargeId: input.agencyChargeId ?? null,
          creditor: input.creditor ?? null,
          nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : null,
          dueDateFinal: input.dueDateFinal ? new Date(input.dueDateFinal) : null,
          subDueDates: (input.subDueDates as any) ?? null,
          createdByUserId: userId,
        },
      });

      await tx.debtHistory.create({
        data: {
          debtId: created.id,
          action: 'CREATED',
          changes: {
            type: input.type,
            totalAmount: input.totalAmount,
            motif: input.motif,
            nextDueDate: input.nextDueDate ?? null,
            dueDateFinal: input.dueDateFinal ?? null,
          },
          comment: 'Creation initiale',
          userId,
        },
      });

      return created;
    });

    return debt;
  }
}
