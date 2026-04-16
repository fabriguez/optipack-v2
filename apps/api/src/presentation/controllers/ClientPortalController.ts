import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { prisma } from '../../config/database';
import {
  AuthenticationError,
  NotFoundError,
  BusinessError,
} from '../../domain/errors/BusinessError';

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
      const { phone, password } = req.body;

      if (!phone || !password) {
        throw new BusinessError('Telephone et mot de passe requis');
      }

      const client = await prisma.client.findUnique({ where: { phone } });

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

  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { phone, password } = req.body;

      if (!phone || !password) {
        throw new BusinessError('Telephone et mot de passe requis');
      }

      if (password.length < 6) {
        throw new BusinessError(
          'Le mot de passe doit contenir au moins 6 caracteres',
        );
      }

      const client = await prisma.client.findUnique({ where: { phone } });

      if (!client) {
        throw new NotFoundError(
          'Client',
          `Aucun client trouve avec le telephone ${phone}`,
        );
      }

      if (client.isPortalActive && client.passwordHash) {
        throw new BusinessError(
          'Ce client a deja un compte portail actif. Utilisez la connexion.',
        );
      }

      const passwordHash = await bcrypt.hash(password, 10);

      await prisma.client.update({
        where: { id: client.id },
        data: { passwordHash, isPortalActive: true },
      });

      const tokenPayload: ClientJwtPayload = {
        clientId: client.id,
        phone: client.phone,
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
            id: client.id,
            fullName: client.fullName,
            phone: client.phone,
            email: client.email,
            agencyId: client.agencyId,
          },
        },
      });
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

      const [parcels, total] = await Promise.all([
        prisma.parcel.findMany({
          where: { clientId, isDeleted: false },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            recipient: { select: { fullName: true, phone: true } },
            warehouse: { select: { name: true } },
            container: { select: { designation: true } },
          },
        }),
        prisma.parcel.count({ where: { clientId, isDeleted: false } }),
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

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where: { clientId, isActive: true },
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
        prisma.invoice.count({ where: { clientId, isActive: true } }),
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
              select: { reference: true, totalAmount: true, status: true },
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
