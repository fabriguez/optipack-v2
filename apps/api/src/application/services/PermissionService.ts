import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';

/**
 * Calcule les permissions effectives d'un User pour l'ABAC.
 *
 * Regle :
 *   - SUPER_ADMIN : retourne ['*'] (le middleware court-circuite le check).
 *   - Sinon : permissions = (permissions du Position de l'Employee lie)
 *             ∪ overrides(granted=true) − overrides(granted=false)
 *
 * Le resultat est embarque dans le JWT a la connexion (et au refresh) pour
 * eviter une requete DB par appel API. En contrepartie, un changement de
 * matrice/poste necessite un re-login (ou un refresh) pour s'appliquer.
 */
@injectable()
export class PermissionService {
  async getEffectivePermissionsForUser(userId: string): Promise<string[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        employee: {
          select: {
            positionId: true,
            positionRef: {
              select: {
                permissions: {
                  select: { permission: { select: { key: true } } },
                },
              },
            },
          },
        },
        permissionOverrides: {
          select: { granted: true, permission: { select: { key: true } } },
        },
      },
    });

    if (!user) return [];
    if (user.role === 'SUPER_ADMIN') return ['*'];

    const set = new Set<string>();
    const positionPerms = user.employee?.positionRef?.permissions ?? [];
    for (const pp of positionPerms) {
      set.add(pp.permission.key);
    }
    for (const ov of user.permissionOverrides) {
      if (ov.granted) set.add(ov.permission.key);
      else set.delete(ov.permission.key);
    }
    return Array.from(set).sort();
  }

  /** Retourne true si l'utilisateur dispose d'au moins une des permissions demandees. */
  hasAny(userPermissions: string[] | undefined, required: string[]): boolean {
    if (!userPermissions) return false;
    if (userPermissions.includes('*')) return true;
    return required.some((k) => userPermissions.includes(k));
  }

  /** Retourne true si l'utilisateur dispose de toutes les permissions demandees. */
  hasAll(userPermissions: string[] | undefined, required: string[]): boolean {
    if (!userPermissions) return false;
    if (userPermissions.includes('*')) return true;
    return required.every((k) => userPermissions.includes(k));
  }
}
