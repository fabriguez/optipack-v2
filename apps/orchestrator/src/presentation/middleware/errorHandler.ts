import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { BusinessError } from '../../domain/errors/BusinessError';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation echouee',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof BusinessError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  // Fallback : log et 500
  // eslint-disable-next-line no-console
  console.error('[orchestrator] Unhandled error', err);
  res.status(500).json({ success: false, message: 'Erreur serveur' });
}
