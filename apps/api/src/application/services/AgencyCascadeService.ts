import { prisma } from '../../config/database';
import { invalidatePvCache } from './pvCache';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('agency-cascade');

/**
 * Cascade de (des)activation d'une agence.
 *
 * Regle produit : quand un admin desactive une agence, tout ce qui en decoule
 * devient NON FONCTIONNEL pour les employes (mais reste visible pour l'admin).
 * En particulier les COMPTES des employes de l'agence sont desactives ET leurs
 * sessions en cours sont tuees (deconnexion automatique). Un employe rattache a
 * PLUSIEURS agences n'est desactive que si l'agence morte etait sa DERNIERE
 * agence active (sinon il continue de travailler pour ses autres agences ; le
 * scope agence bloque deja ses actions sur l'agence morte).
 *
 * Reversibilite : `User.deactivatedByAgencyId` trace les comptes coupes PAR la
 * cascade (et non suspendus manuellement). La reactivation de l'agence ne
 * ressuscite QUE ceux-la.
 *
 * Force-logout : `authenticate` ne relit pas `isActive` a chaque requete ; il
 * compare seulement `pv`. On incremente donc `permissionVersion` (invalide les
 * JWT en cours, effet <= 60s) + on purge les refresh tokens (bloque le refresh
 * silencieux). `isActive=false` bloque en plus tout nouveau login/refresh.
 */

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

/** userIds (non-admin) rattaches a une agence : UserAgency ∪ Employee.agencyId
 *  ∪ affectations actives (EmployeeAgencyAssignment.toDate=null) ∪ responsable. */
async function staffUserIdsForAgency(agencyId: string): Promise<string[]> {
  const [userAgencies, employees, assignments, agency] = await Promise.all([
    prisma.userAgency.findMany({ where: { agencyId }, select: { userId: true } }),
    prisma.employee.findMany({ where: { agencyId }, select: { userId: true } }),
    prisma.employeeAgencyAssignment.findMany({
      where: { agencyId, toDate: null },
      select: { employee: { select: { userId: true } } },
    }),
    prisma.agency.findUnique({ where: { id: agencyId }, select: { responsibleUserId: true } }),
  ]);

  const ids = new Set<string>();
  for (const u of userAgencies) if (u.userId) ids.add(u.userId);
  for (const e of employees) if (e.userId) ids.add(e.userId);
  for (const a of assignments) if (a.employee?.userId) ids.add(a.employee.userId);
  if (agency?.responsibleUserId) ids.add(agency.responsibleUserId);
  if (ids.size === 0) return [];

  // Les admins gardent leur acces + la visibilite : jamais coupes.
  const admins = await prisma.user.findMany({
    where: { id: { in: [...ids] }, role: { in: ADMIN_ROLES as never } },
    select: { id: true },
  });
  const adminSet = new Set(admins.map((a) => a.id));
  return [...ids].filter((id) => !adminSet.has(id));
}

/** true si le user possede encore AU MOINS une autre agence ACTIVE. */
async function hasOtherActiveAgency(userId: string, excludeAgencyId: string): Promise<boolean> {
  const count = await prisma.userAgency.count({
    where: { userId, agencyId: { not: excludeAgencyId }, agency: { isActive: true } },
  });
  return count > 0;
}

/** Force la deconnexion immediate d'un lot d'utilisateurs (pv bump + purge refresh). */
async function forceLogout(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { permissionVersion: { increment: 1 } },
  });
  for (const id of userIds) invalidatePvCache(id);
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
}

/**
 * Desactive une agence en cascade : coupe (isActive=false) les comptes des
 * employes dont c'etait la derniere agence active, et les deconnecte.
 * A appeler APRES avoir pose agency.isActive=false.
 */
export async function cascadeDeactivateAgency(agencyId: string): Promise<void> {
  const staff = await staffUserIdsForAgency(agencyId);
  const toCut: string[] = [];
  for (const userId of staff) {
    if (!(await hasOtherActiveAgency(userId, agencyId))) toCut.push(userId);
  }
  if (toCut.length === 0) return;

  await prisma.user.updateMany({
    where: { id: { in: toCut }, isActive: true },
    data: { isActive: false, deactivatedByAgencyId: agencyId },
  });
  await forceLogout(toCut);
  logger.warn(
    { agencyId, count: toCut.length },
    'Cascade desactivation agence : comptes staff coupes + deconnectes',
  );
}

/**
 * Reactive une agence en cascade : ne reactive QUE les comptes que la cascade
 * avait elle-meme coupes (deactivatedByAgencyId === agencyId). A appeler APRES
 * avoir pose agency.isActive=true.
 */
export async function cascadeReactivateAgency(agencyId: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: { deactivatedByAgencyId: agencyId },
    select: { id: true },
  });
  if (users.length === 0) return;
  const ids = users.map((u) => u.id);

  await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { isActive: true, deactivatedByAgencyId: null, permissionVersion: { increment: 1 } },
  });
  for (const id of ids) invalidatePvCache(id);
  logger.warn(
    { agencyId, count: ids.length },
    'Cascade reactivation agence : comptes staff reactives',
  );
}
