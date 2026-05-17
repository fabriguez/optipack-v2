import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateAgencyUseCase } from '../../application/use-cases/agency/CreateAgencyUseCase';
import { ListAgenciesUseCase } from '../../application/use-cases/agency/ListAgenciesUseCase';
import { GetAgencyUseCase } from '../../application/use-cases/agency/GetAgencyUseCase';
import { UpdateAgencyUseCase } from '../../application/use-cases/agency/UpdateAgencyUseCase';
import { DeleteAgencyUseCase } from '../../application/use-cases/agency/DeleteAgencyUseCase';
import { CreateAgencyChargeUseCase } from '../../application/use-cases/agency/CreateAgencyChargeUseCase';
import { UpdateAgencyChargeUseCase } from '../../application/use-cases/agency/UpdateAgencyChargeUseCase';
import { ListAgencyChargesUseCase } from '../../application/use-cases/agency/ListAgencyChargesUseCase';
import { PayAgencyChargeUseCase } from '../../application/use-cases/agency/PayAgencyChargeUseCase';
import { DeleteAgencyChargeUseCase } from '../../application/use-cases/agency/DeleteAgencyChargeUseCase';
import { UploadAgencyImageUseCase } from '../../application/use-cases/agency/UploadAgencyImageUseCase';
import { DeleteAgencyImageUseCase } from '../../application/use-cases/agency/DeleteAgencyImageUseCase';
import { SetAgencyOpeningHoursUseCase } from '../../application/use-cases/agency/SetAgencyOpeningHoursUseCase';
import { AgencyBreakdownUseCase } from '../../application/use-cases/agency/AgencyBreakdownUseCase';
import { DailyReportService } from '../../application/services/DailyReportService';
import { DailyReportPDFService } from '../../application/services/DailyReportPDFService';
import { StorageService } from '../../infrastructure/storage/StorageService';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { getOrgId } from '../middleware/tenantGuard';

export class AgencyController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateAgencyUseCase);
      const agency = await useCase.execute(req.body, getOrgId(req));
      res.status(201).json({ success: true, data: agency });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListAgenciesUseCase);
      const result = await useCase.execute(getOrgId(req), req.query as never);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetAgencyUseCase);
      const agency = await useCase.execute(req.params.id);
      res.json({ success: true, data: agency });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateAgencyUseCase);
      const agency = await useCase.execute(req.params.id, req.body);
      res.json({ success: true, data: agency });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteAgencyUseCase);
      await useCase.execute(req.params.id);
      res.json({ success: true, message: 'Agence desactivee' });
    } catch (err) {
      next(err);
    }
  }

  // -----------------------------------------------------------------
  // Charges recurrentes
  // -----------------------------------------------------------------

  static async listCharges(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListAgencyChargesUseCase);
      const period = (req.query.period as string | undefined) ?? undefined;
      const data = await useCase.execute(req.params.id, period);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async createCharge(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateAgencyChargeUseCase);
      const charge = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.status(201).json({ success: true, data: charge });
    } catch (err) {
      next(err);
    }
  }

  static async updateCharge(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateAgencyChargeUseCase);
      const charge = await useCase.execute(req.params.chargeId, req.body);
      res.json({ success: true, data: charge });
    } catch (err) {
      next(err);
    }
  }

  static async deleteCharge(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteAgencyChargeUseCase);
      await useCase.execute(req.params.chargeId);
      res.json({ success: true, message: 'Charge desactivee ou supprimee' });
    } catch (err) {
      next(err);
    }
  }

  static async payCharge(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(PayAgencyChargeUseCase);
      const expense = await useCase.execute(req.params.chargeId, req.body, req.user!.userId);
      res.status(201).json({ success: true, data: expense });
    } catch (err) {
      next(err);
    }
  }

  // -----------------------------------------------------------------
  // Image agence
  // -----------------------------------------------------------------

  static async uploadImage(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
      }
      const useCase = container.resolve(UploadAgencyImageUseCase);
      const agency = await useCase.execute(req.params.id, file);
      res.json({ success: true, data: agency });
    } catch (err) {
      next(err);
    }
  }

  static async deleteImage(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteAgencyImageUseCase);
      const agency = await useCase.execute(req.params.id);
      res.json({ success: true, data: agency });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Sert l'image stockee dans MinIO. Endpoint PUBLIC (pas d'auth requise) car
   * il est consomme par les balises <img> qui n'envoient pas le token. Les
   * images d'agence ne sont pas sensibles.
   */
  static async getImage(req: Request, res: Response, next: NextFunction) {
    try {
      const agency = await prisma.agency.findUnique({
        where: { id: req.params.id },
        select: { imageKey: true },
      });
      if (!agency || !agency.imageKey) {
        throw new NotFoundError('Image', req.params.id);
      }
      const storage = container.resolve(StorageService);
      const obj = await storage.getObject(agency.imageKey);
      if (!obj) throw new NotFoundError('Image', req.params.id);
      res.set({
        'Content-Type': obj.contentType,
        'Content-Length': String(obj.size),
        'Cache-Control': 'public, max-age=3600',
        // L'image est consommee par <img> sur l'origine du frontend (port different).
        // Helmet pose CORP: same-origin par defaut, ce qui bloque <img> cross-origin.
        'Cross-Origin-Resource-Policy': 'cross-origin',
      });
      obj.stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  // ----- Breakdowns financiers -----

  static async breakdown(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(AgencyBreakdownUseCase);
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const result = await useCase.execute({ agencyId: req.params.id, from, to });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // ----- Rapports journaliers -----

  static async listDailyReports(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.agencyDailyReport.findMany({
        where: { agencyId: req.params.id },
        orderBy: { date: 'desc' },
        take: 60,
        include: { _count: { select: { attachments: true } } },
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async getDailyReport(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await prisma.agencyDailyReport.findUnique({
        where: { id: req.params.reportId },
        include: { attachments: true, closedByUser: { select: { id: true, firstName: true, lastName: true } } },
      });
      if (!item) throw new NotFoundError('Rapport journalier', req.params.reportId);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async generateDailyReport(req: Request, res: Response, next: NextFunction) {
    try {
      const svc = container.resolve(DailyReportService);
      const date = req.body?.date ? new Date(req.body.date) : new Date();
      const result = await svc.generate(req.params.id, date);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async updateDailyReportObservation(req: Request, res: Response, next: NextFunction) {
    try {
      const observation = (req.body?.observation as string | undefined) ?? null;
      const status = req.body?.status as 'CLOSED' | 'AMENDED' | undefined;
      const updated = await prisma.agencyDailyReport.update({
        where: { id: req.params.reportId },
        data: {
          observation,
          ...(status === 'CLOSED' && {
            status: 'CLOSED',
            closedAt: new Date(),
            closedBy: req.user!.userId,
          }),
          ...(status === 'AMENDED' && { status: 'AMENDED' }),
        },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async getDailyReportPDF(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await prisma.agencyDailyReport.findUnique({
        where: { id: req.params.reportId },
        include: {
          attachments: { orderBy: { createdAt: 'asc' } },
          closedByUser: { select: { firstName: true, lastName: true } },
        },
      });
      if (!report) throw new NotFoundError('Rapport journalier', req.params.reportId);

      // Recupere le logo organisation depuis MinIO si dispo (le payload n'a
      // que l'URL ; le PDF a besoin du buffer pour l'embarquer).
      const payload = report.payload as any;
      let logoBuffer: Buffer | null = null;
      const logoUrl: string | undefined = payload?.organization?.logoUrl;
      if (logoUrl) {
        try {
          const storage = container.resolve(StorageService);
          // logoUrl peut etre une URL absolue ou une key MinIO ; on tente la key.
          const key = logoUrl.split('/uploads/object/').pop() ?? logoUrl;
          const obj = await storage.getObject(key);
          if (obj) {
            const chunks: Buffer[] = [];
            for await (const ch of obj.stream as any) chunks.push(ch as Buffer);
            logoBuffer = Buffer.concat(chunks);
          }
        } catch { /* logo optionnel */ }
      }

      const pdfService = container.resolve(DailyReportPDFService);
      const buffer = await pdfService.generate({
        reportDate: report.date,
        status: report.status,
        observation: report.observation,
        closedAt: report.closedAt,
        closedByName: report.closedByUser
          ? `${report.closedByUser.firstName} ${report.closedByUser.lastName}`
          : null,
        payload,
        attachments: report.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          caption: a.caption,
          contentType: a.contentType,
          createdAt: a.createdAt.toISOString(),
        })),
        logoBuffer,
      });

      const filename = `rapport-${new Date(report.date).toISOString().slice(0, 10)}.pdf`;
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `inline; filename="${filename}"`,
      });
      res.end(buffer);
    } catch (err) {
      next(err);
    }
  }

  static async addDailyReportAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const { url, storageKey, fileName, contentType, size, caption } = req.body;
      if (!url) return res.status(400).json({ success: false, message: 'url requis' });
      const att = await prisma.agencyDailyReportAttachment.create({
        data: {
          reportId: req.params.reportId,
          url,
          storageKey: storageKey ?? null,
          fileName: fileName ?? null,
          contentType: contentType ?? null,
          size: size ?? null,
          caption: caption ?? null,
          uploadedBy: req.user!.userId,
        },
      });
      res.status(201).json({ success: true, data: att });
    } catch (err) {
      next(err);
    }
  }

  static async updateDailyReportAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const att = await prisma.agencyDailyReportAttachment.findUnique({
        where: { id: req.params.attachmentId },
      });
      if (!att || att.reportId !== req.params.reportId) {
        return res.status(404).json({ success: false, message: 'Piece jointe introuvable' });
      }
      const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : null;
      const updated = await prisma.agencyDailyReportAttachment.update({
        where: { id: att.id },
        data: { caption: caption || null },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async deleteDailyReportAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const att = await prisma.agencyDailyReportAttachment.findUnique({
        where: { id: req.params.attachmentId },
      });
      if (!att || att.reportId !== req.params.reportId) {
        return res.status(404).json({ success: false, message: 'Piece jointe introuvable' });
      }
      await prisma.agencyDailyReportAttachment.delete({ where: { id: att.id } });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  // ----- Documents et historique d'une charge -----

  static async listChargeDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const docs = await prisma.agencyChargeDocument.findMany({
        where: { chargeId: req.params.chargeId },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: docs });
    } catch (err) {
      next(err);
    }
  }

  static async addChargeDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const charge = await prisma.agencyCharge.findUnique({ where: { id: req.params.chargeId } });
      if (!charge) throw new NotFoundError('Charge', req.params.chargeId);

      const { url, storageKey, fileName, contentType, size, caption } = req.body as {
        url: string;
        storageKey?: string;
        fileName?: string;
        contentType?: string;
        size?: number;
        caption?: string;
      };
      if (!url) {
        return res.status(400).json({ success: false, message: 'url requis' });
      }

      const doc = await prisma.agencyChargeDocument.create({
        data: {
          chargeId: charge.id,
          url,
          storageKey: storageKey ?? null,
          fileName: fileName ?? null,
          contentType: contentType ?? null,
          size: size ?? null,
          caption: caption ?? null,
          uploadedBy: req.user!.userId,
        },
      });

      await prisma.agencyChargeHistory.create({
        data: {
          chargeId: charge.id,
          action: 'DOCUMENT_ADDED',
          userId: req.user!.userId,
          changes: { documentId: doc.id, fileName: doc.fileName, url: doc.url } as any,
        },
      });

      res.status(201).json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  }

  static async deleteChargeDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await prisma.agencyChargeDocument.findUnique({ where: { id: req.params.documentId } });
      if (!doc || doc.chargeId !== req.params.chargeId) {
        return res.status(404).json({ success: false, message: 'Document introuvable' });
      }
      await prisma.agencyChargeDocument.delete({ where: { id: doc.id } });
      await prisma.agencyChargeHistory.create({
        data: {
          chargeId: doc.chargeId,
          action: 'DOCUMENT_REMOVED',
          userId: req.user!.userId,
          changes: { documentId: doc.id, fileName: doc.fileName } as any,
        },
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  static async listChargeHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.agencyChargeHistory.findMany({
        where: { chargeId: req.params.chargeId },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  // ----- Horaires d'ouverture -----

  static async listOpeningHours(req: Request, res: Response, next: NextFunction) {
    try {
      const hours = await prisma.agencyOpeningHours.findMany({
        where: { agencyId: req.params.id },
        orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
      });
      res.json({ success: true, data: hours });
    } catch (err) {
      next(err);
    }
  }

  static async setOpeningHours(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(SetAgencyOpeningHoursUseCase);
      const hours = Array.isArray(req.body?.hours) ? req.body.hours : [];
      const result = await useCase.execute(req.params.id, hours);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
