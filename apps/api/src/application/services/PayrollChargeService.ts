import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';

/**
 * Service responsable de la charge "masse salariale" auto-geree par agence.
 *
 * Regle :
 *  - Pour chaque agence, il existe une AgencyCharge SALARY isAutoManaged=true.
 *  - Son defaultAmount = somme des baseSalary des employes actifs (isActive=true, endDate null).
 *  - Cette charge ne peut PAS etre creee/modifiee/supprimee manuellement par l'utilisateur.
 *  - Elle est synchronisee a chaque create/update/delete d'employe.
 */
@injectable()
export class PayrollChargeService {
  /**
   * Recalcule et upsert la charge masse salariale auto pour une agence donnee.
   * Idempotent : sur a appeler apres chaque mutation employe.
   */
  async syncForAgency(agencyId: string): Promise<void> {
    const agg = await prisma.employee.aggregate({
      where: {
        agencyId,
        isActive: true,
        endDate: null,
      },
      _sum: { baseSalary: true },
    });

    const total = Number(agg._sum.baseSalary ?? 0);

    // Recherche la charge auto existante (au plus une par agence/type/auto=true)
    const existing = await prisma.agencyCharge.findFirst({
      where: { agencyId, type: 'SALARY', isAutoManaged: true },
    });

    if (existing) {
      await prisma.agencyCharge.update({
        where: { id: existing.id },
        data: {
          defaultAmount: total,
          isActive: true,
          label: 'Masse salariale (auto)',
        },
      });
    } else {
      await prisma.agencyCharge.create({
        data: {
          agencyId,
          type: 'SALARY',
          label: 'Masse salariale (auto)',
          defaultAmount: total,
          isActive: true,
          isAutoManaged: true,
          reference: 'Calcul automatique - somme des salaires de base',
        },
      });
    }
  }
}

export const PAYROLL_CHARGE_SERVICE = Symbol.for('PayrollChargeService');
