import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Marque/demarque un employe comme chef d'agence.
 * Si l'employe est lie a un User, on synchronise aussi son role :
 *  - true  -> role User passe a CHEF_AGENCE
 *  - false -> role User repasse a PERSONNEL si le precedent etait CHEF_AGENCE
 */
@injectable()
export class SetEmployeeManagerFlagUseCase {
  async execute(employeeId: string, isManager: boolean) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    if (!employee) throw new NotFoundError('Employe', employeeId);

    const updated = await prisma.employee.update({
      where: { id: employeeId },
      data: { isAgencyManager: isManager },
    });

    if (employee.user) {
      const newRole = isManager ? 'CHEF_AGENCE' : 'PERSONNEL';
      const currentRole = employee.user.role;
      // On ne touche que si le User est dans un role employe (PERSONNEL/CHEF_AGENCE),
      // pour ne pas degrader un ADMIN/COMPTABLE/etc qui aurait aussi un Employee.
      if (currentRole === 'PERSONNEL' || currentRole === 'CHEF_AGENCE') {
        await prisma.user.update({
          where: { id: employee.user.id },
          data: { role: newRole as any },
        });
      }
    }

    return updated;
  }
}
