import type { NextFunction, Request, Response } from 'express';
import { container } from 'tsyringe';
import { UfwUseCases } from '../../application/use-cases/ufw/UfwUseCases';

/**
 * Endpoints UFW : pilote le firewall d'un VPS via SSH depuis le dashboard ops.
 *
 * IMPORTANT (arch) : avec containers bindes sur 127.0.0.1 + Caddy en frontal,
 * creer un tenant n'ajoute aucun port a UFW. Ces endpoints servent au
 * bootstrap (baseline 22/80/443), au debug temporaire, et a l'audit.
 */
export class UfwController {
  static async status(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UfwUseCases);
      const out = await useCase.getStatus(req.params.id!);
      res.json({ success: true, data: out });
    } catch (err) {
      next(err);
    }
  }

  static async enable(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UfwUseCases);
      const out = await useCase.enable(req.params.id!);
      res.json({ success: true, data: out });
    } catch (err) {
      next(err);
    }
  }

  static async disable(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UfwUseCases);
      const out = await useCase.disable(req.params.id!);
      res.json({ success: true, data: out });
    } catch (err) {
      next(err);
    }
  }

  static async addRule(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UfwUseCases);
      const { action, spec } = req.body as { action: string; spec: string };
      if (!['allow', 'deny', 'reject', 'limit'].includes(action ?? '')) {
        return res
          .status(400)
          .json({ success: false, message: 'action doit etre allow|deny|reject|limit' });
      }
      if (!spec || typeof spec !== 'string') {
        return res
          .status(400)
          .json({ success: false, message: 'spec requis (ex: "443/tcp" ou "from 1.2.3.4 to any port 22")' });
      }
      const out = await useCase.addRule(req.params.id!, { action: action as 'allow' | 'deny' | 'reject' | 'limit', spec });
      res.json({ success: true, data: out });
    } catch (err) {
      next(err);
    }
  }

  static async deleteRule(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UfwUseCases);
      const index = Number(req.params.index);
      const out = await useCase.deleteRule(req.params.id!, index);
      res.json({ success: true, data: out });
    } catch (err) {
      next(err);
    }
  }

  static async applyBaseline(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UfwUseCases);
      const out = await useCase.applyBaseline(req.params.id!);
      res.json({ success: true, data: out });
    } catch (err) {
      next(err);
    }
  }
}
