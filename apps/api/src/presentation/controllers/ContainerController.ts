import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { prisma } from '../../config/database';
import { CreateContainerUseCase } from '../../application/use-cases/container/CreateContainerUseCase';
import { UpdateContainerUseCase } from '../../application/use-cases/container/UpdateContainerUseCase';
import { ListContainersUseCase } from '../../application/use-cases/container/ListContainersUseCase';
import { LoadParcelsUseCase } from '../../application/use-cases/container/LoadParcelsUseCase';
import { ListLoadableParcelsUseCase } from '../../application/use-cases/container/ListLoadableParcelsUseCase';
import { LoadByQRCodeUseCase } from '../../application/use-cases/container/LoadByQRCodeUseCase';
import { RemoveParcelFromContainerUseCase } from '../../application/use-cases/container/RemoveParcelFromContainerUseCase';
import { DepartContainerUseCase } from '../../application/use-cases/container/DepartContainerUseCase';
import { ArriveContainerUseCase } from '../../application/use-cases/container/ArriveContainerUseCase';
import { UnloadParcelUseCase } from '../../application/use-cases/container/UnloadParcelUseCase';
import { CONTAINER_REPOSITORY } from '../../application/interfaces/IContainerRepository';
import { PARCEL_REPOSITORY } from '../../application/interfaces/IParcelRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { HistoryService } from '../../application/services/HistoryService';
import { containerScope, scopeCtx } from '../../application/services/scope/agencyScope';

export class ContainerController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
      if (!isAdmin && req.body.departureAgencyId && !user.agencyIds.includes(req.body.departureAgencyId)) {
        const { AuthorizationError } = await import('../../domain/errors/BusinessError');
        throw new AuthorizationError('L\'agence de depart doit correspondre a votre agence');
      }
      const useCase = container.resolve(CreateContainerUseCase);
      const result = await useCase.execute(req.body, user.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(UpdateContainerUseCase);
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const history = container.resolve(HistoryService);
      const items = await history.listContainerHistory(req.params.id);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListContainersUseCase);
      const {
        departureAgencyId, arrivalAgencyId, status, isForwarding, carrierId,
        departureDateFrom, departureDateTo, arrivalDateFrom, arrivalDateTo,
      } = req.query;
      const isForwardingFlag =
        isForwarding === 'true' ? true : isForwarding === 'false' ? false : undefined;
      // ADMIN tenant / SUPER_ADMIN plateforme : aucune restriction d'agence
      // (voir tous les conteneurs). Les autres sont filtres par leurs agences.
      // Sans ce bypass, un admin avec agencyIds=[] verrait LA LISTE VIDE -- bug
      // observe sur le formulaire de conteneur d'acheminement (parentContainer
      // empty). unrestricted = policy.isAdmin (ADMIN || SUPER_ADMIN).
      const agencyIds =
        scopeCtx(req).unrestricted ? undefined : req.user!.agencyIds;
      // Scope agence (etape 2) : fragment AND additionnel, actif en enforce.
      const scopeWhere = containerScope.where(scopeCtx(req)) ?? null;
      const result = await useCase.execute(
        {
          departureAgencyId: departureAgencyId as string,
          arrivalAgencyId: arrivalAgencyId as string,
          status: status as string,
          isForwarding: isForwardingFlag,
          agencyIds,
          carrierId: carrierId as string | undefined,
          departureDateFrom: departureDateFrom as string | undefined,
          departureDateTo: departureDateTo as string | undefined,
          arrivalDateFrom: arrivalDateFrom as string | undefined,
          arrivalDateTo: arrivalDateTo as string | undefined,
          scopeWhere,
        },
        req.query as any,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const repo = container.resolve<any>(CONTAINER_REPOSITORY);
      const cont = await repo.findById(req.params.id);
      if (!cont) throw new NotFoundError('Conteneur', req.params.id);
      res.json({ success: true, data: cont });
    } catch (err) {
      next(err);
    }
  }

  static async getParcels(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const repo = container.resolve<any>(PARCEL_REPOSITORY);
      const parcels = await repo.findByContainer(req.params.id);
      res.json({ success: true, data: parcels });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Snapshot des colis pour le calcul du benefice :
   *  - Avant transit (EMPTY/LOADING) : retourne les colis ACTUELLEMENT
   *    charges (containerId == id). Le total suit dynamiquement les
   *    ajouts / retraits.
   *  - Au depart et apres (IN_TRANSIT/RECEIVED/UNLOADED) : retourne le
   *    snapshot fige (containerId OU lastContainerId == id). Permet de
   *    preserver la valeur meme apres dechargement.
   */
  static async getArrivalSnapshot(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const containerRepo = container.resolve<any>(CONTAINER_REPOSITORY);
      const parcelRepo = container.resolve<any>(PARCEL_REPOSITORY);
      const cont = await containerRepo.findById(req.params.id);
      if (!cont) throw new NotFoundError('Conteneur', req.params.id);
      const FROZEN = new Set(['IN_TRANSIT', 'RECEIVED', 'UNLOADED']);
      const parcels = FROZEN.has(cont.status)
        ? await parcelRepo.findArrivalSnapshot(req.params.id)
        : await parcelRepo.findByContainer(req.params.id);
      res.json({ success: true, data: parcels });
    } catch (err) {
      next(err);
    }
  }

  static async loadParcels(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(LoadParcelsUseCase);
      const result = await useCase.execute(req.params.id, req.body.parcelIds, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getLoadableParcels(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(ListLoadableParcelsUseCase);
      const { search, page, limit, warehouseId } = req.query;
      const result = await useCase.execute(req.params.id, {
        search: search as string | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        warehouseId: warehouseId ? String(warehouseId) : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async loadByQr(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(LoadByQRCodeUseCase);
      const result = await useCase.execute(
        req.params.id,
        req.body.trackingNumber,
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async removeParcel(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(RemoveParcelFromContainerUseCase);
      const result = await useCase.execute(
        req.params.id,
        req.body.parcelId,
        req.body.reason,
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async depart(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(DepartContainerUseCase);
      const result = await useCase.execute(req.params.id, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async arrive(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(ArriveContainerUseCase);
      const result = await useCase.execute(req.params.id, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async unloadParcel(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(UnloadParcelUseCase);
      const { parcelId, action, warehouseId, newWeight, comment } = req.body;
      const result = await useCase.execute(
        req.params.id,
        parcelId,
        action,
        warehouseId,
        req.user!.userId,
        { newWeight, comment },
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // -----------------------------------------------------------------
  // Documents / images du conteneur (max 10 par conteneur)
  // -----------------------------------------------------------------

  static async listDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const docs = await prisma.containerDocument.findMany({
        where: { containerId: req.params.id },
        include: { uploader: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: docs });
    } catch (err) {
      next(err);
    }
  }

  static async addDocument(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const containerId = req.params.id;
      const { url, storageKey, fileName, contentType, size, caption, isImage } = req.body as {
        url: string;
        storageKey?: string;
        fileName?: string;
        contentType?: string;
        size?: number;
        caption?: string;
        isImage?: boolean;
      };
      if (!url) return res.status(400).json({ success: false, message: 'url requis' });

      const count = await prisma.containerDocument.count({ where: { containerId } });
      if (count >= 10) {
        return res.status(400).json({
          success: false,
          message: 'Limite atteinte : 10 documents max par conteneur. Supprimez-en un d\'abord.',
        });
      }

      const doc = await prisma.containerDocument.create({
        data: {
          containerId,
          url,
          storageKey: storageKey ?? null,
          fileName: fileName ?? null,
          contentType: contentType ?? null,
          size: size ?? null,
          caption: caption?.trim() || null,
          isImage: !!isImage,
          uploadedBy: req.user!.userId,
        },
      });
      res.status(201).json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  }

  static async updateDocument(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const doc = await prisma.containerDocument.findUnique({ where: { id: req.params.documentId } });
      if (!doc || doc.containerId !== req.params.id) {
        return res.status(404).json({ success: false, message: 'Document introuvable' });
      }
      const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : null;
      const updated = await prisma.containerDocument.update({
        where: { id: doc.id },
        data: { caption: caption || null },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async deleteDocument(req: Request, res: Response, next: NextFunction) {
    try {
      await containerScope.assert(req.params.id, scopeCtx(req));
      const doc = await prisma.containerDocument.findUnique({ where: { id: req.params.documentId } });
      if (!doc || doc.containerId !== req.params.id) {
        return res.status(404).json({ success: false, message: 'Document introuvable' });
      }
      await prisma.containerDocument.delete({ where: { id: doc.id } });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
