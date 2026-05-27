import { inject, injectable } from 'tsyringe';
import type { CreateContainerInput } from '@transitsoftservices/shared';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';
import { prisma } from '../../../config/database';

/**
 * Genere une designation automatique unique de la forme :
 *   <ORG_SLUG>-<TYPE>-<DEST_CITY_SLUG>-<NUM>
 * ou NUM s'incremente parmi tous les conteneurs deja crees pour ce trio.
 * Race-safe : retry jusqu'a 5x si collision sur l'unique constraint.
 */
async function buildAutoDesignation(opts: {
  organizationName: string;
  type: string;
  destCity: string;
  organizationId: string;
}): Promise<string> {
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 16) || 'X';
  const orgSlug = slug(opts.organizationName);
  const typeSlug = slug(opts.type);
  const destSlug = slug(opts.destCity);
  const prefix = `${orgSlug}-${typeSlug}-${destSlug}`;

  // Compte les designations existantes commencant par ce prefixe pour
  // initialiser le compteur. Pas de course parfaite ici mais le retry sur
  // collision (cote create) couvre les rares cas concurrents.
  const existing = await prisma.container.count({
    where: { organizationId: opts.organizationId, designation: { startsWith: `${prefix}-` } },
  });
  return `${prefix}-${String(existing + 1).padStart(3, '0')}`;
}

@injectable()
export class CreateContainerUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
    private history: HistoryService,
  ) {}

  async execute(
    input: CreateContainerInput & {
      isForwarding?: boolean;
      parentContainerId?: string;
      carrier?: string;
      carrierId?: string;
      carrierCost?: number;
    },
    userId: string,
  ) {
    const isForwarding = input.isForwarding === true;

    // Les conteneurs standards (non-acheminement) ne peuvent pas etre LAND
    if (!isForwarding && input.type === 'LAND') {
      throw new BusinessError(
        "Les conteneurs standards ne supportent que les types AIR ou SEA. Utilisez un conteneur d'acheminement pour le type LAND.",
      );
    }

    if (input.parentContainerId && !isForwarding) {
      throw new BusinessError(
        "Seul un conteneur d'acheminement peut etre place dans un conteneur parent.",
      );
    }

    if (input.parentContainerId) {
      const parent = await this.containerRepo.findById(input.parentContainerId);
      if (!parent) throw new NotFoundError('Conteneur parent', input.parentContainerId);
      if (parent.isForwarding) {
        throw new BusinessError(
          "Le conteneur parent ne peut pas etre lui-meme un conteneur d'acheminement.",
        );
      }
      // On accepte n'importe quel statut de parent (EMPTY, LOADING, IN_TRANSIT,
      // RECEIVED, UNLOADED). Le besoin metier : tracer la provenance d'un
      // acheminement meme apres dechargement complet du conteneur parent.
      // L'ancien filtre EMPTY/LOADING empechait la creation post-arrivee,
      // ce qui bloquait les regroupements documentaires retroactifs.
    }

    const [depAgency, arrAgency] = await Promise.all([
      this.agencyRepo.findById(input.departureAgencyId),
      this.agencyRepo.findById(input.arrivalAgencyId),
    ]);

    if (!depAgency) throw new NotFoundError('Agence de depart', input.departureAgencyId);
    if (!arrAgency) throw new NotFoundError("Agence d'arrivee", input.arrivalAgencyId);

    const carrier = input.carrier?.trim() || null;
    const carrierCost = input.carrierCost != null && Number(input.carrierCost) > 0 ? Number(input.carrierCost) : 0;

    // Verifie le transporteur (FK) s'il est fourni.
    let carrierEntity: { id: string; name: string } | null = null;
    if (input.carrierId) {
      const c = await prisma.carrier.findUnique({
        where: { id: input.carrierId },
        select: { id: true, name: true, organizationId: true },
      });
      if (!c) throw new NotFoundError('Transporteur', input.carrierId);
      if (c.organizationId !== depAgency.organizationId) {
        throw new BusinessError("Le transporteur n'appartient pas a la meme organisation.");
      }
      carrierEntity = { id: c.id, name: c.name };
    }

    // Designation : si l'utilisateur n'en fournit pas (ou laisse vide), on
    // genere automatiquement <ORG>-<TYPE>-<DEST>-<NUM>. La retry sur P2002
    // couvre les collisions concurrentes rares (deux creations simultanees
    // qui ont lu le meme compteur).
    const providedDesignation = input.designation?.trim();
    let organizationName: string | null = null;
    if (!providedDesignation) {
      const org = await prisma.organization.findUnique({
        where: { id: depAgency.organizationId },
        select: { name: true },
      });
      organizationName = org?.name ?? 'ORG';
    }

    const created = await (async () => {
      const baseData = (designation: string) => ({
        organizationId: depAgency.organizationId,
        designation,
        type: input.type,
        isForwarding,
        capacity: input.capacity,
        carrierCost,
        ...(carrier && { carrier }),
        ...(carrierEntity && { carrierEntity: { connect: { id: carrierEntity.id } } }),
        departureAgency: { connect: { id: input.departureAgencyId } },
        arrivalAgency: { connect: { id: input.arrivalAgencyId } },
        ...(input.transitRouteId && { transitRoute: { connect: { id: input.transitRouteId } } }),
        ...(input.parentContainerId && {
          parentContainer: { connect: { id: input.parentContainerId } },
        }),
      });

      if (providedDesignation) {
        return this.containerRepo.create(baseData(providedDesignation));
      }

      // Auto designation avec retry sur collision (max 5 tentatives).
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const designation = await buildAutoDesignation({
          organizationName: organizationName ?? 'ORG',
          type: input.type,
          destCity: arrAgency.city,
          organizationId: depAgency.organizationId,
        });
        try {
          return await this.containerRepo.create(baseData(designation));
        } catch (e: any) {
          // Prisma unique constraint violation = collision concurrente,
          // on relance buildAutoDesignation qui re-comptera et generera
          // un numero plus eleve.
          if (e?.code === 'P2002') {
            lastErr = e;
            continue;
          }
          throw e;
        }
      }
      throw lastErr ?? new BusinessError('Impossible de generer une designation unique pour le conteneur.');
    })();

    // Depense automatique de transport : si un cout transporteur est
    // renseigne (> 0), on cree immediatement une Expense imputee au
    // conteneur. La propagation aux parents (cas forwarding) se fera
    // automatiquement au depart via DepartContainerUseCase.
    if (carrierCost > 0) {
      try {
        const carrierName = carrierEntity?.name ?? carrier ?? 'Transporteur';
        await prisma.expense.create({
          data: {
            agencyId: depAgency.id,
            title: `Transport ${carrierName} - ${created.designation}`,
            reason: `Cout transport conteneur ${created.designation}`,
            description: `Cout fixe convenu avec le transporteur ${carrierName}.`,
            category: 'TRANSPORT',
            amount: carrierCost,
            containerId: created.id,
            approvedByUserId: userId,
            isPaid: false,
          },
        });
      } catch (err) {
        // Best-effort : echec de creation de depense n'annule pas le conteneur.
        // Logge dans l'historique pour visibilite.
        try {
          await this.history.recordContainer({
            containerId: created.id,
            action: 'TRANSPORT_EXPENSE_FAILED',
            userId,
            comment: 'Echec creation auto depense transport',
            changes: { error: err instanceof Error ? err.message : String(err) } as any,
          });
        } catch { /* skip */ }
      }
    }

    await this.history.recordContainer({
      containerId: created.id,
      action: 'CREATED',
      statusAfter: 'EMPTY',
      userId,
      comment: isForwarding ? "Conteneur d'acheminement cree" : 'Conteneur cree',
      changes: {
        designation: created.designation,
        type: created.type,
        capacity: Number(created.capacity),
        isForwarding,
        carrier,
        carrierId: carrierEntity?.id ?? null,
        carrierCost,
        parentContainerId: input.parentContainerId ?? null,
        departureAgencyId: input.departureAgencyId,
        arrivalAgencyId: input.arrivalAgencyId,
      },
    });

    return created;
  }
}
