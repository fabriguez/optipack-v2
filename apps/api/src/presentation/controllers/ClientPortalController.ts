import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomInt } from 'crypto';
import { config } from '../../config';
import { prisma } from '../../config/database';
import {
  AuthenticationError,
  NotFoundError,
  BusinessError,
} from '../../domain/errors/BusinessError';
import { notificationService } from '../../application/services/notifications/NotificationService';
import type { NotificationChannel } from '../../application/services/notifications/types';

// OTP reset portail client : 10 min de validite, 5 tentatives max.
const CLIENT_OTP_TTL_MS = 10 * 60 * 1000;
const CLIENT_OTP_MAX_ATTEMPTS = 5;
// Diffusion du code OTP : email + SMS + WhatsApp (jamais PUSH : l'utilisateur
// n'est pas connecte et n'a pas forcement un appareil enregistre).
const CLIENT_RESET_CHANNELS: NotificationChannel[] = ['EMAIL', 'SMS', 'WHATSAPP'];

/**
 * Normalise un numero de telephone pour le stockage / la comparaison.
 * Strip tout whitespace + caracteres de mise en forme (espaces, tirets,
 * parentheses, points). Conserve le `+` initial.
 * Sans ca, "+237 6XX XXX XXX" (avec espaces) et "+2376XXXXXXX" (sans)
 * sont vus comme deux numeros distincts et la connexion echoue apres
 * une inscription qui auto-formatait l'input.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '');
}

/**
 * Resout un client a partir d'un identifiant email OU telephone. L'email est
 * detecte par la presence d'un '@' (comparaison insensible a la casse), sinon
 * la valeur est traitee comme un telephone (normalise). Retourne null si
 * introuvable. Sert au reset mot de passe (l'utilisateur peut saisir l'un ou
 * l'autre, comme au login).
 */
async function findClientByIdentifier(rawId: string) {
  const id = String(rawId).trim();
  if (id.includes('@')) {
    return prisma.client.findFirst({
      where: { email: { equals: id, mode: 'insensitive' } },
    });
  }
  return prisma.client.findUnique({ where: { phone: normalizePhone(id) } });
}

/**
 * Charge le jeton de reset actif d'un client et valide le code OTP fourni.
 * Gere l'expiration et le plafond de tentatives (suppression du jeton), et
 * incremente le compteur sur code errone (anti-bruteforce). Retourne le jeton
 * valide SANS le consommer (le caller decide de le marquer `usedAt`). Leve une
 * BusinessError generique sinon (anti-enumeration). Partage par verifyResetCode
 * (etape 2) et resetPassword (etape 3) du flux en deux temps.
 */
async function assertValidResetToken(clientId: string, code: string) {
  const item = await prisma.clientPasswordResetToken.findFirst({
    where: { clientId, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!item) throw new BusinessError('Code invalide ou expire.');
  if (item.expiresAt < new Date()) {
    await prisma.clientPasswordResetToken.delete({ where: { id: item.id } });
    throw new BusinessError('Code expire. Demandez-en un nouveau.');
  }
  if (item.attempts >= CLIENT_OTP_MAX_ATTEMPTS) {
    await prisma.clientPasswordResetToken.delete({ where: { id: item.id } });
    throw new BusinessError('Trop de tentatives. Demandez un nouveau code.');
  }
  const ok = await bcrypt.compare(String(code), item.token);
  if (!ok) {
    await prisma.clientPasswordResetToken.update({
      where: { id: item.id },
      data: { attempts: { increment: 1 } },
    });
    throw new BusinessError('Code invalide ou expire.');
  }
  return item;
}

/**
 * Construit un filtre Prisma createdAt { gte, lte } a partir des query params
 * `from` / `to` (YYYY-MM-DD ou ISO). Le `to` est etendu a la fin de la journee
 * pour inclure tous les enregistrements du jour. Retourne undefined si aucune
 * borne valide n'est fournie. Sert au filtre par periode de l'historique.
 */
function parseDateRangeQuery(
  query: Record<string, unknown>,
): { gte?: Date; lte?: Date } | undefined {
  const range: { gte?: Date; lte?: Date } = {};
  const from = query.from as string | undefined;
  const to = query.to as string | undefined;
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      // Si la borne est une date nue (sans heure), couvrir toute la journee.
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) d.setHours(23, 59, 59, 999);
      range.lte = d;
    }
  }
  return range.gte || range.lte ? range : undefined;
}

interface ClientJwtPayload {
  clientId: string;
  phone: string;
  type: 'client';
}

declare global {
  namespace Express {
    interface Request {
      clientPortal?: ClientJwtPayload;
    }
  }
}

export function authenticateClient(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AuthenticationError());
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as ClientJwtPayload;

    if (payload.type !== 'client') {
      return next(new AuthenticationError('Token invalide'));
    }

    req.clientPortal = payload;
    next();
  } catch {
    next(new AuthenticationError('Token invalide ou expire'));
  }
}

export class ClientPortalController {
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      // Connexion par telephone OU email. `identifier` est le champ unifie ;
      // `phone`/`email` restent acceptes pour compat ascendante.
      const { phone: rawPhone, email: rawEmail, identifier, password } = req.body;
      const rawId = identifier ?? rawEmail ?? rawPhone;

      if (!rawId || !password) {
        throw new BusinessError('Identifiant et mot de passe requis');
      }

      const looksLikeEmail = String(rawId).includes('@');
      const client = looksLikeEmail
        ? await prisma.client.findFirst({
            where: { email: { equals: String(rawId).trim(), mode: 'insensitive' } },
          })
        : await prisma.client.findUnique({ where: { phone: normalizePhone(String(rawId)) } });

      if (!client) {
        throw new AuthenticationError('Identifiants incorrects');
      }

      if (!client.isPortalActive || !client.passwordHash) {
        throw new AuthenticationError(
          'Compte portail non active. Veuillez vous inscrire.',
        );
      }

      const valid = await bcrypt.compare(password, client.passwordHash);

      if (!valid) {
        throw new AuthenticationError('Identifiants incorrects');
      }

      const tokenPayload: ClientJwtPayload = {
        clientId: client.id,
        phone: client.phone,
        type: 'client',
      };

      const accessToken = jwt.sign(tokenPayload, config.jwt.secret, {
        expiresIn: '7d',
      });

      res.json({
        success: true,
        data: {
          accessToken,
          client: {
            id: client.id,
            fullName: client.fullName,
            phone: client.phone,
            email: client.email,
            agencyId: client.agencyId,
            loyaltyTier: client.loyaltyTier,
            loyaltyPoints: client.loyaltyPoints,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Inscription portail client public.
   *
   * Comportement :
   *  - Si aucun client n'a ce telephone, on en CREE un nouveau (cas auto-
   *    inscription depuis le site public). Le client n'est rattache a aucune
   *    agence specifique (agencyId null), et son organisationId est determine
   *    plus tard (au 1er envoi de colis), OU on assigne l'organisation par
   *    defaut (premiere active) pour pouvoir loger le compte tout de suite.
   *  - Si un client existe deja avec ce telephone et SANS portail actif,
   *    on active son portail (set passwordHash + isPortalActive). Cas typique :
   *    le client a deja envoye un colis via une agence, l'agence a cree sa
   *    fiche, il vient maintenant creer son compte web.
   *  - Si un client existe avec un portail deja actif, on refuse (il doit se
   *    connecter).
   */
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { fullName, phone: rawPhone, email, password } = req.body as {
        fullName?: string;
        phone?: string;
        email?: string;
        password?: string;
      };

      if (!rawPhone || !password) {
        throw new BusinessError('Telephone et mot de passe requis');
      }
      const phone = normalizePhone(rawPhone);
      if (password.length < 6) {
        throw new BusinessError(
          'Le mot de passe doit contenir au moins 6 caracteres',
        );
      }

      const existing = await prisma.client.findUnique({ where: { phone } });

      if (existing && existing.isPortalActive && existing.passwordHash) {
        throw new BusinessError(
          'Ce numero est deja associe a un compte portail. Connectez-vous.',
        );
      }

      // Email unique : refuse si l'email fourni appartient deja a un AUTRE client.
      const normalizedEmail = email?.trim() || null;
      if (normalizedEmail) {
        const emailOwner = await prisma.client.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });
        if (emailOwner && emailOwner.id !== existing?.id) {
          throw new BusinessError('Cet email est deja utilise par un autre compte.');
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);

      let client = existing;
      if (existing) {
        // Activation du portail sur un client existant (deja cree par une
        // agence). On enrichit avec fullName/email si fournis et absents.
        client = await prisma.client.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            isPortalActive: true,
            ...(fullName && !existing.fullName ? { fullName } : {}),
            ...(email && !existing.email ? { email } : {}),
          },
        });
      } else {
        // Cas auto-inscription : aucun client existant. On en cree un.
        // fullName devient requis dans ce cas (sinon impossible de creer une fiche).
        if (!fullName || fullName.trim().length < 2) {
          throw new BusinessError(
            'Nom complet requis (au moins 2 caracteres) pour creer un nouveau compte.',
          );
        }
        // Recupere une organisation par defaut (premiere active). Dans un
        // setup multi-tenant strict, il faudrait pouvoir choisir l'org cote
        // public via skin/domaine -- TODO Phase 2 portail public.
        const defaultOrg = await prisma.organization.findFirst({
          orderBy: { createdAt: 'asc' },
        });
        if (!defaultOrg) {
          throw new BusinessError(
            'Aucune organisation configuree. Contactez le support.',
          );
        }
        client = await prisma.client.create({
          data: {
            organizationId: defaultOrg.id,
            fullName: fullName.trim(),
            phone,
            email: email?.trim() || null,
            passwordHash,
            isPortalActive: true,
            clientType: 'INDIVIDUAL',
            agencyId: null,
          },
        });
      }

      const tokenPayload: ClientJwtPayload = {
        clientId: client!.id,
        phone: client!.phone,
        type: 'client',
      };

      const accessToken = jwt.sign(tokenPayload, config.jwt.secret, {
        expiresIn: '7d',
      });

      res.status(201).json({
        success: true,
        data: {
          accessToken,
          client: {
            id: client!.id,
            fullName: client!.fullName,
            phone: client!.phone,
            email: client!.email,
            agencyId: client!.agencyId,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Demande d'un code OTP de reinitialisation pour le portail client.
   * Identification par telephone. Dispatch SMS + repli email via le
   * NotificationService. Reponse toujours { ok: true } (anti-enumeration).
   */
  static async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      // Identifiant unifie : email OU telephone (comme au login). `phone`/`email`
      // restent acceptes pour compat ascendante.
      const { identifier, phone: rawPhone, email: rawEmail } = req.body as {
        identifier?: string;
        phone?: string;
        email?: string;
      };
      const rawId = identifier ?? rawEmail ?? rawPhone;
      if (!rawId) throw new BusinessError('Email ou telephone requis');

      const client = await findClientByIdentifier(String(rawId));
      // On ne revele pas l'existence du compte ni l'etat du portail.
      if (client && client.isPortalActive && client.passwordHash && client.isActive) {
        await prisma.clientPasswordResetToken.deleteMany({
          where: { clientId: client.id, usedAt: null },
        });

        const code = String(randomInt(100000, 1000000));
        const tokenHash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(Date.now() + CLIENT_OTP_TTL_MS);
        await prisma.clientPasswordResetToken.create({
          data: { clientId: client.id, token: tokenHash, expiresAt },
        });

        const ttlMin = Math.round(CLIENT_OTP_TTL_MS / 60000);
        try {
          await notificationService.notify(
            {
              clientId: client.id,
              phone: client.phone,
              email: client.email,
              organizationId: client.organizationId,
            },
            {
              title: 'Code de reinitialisation',
              message:
                `Votre code de reinitialisation est : ${code}. ` +
                `Il est valide ${ttlMin} minutes. Ne le communiquez a personne.`,
              channels: CLIENT_RESET_CHANNELS,
              metadata: { kind: 'PASSWORD_RESET' },
            },
          );
        } catch {
          // best-effort : ne pas faire echouer la demande.
        }
      }
      res.json({ success: true, data: { ok: true } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Verifie le code OTP (phone + code) et applique le nouveau mot de passe.
   * Politique client : min 6 caracteres (alignee sur l'inscription portail).
   */
  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { phone: rawPhone, code, newPassword } = req.body as {
        phone?: string;
        code?: string;
        newPassword?: string;
      };
      if (!rawPhone || !code || !newPassword) {
        throw new BusinessError('Telephone, code et nouveau mot de passe requis');
      }
      if (newPassword.length < 6) {
        throw new BusinessError('Le mot de passe doit contenir au moins 6 caracteres');
      }
      const phone = normalizePhone(String(rawPhone));

      const client = await prisma.client.findUnique({ where: { phone } });
      if (!client) throw new BusinessError('Code invalide ou expire.');

      const item = await prisma.clientPasswordResetToken.findFirst({
        where: { clientId: client.id, usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!item) throw new BusinessError('Code invalide ou expire.');
      if (item.expiresAt < new Date()) {
        await prisma.clientPasswordResetToken.delete({ where: { id: item.id } });
        throw new BusinessError('Code expire. Demandez-en un nouveau.');
      }
      if (item.attempts >= CLIENT_OTP_MAX_ATTEMPTS) {
        await prisma.clientPasswordResetToken.delete({ where: { id: item.id } });
        throw new BusinessError('Trop de tentatives. Demandez un nouveau code.');
      }

      const ok = await bcrypt.compare(String(code), item.token);
      if (!ok) {
        await prisma.clientPasswordResetToken.update({
          where: { id: item.id },
          data: { attempts: { increment: 1 } },
        });
        throw new BusinessError('Code invalide ou expire.');
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.$transaction([
        prisma.client.update({
          where: { id: client.id },
          data: { passwordHash, isPortalActive: true },
        }),
        prisma.clientPasswordResetToken.update({
          where: { id: item.id },
          data: { usedAt: new Date() },
        }),
      ]);
      res.json({ success: true, data: { ok: true } });
    } catch (err) {
      next(err);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;

      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          idNumber: true,
          imageUrl: true,
          idDocumentUrl: true,
          idDocumentBackUrl: true,
          idVerificationStatus: true,
          idVerifiedAt: true,
          idExpiryDate: true,
          idRejectionReason: true,
          address: true,
          agencyId: true,
          loyaltyTier: true,
          loyaltyPoints: true,
          totalSpent: true,
          isActive: true,
          createdAt: true,
          agency: {
            select: {
              id: true,
              name: true,
              city: true,
              phone: true,
            },
          },
        },
      });

      if (!client) {
        throw new NotFoundError('Client', clientId);
      }

      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  static async parcels(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const skip = (page - 1) * limit;

      // Historique des expeditions : recherche libre + statut + plage de dates.
      const search = (req.query.search as string | undefined)?.trim();
      const status = (req.query.status as string | undefined)?.trim();
      const createdAt = parseDateRangeQuery(req.query);

      const where: Record<string, unknown> = { clientId, isDeleted: false };
      if (createdAt) where.createdAt = createdAt;
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { trackingNumber: { contains: search, mode: 'insensitive' } },
          { designation: { contains: search, mode: 'insensitive' } },
          { destination: { contains: search, mode: 'insensitive' } },
          { recipient: { fullName: { contains: search, mode: 'insensitive' } } },
        ];
      }

      const [parcels, total] = await Promise.all([
        prisma.parcel.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            recipient: { select: { fullName: true, phone: true } },
            warehouse: { select: { name: true } },
            container: { select: { designation: true } },
          },
        }),
        prisma.parcel.count({ where }),
      ]);

      res.json({
        success: true,
        data: parcels,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  static async parcelByTracking(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { clientId } = req.clientPortal!;
      const { trackingNumber } = req.params;

      const parcel = await prisma.parcel.findUnique({
        where: { trackingNumber },
        include: {
          recipient: { select: { fullName: true, phone: true } },
          warehouse: { select: { name: true } },
          container: { select: { designation: true } },
        },
      });

      if (!parcel || parcel.clientId !== clientId || parcel.isDeleted) {
        throw new NotFoundError('Colis', trackingNumber);
      }

      res.json({ success: true, data: parcel });
    } catch (err) {
      next(err);
    }
  }

  static async invoices(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const skip = (page - 1) * limit;

      // Historique facturation : recherche reference + statut + plage de dates.
      const search = (req.query.search as string | undefined)?.trim();
      const status = (req.query.status as string | undefined)?.trim();
      const createdAt = parseDateRangeQuery(req.query);

      const where: Record<string, unknown> = { clientId, isActive: true };
      if (createdAt) where.createdAt = createdAt;
      if (status) where.status = status;
      if (search) {
        where.reference = { contains: search, mode: 'insensitive' };
      }

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            payments: {
              select: {
                id: true,
                reference: true,
                amount: true,
                paymentMethod: true,
                createdAt: true,
              },
            },
          },
        }),
        prisma.invoice.count({ where }),
      ]);

      res.json({
        success: true,
        data: invoices,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  static async payments(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const skip = (page - 1) * limit;

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where: { invoice: { clientId } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            invoice: {
              select: { reference: true, totalAmount: true, status: true },
            },
          },
        }),
        prisma.payment.count({ where: { invoice: { clientId } } }),
      ]);

      res.json({
        success: true,
        data: payments,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  static async debts(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const skip = (page - 1) * limit;

      const [debts, total] = await Promise.all([
        prisma.debt.findMany({
          where: { clientId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            invoice: {
              select: {
                id: true,
                reference: true,
                totalAmount: true,
                status: true,
              },
            },
          },
        }),
        prisma.debt.count({ where: { clientId } }),
      ]);

      res.json({
        success: true,
        data: debts,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  static async notifications(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { clientId } = req.clientPortal!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const skip = (page - 1) * limit;

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where: { clientId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.notification.count({ where: { clientId } }),
      ]);

      res.json({
        success: true,
        data: notifications,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  static async agencies(_req: Request, res: Response, next: NextFunction) {
    try {
      const agencies = await prisma.agency.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          city: true,
          country: true,
          phone: true,
          email: true,
          googleMapsLink: true,
        },
        orderBy: { name: 'asc' },
      });

      res.json({ success: true, data: agencies });
    } catch (err) {
      next(err);
    }
  }
}
