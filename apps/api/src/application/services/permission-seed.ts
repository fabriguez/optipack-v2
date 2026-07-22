import type { PrismaClient } from '@prisma/client';
import { createChildLogger } from '../../config/logger';
import { ADMIN_ONLY_PERMISSION_KEYS } from '../../domain/constants/permissions';
import {
  PERMISSION_CATALOG,
  POSITION_CATALOG,
  LEGACY_ROLE_TO_POSITION,
} from '../../domain/permissions/permission-catalog';

// Fonctions PURES de seed ABAC : aucune dependance au conteneur DI (tsyringe).
// C'est volontaire — elles sont appelees a la fois par le seed CLI
// (prisma/seed.ts via tsx, SANS reflect-metadata) et par le self-heal runtime
// (PermissionSeedService, qui lui vit dans le monde tsyringe). Importer tsyringe
// ici casserait le seed CLI ("reflect polyfill required"). La classe injectable
// reste dans PermissionSeedService.ts.

const logger = createChildLogger('permission-seed');

// Client Prisma minimal accepte par les fonctions ci-dessous : la transaction
// singleton (`prisma`) comme un `new PrismaClient()` cree par le seed conviennent.
export type Db = Pick<PrismaClient, 'permission' | 'position' | 'positionPermission' | 'user' | 'employee'>;

/**
 * Upsert idempotent du catalogue global de permissions (les cles sont uniques,
 * non scopees par organisation). Retourne le mapping cle -> id.
 */
export async function ensurePermissionCatalog(db: Db): Promise<Map<string, string>> {
  const permByKey = new Map<string, string>();
  for (const p of PERMISSION_CATALOG) {
    const row = await db.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, category: p.category, description: p.description ?? null },
      create: {
        key: p.key,
        label: p.label,
        category: p.category,
        description: p.description ?? null,
        isSystem: true,
      },
    });
    permByKey.set(p.key, row.id);
  }
  return permByKey;
}

/**
 * Seed catalogue + postes systeme d'une organisation. Idempotent :
 * - permissions upsert par cle ;
 * - postes upsert par (organizationId, agencyId=null, name) ;
 * - matrice de droits en UNION seulement (on ajoute les cles du preset
 *   manquantes, on ne supprime JAMAIS — la matrice d'un poste existant
 *   appartient a l'admin, pas au seed).
 */
export async function seedPermissionsAndPositions(db: Db, organizationId: string): Promise<void> {
  const permByKey = await ensurePermissionCatalog(db);
  logger.info({ organizationId, count: permByKey.size }, 'Permissions seedees');

  for (const pos of POSITION_CATALOG) {
    const existing = await db.position.findFirst({
      where: { organizationId, agencyId: null, name: pos.name },
    });
    const position = existing
      ? await db.position.update({
          where: { id: existing.id },
          data: { description: pos.description, hierarchyLevel: pos.hierarchyLevel, isSystem: true },
        })
      : await db.position.create({
          data: {
            organizationId,
            agencyId: null,
            name: pos.name,
            description: pos.description,
            hierarchyLevel: pos.hierarchyLevel,
            isSystem: true,
          },
        });

    const targetKeys = (pos.permissions === '*' ? Array.from(permByKey.keys()) : pos.permissions)
      .filter((k) => !ADMIN_ONLY_PERMISSION_KEYS.includes(k));
    await db.positionPermission.createMany({
      data: targetKeys
        .map((k) => permByKey.get(k))
        .filter((id): id is string => !!id)
        .map((permissionId) => ({ positionId: position.id, permissionId })),
      skipDuplicates: true,
    });
  }
  logger.info({ organizationId, count: POSITION_CATALOG.length }, 'Postes seedes');
}

/**
 * Rattache les employes sans poste au poste systeme correspondant a leur role
 * legacy. Ne touche jamais un employe deja positionne. Log les users actifs
 * non-admin sans fiche employe (ils n'auront AUCUNE permission en mode enforce).
 */
export async function migrateLegacyRolePositions(db: Db, organizationId: string): Promise<void> {
  const positions = await db.position.findMany({
    where: { organizationId, agencyId: null, isSystem: true },
    select: { id: true, name: true },
  });
  const positionByName = new Map(positions.map((p) => [p.name, p.id]));

  let attached = 0;
  for (const [role, positionName] of Object.entries(LEGACY_ROLE_TO_POSITION)) {
    const positionId = positionByName.get(positionName);
    if (!positionId) continue;
    const users = await db.user.findMany({
      where: { organizationId, role: role as never, isActive: true },
      select: { id: true, employee: { select: { id: true, positionId: true } } },
    });
    for (const user of users) {
      if (!user.employee || user.employee.positionId) continue;
      await db.employee.update({
        where: { id: user.employee.id },
        data: { positionId },
      });
      attached += 1;
    }
  }
  if (attached > 0) {
    logger.info({ organizationId, attached }, 'Migration legacy roles : employes rattaches a un poste');
  }

  const orphans = await db.user.findMany({
    where: {
      organizationId,
      isActive: true,
      role: { notIn: ['SUPER_ADMIN', 'ADMIN'] },
      employee: null,
    },
    select: { id: true, email: true, role: true },
  });
  if (orphans.length > 0) {
    logger.warn(
      { organizationId, orphans: orphans.map((u) => `${u.email} (${u.role})`) },
      `${orphans.length} user(s) actifs sans fiche employe (aucune permission en mode enforce)`,
    );
  }
}
