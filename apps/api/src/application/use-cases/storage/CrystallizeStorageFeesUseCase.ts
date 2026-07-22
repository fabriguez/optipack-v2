import { injectable } from 'tsyringe';
import { StorageChargeService } from '../../services/StorageChargeService';
import { GroupInvoiceService } from '../../services/GroupInvoiceService';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('CrystallizeStorageFees');

export interface CrystallizeStorageResult {
  invoicesScanned: number;
  invoicesBilled: number;
  billedTotal: number;
  groupsResynced: number;
}

/**
 * Cristallisation periodique du magasinage.
 *
 * Materialise, pour chaque facture portant des frais de magasinage hors
 * franchise non encore factures, le montant accru dans la facture
 * (totalAmount / netAmount / balance / status). Consequence voulue : une
 * facture deja soldee dont le colis reste stocke repasse en PARTIAL et le
 * total inclut desormais le magasinage -- conformement a la regle "une seule
 * facture par colis, toujours a jour".
 *
 * Idempotent et selectif : `findInvoicesWithAccruedStorage` ne renvoie que les
 * factures dont au moins une charge a franchi la periode de gratuite ; les
 * charges encore en franchise (fee 0) sont laissees intactes par le garde de
 * `crystallizeForInvoice`. Un passage quotidien facture donc ~1 jour/jour sans
 * jamais consommer la franchise a vide.
 *
 * Sert au cron quotidien ET au backfill one-shot des colis existants dont le
 * magasinage n'avait jamais ete injecte dans leur facture.
 */
@injectable()
export class CrystallizeStorageFeesUseCase {
  constructor(
    private storageCharges: StorageChargeService,
    private groupInvoice: GroupInvoiceService,
  ) {}

  async execute(): Promise<CrystallizeStorageResult> {
    const invoiceIds = await this.storageCharges.findInvoicesWithAccruedStorage();

    let invoicesBilled = 0;
    let billedTotal = 0;
    const affectedInvoiceIds: string[] = [];

    for (const invoiceId of invoiceIds) {
      try {
        const billed = await this.storageCharges.crystallizeForInvoice({
          invoiceId,
          reason: 'CRON',
        });
        if (billed > 0) {
          invoicesBilled++;
          billedTotal += billed;
          affectedInvoiceIds.push(invoiceId);
        }
      } catch (err) {
        logger.error({ err, invoiceId }, 'Crystallisation magasinage echouee pour une facture');
      }
    }

    // Resync des factures agregat de groupe : le magasinage vit sur les
    // factures membres (par colis) ; l'agregat doit refleter la somme.
    const groupIds = new Set<string>();
    for (const invoiceId of affectedInvoiceIds) {
      try {
        const groupId = await this.groupInvoice.resolveGroupId(invoiceId);
        if (groupId) groupIds.add(groupId);
      } catch (err) {
        logger.error({ err, invoiceId }, 'Resolution groupe echouee');
      }
    }
    for (const groupId of groupIds) {
      try {
        await this.groupInvoice.sync(groupId);
      } catch (err) {
        logger.error({ err, groupId }, 'Resync facture agregat echouee');
      }
    }

    return {
      invoicesScanned: invoiceIds.length,
      invoicesBilled,
      billedTotal,
      groupsResynced: groupIds.size,
    };
  }
}
