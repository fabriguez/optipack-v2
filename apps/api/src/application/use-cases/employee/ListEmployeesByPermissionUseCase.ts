import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';

interface OrdererCandidate {
  id: string;
  fullName: string;
  position: string;
  positionName?: string | null;
  agencyId: string;
  agencyName: string;
}

/**
 * Retourne la liste des employes habilites pour une cle de permission ABAC
 * (ex: "disbursement.order"). Utilise par DisbursementFormDialog pour le
 * choix de l'ordonnateur.
 *
 * Scope : agences accessibles par l'utilisateur courant (passees en arg).
 * Si agencyIds est null => SUPER_ADMIN, on retourne tout.
 */
@injectable()
export class ListEmployeesByPermissionUseCase {
  async execute(
    permissionKey: string,
    agencyIds: string[] | null,
    organizationId: string,
  ): Promise<OrdererCandidate[]> {
    const employees = await prisma.employee.findMany({
      where: {
        isActive: true,
        agency: { organizationId },
        ...(agencyIds !== null && { agencyId: { in: agencyIds } }),
        positionRef: {
          permissions: {
            some: { permission: { key: permissionKey } },
          },
        },
      },
      include: {
        positionRef: { select: { name: true } },
        agency: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
      take: 200,
    });

    return employees.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      position: e.position,
      positionName: e.positionRef?.name ?? null,
      agencyId: e.agencyId,
      agencyName: e.agency?.name ?? '',
    }));
  }
}
