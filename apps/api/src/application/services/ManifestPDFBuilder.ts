import { inject, injectable } from 'tsyringe';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { MANIFEST_REPOSITORY, type IManifestRepository } from '../interfaces/IManifestRepository';
import { PDFService } from './PDFService';
import { loadPdfBranding } from './PdfBrandingService';

interface PDFResult {
  buffer: Buffer;
  filename: string;
}

/**
 * Construit les PDFs de bordereaux (envoi / reception / comparaison) pour
 * un conteneur. Reutilise par le controller HTTP et par le SendDailyReportEmail
 * UC (pieces jointes du mail).
 */
@injectable()
export class ManifestPDFBuilder {
  constructor(
    @inject(MANIFEST_REPOSITORY) private manifestRepo: IManifestRepository,
  ) {}

  async buildManifestPDF(manifestId: string): Promise<PDFResult> {
    const manifest = await prisma.shippingManifest.findUnique({
      where: { id: manifestId },
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
    if (!manifest) throw new NotFoundError('Bordereau', manifestId);

    const buffer = await PDFService.generateManifestPDF({
      // Logo + nom du tenant sur le bordereau (pieces jointes mail incluses).
      branding: await loadPdfBranding(manifest.container.organizationId),
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
        transit: l.transit ?? null,
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

    return { buffer, filename: `${manifest.number}.pdf` };
  }

  async buildComparisonPDF(containerId: string): Promise<PDFResult> {
    const comparison = await this.manifestRepo.getComparison(containerId);
    const containerData = await prisma.container.findUnique({
      where: { id: containerId },
      select: { id: true, designation: true, type: true, organizationId: true },
    });
    if (!containerData) throw new NotFoundError('Conteneur', containerId);

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

    const buffer = await PDFService.generateComparisonPDF({
      branding: await loadPdfBranding(containerData.organizationId),
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
      missingPhysical: [...missingFromAuto, ...missingFromAdmin],
      extraPhysical: [...extraFromAuto, ...extraFromAdmin],
    });

    return { buffer, filename: `comparaison-${containerData.designation}.pdf` };
  }
}
