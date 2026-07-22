import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';
import { createChildLogger } from '../../config/logger';
import {
  ensurePermissionCatalog,
  seedPermissionsAndPositions,
  migrateLegacyRolePositions,
} from './permission-seed';

const logger = createChildLogger('PermissionSeedService');

/**
 * Self-heal des permissions ABAC. Contexte : les tenants secondaires sont
 * provisionnes par l'orchestrator via un seed inline qui ne cree QUE
 * l'organisation + l'owner SUPER_ADMIN — il n'appelle jamais
 * seedPermissionsAndPositions. Resultat : ces tenants demarrent avec ZERO poste
 * systeme, donc tout employe non-admin se retrouve sans aucune permission en
 * mode enforce (l'owner ne le voit pas : role admin => wildcard '*'). Ce service
 * repare ces tenants au boot de l'API, comme AccountingAccountService le fait
 * deja pour le plan comptable.
 *
 * NB : la logique de seed vit dans `./permission-seed` (fonctions PURES, sans
 * tsyringe) pour rester utilisable par le seed CLI (prisma/seed.ts) qui n'a pas
 * de polyfill reflect-metadata. Ce fichier n'ajoute que la couche DI + le
 * self-heal multi-organisations.
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
