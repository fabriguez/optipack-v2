import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateParcelUseCase } from '../../application/use-cases/parcel/CreateParcelUseCase';
import { CreateBatchParcelsUseCase } from '../../application/use-cases/parcel/CreateBatchParcelsUseCase';
import { ListParcelsUseCase } from '../../application/use-cases/parcel/ListParcelsUseCase';
import { GetParcelUseCase } from '../../application/use-cases/parcel/GetParcelUseCase';
import { UpdateParcelUseCase } from '../../application/use-cases/parcel/UpdateParcelUseCase';
import { UpdateParcelStatusUseCase } from '../../application/use-cases/parcel/UpdateParcelStatusUseCase';
import { prisma } from '../../config/database';
import { HistoryService } from '../../application/services/HistoryService';
import { realtimeService } from '../../infrastructure/realtime/RealtimeService';
import {
  HandoverParcelUseCase,
  HandoverUntrackedParcelUseCase,
} from '../../application/use-cases/parcel/HandoverParcelUseCase';
import { ComputeStorageFeeUseCase } from '../../application/use-cases/parcel/ComputeStorageFeeUseCase';
import { StorageChargeService } from '../../application/services/StorageChargeService';
import { deriveInvoiceView } from '../../application/services/invoiceView';
import {
  ArchiveParcelsUseCase,
  UnarchiveParcelsUseCase,
} from '../../application/use-cases/parcel/ArchiveParcelsUseCase';
import { DeleteParcelUseCase } from '../../application/use-cases/parcel/DeleteParcelUseCase';
import { parcelScope, parcelInScope, scopeCtx } from '../../application/services/scope/agencyScope';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../application/interfaces/IParcelRepository';
import { applyFieldPolicy, PARCEL_FIELD_POLICY } from '../serializers/fieldPolicy';
import { getPolicy } from '../middleware/policyContext';

export class ParcelController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateParcelUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      // Realtime : notifie le client expediteur que son colis vient d'etre cree.
      try {
        const clientId = (result as { clientId?: string })?.clientId;
        if (clientId) realtimeService.toClient(clientId, 'parcel:created', { parcel: result });
      } catch {
        /* non bloquant */
      }
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // Audit fix #5 : creation batch (1 facture pour N colis)
  static async createBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateBatchParcelsUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListParcelsUseCase);
      const {
        warehouseId,
        containerId,
        lastContainerId,
        spaceId,
        origin,
        destination,
        parcelGroupId,
        clientId,
        status,
        transitType,
        onlyPresent,
        archived,
      } = req.query;
      // Colis : la LECTURE n'est PAS scopee par agence — un colis transite entre
      // agences, tout personnel avec parcel.read voit tous les colis. Le scope
      // agence ne s'applique qu'aux ACTIONS (assert dans update/handover/etc.).
      // archived : 'true' = uniquement archives, 'all' = tout, defaut/null = exclus.
      const archivedFilter: 'true' | 'all' | 'false' | undefined =
        archived === 'true' ? 'true' : archived === 'all' ? 'all' : undefined;
      const result = await useCase.execute(
        {
          warehouseId: warehouseId as string,
          containerId: containerId as string,
          lastContainerId: lastContainerId as string,
          spaceId: spaceId as string,
          origin: origin as string,
          destination: destination as string,
          parcelGroupId: parcelGroupId as string,
          clientId: clientId as string,
          status: status as string,
          transitType: transitType as string,
          onlyPresent: onlyPresent === 'true' || onlyPresent === '1',
          archived: archivedFilter,
        },
        req.query as any,
      );
      // inAgencyScope : indique a l'UI si le user peut AGIR sur le colis (son
      // agence intersecte le jeu d'agences du colis). La lecture reste ouverte.
      const ctx = scopeCtx(req);
      const items = (result.data as any[]).map((p) => ({ ...p, inAgencyScope: parcelInScope(p, ctx) }));
      const policy = getPolicy(req);
      const data = policy ? applyFieldPolicy(items, PARCEL_FIELD_POLICY, policy) : items;
      res.json({ success: true, ...result, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Valeurs distinctes disponibles pour les filtres du listing (conteneur,
   * client, zone, destination, statut, route) calculees sur le meme perimetre
   * que la liste -- ex: colis presents d'un magasin -- et non sur toute la base.
   */
  static async facets(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<IParcelRepository>(PARCEL_REPOSITORY);
      const { warehouseId, onlyPresent, archived } = req.query;
      // Facettes calculees sur le meme perimetre que la liste : lecture non scopee.
      const archivedFilter: 'true' | 'all' | undefined =
        archived === 'true' ? 'true' : archived === 'all' ? 'all' : undefined;
      const facets = await repo.findFilterFacets({
        warehouseId: warehouseId as string,
        onlyPresent: onlyPresent === 'true' || onlyPresent === '1',
        archived: archivedFilter,
      });
      res.json({ success: true, data: facets });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      // Lecture non scopee : voir n'importe quel colis (toutes agences).
      const useCase = container.resolve(GetParcelUseCase);
      const parcel: any = await useCase.execute(req.params.id);
      // Enrichit la facture liee avec le magasinage en cours (non cristallise)
      // pour exposer statut effectif + reste a payer magasinage inclus des le
      // detail colis, sans attendre le cron de cristallisation.
      if (parcel?.invoice?.id) {
        const pending = await container
          .resolve(StorageChargeService)
          .pendingForInvoice(parcel.invoice.id);
        parcel.invoice = { ...parcel.invoice, ...deriveInvoiceView(parcel.invoice, pending) };
      }
      const withScope = { ...parcel, inAgencyScope: parcelInScope(parcel, scopeCtx(req)) };
      const policy = getPolicy(req);
      res.json({ success: true, data: policy ? applyFieldPolicy(withScope, PARCEL_FIELD_POLICY, policy) : withScope });
    } catch (err) {
      next(err);
    }
  }

  static async getByTracking(req: Request, res: Response, next: NextFunction) {
    try {
      // Lecture non scopee : voir n'importe quel colis par son tracking.
      const useCase = container.resolve(GetParcelUseCase);
      const parcel = await useCase.execute(req.params.tracking);
      res.json({ success: true, data: parcel });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      await parcelScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(UpdateParcelUseCase);
      const parcel = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.json({ success: true, data: parcel });
    } catch (err) {
      next(err);
    }
  }

  static async archive(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ArchiveParcelsUseCase);
      const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
      await parcelScope.assertMany(ids, scopeCtx(req));
      const result = await useCase.execute(ids, req.user!.userId, req.body?.reason);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async unarchive(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UnarchiveParcelsUseCase);
      const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
      await parcelScope.assertMany(ids, scopeCtx(req));
      const result = await useCase.execute(ids, req.user!.userId, req.body?.reason);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      await parcelScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(UpdateParcelStatusUseCase);
      const warehouseChange = Object.prototype.hasOwnProperty.call(req.body, 'warehouseId')
        ? { warehouseId: (req.body.warehouseId as string | null) ?? null }
        : undefined;
      const parcel = await useCase.execute(
        req.params.id,
        req.body.status,
        req.user!.userId,
        warehouseChange,
      );
      // Realtime : l'emission `parcel:updated` est centralisee dans
      // RealtimeParcelHandler (ecoute PARCEL_STATUS_CHANGED emis par le
      // use-case) -> couvre TOUS les chemins de changement de statut sans
      // duplication ici.
      res.json({ success: true, data: parcel });
    } catch (err) {
      next(err);
    }
  }

  // ============================================================
  // GALERIE D'IMAGES
  // ============================================================

  static async listImages(req: Request, res: Response, next: NextFunction) {
    try {
      // Lecture non scopee : voir la galerie de n'importe quel colis.
      const images = await prisma.parcelImage.findMany({
        where: { parcelId: req.params.id },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      res.json({ success: true, data: images });
    } catch (err) {
      next(err);
    }
  }

  static async addImage(req: Request, res: Response, next: NextFunction) {
    try {
      const { url, caption, isPrimary } = req.body as { url: string; caption?: string; isPrimary?: boolean };
      if (!url) {
        return res.status(400).json({ success: false, message: 'url requis' });
      }
      await parcelScope.assert(req.params.id, scopeCtx(req));

      const parcel = await prisma.parcel.findUnique({ where: { id: req.params.id }, select: { id: true, designation: true, trackingNumber: true } });
      if (!parcel) {
        return res.status(404).json({ success: false, message: 'Colis introuvable' });
      }

      if (isPrimary) {
        await prisma.parcelImage.updateMany({ where: { parcelId: parcel.id }, data: { isPrimary: false } });
      }

      const count = await prisma.parcelImage.count({ where: { parcelId: parcel.id } });
      const image = await prisma.parcelImage.create({
        data: {
          parcelId: parcel.id,
          url,
          caption: caption ?? null,
          isPrimary: !!isPrimary,
          sortOrder: count,
        },
      });

      const history = container.resolve(HistoryService);
      await history.recordParcel({
        parcelId: parcel.id,
        action: 'IMAGE_ADDED',
        userId: req.user!.userId,
        parcelDesignationSnapshot: parcel.designation,
        parcelTrackingSnapshot: parcel.trackingNumber,
        comment: 'Image ajoutee a la galerie',
        metadata: { url, isPrimary: !!isPrimary },
      });

      res.status(201).json({ success: true, data: image });
    } catch (err) {
      next(err);
    }
  }

  static async deleteImage(req: Request, res: Response, next: NextFunction) {
    try {
      await parcelScope.assert(req.params.id, scopeCtx(req));
      const image = await prisma.parcelImage.findUnique({
        where: { id: req.params.imageId },
        include: { parcel: { select: { designation: true, trackingNumber: true } } },
      });
      if (!image || image.parcelId !== req.params.id) {
        return res.status(404).json({ success: false, message: 'Image introuvable' });
      }

      await prisma.parcelImage.delete({ where: { id: image.id } });

      const history = container.resolve(HistoryService);
      await history.recordParcel({
        parcelId: image.parcelId,
        action: 'IMAGE_REMOVED',
        userId: req.user!.userId,
        parcelDesignationSnapshot: image.parcel.designation,
        parcelTrackingSnapshot: image.parcel.trackingNumber,
        comment: 'Image retiree de la galerie',
        metadata: { url: image.url },
      });

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  // ----- Remise au client (handover) -----

  static async handover(req: Request, res: Response, next: NextFunction) {
    try {
      await parcelScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(HandoverParcelUseCase);
      const isAdmin = req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN';
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId, isAdmin);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async handoverUntracked(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(HandoverUntrackedParcelUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // Frais de magasinage : calcul a la demande (preview) ou au moment de la
  // remise/facturation. Renvoie le breakdown complet (jours, taux, total).
  static async storageFee(req: Request, res: Response, next: NextFunction) {
    try {
      // Lecture (preview) non scopee.
      const useCase = container.resolve(ComputeStorageFeeUseCase);
      const data = await useCase.execute(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await parcelScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(DeleteParcelUseCase);
      await useCase.execute(req.params.id, req.user!.userId);
      res.json({ success: true, message: 'Colis supprime' });
    } catch (err) {
      next(err);
    }
  }
}
