import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { getPolicy } from '../../../presentation/middleware/policyContext';

/**
 * Scoping agence (PERMISSIONS-PLAN.md etape 2).
 *
 * Regle : un personnel ne voit que les ressources dont le jeu d'agences
 * intersecte ses agencyIds. ADMIN/SUPER_ADMIN : aucune restriction.
 *
 * Deploiement aligne sur le mode shadow des permissions
 * (PERMISSIONS_ENFORCE) :
 *   - 'log'     : les listes ne sont PAS filtrees ; les acces detail hors
 *                 scope sont logges [SCOPE-DENY] mais laissent passer.
 *   - 'enforce' : listes filtrees en SQL ; detail/mutation hors scope -> 404
 *                 (NotFoundError, indistinguable d'un id inconnu).
 *
 * Usage controller :
 *   const ctx = scopeCtx(req);
 *   // liste : fragment a merger en AND dans le where du repo
 *   repo.findAll({ ...filters, scopeWhere: parcelScope.where(ctx) }, ...)
 *   // detail / mutation :
 *   await parcelScope.assert(req.params.id, ctx);
 */

export interface ScopeCtx {
  orgId: string;
  userId: string;
  agencyIds: string[];
  /** true = aucune restriction (ADMIN tenant / SUPER_ADMIN plateforme). */
  unrestricted: boolean;
}

export function scopeEnforced(): boolean {
  return config.permissions.enforce === 'enforce';
}

/** Construit le contexte de scope depuis la requete authentifiee staff. */
export function scopeCtx(req: Request): ScopeCtx {
  const policy = getPolicy(req);
  if (!policy) {
    // Route staff appelee sans user : ne doit pas arriver derriere authenticate.
    return { orgId: '', userId: '', agencyIds: [], unrestricted: false };
  }
  return {
    orgId: policy.orgId,
    userId: policy.userId,
    agencyIds: policy.agencyIds,
    unrestricted: policy.isAdmin,
  };
}

type AnyWhere = Record<string, unknown>;

interface ScopeResolver<TWhere extends AnyWhere = AnyWhere> {
  /**
   * Restriction agence brute (independante du mode). undefined = pas de
   * restriction pour ce contexte (admin).
   */
  restriction(ctx: ScopeCtx): TWhere | undefined;
  /**
   * Fragment a appliquer aux LISTES/agregats : actif seulement en mode
   * enforce (les listes ne sont pas filtrees en shadow).
   */
  where(ctx: ScopeCtx): TWhere | undefined;
  /**
   * Detail/mutation : verifie que l'enregistrement est dans le scope.
   * Hors scope -> NotFoundError (404) en enforce, log [SCOPE-DENY] en shadow.
   * Id inconnu : laisse le flux nominal repondre (pas de throw ici si absent
   * de la base, sauf si la restriction l'exclut).
   */
  assert(id: string, ctx: ScopeCtx): Promise<void>;
  /** Variante batch : tous les ids doivent etre dans le scope. */
  assertMany(ids: string[], ctx: ScopeCtx): Promise<void>;
}

interface CountDelegate {
  count(args: { where: AnyWhere }): Promise<number>;
}

/**
 * Filtre org par defaut : la plupart des modeles portent un scalaire
 * `organizationId`. Les modeles qui atteignent l'org via relation passent un
 * `buildOrgWhere` explicite (cf. resolvers plus bas).
 */
function defaultOrgWhere<TWhere extends AnyWhere>(orgId: string): TWhere {
  return { organizationId: orgId } as unknown as TWhere;
}

function makeScope<TWhere extends AnyWhere>(
  resource: string,
  delegate: () => CountDelegate,
  buildRestriction: (agencyIds: string[]) => TWhere,
  buildOrgWhere: (orgId: string) => TWhere = defaultOrgWhere,
): ScopeResolver<TWhere> {
  const restriction = (ctx: ScopeCtx): TWhere | undefined => {
    if (ctx.unrestricted) return undefined;
    return buildRestriction(ctx.agencyIds);
  };
  return {
    restriction,
    where(ctx) {
      if (!scopeEnforced()) return undefined;
      return restriction(ctx);
    },
    async assert(id, ctx) {
      // Sans contexte org (route hors `authenticate`) : on ne peut pas scoper.
      if (!ctx.orgId) return;
      // L'isolation TENANT (organizationId) est un invariant DUR : toujours
      // appliquee, quel que soit le mode (log/enforce) et le role (y compris
      // ADMIN). Seule la restriction AGENCE reste soumise au mode shadow.
      const org = buildOrgWhere(ctx.orgId);
      const r = restriction(ctx);
      const and = r ? [org, r] : [org];
      const inScope = await delegate().count({ where: { id, AND: and } });
      if (inScope > 0) return;
      // Hors scope. L'enregistrement est-il au moins dans l'org de l'appelant ?
      const inOrg = r ? await delegate().count({ where: { id, AND: [org] } }) : 0;
      if (!r || inOrg === 0) {
        // Hors org (autre tenant) ou inexistant -> refus dur, toujours 404.
        throw new NotFoundError(resource, id);
      }
      // Dans l'org mais hors du jeu d'agences : soumis au mode shadow.
      if (!scopeEnforced()) {
        // eslint-disable-next-line no-console
        console.warn(
          `[SCOPE-DENY] user=${ctx.userId} resource=${resource} id=${id} agencies=[${ctx.agencyIds.join(',')}]`,
        );
        return;
      }
      throw new NotFoundError(resource, id);
    },
    async assertMany(ids, ctx) {
      if (!ctx.orgId || ids.length === 0) return;
      const org = buildOrgWhere(ctx.orgId);
      const unique = Array.from(new Set(ids));
      const r = restriction(ctx);
      const and = r ? [org, r] : [org];
      const inScope = await delegate().count({ where: { id: { in: unique }, AND: and } });
      if (inScope === unique.length) return;
      // Au moins un id hors du scope courant. Verifie l'appartenance a l'org.
      const inOrg = await delegate().count({ where: { id: { in: unique }, AND: [org] } });
      if (inOrg < unique.length) {
        // Au moins un id hors org (autre tenant) ou inexistant -> refus dur.
        throw new NotFoundError(resource, ids.join(','));
      }
      // Tous dans l'org mais certains hors agence : soumis au mode shadow.
      if (!r || !scopeEnforced()) {
        if (r) {
          // eslint-disable-next-line no-console
          console.warn(
            `[SCOPE-DENY] user=${ctx.userId} resource=${resource} batch=${unique.length} inScope=${inScope}`,
          );
        }
        return;
      }
      throw new NotFoundError(resource, ids.join(','));
    },
  };
}

// ============================================================
// Resolvers par ressource
// ============================================================

/**
 * Colis : jeu d'agences = entrepot courant ∪ entrepot d'origine ∪ agence de
 * destination ∪ agences (depart/arrivee) du conteneur courant et du dernier
 * conteneur. Un colis A->B est invisible pour un personnel de l'agence C.
 */
export const parcelScope = makeScope<Prisma.ParcelWhereInput>(
  'Parcel',
  () => prisma.parcel,
  (ids) => ({
    OR: [
      { warehouse: { agencyId: { in: ids } } },
      { originalWarehouse: { agencyId: { in: ids } } },
      { destinationAgencyId: { in: ids } },
      { container: { OR: [{ departureAgencyId: { in: ids } }, { arrivalAgencyId: { in: ids } }] } },
      { lastContainer: { OR: [{ departureAgencyId: { in: ids } }, { arrivalAgencyId: { in: ids } }] } },
    ],
  }),
);

/** Conteneur : agence de depart ou d'arrivee (champs requis au schema). */
export const containerScope = makeScope<Prisma.ContainerWhereInput>(
  'Container',
  () => prisma.container,
  (ids) => ({
    OR: [{ departureAgencyId: { in: ids } }, { arrivalAgencyId: { in: ids } }],
  }),
);

/** Manifeste : via le conteneur porteur. */
export const manifestScope = makeScope<Prisma.ShippingManifestWhereInput>(
  'ShippingManifest',
  () => prisma.shippingManifest,
  (ids) => ({
    container: {
      OR: [{ departureAgencyId: { in: ids } }, { arrivalAgencyId: { in: ids } }],
    },
  }),
  (orgId) => ({ container: { organizationId: orgId } }),
);

/** Entrepot : agence directe. */
export const warehouseScope = makeScope<Prisma.WarehouseWhereInput>(
  'Warehouse',
  () => prisma.warehouse,
  (ids) => ({ agencyId: { in: ids } }),
  (orgId) => ({ agency: { organizationId: orgId } }),
);

/**
 * Client : agence d'enregistrement, ou activite dans une agence du user
 * (colis ou facture rattaches), ou client sans agence (org-wide).
 */
export const clientScope = makeScope<Prisma.ClientWhereInput>(
  'Client',
  () => prisma.client,
  (ids) => ({
    OR: [
      { agencyId: { in: ids } },
      { agencyId: null },
      { invoices: { some: { agencyId: { in: ids } } } },
      { parcels: { some: { warehouse: { agencyId: { in: ids } } } } },
      { parcels: { some: { destinationAgencyId: { in: ids } } } },
    ],
  }),
);

/** Employe : agence principale ou affectations. */
export const employeeScope = makeScope<Prisma.EmployeeWhereInput>(
  'Employee',
  () => prisma.employee,
  (ids) => ({
    OR: [
      { agencyId: { in: ids } },
      { agencyAssignments: { some: { agencyId: { in: ids } } } },
    ],
  }),
  (orgId) => ({ agency: { organizationId: orgId } }),
);

/** Groupe de colis : agence directe. */
export const parcelGroupScope = makeScope<Prisma.ParcelGroupWhereInput>(
  'ParcelGroup',
  () => prisma.parcelGroup,
  (ids) => ({ agencyId: { in: ids } }),
);

// --- Finance : rattachement agence direct ---

// Invoice/Payment n'ont PAS de scalaire organizationId : l'isolation tenant
// passe par l'agence emettrice (agencyId requis au schema). Le defaut
// `{ organizationId }` faisait crasher tout assert (PrismaValidationError,
// ex: enregistrement d'un paiement au backoffice).
export const invoiceScope = makeScope<Prisma.InvoiceWhereInput>(
  'Invoice',
  () => prisma.invoice,
  (ids) => ({ agencyId: { in: ids } }),
  (orgId) => ({ agency: { organizationId: orgId } }),
);

export const paymentScope = makeScope<Prisma.PaymentWhereInput>(
  'Payment',
  () => prisma.payment,
  (ids) => ({ agencyId: { in: ids } }),
  (orgId) => ({ agency: { organizationId: orgId } }),
);

export const cashRegisterScope = makeScope<Prisma.AgencyCashRegisterWhereInput>(
  'AgencyCashRegister',
  () => prisma.agencyCashRegister,
  (ids) => ({ agencyId: { in: ids } }),
  (orgId) => ({ agency: { organizationId: orgId } }),
);

export const disbursementScope = makeScope<Prisma.DisbursementVoucherWhereInput>(
  'DisbursementVoucher',
  () => prisma.disbursementVoucher,
  (ids) => ({ agencyId: { in: ids } }),
  (orgId) => ({ agency: { organizationId: orgId } }),
);

export const expenseScope = makeScope<Prisma.ExpenseWhereInput>(
  'Expense',
  () => prisma.expense,
  // Depense siege (headOfficeCashRegisterId) : reservee a l'admin -> exclue ici.
  (ids) => ({ agencyId: { in: ids } }),
  (orgId) => ({ agency: { organizationId: orgId } }),
);

export const penaltyScope = makeScope<Prisma.PenaltyWhereInput>(
  'Penalty',
  () => prisma.penalty,
  (ids) => ({ agencyId: { in: ids } }),
  (orgId) => ({ agency: { organizationId: orgId } }),
);

export const journalEntryScope = makeScope<Prisma.JournalEntryWhereInput>(
  'JournalEntry',
  () => prisma.journalEntry,
  (ids) => ({ agencyId: { in: ids } }),
  (orgId) => ({ agency: { organizationId: orgId } }),
);

export const fundTransferScope = makeScope<Prisma.FundTransferWhereInput>(
  'FundTransfer',
  () => prisma.fundTransfer,
  (ids) => ({
    OR: [{ sourceAgencyId: { in: ids } }, { destinationAgencyId: { in: ids } }],
  }),
  (orgId) => ({
    OR: [
      { sourceOrganizationId: orgId },
      { sourceAgency: { organizationId: orgId } },
      { destinationAgency: { organizationId: orgId } },
    ],
  }),
);

/** Dette : agence directe (champ requis au schema). */
export const debtScope = makeScope<Prisma.DebtWhereInput>(
  'Debt',
  () => prisma.debt,
  (ids) => ({ agencyId: { in: ids } }),
);

export const debtPaymentScope = makeScope<Prisma.DebtPaymentWhereInput>(
  'DebtPayment',
  () => prisma.debtPayment,
  (ids) => ({ agencyId: { in: ids } }),
  // Pas de scalaire organizationId : isolation via l'agence (requise).
  (orgId) => ({ agency: { organizationId: orgId } }),
);

// --- Communication ---

/** Conversation support : agence directe (champ requis au schema). */
export const chatConversationScope = makeScope<Prisma.ChatConversationWhereInput>(
  'ChatConversation',
  () => prisma.chatConversation,
  (ids) => ({ agencyId: { in: ids } }),
  // Pas de scalaire organizationId : isolation via l'agence (requise).
  (orgId) => ({ agency: { organizationId: orgId } }),
);

/** Notifications org (listing admin) : agence directe ; null = org-wide. */
export const notificationScope = makeScope<Prisma.NotificationWhereInput>(
  'Notification',
  () => prisma.notification,
  (ids) => ({ OR: [{ agencyId: { in: ids } }, { agencyId: null }] }),
);

/** Audit : evenements rattaches a une agence du user ; null = org-wide. */
export const auditLogScope = makeScope<Prisma.AuditLogWhereInput>(
  'AuditLog',
  () => prisma.auditLog,
  (ids) => ({ OR: [{ agencyId: { in: ids } }, { agencyId: null }] }),
  // Pas de scalaire organizationId : isolation via l'agence OU l'utilisateur
  // auteur (les deux sont nullables -> OR).
  (orgId) => ({
    OR: [{ agency: { organizationId: orgId } }, { user: { organizationId: orgId } }],
  }),
);

// Ressources volontairement SANS scope agence (referentiels org-wide) :
// TransitRoute, Carrier, PaymentMethodConfig, LoyaltyTierConfig, Currency,
// Position/Permission, Organization config, HeadOffice* (reserve admin via
// headoffice.* + authorize).

/**
 * Helper listes : merge un fragment de scope dans un where existant SANS
 * ecraser un eventuel OR de recherche (toujours via AND).
 */
export function andWhere<T extends AnyWhere>(where: T, scope: AnyWhere | undefined): T {
  if (!scope) return where;
  const existing = (where as { AND?: unknown }).AND;
  const and = Array.isArray(existing) ? [...existing, scope] : existing ? [existing, scope] : [scope];
  return { ...where, AND: and };
}
