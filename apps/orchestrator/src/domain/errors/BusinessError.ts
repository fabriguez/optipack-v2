export class BusinessError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

export class NotFoundError extends BusinessError {
  statusCode = 404;
  constructor(entity: string, id: string) {
    super(`${entity} introuvable : ${id}`);
    this.name = 'NotFoundError';
  }
}

export class AuthenticationError extends BusinessError {
  statusCode = 401;
  constructor(message = 'Authentification requise') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends BusinessError {
  statusCode = 403;
  constructor(message = 'Acces refuse') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ConflictError extends BusinessError {
  statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
