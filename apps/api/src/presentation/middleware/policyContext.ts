import type { Request } from 'express';
import type { JwtPayload } from '@transitsoftservices/shared';

/**
 * Contexte de politique d'acces (ABAC), construit une fois par requete a
 * partir du JWT et cache sur `req`. Source unique pour :
 *   - les checks de permission (requirePermission, controllers),
 *   - le scoping agence (scope resolvers, etape 2 du plan),
 *   - le masquage de champs (field policies, etape 3 du plan).
 *
 * Cf. PERMISSIONS-PLAN.md.
 */
export interface PolicyContext {
  orgId: string;
  userId: string;
  role: string;
  /** Agences accessibles a l'utilisateur (UserAgency). */
  agencyIds: string[];
  /** Permissions effectives embarquees dans le JWT au login/refresh. */
  permissions: ReadonlySet<string>;
  /** ADMIN (admin du tenant) ou SUPER_ADMIN (plateforme) : bypass complet. */
  isAdmin: boolean;
  /** true si l'utilisateur detient la permission (wildcard et admin inclus). */
  can(key: string): boolean;
  /** true si l'utilisateur detient AU MOINS UNE des permissions. */
  canAny(keys: string[]): boolean;
}

const POLICY_KEY = Symbol('policyContext');

function buildPolicy(user: JwtPayload): PolicyContext {
  const permissions = new Set(user.permissions ?? []);
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const hasWildcard = isAdmin || permissions.has('*');
  const can = (key: string): boolean => hasWildcard || permissions.has(key);
  return {
    orgId: user.organizationId,
    userId: user.userId,
    role: user.role,
    agencyIds: user.agencyIds ?? [],
    permissions,
    isAdmin,
    can,
    canAny: (keys) => keys.length === 0 || keys.some(can),
  };
}

/**
 * Retourne le PolicyContext de la requete (construit et cache au premier appel).
 * Retourne null si la requete n'est pas authentifiee staff (ex. token portail client).
 */
export function getPolicy(req: Request): PolicyContext | null {
  const holder = req as Request & { [POLICY_KEY]?: PolicyContext };
  if (holder[POLICY_KEY]) return holder[POLICY_KEY];
  if (!req.user) return null;
  const policy = buildPolicy(req.user);
  holder[POLICY_KEY] = policy;
  return policy;
}
