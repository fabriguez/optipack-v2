import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { RegisterUseCase } from '../../application/use-cases/auth/RegisterUseCase';
import { LoginUseCase } from '../../application/use-cases/auth/LoginUseCase';
import { RefreshTokenUseCase } from '../../application/use-cases/auth/RefreshTokenUseCase';
import { GetMeUseCase } from '../../application/use-cases/auth/GetMeUseCase';
import {
  ChangePasswordUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
} from '../../application/use-cases/auth/PasswordUseCases';
import { AuthenticationError } from '../../domain/errors/BusinessError';

// Phase 0.2 : multi-tenant. Le seed initial du tenant cree son premier admin avec
// un organizationId fourni. Les invitations ulterieures viennent d'un user authentifie
// qui partage son organizationId au nouveau user.
export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(RegisterUseCase);
      // organizationId : prio body (seed orchestrator), sinon user authentifie, sinon erreur.
      const orgId =
        (req.body?.organizationId as string | undefined) ||
        req.user?.organizationId;
      if (!orgId) {
        throw new AuthenticationError('organizationId requis pour creer un user');
      }
      const result = await useCase.execute(req.body, orgId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(LoginUseCase);
      const result = await useCase.execute(req.body);

      if (result.requires2FA) {
        res.json({ success: true, data: { requires2FA: true, userId: result.user.id } });
        return;
      }

      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });

      res.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      if (!refreshToken) {
        throw new AuthenticationError('Refresh token manquant');
      }

      const useCase = container.resolve(RefreshTokenUseCase);
      const result = await useCase.execute(refreshToken);

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.json({ success: true, data: { accessToken: result.accessToken } });
    } catch (err) {
      next(err);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetMeUseCase);
      const result = await useCase.execute(req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response, _next: NextFunction) {
    res.clearCookie('refreshToken', { path: '/' });
    res.json({ success: true, message: 'Deconnexion reussie' });
  }

  static async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ChangePasswordUseCase);
      const result = await useCase.execute(
        req.user!.userId,
        req.body?.currentPassword ?? '',
        req.body?.newPassword ?? '',
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(RequestPasswordResetUseCase);
      const result = await useCase.execute(req.body?.email ?? '');
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ResetPasswordUseCase);
      const result = await useCase.execute(req.body?.token ?? '', req.body?.newPassword ?? '');
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
