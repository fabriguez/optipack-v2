import type { Request, Response } from 'express';
import { container } from 'tsyringe';
import { ReconcileCaddyUseCase } from '../../application/use-cases/caddy/ReconcileCaddyUseCase';

export class CaddyController {
  /**
   * POST /ops/caddy/reconcile
   * Body (optionnel) : { vpsId?: string }
   *
   * Rebuild la config Caddy depuis la BDD et la pousse :
   *  - sur le VPS specifie si vpsId est fourni
   *  - sinon sur tous les VPS non-decommissionnes
   *
   * Le tenant principal (isMain=true) est inclus avec son schema d'URL plat.
   * Le VPS "self" est servi via /load local, les autres via SSH.
   */
  static async reconcile(req: Request, res: Response) {
    const useCase = container.resolve(ReconcileCaddyUseCase);
    const vpsId = (req.body?.vpsId as string | undefined) ?? undefined;
    const results = await useCase.execute(vpsId);
    res.json({ success: true, data: results });
  }
}
