import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { LoginOpsAdminUseCase } from '../../application/use-cases/auth/LoginOpsAdminUseCase';
import { SetupTwoFactorUseCase } from '../../application/use-cases/auth/SetupTwoFactorUseCase';
import { GetMeUseCase } from '../../application/use-cases/auth/GetMeUseCase';
import { AuditLogger } from '../../application/services/AuditLogger';
import { AuthenticationError } from '../../domain/errors/BusinessError';

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(LoginOpsAdminUseCase);
      const result = await useCase.execute(req.body);
      // On ne loggue que les logins reussis (i.e. quand un accessToken est emis)
      if (result.accessToken && result.opsAdmin) {
        req.opsAdmin = {
          sub: result.opsAdmin.id,
          email: result.opsAdmin.email,
          isSuperAdmin: result.opsAdmin.isSuperAdmin,
          scope: 'ops',
        };
        await container.resolve(AuditLogger).log(req, {
          action: 'OPS_LOGIN',
          entityType: 'OpsAdmin',
          entityId: result.opsAdmin.id,
        });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async setupTwoFactor(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(SetupTwoFactorUseCase);
      const challengeToken = req.body?.challengeToken as string | undefined;
      if (!challengeToken) {
        res.status(400).json({ success: false, message: 'challengeToken requis' });
        return;
      }
      const result = await useCase.generateSecret(challengeToken);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async confirmTwoFactor(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(SetupTwoFactorUseCase);
      const { challengeToken, totpCode } = req.body as {
        challengeToken?: string;
        totpCode?: string;
      };
      if (!challengeToken || !totpCode) {
        res.status(400).json({ success: false, message: 'challengeToken et totpCode requis' });
        return;
      }
      const result = await useCase.confirm(challengeToken, totpCode);
      if (result.opsAdmin) {
        req.opsAdmin = {
          sub: result.opsAdmin.id,
          email: result.opsAdmin.email,
          isSuperAdmin: result.opsAdmin.isSuperAdmin,
          scope: 'ops',
        };
        await container.resolve(AuditLogger).log(req, {
          action: 'OPS_2FA_ENABLED',
          entityType: 'OpsAdmin',
          entityId: result.opsAdmin.id,
        });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.opsAdmin) throw new AuthenticationError();
      const data = await container.resolve(GetMeUseCase).execute(req.opsAdmin.sub);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Logout : avec un JWT stateless, le serveur ne peut pas revoquer le token cote client.
   * On loggue juste l'action ; le frontend doit supprimer le token de son storage.
   * (Pour une revocation reelle : blacklist Redis avec TTL = exp du JWT.)
   */
  /**
   * Login via un code de recuperation 2FA (perte de l'authenticator).
   * Body : { challengeToken, recoveryCode }
   */
  static async useRecoveryCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { challengeToken, recoveryCode } = req.body as {
        challengeToken?: string;
        recoveryCode?: string;
      };
      if (!challengeToken || !recoveryCode) {
        res.status(400).json({ success: false, message: 'challengeToken et recoveryCode requis' });
        return;
      }
      const result = await container
        .resolve(SetupTwoFactorUseCase)
        .useRecoveryCode(challengeToken, recoveryCode);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /** Regenere 10 nouveaux codes de recuperation (revoque les anciens). */
  static async regenerateRecoveryCodes(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.opsAdmin) throw new AuthenticationError();
      const codes = await container
        .resolve(SetupTwoFactorUseCase)
        .regenerateRecoveryCodes(req.opsAdmin.sub);
      await container.resolve(AuditLogger).log(req, {
        action: 'OPS_2FA_RECOVERY_CODES_REGEN',
        entityType: 'OpsAdmin',
        entityId: req.opsAdmin.sub,
      });
      res.json({ success: true, data: { recoveryCodes: codes } });
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.opsAdmin) {
        await container.resolve(AuditLogger).log(req, {
          action: 'OPS_LOGOUT',
          entityType: 'OpsAdmin',
          entityId: req.opsAdmin.sub,
        });
      }
      res.json({ success: true, message: 'Deconnexion enregistree' });
    } catch (err) {
      next(err);
    }
  }
}
