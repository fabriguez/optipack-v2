import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateClientUseCase } from '../../application/use-cases/client/CreateClientUseCase';
import { ListClientsUseCase } from '../../application/use-cases/client/ListClientsUseCase';
import { GetClientUseCase } from '../../application/use-cases/client/GetClientUseCase';
import { UpdateClientUseCase } from '../../application/use-cases/client/UpdateClientUseCase';
import { DeleteClientUseCase } from '../../application/use-cases/client/DeleteClientUseCase';
import {
  UploadClientImageUseCase,
  DeleteClientImageUseCase,
  GetClientImageUseCase,
} from '../../application/use-cases/client/ClientImageUseCases';
import {
  ExportClientsXlsxUseCase,
  ImportClientsXlsxUseCase,
} from '../../application/use-cases/client/ClientXlsxUseCases';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';
import { getOrgId } from '../middleware/tenantGuard';

export class ClientController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateClientUseCase);
      const client = await useCase.execute(req.body, getOrgId(req));
      res.status(201).json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListClientsUseCase);
      const agencyId = req.query.agencyId as string | undefined;
      const result = await useCase.execute(
        { organizationId: getOrgId(req), agencyId },
        req.query as never,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetClientUseCase);
      const client = await useCase.execute(req.params.id);
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Score de fiabilite client (BON / RISQUE / MAUVAIS) derive de :
   *  - Nombre de dettes OVERDUE actuelles
   *  - Ratio total OVERDUE / total cleared historique
   *  - Delai moyen de paiement (jours entre creation dette et clearance)
   *  - Cumul restant actuel
   * Aucun champ persiste : calcul a la demande.
   */
  static async getScore(req: Request, res: Response, next: NextFunction) {
    try {
      const { prisma } = await import('../../config/database');
      const clientId = req.params.id;
      const [overdueCount, activeDebts, clearedDebts] = await Promise.all([
        prisma.debt.count({ where: { clientId, type: 'CLIENT', status: 'OVERDUE' } }),
        prisma.debt.findMany({
          where: { clientId, type: 'CLIENT', status: { notIn: ['CANCELLED' as never, 'CLEARED' as never] } },
          select: { remainingAmount: true },
        }),
        prisma.debt.findMany({
          where: { clientId, type: 'CLIENT', status: 'CLEARED' },
          select: { createdAt: true, updatedAt: true },
        }),
      ]);

      const activeOutstanding = activeDebts.reduce((s, d) => s + Number(d.remainingAmount), 0);
      const clearedCount = clearedDebts.length;
      const totalDebtsHistorical = clearedCount + activeDebts.length;
      const overdueRatio = totalDebtsHistorical > 0 ? overdueCount / totalDebtsHistorical : 0;

      // Delai moyen paiement (jours).
      let avgPaymentDays: number | null = null;
      if (clearedDebts.length > 0) {
        const totalDays = clearedDebts.reduce(
          (s, d) => s + (d.updatedAt.getTime() - d.createdAt.getTime()) / (24 * 3600 * 1000),
          0,
        );
        avgPaymentDays = Math.round(totalDays / clearedDebts.length);
      }

      // Determination score :
      //  - GOOD : 0 OVERDUE + ratio < 5% + paye sous 14j en moyenne
      //  - RISKY : 1-2 OVERDUE OU ratio 5-25% OU paye 14-30j
      //  - BAD : 3+ OVERDUE OU ratio > 25% OU paye > 30j
      let score: 'GOOD' | 'RISKY' | 'BAD' = 'GOOD';
      const reasons: string[] = [];
      if (overdueCount >= 3) { score = 'BAD'; reasons.push(`${overdueCount} dettes en retard`); }
      else if (overdueCount > 0) { score = 'RISKY'; reasons.push(`${overdueCount} dette(s) en retard`); }
      if (overdueRatio > 0.25) { score = 'BAD'; reasons.push(`${Math.round(overdueRatio * 100)}% des dettes ont ete en retard`); }
      else if (overdueRatio > 0.05 && score === 'GOOD') { score = 'RISKY'; reasons.push(`${Math.round(overdueRatio * 100)}% des dettes ont ete en retard`); }
      if (avgPaymentDays !== null) {
        if (avgPaymentDays > 30) { score = 'BAD'; reasons.push(`Paiement moyen ${avgPaymentDays}j (lent)`); }
        else if (avgPaymentDays > 14 && score === 'GOOD') { score = 'RISKY'; reasons.push(`Paiement moyen ${avgPaymentDays}j`); }
      }
      if (reasons.length === 0) reasons.push('Aucune dette problematique');

      res.json({
        success: true,
        data: {
          score,
          overdueCount,
          activeDebtsCount: activeDebts.length,
          clearedCount,
          activeOutstanding,
          overdueRatio: Number(overdueRatio.toFixed(3)),
          avgPaymentDays,
          reasons,
        },
      });
    } catch (err) { next(err); }
  }

  /**
   * Cumul reste a payer du client : somme des soldes des factures non
   * annulees (status != CANCELLED) + somme des remainingAmount des dettes
   * actives (status != CANCELLED && != CLEARED). Inclus breakdown.
   */
  static async getOutstanding(req: Request, res: Response, next: NextFunction) {
    try {
      const { prisma } = await import('../../config/database');
      const clientId = req.params.id;
      const [invoiceAgg, debtAgg, unpaidInvoiceCount, activeDebtCount] = await Promise.all([
        prisma.invoice.aggregate({
          where: { clientId, isActive: true, status: { not: 'CANCELLED' as never } },
          _sum: { balance: true },
        }),
        prisma.debt.aggregate({
          where: {
            clientId,
            status: { notIn: ['CANCELLED' as never, 'CLEARED' as never] },
          },
          _sum: { remainingAmount: true },
        }),
        prisma.invoice.count({
          where: { clientId, isActive: true, status: { notIn: ['PAID' as never, 'CANCELLED' as never] } },
        }),
        prisma.debt.count({
          where: {
            clientId,
            status: { notIn: ['CANCELLED' as never, 'CLEARED' as never] },
          },
        }),
      ]);
      const invoiceOutstanding = Number(invoiceAgg._sum.balance ?? 0);
      const debtOutstanding = Number(debtAgg._sum.remainingAmount ?? 0);
      res.json({
        success: true,
        data: {
          invoiceOutstanding,
          debtOutstanding,
          totalOutstanding: invoiceOutstanding + debtOutstanding,
          unpaidInvoiceCount,
          activeDebtCount,
        },
      });
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateClientUseCase);
      const client = await useCase.execute(req.params.id, req.body);
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteClientUseCase);
      await useCase.execute(req.params.id);
      res.json({ success: true, message: 'Client desactive' });
    } catch (err) {
      next(err);
    }
  }

  // ----- Photos client (profile / idDocument / idDocumentBack) -----

  static async uploadImage(req: Request, res: Response, next: NextFunction) {
    try {
      const slot = req.params.slot as 'profile' | 'idDocument' | 'idDocumentBack';
      if (!['profile', 'idDocument', 'idDocumentBack'].includes(slot)) {
        throw new NotFoundError('Slot photo client', slot);
      }
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
      const useCase = container.resolve(UploadClientImageUseCase);
      const result = await useCase.execute(req.params.id, slot, file);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async deleteImage(req: Request, res: Response, next: NextFunction) {
    try {
      const slot = req.params.slot as 'profile' | 'idDocument' | 'idDocumentBack';
      if (!['profile', 'idDocument', 'idDocumentBack'].includes(slot)) {
        throw new NotFoundError('Slot photo client', slot);
      }
      const useCase = container.resolve(DeleteClientImageUseCase);
      const result = await useCase.execute(req.params.id, slot);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getImage(req: Request, res: Response, next: NextFunction) {
    try {
      const slot = req.params.slot as 'profile' | 'idDocument' | 'idDocumentBack';
      if (!['profile', 'idDocument', 'idDocumentBack'].includes(slot)) {
        throw new NotFoundError('Slot photo client', slot);
      }
      const useCase = container.resolve(GetClientImageUseCase);
      const obj = await useCase.execute(req.params.id, slot);
      if (!obj) return res.status(404).end();
      res.setHeader('Content-Type', obj.contentType);
      res.setHeader('Content-Length', String(obj.size));
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      obj.stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /** GET /clients/export.xlsx?agencyId=... */
  static async exportXlsx(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ExportClientsXlsxUseCase);
      const agencyId = (req.query.agencyId as string | undefined) || undefined;
      const { buffer, fileName } = await useCase.execute(getOrgId(req), agencyId);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  /** POST /clients/import (multipart, "file") -> rapport {created, skipped, errors[]} */
  static async importXlsx(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;
      if (!file?.buffer) {
        throw new BusinessError('Fichier XLSX manquant (champ "file")');
      }
      const useCase = container.resolve(ImportClientsXlsxUseCase);
      const result = await useCase.execute(getOrgId(req), file.buffer, {
        defaultAgencyId: (req.body?.defaultAgencyId as string | undefined) || undefined,
        dryRun: req.body?.dryRun === 'true' || req.body?.dryRun === true,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
