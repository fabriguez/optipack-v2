import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { MANIFEST_REPOSITORY, type IManifestRepository } from '../../interfaces/IManifestRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { HistoryService } from '../../services/HistoryService';
import { prisma } from '../../../config/database';
import { propagateForwardingExpense } from '../expense/CreateContainerExpenseUseCase';

@injectable()
export class DepartContainerUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    @inject(MANIFEST_REPOSITORY) private manifestRepo: IManifestRepository,
    private history: HistoryService,
  ) {}

  async execute(containerId: string, userId: string) {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (container.status !== 'LOADING') {
      throw new BusinessError(
        `Le conteneur doit etre en chargement pour partir. Statut actuel: ${container.status}`,
      );
    }

    const departureDate = new Date();
    await this.containerRepo.update(containerId, {
      status: 'IN_TRANSIT',
      departureDate,
    });

    const parcels = await this.parcelRepo.findByContainer(containerId);
    const parcelIds = parcels.map((p) => p.id);

    if (parcelIds.length > 0) {
      await this.parcelRepo.updateMany(parcelIds, { status: 'IN_TRANSIT' });

      await this.history.recordParcelMany(
        parcels.map((p) => ({
          parcelId: p.id,
          action: 'CONTAINER_DEPARTED',
          statusBefore: 'LOADING',
          statusAfter: 'IN_TRANSIT',
          containerId,
          userId,
          parcelDesignationSnapshot: p.designation,
          parcelTrackingSnapshot: p.trackingNumber,
          comment: `Depart du conteneur ${container.designation}`,
        })),
      );
    }

    await this.history.recordContainer({
      containerId,
      action: 'DEPARTED',
      statusBefore: 'LOADING',
      statusAfter: 'IN_TRANSIT',
      userId,
      comment: `Depart - ${parcelIds.length} colis a bord`,
      changes: { departureDate: departureDate.toISOString(), parcelCount: parcelIds.length },
    });

    // Auto-generation du bordereau d'envoi (DISPATCH) au depart.
    // Best-effort : un echec ne bloque pas le depart.
    if (parcelIds.length > 0) {
      try {
        const manifest = await this.manifestRepo.createDispatchManifest(containerId, userId);
        await this.history.recordContainer({
          containerId,
          action: 'DISPATCH_MANIFEST_CREATED',
          userId,
          comment: `Bordereau d'envoi ${manifest.number} genere automatiquement`,
          changes: { manifestId: manifest.id, number: manifest.number, lineCount: manifest.lines.length },
        });
      } catch (err) {
        // Le bordereau peut deja exister (replay) ou autre erreur metier --
        // on log uniquement, le depart reste valide.
      }
    }

    // Propagation des depenses aux parents si conteneur d'acheminement.
    // Au depart, le contenu est fige -> on propage toutes les depenses
    // accumulees (non encore propagees + non-auto) aux conteneurs parents
    // au prorata des prix snapshotes. Best-effort (log explicite si echec).
    if (container.isForwarding) {
      try {
        const pendingExpenses = await prisma.expense.findMany({
          where: {
            containerId,
            isAutoFromForwarding: false,
            parentExpenseId: null,
            childExpenses: { none: {} },
          },
          select: { id: true, amount: true, title: true },
        });

        const linkCount = await prisma.containerForwardingParcelLink.count({
          where: { forwardingId: containerId },
        });

        const errors: Array<{ expenseId: string; error: string }> = [];
        let propagated = 0;
        for (const exp of pendingExpenses) {
          try {
            await prisma.$transaction(async (tx) => {
              await propagateForwardingExpense(tx, exp.id, containerId, Number(exp.amount), userId);
            });
            propagated += 1;
          } catch (err) {
            errors.push({
              expenseId: exp.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        await this.history.recordContainer({
          containerId,
          action: 'FORWARDING_EXPENSES_PROPAGATED',
          userId,
          comment:
            pendingExpenses.length === 0
              ? 'Aucune depense pendante a propager'
              : `${propagated}/${pendingExpenses.length} depense(s) propagee(s) (${linkCount} colis lies)`,
          changes: {
            pendingCount: pendingExpenses.length,
            propagatedCount: propagated,
            linkCount,
            errors: errors.length > 0 ? errors : undefined,
          } as any,
        });
      } catch (err) {
        // Log dans l'historique conteneur pour visibilite.
        try {
          await this.history.recordContainer({
            containerId,
            action: 'FORWARDING_EXPENSES_PROPAGATION_FAILED',
            userId,
            comment: 'Echec global propagation depenses',
            changes: { error: err instanceof Error ? err.message : String(err) } as any,
          });
        } catch { /* skip */ }
      }
    }

    eventBus.emit({
      type: DomainEvents.CONTAINER_DEPARTED,
      payload: { containerId, parcelCount: parcelIds.length },
      timestamp: new Date(),
      userId,
    });

    // Emit parcel status change events for each parcel (LOADING -> IN_TRANSIT)
    try {
      for (const p of parcels) {
        try {
          eventBus.emit({
            type: DomainEvents.PARCEL_STATUS_CHANGED,
            payload: { parcelId: p.id, oldStatus: 'LOADING', newStatus: 'IN_TRANSIT', trackingNumber: p.trackingNumber },
            timestamp: new Date(),
            userId,
          });
        } catch (e) {
          // non blocking
        }
      }
    } catch (e) {
      // non blocking
    }

    return { containerId, parcelCount: parcelIds.length, status: 'IN_TRANSIT' };
  }
}
