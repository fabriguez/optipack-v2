export class BusinessError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'BUSINESS_ERROR') {
    super(message);
    this.name = 'BusinessError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends BusinessError {
  constructor(entity: string, id?: string) {
    const msg = id ? `${entity} avec l'ID "${id}" introuvable` : `${entity} introuvable`;
    super(msg, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends BusinessError {
  public readonly errors: Record<string, string[]>;

  constructor(errors: Record<string, string[]>) {
    super('Erreurs de validation', 422, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class AuthorizationError extends BusinessError {
  constructor(message = 'Acces non autorise') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'AuthorizationError';
  }
}

export class AuthenticationError extends BusinessError {
  constructor(message = 'Authentification requise') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'AuthenticationError';
  }
}

export class ConflictError extends BusinessError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class InsufficientBalanceError extends BusinessError {
  constructor(required: number, available: number) {
    super(
      `Solde insuffisant. Requis: ${required}, Disponible: ${available}`,
      400,
      'INSUFFICIENT_BALANCE',
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class ImmutabilityError extends BusinessError {
  constructor(entity: string) {
    super(
      `${entity} est immutable et ne peut pas etre modifie. Utilisez une annulation.`,
      400,
      'IMMUTABLE_ENTITY',
    );
    this.name = 'ImmutabilityError';
  }
}

export class InvalidStatusTransitionError extends BusinessError {
  constructor(entity: string, currentStatus: string, targetStatus: string) {
    super(
      `Transition invalide pour ${entity}: ${currentStatus} -> ${targetStatus}`,
      400,
      'INVALID_STATUS_TRANSITION',
    );
    this.name = 'InvalidStatusTransitionError';
  }
}
