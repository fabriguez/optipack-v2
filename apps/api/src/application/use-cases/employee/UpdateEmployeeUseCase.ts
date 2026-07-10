import { inject, injectable } from 'tsyringe';
import type { Prisma } from '@prisma/client';
import { EMPLOYEE_REPOSITORY, type IEmployeeRepository } from '../../interfaces/IEmployeeRepository';
import { PayrollChargeService } from '../../services/PayrollChargeService';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { prisma } from '../../../config/database';
import { syncEmployeeAgencies } from '../../services/EmployeeAgencyService';

/**
 * Construit un payload Prisma sur (checked input) depuis le body HTTP brut :
 * whitelist des colonnes scalaires + mapping des FK vers les relations
 * (agencyId -> agency.connect, ...). Les champs etrangers au modele
 * (email, createUser, additionalAgencyIds...) sont ignores — Prisma rejette
 * tout argument inconnu avec une PrismaClientValidationError 400.
 */
function toEmployeeUpdateData(data: any): Prisma.EmployeeUpdateInput {
  const out: Prisma.EmployeeUpdateInput = {};
  const trimOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  if (data.fullName !== undefined) out.fullName = data.fullName;
  if (data.idNumber !== undefined) out.idNumber = trimOrNull(data.idNumber);
  if (data.phone !== undefined) out.phone = trimOrNull(data.phone);
  if (data.position !== undefined) out.position = data.position;
  if (data.level !== undefined) out.level = trimOrNull(data.level);
  if (data.baseSalary !== undefined) out.baseSalary = data.baseSalary;
  if (data.educationLevel !== undefined) out.educationLevel = trimOrNull(data.educationLevel);
  if (data.specialty !== undefined) out.specialty = trimOrNull(data.specialty);
  if (data.contractType !== undefined) out.contractType = data.contractType;
  if (data.isAgencyManager !== undefined) out.isAgencyManager = !!data.isAgencyManager;
  if (data.isActive !== undefined) out.isActive = data.isActive;
  if (data.startDate !== undefined) out.startDate = data.startDate;
  if (data.endDate !== undefined) out.endDate = data.endDate;
  if (data.emergencyContactName !== undefined) out.emergencyContactName = trimOrNull(data.emergencyContactName);
  if (data.emergencyContactPhone !== undefined) out.emergencyContactPhone = trimOrNull(data.emergencyContactPhone);
  if (data.emergencyContactRelation !== undefined) out.emergencyContactRelation = trimOrNull(data.emergencyContactRelation);

  if (data.agencyId) out.agency = { connect: { id: data.agencyId } };
  if (data.positionId) out.positionRef = { connect: { id: data.positionId } };
  // managerId vide = retrait du superieur hierarchique.
  if (data.managerId !== undefined) {
    out.manager = data.managerId ? { connect: { id: data.managerId } } : { disconnect: true };
  }
  return out;
}

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

    const employee = await this.employeeRepo.update(id, toEmployeeUpdateData(data));

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
