import { inject, injectable } from 'tsyringe';
import { EMPLOYEE_REPOSITORY, type IEmployeeRepository } from '../../interfaces/IEmployeeRepository';
import { PayrollChargeService } from '../../services/PayrollChargeService';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { prisma } from '../../../config/database';
import { syncEmployeeAgencies } from '../../services/EmployeeAgencyService';

@injectable()
export class UpdateEmployeeUseCase {
  constructor(
    @inject(EMPLOYEE_REPOSITORY) private employeeRepo: IEmployeeRepository,
    private payrollCharge: PayrollChargeService,
  ) {}

  async execute(id: string, data: any) {
    const existing = await this.employeeRepo.findById(id);
    if (!existing) throw new NotFoundError('Employe', id);

    // Agences supplementaires : champ virtuel (pas une colonne Employee),
    // extrait avant le update Prisma puis synchronise a part.
    const additionalAgencyIds: string[] | undefined = Array.isArray(data.additionalAgencyIds)
      ? data.additionalAgencyIds
      : undefined;
    delete data.additionalAgencyIds;

    // Employe inactif (contrat rompu) : verrouille toute modification metier
    // sauf reactivation explicite (isActive=true + endDate=null).
    if (!existing.isActive) {
      const isReactivation = data.isActive === true && data.endDate === null;
      if (!isReactivation) {
        throw new BusinessError(
          'Employe inactif (contrat rompu). Aucune modification possible sans reactivation prealable.',
        );
      }
    }

    // Invariant chef unique : si on promeut cet employe chef via update,
    // demote tout autre chef de l'agence (cible = nouvelle agence si change).
    if (data.isAgencyManager === true && !existing.isAgencyManager) {
      const targetAgencyId = data.agencyId || existing.agencyId;
      const others = await prisma.employee.findMany({
        where: {
          agencyId: targetAgencyId,
          isAgencyManager: true,
          id: { not: id },
        },
        include: { user: true },
      });
      if (others.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.employee.updateMany({
            where: { id: { in: others.map((o) => o.id) } },
            data: { isAgencyManager: false },
          });
          const userIds = others
            .filter((o) => o.user && o.user.role === 'CHEF_AGENCE')
            .map((o) => o.user!.id);
          if (userIds.length > 0) {
            await tx.user.updateMany({
              where: { id: { in: userIds } },
              data: { role: 'PERSONNEL' as any },
            });
          }
        });
      }
    }

    const employee = await this.employeeRepo.update(id, data);

    // Si le salaire ou l'etat actif change, on resync la masse salariale.
    const agencyChanged = data.agencyId && data.agencyId !== existing.agencyId;

    // Sync agences d'intervention (assignments RH + UserAgency/JWT) quand la
    // liste est fournie ou que l'agence principale change.
    if (additionalAgencyIds !== undefined || agencyChanged) {
      const active = additionalAgencyIds ?? (
        await prisma.employeeAgencyAssignment.findMany({
          where: { employeeId: id, toDate: null, isPrimary: false },
          select: { agencyId: true },
        })
      ).map((a) => a.agencyId);
      await syncEmployeeAgencies(id, (existing as any).userId ?? null, employee.agencyId, active);
    }
    await this.payrollCharge.syncForAgency(employee.agencyId);
    if (agencyChanged) {
      await this.payrollCharge.syncForAgency(existing.agencyId);
    }
    return employee;
  }
}
