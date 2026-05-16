import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { generateReference } from '@transitsoftservices/shared';
import { emailService } from '../../../infrastructure/email/EmailService';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { config } from '../../../config';

interface ParcelInGroupInput {
  designation: string;
  trackingFournisseur?: string;
  weight?: number;
  volume?: number;
  // destination (string ville) est derivee cote backend depuis l'agence,
  // mais l'appelant peut la passer en override.
  destination?: string;
  destinationAddress?: string;
  destinationAgencyId?: string;
  recipientId?: string;
  warehouseId?: string;
  spaceId?: string;
  transitRouteId?: string;
  origin?: string;
  category?: 'STANDARD' | 'DOCUMENT' | 'FOOD' | 'ELECTRONICS' | 'CLOTHING' | 'OTHER';
  isFragile?: boolean;
  isHazardous?: boolean;
  declaredValue?: number;
  price?: number;
  observation?: string;
}

interface CreateGroupInput {
  organizationId: string;
  clientId: string;
  /** Agence emettrice -- optionnel : si absent, derivee depuis warehouseId.agencyId. */
  agencyId?: string;
  /** Magasin de depart partage par tous les colis du groupe. */
  warehouseId?: string;
  /** Route de transit partagee par tous les colis du groupe. */
  transitRouteId?: string;
  label?: string;
  notes?: string;
  parcels: ParcelInGroupInput[];
}

function genTracking(): string {
  return `TST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

@injectable()
export class CreateParcelGroupUseCase {
  async execute(input: CreateGroupInput) {
    if (!input.parcels?.length) throw new BusinessError('Au moins un colis requis dans le groupe');
    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw new NotFoundError('Client', input.clientId);

    // Resolution de l'agence emettrice :
    //   1) si l'appelant fournit agencyId, on l'utilise (legacy)
    //   2) sinon on la derive depuis warehouseId.agencyId -- nouvelle regle
    //      metier : un groupe (et un colis) ne sont plus associes a une agence
    //      en propre, l'agence se deduit du magasin.
    let resolvedAgencyId = input.agencyId ?? null;
    if (!resolvedAgencyId) {
      if (!input.warehouseId) {
        throw new BusinessError(
          'Magasin de depart obligatoire pour deriver l\'agence du groupe.',
        );
      }
      const wh = await prisma.warehouse.findUnique({
        where: { id: input.warehouseId },
        select: { agencyId: true },
      });
      if (!wh) throw new NotFoundError('Magasin', input.warehouseId);
      resolvedAgencyId = wh.agencyId;
    }
    const agency = await prisma.agency.findUnique({ where: { id: resolvedAgencyId } });
    if (!agency) throw new NotFoundError('Agence', resolvedAgencyId);

    // Pre-charge les villes des agences referencees pour deriver le champ
    // `destination` (compat ascendante PDF/manifest) sans appel DB par colis.
    const agencyIds = Array.from(
      new Set(input.parcels.map((p) => p.destinationAgencyId).filter((x): x is string => !!x)),
    );
    const agencies = agencyIds.length
      ? await prisma.agency.findMany({
          where: { id: { in: agencyIds } },
          select: { id: true, city: true },
        })
      : [];
    const cityByAgency = new Map(agencies.map((a) => [a.id, a.city]));

    return prisma.$transaction(async (tx) => {
      const count = await tx.parcelGroup.count({ where: { agencyId: resolvedAgencyId } });
      const reference = generateReference('GRP', count + 1);

      const group = await tx.parcelGroup.create({
        data: {
          organizationId: input.organizationId,
          clientId: input.clientId,
          agencyId: resolvedAgencyId,
          reference,
          label: input.label ?? null,
          notes: input.notes ?? null,
          status: 'DRAFT',
        },
      });

      const createdParcels = [];
      for (const p of input.parcels) {
        const derivedDestination =
          p.destination ?? (p.destinationAgencyId ? cityByAgency.get(p.destinationAgencyId) : null) ?? '';
        const parcel = await tx.parcel.create({
          data: {
            organizationId: input.organizationId,
            trackingNumber: genTracking(),
            trackingFournisseur: p.trackingFournisseur || null,
            designation: p.designation,
            weight: p.weight ?? null,
            volume: p.volume ?? null,
            destination: derivedDestination,
            destinationAddress: p.destinationAddress ?? null,
            destinationAgencyId: p.destinationAgencyId ?? null,
            recipientId: p.recipientId ?? null,
            origin: p.origin ?? null,
            category: (p.category as any) ?? 'STANDARD',
            isFragile: !!p.isFragile,
            isHazardous: !!p.isHazardous,
            declaredValue: p.declaredValue ?? null,
            observation: p.observation ?? null,
            status: 'IN_STOCK',
            isPresent: true,
            price: p.price ?? 0,
            clientId: input.clientId,
            // Magasin et route propages depuis le contexte du groupe en
            // priorite ; chaque colis peut neanmoins surcharger localement
            // (cas rares de groupes heterogenes).
            warehouseId: p.warehouseId ?? input.warehouseId ?? null,
            originalWarehouseId: p.warehouseId ?? input.warehouseId ?? null,
            spaceId: p.spaceId ?? null,
            transitRouteId: p.transitRouteId ?? input.transitRouteId ?? null,
            warehouseEnteredAt: (p.warehouseId ?? input.warehouseId) ? new Date() : null,
            parcelGroupId: group.id,
          },
        });
        createdParcels.push(parcel);
      }

      return tx.parcelGroup.findUnique({
        where: { id: group.id },
        include: {
          // Ordre stable des colis : le frontend match les uploads photos par
          // index, donc on doit garantir l'ordre de creation.
          parcels: { orderBy: { createdAt: 'asc' } },
          client: true,
          agency: true,
        },
      });
    });
  }
}

@injectable()
export class AddParcelToGroupUseCase {
  async execute(groupId: string, parcel: ParcelInGroupInput, organizationId: string) {
    const group = await prisma.parcelGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundError('Groupe', groupId);
    if (group.status !== 'DRAFT') {
      throw new BusinessError('Le groupe est finalise, on ne peut plus y ajouter de colis');
    }
    return prisma.parcel.create({
      data: {
        organizationId,
        trackingNumber: genTracking(),
        designation: parcel.designation,
        weight: parcel.weight ?? null,
        volume: parcel.volume ?? null,
        destination: parcel.destination ?? '',
        category: (parcel.category as any) ?? 'STANDARD',
        status: 'IN_STOCK',
        isPresent: true,
        price: parcel.price ?? 0,
        clientId: group.clientId,
        warehouseId: parcel.warehouseId ?? null,
        originalWarehouseId: parcel.warehouseId ?? null,
        spaceId: parcel.spaceId ?? null,
        warehouseEnteredAt: parcel.warehouseId ? new Date() : null,
        parcelGroupId: groupId,
      },
    });
  }
}

@injectable()
export class GenerateGroupInvoiceUseCase {
  /**
   * Cree (ou recupere) la facture globale couvrant tous les colis du groupe.
   * - Total = somme des parcel.price + (storage fees a compute si applicable)
   * - Met a jour Parcel.invoiceId pour chaque colis du groupe
   * - Passe le groupe en status FINALIZED
   */
  async execute(groupId: string) {
    const group = await prisma.parcelGroup.findUnique({
      where: { id: groupId },
      include: { parcels: true, invoice: true, client: true, agency: true },
    });
    if (!group) throw new NotFoundError('Groupe', groupId);
    if (group.parcels.length === 0) throw new BusinessError('Groupe sans colis');

    if (group.invoice) return group.invoice;

    const total = group.parcels.reduce((sum, p) => sum + Number(p.price), 0);
    const count = await prisma.invoice.count({ where: { agencyId: group.agencyId } });
    const reference = generateReference('FCT-GRP', count + 1);

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceTx = await tx.invoice.create({
        data: {
          reference,
          clientId: group.clientId,
          agencyId: group.agencyId,
          totalAmount: total,
          netAmount: total,
          balance: total,
          parcelGroupId: group.id,
        },
      });
      await tx.parcel.updateMany({
        where: { parcelGroupId: group.id },
        data: { invoiceId: invoiceTx.id },
      });
      await tx.parcelGroup.update({
        where: { id: group.id },
        data: { status: 'FINALIZED' },
      });
      return invoiceTx;
    });

    // Emit invoice created event for notifications
    try {
      eventBus.emit({
        type: DomainEvents.INVOICE_CREATED,
        payload: {
          invoiceId: invoice.id,
          reference: invoice.reference,
          clientId: invoice.clientId,
          agencyId: invoice.agencyId,
          totalAmount: invoice.totalAmount,
        },
        timestamp: new Date(),
      });
    } catch (e) {
      // non blocking
    }

    return invoice;
  }
}

@injectable()
export class SendGroupInvoiceUseCase {
  async execute(groupId: string) {
    const group = await prisma.parcelGroup.findUnique({
      where: { id: groupId },
      include: {
        invoice: true,
        client: { select: { fullName: true, email: true } },
        parcels: true,
      },
    });
    if (!group) throw new NotFoundError('Groupe', groupId);
    if (!group.invoice) throw new BusinessError('Generez d\'abord la facture du groupe.');
    if (!group.client.email) {
      throw new BusinessError('Le client n\'a pas d\'email enregistre.');
    }
    const invoice = group.invoice;
    const total = Number(invoice.totalAmount);
    const url = `${config.webUrl}/invoices/${invoice.id}`;

    await emailService.send(
      group.client.email,
      `Votre facture groupee ${invoice.reference}`,
      [
        `<p>Bonjour <strong>${group.client.fullName}</strong>,</p>`,
        `<p>Votre facture pour le groupe <strong>${group.reference}</strong> est disponible.</p>`,
        `<p>Nombre de colis : <strong>${group.parcels.length}</strong></p>`,
        `<p>Total : <strong>${total.toLocaleString()} XAF</strong></p>`,
        `<p><a href="${url}">Voir la facture en ligne</a></p>`,
      ].join(''),
    );

    await prisma.parcelGroup.update({
      where: { id: groupId },
      data: { status: 'SENT' },
    });
    return { sentTo: group.client.email };
  }
}

@injectable()
export class ListParcelGroupsUseCase {
  async execute(filters: { clientId?: string; agencyId?: string; status?: string }) {
    return prisma.parcelGroup.findMany({
      where: {
        ...(filters.clientId && { clientId: filters.clientId }),
        ...(filters.agencyId && { agencyId: filters.agencyId }),
        ...(filters.status && { status: filters.status as any }),
      },
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
        agency: { select: { id: true, name: true } },
        invoice: { select: { id: true, reference: true, status: true, totalAmount: true } },
        _count: { select: { parcels: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}

@injectable()
export class GetParcelGroupUseCase {
  async execute(groupId: string) {
    const group = await prisma.parcelGroup.findUnique({
      where: { id: groupId },
      include: {
        client: true,
        agency: { select: { id: true, name: true } },
        invoice: true,
        parcels: {
          include: {
            warehouse: { select: { id: true, name: true } },
            transitRoute: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });
    if (!group) throw new NotFoundError('Groupe', groupId);
    return group;
  }
}
