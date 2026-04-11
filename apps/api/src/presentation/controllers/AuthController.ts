import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { RegisterUseCase } from '../../application/use-cases/auth/RegisterUseCase';
import { LoginUseCase } from '../../application/use-cases/auth/LoginUseCase';
import { RefreshTokenUseCase } from '../../application/use-cases/auth/RefreshTokenUseCase';
import { GetMeUseCase } from '../../application/use-cases/auth/GetMeUseCase';
import { AuthenticationError } from '../../domain/errors/BusinessError';

const DEFAULT_ORG_ID = '00000000-0000-4000-a000-000000000001';

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(RegisterUseCase);
      const result = await useCase.execute(req.body, DEFAULT_ORG_ID);
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
}
