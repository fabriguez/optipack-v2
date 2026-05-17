import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Marque/demarque un employe comme chef d'agence.
 *
 * Invariant : une agence n'a qu'un seul chef actif a la fois. Promouvoir un
 * employe demote automatiquement tout autre chef de la meme agence (flag +
 * role User si lie).
 *
 * Sync User.role pour les employes lies :
 *  - true  -> CHEF_AGENCE
 *  - false -> PERSONNEL (si l'ancien role etait CHEF_AGENCE/PERSONNEL)
 */
@injectable()
export class SetEmployeeManagerFlagUseCase {
  async execute(employeeId: string, isManager: boolean) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    if (!employee) throw new NotFoundError('Employe', employeeId);
    if (!employee.isActive) {
      const { BusinessError } = await import('../../../domain/errors/BusinessError');
      throw new BusinessError('Employe inactif (contrat rompu). Le statut chef ne peut etre modifie.');
    }

    return prisma.$transaction(async (tx) => {
      // Si on promeut : demote tout autre chef de la meme agence (exclusivite).
      if (isManager) {
        const others = await tx.employee.findMany({
          where: {
            agencyId: employee.agencyId,
            isAgencyManager: true,
            id: { not: employeeId },
          },
          include: { user: true },
        });
        if (others.length > 0) {
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
        }
      }

      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: { isAgencyManager: isManager },
      });

      if (employee.user) {
        const newRole = isManager ? 'CHEF_AGENCE' : 'PERSONNEL';
        const currentRole = employee.user.role;
        if (currentRole === 'PERSONNEL' || currentRole === 'CHEF_AGENCE') {
          await tx.user.update({
            where: { id: employee.user.id },
            data: { role: newRole as any },
          });
        }
      }

      return updated;
    });
  }
}
