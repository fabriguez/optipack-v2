import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { MANIFEST_REPOSITORY, type IManifestRepository } from '../../application/interfaces/IManifestRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { prisma } from '../../config/database';
import { PDFService } from '../../application/services/PDFService';
import { HistoryService } from '../../application/services/HistoryService';
import { RegisterExtraManifestParcelUseCase } from '../../application/use-cases/manifest/RegisterExtraManifestParcelUseCase';

function getRepo(): IManifestRepository {
  return container.resolve<IManifestRepository>(MANIFEST_REPOSITORY);
}

export class ManifestController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = getRepo();
      const { containerId, type, status } = req.query;
      const result = await repo.findAll(
        {
          containerId: containerId as string,
          type: type as string,
          status: status as string,
        },
        req.query as never,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = getRepo();
      const manifest = await repo.findById(req.params.id);
      if (!manifest) throw new NotFoundError('Bordereau', req.params.id);
      res.json({ success: true, data: manifest });
    } catch (err) {
      next(err);
    }
  }

  static async createDispatch(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = getRepo();
      const manifest = await repo.createDispatchManifest(req.params.containerId, req.user!.userId);
      const history = container.resolve(HistoryService);
      await history.recordContainer({
        containerId: req.params.containerId,
        action: 'DISPATCH_MANIFEST_CREATED',
        userId: req.user!.userId,
        comment: `Bordereau d'envoi ${manifest.number} genere`,
        changes: { manifestId: manifest.id, number: manifest.number, lineCount: manifest.lines.length },
      });
      res.status(201).json({ success: true, data: manifest });
    } catch (err) {
      next(err);
    }
  }

  static async createReception(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = getRepo();
      const manifest = await repo.createReceptionManifest(req.params.containerId, req.user!.userId);
      const history = container.resolve(HistoryService);
      await history.recordContainer({
        containerId: req.params.containerId,
        action: 'RECEPTION_MANIFEST_CREATED',
        userId: req.user!.userId,
        comment: `Bordereau de reception ${manifest.number} genere`,
        changes: { manifestId: manifest.id, number: manifest.number, lineCount: manifest.lines.length },
      });
      res.status(201).json({ success: true, data: manifest });
    } catch (err) {
      next(err);
    }
  }

  static async getComparison(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = getRepo();
      const comparison = await repo.getComparison(req.params.containerId);
      res.json({ success: true, data: comparison });
    } catch (err) {
      next(err);
    }
  }

  // ----------------------------------------------------------------
  // ECARTS marques par l'admin lors de la reception
  // ----------------------------------------------------------------

  static async listDiscrepancies(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = getRepo();
      const items = await repo.listDiscrepancies(req.params.containerId);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async addDiscrepancy(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = getRepo();
      const { type, parcelId, designation, trackingNumber, weight, comment } = req.body as {
        type: 'MISSING_PHYSICAL' | 'EXTRA_PHYSICAL';
        parcelId?: string;
        designation?: string;
        trackingNumber?: string;
        weight?: number;
        comment?: string;
      };
      if (!type || !['MISSING_PHYSICAL', 'EXTRA_PHYSICAL'].includes(type)) {
        return res.status(400).json({ success: false, message: 'type invalide' });
      }
      const created = await repo.addDiscrepancy({
        containerId: req.params.containerId,
        type,
        parcelId: parcelId ?? null,
        designation: designation ?? null,
        trackingNumber: trackingNumber ?? null,
        weight: weight ?? null,
        comment: comment ?? null,
        markedByUserId: req.user!.userId,
      });
      const history = container.resolve(HistoryService);
      await history.recordContainer({
        containerId: req.params.containerId,
        action: type === 'MISSING_PHYSICAL' ? 'DISCREPANCY_MISSING' : 'DISCREPANCY_EXTRA',
        userId: req.user!.userId,
        comment: comment ?? null,
        changes: { discrepancyId: created.id, parcelId, designation, trackingNumber },
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  }

  static async removeDiscrepancy(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = getRepo();
      await repo.removeDiscrepancy(req.params.discrepancyId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Enregistre un colis trouve PHYSIQUEMENT dans le conteneur mais non
   * enregistre en ligne. Cree un vrai Parcel + une ManifestDiscrepancy
   * EXTRA_PHYSICAL liee. Le colis apparait dans la comparaison et dans tous
   * les listings (magasin courant, historique container, etc).
   */
  static async registerExtraParcel(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(RegisterExtraManifestParcelUseCase);
      const parcel = await useCase.execute(req.params.containerId, req.body, req.user!.userId);
      res.status(201).json({ success: true, data: parcel });
    } catch (err) {
      next(err);
    }
  }

  // ----------------------------------------------------------------
  // PDF
  // ----------------------------------------------------------------

  static async getPDF(req: Request, res: Response, next: NextFunction) {
    try {
      const manifest = await prisma.shippingManifest.findUnique({
        where: { id: req.params.id },
        include: {
          lines: { orderBy: { addedAt: 'asc' } },
          container: {
            include: {
              departureAgency: { select: { name: true, city: true } },
              arrivalAgency: { select: { name: true, city: true } },
              parentContainer: { select: { designation: true } },
              transitRoute: { select: { name: true } },
            },
          },
        },
      });
      if (!manifest) throw new NotFoundError('Bordereau', req.params.id);

      const buf = await PDFService.generateManifestPDF({
        title: manifest.type === 'DISPATCH' ? "BORDEREAU D'ENVOI" : 'BORDEREAU DE RECEPTION',
        reference: manifest.number,
        containerDesignation: manifest.container.designation,
        containerType: manifest.container.type,
        isForwarding: manifest.container.isForwarding,
        parentContainerName: manifest.container.parentContainer?.designation ?? null,
        carrier: manifest.container.carrier ?? null,
        transitRoute: manifest.container.transitRoute?.name ?? null,
        departureAgency: `${manifest.container.departureAgency.name} (${manifest.container.departureAgency.city})`,
        arrivalAgency: `${manifest.container.arrivalAgency.name} (${manifest.container.arrivalAgency.city})`,
        date: manifest.createdAt,
        parcels: manifest.lines.map((l) => ({
          trackingNumber: l.trackingNumber || '-',
          designation: l.designation,
          weight: l.weight ? Number(l.weight) : null,
          volume: l.volume ? Number(l.volume) : null,
          destination: l.destination || '-',
          destinationCity: l.destinationCity ?? null,
          price: Number(l.price),
          clientName: l.clientName ?? '-',
          clientPhone: l.clientPhone ?? null,
          clientEmail: l.clientEmail ?? null,
          recipientName: l.recipientName ?? '-',
          recipientPhone: l.recipientPhone ?? null,
          recipientEmail: l.recipientEmail ?? null,
          advanceAmount: Number(l.advanceAmount),
          balanceAmount: Number(l.balanceAmount),
          status: l.status ?? undefined,
        })),
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${manifest.number}.pdf"`,
        'Content-Length': buf.length.toString(),
      });
      res.send(buf);
    } catch (err) {
      next(err);
    }
  }

  static async getComparisonPDF(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = getRepo();
      const comparison = await repo.getComparison(req.params.containerId);
      const containerData = await prisma.container.findUnique({
        where: { id: req.params.containerId },
        select: { id: true, designation: true, type: true },
      });
      if (!containerData) throw new NotFoundError('Conteneur', req.params.containerId);

      const dispatchById = new Map(comparison.dispatch.map((l) => [l.parcelId, l]));
      const receptionById = new Map(comparison.reception.map((l) => [l.parcelId, l]));

      type DiscRow = { trackingNumber: string; designation: string; weight: number | null; comment?: string | null };

      const missingFromAuto: DiscRow[] = comparison.missingParcelIds
        .map((pid) => dispatchById.get(pid))
        .filter((l): l is NonNullable<typeof l> => !!l)
        .map((l) => ({
          trackingNumber: l.parcelId ?? '-',
          designation: l.designation,
          weight: l.weight ? Number(l.weight) : null,
          comment: 'Detecte automatiquement',
        }));
      const missingFromAdmin: DiscRow[] = comparison.discrepancies
        .filter((d) => d.type === 'MISSING_PHYSICAL')
        .map((d) => ({
          trackingNumber: d.trackingNumber || '-',
          designation: d.designation || '-',
          weight: d.weight ? Number(d.weight) : null,
          comment: d.comment ?? null,
        }));
      const missingPhysical: DiscRow[] = [...missingFromAuto, ...missingFromAdmin];

      const extraFromAuto: DiscRow[] = comparison.extraParcelIds
        .map((pid) => receptionById.get(pid))
        .filter((l): l is NonNullable<typeof l> => !!l)
        .map((l) => ({
          trackingNumber: l.parcelId ?? '-',
          designation: l.designation,
          weight: l.weight ? Number(l.weight) : null,
          comment: 'Detecte automatiquement',
        }));
      const extraFromAdmin: DiscRow[] = comparison.discrepancies
        .filter((d) => d.type === 'EXTRA_PHYSICAL')
        .map((d) => ({
          trackingNumber: d.trackingNumber || '-',
          designation: d.designation || '-',
          weight: d.weight ? Number(d.weight) : null,
          comment: d.comment ?? null,
        }));
      const extraPhysical: DiscRow[] = [...extraFromAuto, ...extraFromAdmin];

      const buf = await PDFService.generateComparisonPDF({
        reference: `CMP-${containerData.designation}`,
        containerDesignation: containerData.designation,
        containerType: containerData.type,
        date: new Date(),
        dispatched: comparison.dispatch.map((l) => ({
          trackingNumber: l.parcelId ?? '-',
          designation: l.designation,
          weight: l.weight ? Number(l.weight) : null,
          destination: l.destination || '-',
          price: Number(l.price),
        })),
        received: comparison.reception.map((l) => ({
          trackingNumber: l.parcelId ?? '-',
          designation: l.designation,
          weight: l.weight ? Number(l.weight) : null,
          destination: l.destination || '-',
          price: Number(l.price),
        })),
        missingPhysical,
        extraPhysical,
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="comparaison-${containerData.designation}.pdf"`,
        'Content-Length': buf.length.toString(),
      });
      res.send(buf);
    } catch (err) {
      next(err);
    }
  }
}
