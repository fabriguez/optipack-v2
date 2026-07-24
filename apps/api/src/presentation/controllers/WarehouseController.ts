import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateWarehouseUseCase } from '../../application/use-cases/warehouse/CreateWarehouseUseCase';
import { ListWarehousesUseCase } from '../../application/use-cases/warehouse/ListWarehousesUseCase';
import { UpdateWarehouseUseCase } from '../../application/use-cases/warehouse/UpdateWarehouseUseCase';
import { DeleteWarehouseUseCase } from '../../application/use-cases/warehouse/DeleteWarehouseUseCase';
import { GetWarehouseSummaryUseCase } from '../../application/use-cases/warehouse/GetWarehouseSummaryUseCase';
import { StartInventoryUseCase } from '../../application/use-cases/warehouse/StartInventoryUseCase';
import { ScanInventoryParcelUseCase } from '../../application/use-cases/warehouse/ScanInventoryParcelUseCase';
import { CloseInventoryUseCase } from '../../application/use-cases/warehouse/CloseInventoryUseCase';
import { GetInventoryUseCase } from '../../application/use-cases/warehouse/GetInventoryUseCase';
import { MarkInventoryItemManuallyUseCase } from '../../application/use-cases/warehouse/MarkInventoryItemManuallyUseCase';
import { ListUninventoriedParcelsUseCase } from '../../application/use-cases/warehouse/ListUninventoriedParcelsUseCase';
import {
  ListWarehouseSpacesUseCase,
  UpsertWarehouseSpacesUseCase,
  MoveParcelToSpaceUseCase,
} from '../../application/use-cases/warehouse/WarehouseSpaceUseCases';
import { RegisterExtraInventoryParcelUseCase } from '../../application/use-cases/warehouse/RegisterExtraInventoryParcelUseCase';
import { RestockParcelUseCase } from '../../application/use-cases/warehouse/RestockParcelUseCase';
import {
  ListWarehouseStorageRulesUseCase,
  CreateWarehouseStorageRuleUseCase,
  UpdateWarehouseStorageRuleUseCase,
  DeleteWarehouseStorageRuleUseCase,
} from '../../application/use-cases/warehouse/WarehouseStorageRuleUseCases';
import { WAREHOUSE_REPOSITORY } from '../../application/interfaces/IWarehouseRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { prisma } from '../../config/database';
import {
  assertAgencyInScope,
  parcelScope,
  scopeCtx,
  scopeEnforced,
  warehouseScope,
} from '../../application/services/scope/agencyScope';

// Resout l'entrepot porteur d'un inventaire (:inventoryId) puis applique le scope agence.
async function assertInventoryScope(req: Request): Promise<void> {
  const inv = await prisma.warehouseInventory.findUnique({
    where: { id: req.params.inventoryId },
    select: { warehouseId: true },
  });
  if (inv) await warehouseScope.assert(inv.warehouseId, scopeCtx(req));
}

// Idem pour une regle de magasinage (:ruleId).
async function assertStorageRuleScope(req: Request): Promise<void> {
  const rule = await prisma.warehouseStorageFeeRule.findUnique({
    where: { id: req.params.ruleId },
    select: { warehouseId: true },
  });
  if (rule) await warehouseScope.assert(rule.warehouseId, scopeCtx(req));
}

export class WarehouseController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      // Garde dure : on ne cree un magasin que dans une de SES agences (agence
      // cible dans le body). Admin => bypass (ctx.unrestricted).
      const ctx = scopeCtx(req);
      const agencyId = req.body?.agencyId as string | undefined;
      if (agencyId) assertAgencyInScope(agencyId, ctx);
      const useCase = container.resolve(CreateWarehouseUseCase);
      const warehouse = await useCase.execute(req.body);
      res.status(201).json({ success: true, data: warehouse });
    } catch (err) {
      next(err);
    }
  }

  static async listAll(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(WAREHOUSE_REPOSITORY);
      const { agencyId } = req.query;
      const scope = req.user!.role === 'SUPER_ADMIN' ? null : req.user!.agencyIds;
      // Scope agence (etape 2) : fragment AND additionnel, actif en enforce.
      const scopeWhere = warehouseScope.where(scopeCtx(req)) ?? null;
      const result = await repo.findByAgencies(
        scope,
        req.query as any,
        agencyId as string | undefined,
        scopeWhere,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { agencyId } = req.params;
      // Scope agence : l'agence demandee doit appartenir au perimetre du user.
      const ctx = scopeCtx(req);
      if (!ctx.unrestricted && !ctx.agencyIds.includes(agencyId)) {
        if (scopeEnforced()) throw new NotFoundError('Agence', agencyId);
        // eslint-disable-next-line no-console
        console.warn(
          `[SCOPE-DENY] user=${ctx.userId} resource=Agency id=${agencyId} agencies=[${ctx.agencyIds.join(',')}]`,
        );
      }
      const useCase = container.resolve(ListWarehousesUseCase);
      const result = await useCase.execute(agencyId, req.query as any);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      await warehouseScope.assert(req.params.id, scopeCtx(req));
      const repo = container.resolve<any>(WAREHOUSE_REPOSITORY);
      const warehouse = await repo.findById(req.params.id);
      if (!warehouse) throw new NotFoundError('Magasin', req.params.id);
      res.json({ success: true, data: warehouse });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      await warehouseScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(UpdateWarehouseUseCase);
      const warehouse = await useCase.execute(req.params.id, req.body);
      res.json({ success: true, data: warehouse });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await warehouseScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(DeleteWarehouseUseCase);
      await useCase.execute(req.params.id);
      res.json({ success: true, message: 'Magasin desactive' });
    } catch (err) {
      next(err);
    }
  }

  static async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      await warehouseScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(GetWarehouseSummaryUseCase);
      const data = await useCase.execute(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async startInventory(req: Request, res: Response, next: NextFunction) {
    try {
      await warehouseScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(StartInventoryUseCase);
      const data = await useCase.execute(req.params.id, req.user!.userId, req.body?.comment);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async listInventories(req: Request, res: Response, next: NextFunction) {
    try {
      await warehouseScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(GetInventoryUseCase);
      const data = await useCase.listByWarehouse(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getInventory(req: Request, res: Response, next: NextFunction) {
    try {
      await assertInventoryScope(req);
      const useCase = container.resolve(GetInventoryUseCase);
      const data = await useCase.execute(req.params.inventoryId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async scanInventory(req: Request, res: Response, next: NextFunction) {
    try {
      await assertInventoryScope(req);
      const useCase = container.resolve(ScanInventoryParcelUseCase);
      const data = await useCase.execute(
        req.params.inventoryId,
        req.body.trackingNumber,
        req.user!.userId,
        req.body.observation,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Marquage manuel (sans scan) : present/absent + observation libre.
   * Le flag markedManually = true sur l'item permettra au rapport d'inventaire
   * de distinguer les items physiquement scannes des items pointes a la main.
   */
  static async markInventoryItemManual(req: Request, res: Response, next: NextFunction) {
    try {
      await assertInventoryScope(req);
      const useCase = container.resolve(MarkInventoryItemManuallyUseCase);
      const data = await useCase.execute(
        req.params.inventoryId,
        {
          parcelId: req.body.parcelId,
          present: req.body.present !== false,
          observation: req.body.observation,
        },
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /** Liste les colis du magasin pas encore inventories (= aucun item enregistre). */
  static async listUninventoried(req: Request, res: Response, next: NextFunction) {
    try {
      await assertInventoryScope(req);
      const useCase = container.resolve(ListUninventoriedParcelsUseCase);
      const data = await useCase.execute(req.params.inventoryId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async closeInventory(req: Request, res: Response, next: NextFunction) {
    try {
      await assertInventoryScope(req);
      const useCase = container.resolve(CloseInventoryUseCase);
      const data = await useCase.execute(req.params.inventoryId, req.user!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  // ----- Spaces de rangement -----

  static async listSpaces(req: Request, res: Response, next: NextFunction) {
    try {
      await warehouseScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(ListWarehouseSpacesUseCase);
      const data = await useCase.execute(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async upsertSpaces(req: Request, res: Response, next: NextFunction) {
    try {
      await warehouseScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(UpsertWarehouseSpacesUseCase);
      const data = await useCase.execute(
        req.params.id,
        Array.isArray(req.body?.spaces) ? req.body.spaces : [],
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async moveParcelToSpace(req: Request, res: Response, next: NextFunction) {
    try {
      await parcelScope.assert(req.params.parcelId, scopeCtx(req));
      const useCase = container.resolve(MoveParcelToSpaceUseCase);
      const data = await useCase.execute(
        req.params.parcelId,
        (req.body?.spaceId as string | null | undefined) ?? null,
        req.user!.userId,
        req.body?.comment,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  // Enregistre en stock un colis trouve physiquement lors de l'inventaire
  // (extra non present dans le systeme).
  static async registerExtraInventoryParcel(req: Request, res: Response, next: NextFunction) {
    try {
      await assertInventoryScope(req);
      const useCase = container.resolve(RegisterExtraInventoryParcelUseCase);
      const data = await useCase.execute(req.params.inventoryId, req.body, req.user!.userId);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  // Remet en stock un colis precedemment marque absent / perdu.
  static async restockParcel(req: Request, res: Response, next: NextFunction) {
    try {
      await parcelScope.assert(req.params.parcelId, scopeCtx(req));
      const useCase = container.resolve(RestockParcelUseCase);
      const data = await useCase.execute(req.params.parcelId, req.body, req.user!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  // ----- Storage fee rules -----

  static async listStorageRules(req: Request, res: Response, next: NextFunction) {
    try {
      await warehouseScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(ListWarehouseStorageRulesUseCase);
      const data = await useCase.execute(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async createStorageRule(req: Request, res: Response, next: NextFunction) {
    try {
      await warehouseScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(CreateWarehouseStorageRuleUseCase);
      const data = await useCase.execute({ ...req.body, warehouseId: req.params.id });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async updateStorageRule(req: Request, res: Response, next: NextFunction) {
    try {
      await assertStorageRuleScope(req);
      const useCase = container.resolve(UpdateWarehouseStorageRuleUseCase);
      const data = await useCase.execute(req.params.ruleId, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async deleteStorageRule(req: Request, res: Response, next: NextFunction) {
    try {
      await assertStorageRuleScope(req);
      const useCase = container.resolve(DeleteWarehouseStorageRuleUseCase);
      await useCase.execute(req.params.ruleId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
