import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import {
  NotFoundError,
  BusinessError,
} from '../../domain/errors/BusinessError';

/**
 * Extension du ClientPortalController : dashboard, detail colis enrichi,
 * declaration de paiement (MoMo manuel via Notification IN_APP a l'agence),
 * notifications read, messagerie support client.
 *
 * Tous les endpoints attendent que `authenticateClient` ait peuple
 * `req.clientPortal` (sinon 401 deja renvoye par le middleware).
 */
export class ClientPortalExtraController {
  /**
   * Dashboard d'accueil : compteurs colis par statut, factures impayees,
   * dettes actives, notifs non-lues, conversations ouvertes, 5 derniers colis.
   * Une seule requete groupee (Promise.all) pour limiter la latence portail.
   */
  static async dashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;
      const baseParcels = { clientId, isDeleted: false };

      const [
        totalParcels,
        inTransitParcels,
        deliveredParcels,
        arrivedParcels,
        inStorageParcels,
        unpaidInvoices,
        unpaidAgg,
        activeDebtsAgg,
        unreadNotifications,
        openConversations,
        recentParcels,
        recentNotifications,
        loyaltyClient,
      ] = await Promise.all([
        prisma.parcel.count({ where: baseParcels }),
        prisma.parcel.count({
          where: { ...baseParcels, status: { in: ['IN_TRANSIT', 'LOADING'] } },
        }),
        prisma.parcel.count({
          where: { ...baseParcels, status: 'DELIVERED' },
        }),
        prisma.parcel.count({
          where: { ...baseParcels, status: { in: ['ARRIVED', 'RECEIVED'] } },
        }),
        // Colis en magasinage : presents en stock magasin, en attente d'expedition.
        prisma.parcel.count({
          where: { ...baseParcels, status: 'IN_STOCK' },
        }),
        prisma.invoice.count({
          where: {
            clientId,
            isActive: true,
            status: { in: ['UNPAID', 'PARTIAL'] },
          },
        }),
        prisma.invoice.aggregate({
          where: {
            clientId,
            isActive: true,
            status: { in: ['UNPAID', 'PARTIAL'] },
          },
          _sum: { balance: true },
        }),
        prisma.debt.aggregate({
          where: { clientId, status: 'ACTIVE' },
          _sum: { remainingAmount: true },
        }),
        prisma.notification.count({
          where: { clientId, readAt: null },
        }),
        prisma.chatConversation.count({
          where: { clientId, status: 'OPEN' },
        }),
        prisma.parcel.findMany({
          where: baseParcels,
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            trackingNumber: true,
            designation: true,
            status: true,
            destination: true,
            updatedAt: true,
          },
        }),
        // 5 dernieres notifications du client (lues ou non) pour le fil d'accueil.
        prisma.notification.findMany({
          where: { clientId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            title: true,
            message: true,
            type: true,
            readAt: true,
            createdAt: true,
          },
        }),
        // Points de fidelite + palier courant pour la carte stats dashboard.
        prisma.client.findUnique({
          where: { id: clientId },
          select: { loyaltyPoints: true, loyaltyTier: true },
        }),
      ]);

      const unpaidBalance = Number(unpaidAgg._sum.balance ?? 0);
      const debtsRemaining = Number(activeDebtsAgg._sum.remainingAmount ?? 0);

      res.json({
        success: true,
        data: {
          parcels: {
            total: totalParcels,
            inTransit: inTransitParcels,
            arrived: arrivedParcels,
            inStorage: inStorageParcels,
            delivered: deliveredParcels,
          },
          invoices: {
            unpaidCount: unpaidInvoices,
            unpaidBalance,
          },
          debts: {
            remaining: debtsRemaining,
          },
          loyalty: {
            points: loyaltyClient?.loyaltyPoints ?? 0,
            tier: loyaltyClient?.loyaltyTier ?? 'STANDARD',
          },
          // Solde a payer consolide : factures impayees + dettes actives.
          balanceDue: unpaidBalance + debtsRemaining,
          inbox: {
            unreadNotifications,
            openConversations,
          },
          recentParcels,
          recentNotifications,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Detail enrichi d'un colis (timeline + paiements + facture + destinataire +
   * derniere localisation logique). Pas de GPS reel : on remonte l'agence/magasin
   * courant + le conteneur + la route. Les `histories` font office de timeline.
   */
  static async parcelDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;
      const { trackingNumber } = req.params;

      const parcel = await prisma.parcel.findUnique({
        where: { trackingNumber },
        include: {
          recipient: { select: { fullName: true, phone: true } },
          warehouse: {
            select: {
              id: true,
              name: true,
              agency: {
                select: {
                  id: true,
                  name: true,
                  city: true,
                  country: true,
                  googleMapsLink: true,
                },
              },
            },
          },
          destinationAgency: {
            select: {
              id: true,
              name: true,
              city: true,
              country: true,
              googleMapsLink: true,
            },
          },
          container: {
            select: {
              id: true,
              designation: true,
              status: true,
              estimatedArrivalDate: true,
              // Agences depart/arrivee du conteneur : affichage du contexte
              // statut ("en transit de X vers Y", "arrive a Y") cote app.
              departureAgency: { select: { id: true, name: true, city: true } },
              arrivalAgency: { select: { id: true, name: true, city: true } },
              transitRoute: {
                select: {
                  id: true,
                  name: true,
                  departureCity: true,
                  arrivalCity: true,
                  type: true,
                },
              },
            },
          },
          // Apres arrivee/dechargement, le colis peut etre detache du conteneur
          // courant -> on garde lastContainer pour conserver le contexte
          // "arrive a <agence>".
          lastContainer: {
            select: {
              id: true,
              designation: true,
              status: true,
              estimatedArrivalDate: true,
              departureAgency: { select: { id: true, name: true, city: true } },
              arrivalAgency: { select: { id: true, name: true, city: true } },
            },
          },
          transitRoute: {
            select: {
              id: true,
              name: true,
              departureCity: true,
              arrivalCity: true,
              type: true,
            },
          },
          invoice: {
            select: {
              id: true,
              reference: true,
              totalAmount: true,
              paidAmount: true,
              balance: true,
              status: true,
              discount: true,
              tva: true,
              netAmount: true,
            },
          },
          payments: {
            where: { isVoided: false },
            select: {
              id: true,
              reference: true,
              amount: true,
              discount: true,
              discountReason: true,
              paymentMethod: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          images: {
            select: { id: true, url: true, caption: true, isPrimary: true },
            orderBy: { sortOrder: 'asc' },
          },
          histories: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              action: true,
              statusBefore: true,
              statusAfter: true,
              locationBefore: true,
              locationAfter: true,
              actorName: true,
              actorType: true,
              comment: true,
              createdAt: true,
              warehouse: { select: { name: true } },
            },
          },
        },
      });

      if (!parcel || parcel.clientId !== clientId || parcel.isDeleted) {
        throw new NotFoundError('Colis', trackingNumber);
      }

      // Frais de magasinage live + lignes detaillees (magasin / phase / periode)
      // pour ce colis. Source de verite : ParcelStorageCharge.
      const { computeStorageFeesForParcels } = await import(
        '../routes/v1/invoice.routes'
      );
      const storage = await computeStorageFeesForParcels([parcel.id]);
      const s = storage.perParcel.get(parcel.id);
      const storageLines = (s?.lines ?? []).filter((l) => l.feeAmount > 0);

      const transportFee = Number(parcel.price ?? 0);
      const storageFee = Number(s?.fee ?? 0);
      const invoiceDiscount = Number(parcel.invoice?.discount ?? 0);

      // Mouvements financiers du colis : tous les flux (debits = frais,
      // credits = paiements / remises) sur une timeline unique triee.
      type Movement = {
        id: string;
        type: 'TRANSPORT' | 'STORAGE' | 'PAYMENT' | 'DISCOUNT';
        amount: number;
        direction: 'debit' | 'credit';
        date: Date;
        label: string | null;
        reference: string | null;
      };
      const movements: Movement[] = [];

      if (transportFee > 0) {
        movements.push({
          id: `transport-${parcel.id}`,
          type: 'TRANSPORT',
          amount: transportFee,
          direction: 'debit',
          date: parcel.createdAt,
          label: 'Frais de transport',
          reference: null,
        });
      }
      for (const l of storageLines) {
        movements.push({
          id: `storage-${l.id}`,
          type: 'STORAGE',
          amount: Number(l.feeAmount),
          direction: 'debit',
          date: l.endedAt ?? l.stoppedAt ?? l.startedAt,
          label: l.warehouseName ?? 'Magasinage',
          reference: null,
        });
      }
      for (const pay of parcel.payments) {
        movements.push({
          id: pay.id,
          type: 'PAYMENT',
          amount: Number(pay.amount ?? 0),
          direction: 'credit',
          date: pay.createdAt,
          label: pay.paymentMethod,
          reference: pay.reference,
        });
        if (Number(pay.discount ?? 0) > 0) {
          movements.push({
            id: `discount-${pay.id}`,
            type: 'DISCOUNT',
            amount: Number(pay.discount),
            direction: 'credit',
            date: pay.createdAt,
            label: pay.discountReason ?? 'Remise',
            reference: null,
          });
        }
      }
      movements.sort((a, b) => a.date.getTime() - b.date.getTime());

      res.json({
        success: true,
        data: {
          ...parcel,
          fees: {
            transport: transportFee,
            storage: storageFee,
            discount: invoiceDiscount,
          },
          storageLines,
          financialMovements: movements,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Declaration de paiement (MoMo / virement) par le client.
   * Pas de creation de Payment immutable ici : on cree une Notification
   * IN_APP pour l'agence destinataire (agence emettrice de la facture) afin
   * qu'un agent valide et enregistre le vrai paiement via le flux normal.
   * Le client recoit lui aussi une notification de suivi.
   */
  static async declarePayment(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { clientId } = req.clientPortal!;
      const { invoiceId, amount, paymentMethod, transactionReference, note } =
        req.body as {
          invoiceId?: string;
          amount?: number;
          paymentMethod?: string;
          transactionReference?: string;
          note?: string;
        };

      if (!invoiceId || !amount || !paymentMethod) {
        throw new BusinessError(
          'invoiceId, amount et paymentMethod sont requis',
        );
      }
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new BusinessError('Montant invalide');
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          reference: true,
          clientId: true,
          agencyId: true,
          balance: true,
          status: true,
        },
      });
      if (!invoice || invoice.clientId !== clientId) {
        throw new NotFoundError('Facture', invoiceId);
      }
      if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
        throw new BusinessError('Facture deja soldee ou annulee');
      }
      if (amt > Number(invoice.balance)) {
        throw new BusinessError(
          `Le montant declare depasse le solde restant (${invoice.balance}).`,
        );
      }

      const meta = {
        kind: 'PAYMENT_DECLARATION',
        invoiceId: invoice.id,
        invoiceReference: invoice.reference,
        amount: amt,
        paymentMethod,
        transactionReference: transactionReference ?? null,
        note: note ?? null,
        declaredAt: new Date().toISOString(),
      };

      const [agencyNotif, clientNotif] = await prisma.$transaction([
        prisma.notification.create({
          data: {
            agencyId: invoice.agencyId,
            title: `Declaration de paiement ${invoice.reference}`,
            message: `Le client declare avoir paye ${amt} via ${paymentMethod}.${
              transactionReference ? ` Ref: ${transactionReference}.` : ''
            }`,
            type: 'IN_APP',
            status: 'SENT',
            sentAt: new Date(),
            metadata: meta,
          },
        }),
        prisma.notification.create({
          data: {
            clientId,
            title: `Paiement declare pour ${invoice.reference}`,
            message:
              "Votre declaration est en attente de validation par l'agence.",
            type: 'IN_APP',
            status: 'SENT',
            sentAt: new Date(),
            metadata: meta,
          },
        }),
      ]);

      res.status(201).json({
        success: true,
        data: {
          agencyNotificationId: agencyNotif.id,
          notificationId: clientNotif.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async markNotificationRead(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { clientId } = req.clientPortal!;
      const { id } = req.params;
      const notif = await prisma.notification.findUnique({ where: { id } });
      if (!notif || notif.clientId !== clientId) {
        throw new NotFoundError('Notification', id);
      }
      const updated = await prisma.notification.update({
        where: { id },
        data: { readAt: new Date(), status: 'READ' },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async markAllNotificationsRead(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { clientId } = req.clientPortal!;
      const result = await prisma.notification.updateMany({
        where: { clientId, readAt: null },
        data: { readAt: new Date(), status: 'READ' },
      });
      res.json({ success: true, data: { count: result.count } });
    } catch (err) {
      next(err);
    }
  }

  // ============================================================
  // MESSAGERIE (chat support client <-> agence)
  // ============================================================

  static async listConversations(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { clientId } = req.clientPortal!;
      const conversations = await prisma.chatConversation.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        include: {
          agency: { select: { id: true, name: true } },
          assignedUser: {
            select: { id: true, firstName: true, lastName: true },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              message: true,
              senderType: true,
              isRead: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              messages: { where: { isRead: false, senderType: 'USER' } },
            },
          },
        },
      });
      res.json({ success: true, data: conversations });
    } catch (err) {
      next(err);
    }
  }

  static async createConversation(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { clientId } = req.clientPortal!;
      const { agencyId, firstMessage } = req.body as {
        agencyId?: string;
        firstMessage?: string;
      };

      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { agencyId: true },
      });

      // Resolution agence : preference explicite -> agence du client -> 1ere active.
      let resolvedAgencyId = agencyId ?? client?.agencyId ?? null;
      if (!resolvedAgencyId) {
        const fallback = await prisma.agency.findFirst({
          where: { isActive: true },
          select: { id: true },
        });
        if (!fallback) throw new BusinessError('Aucune agence disponible');
        resolvedAgencyId = fallback.id;
      }

      const conversation = await prisma.chatConversation.create({
        data: {
          clientId,
          agencyId: resolvedAgencyId,
          status: 'OPEN',
          ...(firstMessage
            ? {
                messages: {
                  create: {
                    senderClientId: clientId,
                    senderType: 'CLIENT',
                    message: firstMessage,
                  },
                },
              }
            : {}),
        },
        include: {
          agency: { select: { id: true, name: true } },
          messages: true,
        },
      });

      res.status(201).json({ success: true, data: conversation });
    } catch (err) {
      next(err);
    }
  }

  static async listMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;
      const { id } = req.params;

      const conv = await prisma.chatConversation.findUnique({
        where: { id },
        select: { id: true, clientId: true },
      });
      if (!conv || conv.clientId !== clientId) {
        throw new NotFoundError('Conversation', id);
      }

      const messages = await prisma.chatMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
        include: {
          senderUser: {
            select: { id: true, firstName: true, lastName: true },
          },
          senderClient: { select: { id: true, fullName: true } },
        },
      });

      res.json({ success: true, data: messages });
    } catch (err) {
      next(err);
    }
  }

  static async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;
      const { id } = req.params;
      const { message } = req.body as { message?: string };

      if (!message || !message.trim()) {
        throw new BusinessError('Message vide');
      }

      const conv = await prisma.chatConversation.findUnique({
        where: { id },
        select: { id: true, clientId: true, status: true },
      });
      if (!conv || conv.clientId !== clientId) {
        throw new NotFoundError('Conversation', id);
      }
      if (conv.status === 'CLOSED') {
        throw new BusinessError(
          'Conversation fermee. Ouvrez-en une nouvelle.',
        );
      }

      const chatMessage = await prisma.chatMessage.create({
        data: {
          conversationId: id,
          senderClientId: clientId,
          senderType: 'CLIENT',
          message: message.trim(),
        },
        include: {
          senderClient: { select: { id: true, fullName: true } },
        },
      });

      res.status(201).json({ success: true, data: chatMessage });
    } catch (err) {
      next(err);
    }
  }

  static async markConversationRead(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { clientId } = req.clientPortal!;
      const { id } = req.params;

      const conv = await prisma.chatConversation.findUnique({
        where: { id },
        select: { id: true, clientId: true },
      });
      if (!conv || conv.clientId !== clientId) {
        throw new NotFoundError('Conversation', id);
      }

      await prisma.chatMessage.updateMany({
        where: {
          conversationId: id,
          isRead: false,
          senderType: { not: 'CLIENT' },
        },
        data: { isRead: true, readAt: new Date() },
      });

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
