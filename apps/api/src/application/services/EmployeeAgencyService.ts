import { prisma } from '../../config/database';
import { bumpPermissionVersion } from './pvCache';

/**
 * Synchronise les agences d'intervention d'un employe.
 *
 * Un employe peut intervenir sur plusieurs agences : son agence principale
 * (Employee.agencyId — contrat, paie) + des agences supplementaires. Les
 * permissions de son poste s'appliquent sur TOUTES ces agences (le scoping
 * agence intersecte user.agencyIds, cf. PERMISSIONS-PLAN.md decision 5).
 *
 * Deux persistances tenues en phase :
 *  - EmployeeAgencyAssignment : historique RH (lignes actives = toDate null).
 *  - UserAgency (si compte portail lie) : source des agencyIds du JWT.
 * Toute modification bump permissionVersion pour invalider les tokens.
 */
export async function syncEmployeeAgencies(
  employeeId: string,
  userId: string | null,
  primaryAgencyId: string,
  additionalAgencyIds: string[],
): Promise<void> {
  const wanted = Array.from(new Set([primaryAgencyId, ...additionalAgencyIds]));

  await prisma.$transaction(async (tx) => {
    // 1) Assignments RH : clot les lignes actives retirees, cree les manquantes,
    //    et maintient le flag isPrimary sur l'agence principale.
    const active = await tx.employeeAgencyAssignment.findMany({
      where: { employeeId, toDate: null },
    });
    const activeByAgency = new Map(active.map((a) => [a.agencyId, a]));

    const removedIds = active.filter((a) => !wanted.includes(a.agencyId)).map((a) => a.id);
    if (removedIds.length > 0) {
      await tx.employeeAgencyAssignment.updateMany({
        where: { id: { in: removedIds } },
        data: { toDate: new Date() },
      });
    }

    for (const agencyId of wanted) {
      const isPrimary = agencyId === primaryAgencyId;
      const existing = activeByAgency.get(agencyId);
      if (!existing) {
        await tx.employeeAgencyAssignment.create({
          data: { employeeId, agencyId, isPrimary, fromDate: new Date() },
        });
      } else if (existing.isPrimary !== isPrimary) {
        await tx.employeeAgencyAssignment.update({
          where: { id: existing.id },
          data: { isPrimary },
        });
      }
    }

    // 2) Acces (JWT) : aligne UserAgency sur le meme jeu d'agences.
    if (userId) {
      await tx.userAgency.deleteMany({
        where: { userId, agencyId: { notIn: wanted } },
      });
      await tx.userAgency.createMany({
        data: wanted.map((agencyId) => ({ userId, agencyId })),
        skipDuplicates: true,
      });
    }
  });

  // Invalide les tokens en circulation : le refresh recalcule agencyIds.
  if (userId) {
    await bumpPermissionVersion(userId);
  }
}
