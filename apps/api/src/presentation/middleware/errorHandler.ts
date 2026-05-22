import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { BusinessError, ValidationError } from '../../domain/errors/BusinessError';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('ErrorHandler');

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.');
      if (!errors[path]) errors[path] = [];
      errors[path].push(issue.message);
    }
    res.status(422).json({
      success: false,
      message: 'Erreurs de validation',
      code: 'VALIDATION_ERROR',
      errors,
    });
    return;
  }

  // Custom validation errors
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      errors: err.errors,
    });
    return;
  }

  // Business errors
  if (err instanceof BusinessError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
    });
    return;
  }

  // Erreurs S3/MinIO : surface explicite -- "SignatureDoesNotMatch" indique
  // un mauvais access/secret key cote serveur, "NoSuchBucket" un bucket
  // manquant, etc. On renvoie un 502 avec le code S3 pour que l'UI dise
  // "credentials MinIO invalides" plutot que "une erreur est survenue".
  const anyErr = err as any;
  if (anyErr?.name === 'S3Error' || anyErr?.code === 'SignatureDoesNotMatch' || anyErr?.code === 'NoSuchBucket') {
    logger.error({ err }, 'S3/MinIO error');
    res.status(502).json({
      success: false,
      message: `Stockage indisponible (${anyErr.code || 'S3Error'}). Verifiez les credentials MinIO et le nom du bucket cote serveur.`,
      code: 'STORAGE_ERROR',
      detail: anyErr.message,
    });
    return;
  }

  // Erreurs Prisma connues : on les traduit en messages clairs plutot que
  // de renvoyer un 500 generique. Detection par name + code (pas d'import
  // @prisma/client pour garder le handler leger).
  if (anyErr?.name === 'PrismaClientKnownRequestError' && typeof anyErr.code === 'string') {
    const target = Array.isArray(anyErr.meta?.target)
      ? anyErr.meta.target.join(', ')
      : anyErr.meta?.target ?? '';
    const model = anyErr.meta?.modelName ?? '';
    switch (anyErr.code) {
      case 'P2002': // contrainte d'unicite
        logger.warn({ code: anyErr.code, target, model }, 'Prisma unique constraint');
        res.status(409).json({
          success: false,
          message: `Conflit : une entree existe deja avec la meme valeur${target ? ` (${target})` : ''}. Reessayez.`,
          code: 'DUPLICATE',
        });
        return;
      case 'P2025': // enregistrement introuvable
        res.status(404).json({
          success: false,
          message: `Ressource introuvable${model ? ` (${model})` : ''}.`,
          code: 'NOT_FOUND',
        });
        return;
      case 'P2003': // contrainte de cle etrangere
        res.status(400).json({
          success: false,
          message: 'Operation impossible : reference liee invalide ou enregistrement encore utilise.',
          code: 'FK_CONSTRAINT',
        });
        return;
      case 'P2000': // valeur trop longue
        res.status(400).json({
          success: false,
          message: 'Une valeur saisie est trop longue pour le champ concerne.',
          code: 'VALUE_TOO_LONG',
        });
        return;
      default:
        logger.error({ err }, 'Prisma error');
        res.status(400).json({
          success: false,
          message: 'Operation rejetee par la base de donnees. Verifiez les donnees saisies.',
          code: `PRISMA_${anyErr.code}`,
        });
        return;
    }
  }

  if (anyErr?.name === 'PrismaClientValidationError') {
    logger.error({ err }, 'Prisma validation error');
    res.status(400).json({
      success: false,
      message: 'Donnees invalides envoyees a la base. Verifiez le formulaire.',
      code: 'PRISMA_VALIDATION',
    });
    return;
  }

  // Unexpected errors -- on log tout, et on surface le message reel quand il
  // est exploitable (evite le "Erreur interne" opaque cote UI).
  logger.error({ err }, 'Unhandled error');
  const rawMessage = typeof anyErr?.message === 'string' ? anyErr.message.trim() : '';
  const safeMessage =
    rawMessage && rawMessage.length < 300 && !/prisma|invocation|\bat\b.*\(/i.test(rawMessage)
      ? rawMessage
      : 'Erreur interne du serveur';
  res.status(500).json({
    success: false,
    message: safeMessage,
    code: 'INTERNAL_ERROR',
  });
}
