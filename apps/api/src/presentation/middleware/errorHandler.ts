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

  // Unexpected errors
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur',
    code: 'INTERNAL_ERROR',
  });
}
