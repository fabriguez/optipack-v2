import { injectable } from 'tsyringe';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { createChildLogger } from '../../config/logger';
import { ADMIN_ONLY_PERMISSION_KEYS } from '../../domain/constants/permissions';
import {
  PERMISSION_CATALOG,
  POSITION_CATALOG,
  LEGACY_ROLE_TO_POSITION,
} from '../../domain/permissions/permission-catalog';

const logger = createChildLogger('PermissionSeedService');

// Client Prisma minimal accepte par les fonctions ci-dessous : la transaction
// singleton (`prisma`) comme un `new PrismaClient()` cree par le seed conviennent.
type Db = Pick<PrismaClient, 'permission' | 'position' | 'positionPermission' | 'user' | 'employee'>;

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

/**
 * Self-heal des permissions ABAC. Contexte : les tenants secondaires sont
 * provisionnes par l'orchestrator via un seed inline qui ne cree QUE
 * l'organisation + l'owner SUPER_ADMIN — il n'appelle jamais
 * seedPermissionsAndPositions. Resultat : ces tenants demarrent avec ZERO poste
 * systeme, donc tout employe non-admin se retrouve sans aucune permission en
 * mode enforce (l'owner ne le voit pas : role admin => wildcard '*'). Ce service
 * repare ces tenants au boot de l'API, comme AccountingAccountService le fait
 * deja pour le plan comptable.
 */
@injectable()
export class PermissionSeedService {
  /**
   * Garantit les postes systeme d'une organisation. Le catalogue global de
   * permissions est toujours ré-upserté (cheap, idempotent, propage les
   * nouvelles cles). Les postes ne sont (re)seedes QUE si l'organisation n'en a
   * aucun : on ne rejoue pas l'union de la matrice a chaque boot, pour ne pas
   * ressusciter les cles qu'un admin a volontairement retirees d'un poste.
   */
  async ensurePermissionsAndPositions(organizationId: string): Promise<void> {
    const systemPositions = await prisma.position.count({
      where: { organizationId, agencyId: null, isSystem: true },
    });
    if (systemPositions > 0) return;

    await seedPermissionsAndPositions(prisma, organizationId);
    await migrateLegacyRolePositions(prisma, organizationId);
    logger.warn(
      { organizationId },
      'Permissions & postes systeme auto-repares (tenant provisionne sans seed ABAC)',
    );
  }

  /**
   * Self-heal au demarrage : garantit le catalogue global puis les postes de
   * TOUTES les organisations. Sur un tenant, c'est generalement une seule org
   * => cout negligeable, et ca repare un tenant deja casse des le prochain
   * deploiement. Non bloquant : chaque org echoue independamment.
   */
  async ensureAllOrganizations(): Promise<void> {
    await ensurePermissionCatalog(prisma);
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    for (const org of orgs) {
      try {
        await this.ensurePermissionsAndPositions(org.id);
      } catch (err) {
        logger.warn({ err, organizationId: org.id }, 'ensurePermissionsAndPositions a echoue (ignore)');
      }
    }
  }
}
