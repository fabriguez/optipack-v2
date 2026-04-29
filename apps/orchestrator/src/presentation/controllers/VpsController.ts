import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateVpsUseCase, createVpsSchema } from '../../application/use-cases/vps/CreateVpsUseCase';
import { VpsQueryService, updateVpsSchema } from '../../application/use-cases/vps/VpsQueryService';
import { AuditLogger } from '../../application/services/AuditLogger';

export class VpsController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createVpsSchema.parse(req.body);
      const useCase = container.resolve(CreateVpsUseCase);
      const vps = await useCase.execute(parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'VPS_CREATED',
        entityType: 'VPS',
        entityId: vps.id as string,
        payload: { host: parsed.host, username: parsed.username },
      });
      res.status(201).json({ success: true, data: vps });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const svc = container.resolve(VpsQueryService);
      const items = await svc.list({ status: req.query.status as string | undefined });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const svc = container.resolve(VpsQueryService);
      const vps = await svc.getById(req.params.id);
      res.json({ success: true, data: vps });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateVpsSchema.parse(req.body);
      const svc = container.resolve(VpsQueryService);
      const vps = await svc.update(req.params.id, parsed);
      await container.resolve(AuditLogger).log(req, {
        action: parsed.sshPrivateKey ? 'VPS_SSH_ROTATED' : 'VPS_UPDATED',
        entityType: 'VPS',
        entityId: req.params.id,
        // Ne JAMAIS logger la cle privee
        payload: { ...parsed, sshPrivateKey: parsed.sshPrivateKey ? '<rotated>' : undefined },
      });
      res.json({ success: true, data: vps });
    } catch (err) {
      next(err);
    }
  }

  static async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const svc = container.resolve(VpsQueryService);
      const result = await svc.testConnection(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const svc = container.resolve(VpsQueryService);
      const usage = await svc.getUsage(req.params.id);
      res.json({ success: true, data: usage });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const svc = container.resolve(VpsQueryService);
      await svc.delete(req.params.id);
      await container.resolve(AuditLogger).log(req, {
        action: 'VPS_DECOMMISSIONED',
        entityType: 'VPS',
        entityId: req.params.id,
      });
      res.json({ success: true, message: 'VPS decommissionne' });
    } catch (err) {
      next(err);
    }
  }
}
