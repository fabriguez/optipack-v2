import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';
import { createChildLogger } from '../../config/logger';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../domain/accounting/chart-of-accounts';

const logger = createChildLogger('AccountingAccountService');

/**
 * Garantit l'existence du plan comptable d'un tenant.
 *
 * Contexte : le plan comptable n'est semé qu'au provisioning (prisma seed).
 * Un tenant provisionné avant l'ajout du plan — ou dont le seed a échoué —
 * n'a AUCUN `AccountingAccount`. La première écriture au journal (paiement...)
 * plante alors sur un connect Prisma inexistant, APRÈS que le paiement et la
 * facture ont déjà été committés (pas de transaction englobante) → paiement
 * partiel + 404. On rend le posting robuste en garantissant les comptes avant.
 *
 * Idempotent : ne crée que les comptes manquants (une lecture, un createMany).
 */
@injectable()
export class AccountingAccountService {
  /** Garantit le plan comptable pour une organisation donnée. */
  async ensureCoreAccounts(organizationId: string): Promise<void> {
    const existing = await prisma.accountingAccount.findMany({
      where: { organizationId },
      select: { code: true },
    });
    const have = new Set(existing.map((a) => a.code));
    const missing = DEFAULT_CHART_OF_ACCOUNTS.filter((a) => !have.has(a.code));
    if (missing.length === 0) return;

    // skipDuplicates : `code` est unique GLOBALEMENT (pas par org). En base
    // mono-tenant (une org par DB) il n'y a pas de collision ; le flag couvre
    // seulement le cas dev multi-org partageant une DB.
    await prisma.accountingAccount.createMany({
      data: missing.map((a) => ({
        organizationId,
        code: a.code,
        name: a.name,
        type: a.type,
      })),
      skipDuplicates: true,
    });
    logger.info(
      { organizationId, created: missing.map((m) => m.code) },
      'Plan comptable complété (comptes manquants créés)',
    );
  }

  /**
   * Self-heal au démarrage : garantit le plan comptable de TOUTES les
   * organisations. Sur un tenant, c'est généralement une seule org → coût
   * négligeable, et ça répare un tenant déjà cassé dès le prochain déploiement.
   */
  async ensureAllOrganizations(): Promise<void> {
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    for (const org of orgs) {
      try {
        await this.ensureCoreAccounts(org.id);
      } catch (err) {
        logger.warn({ err, organizationId: org.id }, 'ensureCoreAccounts a échoué (ignoré)');
      }
    }
  }
}
