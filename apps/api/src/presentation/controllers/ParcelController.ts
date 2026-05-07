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
import {
  HandoverParcelUseCase,
  HandoverUntrackedParcelUseCase,
} from '../../application/use-cases/parcel/HandoverParcelUseCase';
import { ComputeStorageFeeUseCase } from '../../application/use-cases/parcel/ComputeStorageFeeUseCase';

export class ParcelController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateParcelUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
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
        parcelGroupId,
        clientId,
        status,
        transitType,
        onlyPresent,
      } = req.query;
      const scope = req.user!.role === 'SUPER_ADMIN' ? null : req.user!.agencyIds;
      const result = await useCase.execute(
        {
          warehouseId: warehouseId as string,
          containerId: containerId as string,
          lastContainerId: lastContainerId as string,
          spaceId: spaceId as string,
          origin: origin as string,
          parcelGroupId: parcelGroupId as string,
          clientId: clientId as string,
          status: status as string,
          transitType: transitType as string,
          agencyIds: scope,
          onlyPresent: onlyPresent === 'true' || onlyPresent === '1',
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
      const useCase = container.resolve(GetParcelUseCase);
      const parcel = await useCase.execute(req.params.id);
      res.json({ success: true, data: parcel });
    } catch (err) {
      next(err);
    }
  }

  static async getByTracking(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetParcelUseCase);
      const parcel = await useCase.execute(req.params.tracking);
      res.json({ success: true, data: parcel });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateParcelUseCase);
      const parcel = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.json({ success: true, data: parcel });
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
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
      const useCase = container.resolve(HandoverParcelUseCase);
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId);
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
      const useCase = container.resolve(ComputeStorageFeeUseCase);
      const data = await useCase.execute(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}
