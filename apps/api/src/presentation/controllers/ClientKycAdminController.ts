import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';
import { clientScope, scopeCtx } from '../../application/services/scope/agencyScope';

export class ClientKycAdminController {
  /**
   * GET /clients/kyc/pending
   * Liste les clients avec idVerificationStatus=PENDING pour la file de validation.
   */
  static async listPending(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const skip = Number(req.query.skip ?? 0);
      // Scope agence (etape 2) : merge en AND, filtres existants conserves.
      const scopeWhere = clientScope.where(scopeCtx(req));
      const where: Prisma.ClientWhereInput = {
        idVerificationStatus: 'PENDING',
        isDeleted: false,
        ...(scopeWhere && { AND: [scopeWhere] }),
      };
      const [items, total] = await Promise.all([
        prisma.client.findMany({
          where,
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            imageUrl: true,
            idDocumentUrl: true,
            idDocumentBackUrl: true,
            idNumber: true,
            updatedAt: true,
            agency: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: 'asc' },
          take: limit,
          skip,
        }),
        prisma.client.count({ where }),
      ]);
      res.json({ success: true, data: items, total });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /clients/:id/verify
   * Body : { decision: 'APPROVED' | 'REJECTED', expiryDate?: ISO, reason?: string }
   * APPROVED requiert expiryDate. REJECTED requiert reason.
   */
  static async verify(req: Request, res: Response, next: NextFunction) {
    try {
      await clientScope.assert(req.params.id, scopeCtx(req));
      const { id } = req.params;
      const { decision, expiryDate, reason } = req.body ?? {};

      if (decision !== 'APPROVED' && decision !== 'REJECTED') {
        throw new BusinessError('decision doit etre APPROVED ou REJECTED');
      }

      const client = await prisma.client.findUnique({ where: { id } });
      if (!client) throw new NotFoundError('Client', id);
      if (client.idVerificationStatus !== 'PENDING') {
        throw new BusinessError('Le client n\'est pas en attente de verification');
      }

      const userId = req.user?.userId;
      const now = new Date();
      const data: Record<string, unknown> = {
        idVerificationStatus: decision,
        idVerifiedByUserId: userId,
      };

      if (decision === 'APPROVED') {
        if (!expiryDate) throw new BusinessError('expiryDate obligatoire pour approbation');
        const dt = new Date(expiryDate);
        if (Number.isNaN(dt.getTime()) || dt <= now) {
          throw new BusinessError('expiryDate doit etre future');
        }
        data.idVerifiedAt = now;
        data.idExpiryDate = dt;
        data.idRejectionReason = null;
      } else {
        if (!reason || String(reason).trim().length === 0) {
          throw new BusinessError('reason obligatoire en cas de refus');
        }
        data.idVerifiedAt = null;
        data.idExpiryDate = null;
        data.idRejectionReason = String(reason).trim();
      }

      await prisma.client.update({ where: { id }, data });
      const updated = await prisma.client.findUnique({
        where: { id },
        select: {
          id: true,
          fullName: true,
          idVerificationStatus: true,
          idVerifiedAt: true,
          idExpiryDate: true,
          idRejectionReason: true,
        },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
}
