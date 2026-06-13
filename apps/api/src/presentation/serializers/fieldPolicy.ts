import type { PolicyContext } from '../middleware/policyContext';

/** Mode de masquage.
 *  ref  → objet → { id, masked: true }
 *  null → champ mis à null
 *  snap → chaîne snapshot → "•••"
 */
export type RedactMode = 'ref' | 'null' | 'snap';

export interface FieldRule {
  /** Clé(s) de permission — au moins UNE suffit (OR). */
  require: string | string[];
  redact: RedactMode;
}

export type FieldPolicy = Record<string, FieldRule>;

type Ctx = Pick<PolicyContext, 'can'>;

/**
 * Applique une politique de masquage sur un objet ou un tableau.
 * Immutable : retourne un clone — ne mute jamais l'original.
 * Les chemins utilisent la notation pointée ("client.phone").
 * Un chemin parent masqué protège automatiquement ses sous-chemins.
 */
export function applyFieldPolicy<T>(data: T, policy: FieldPolicy, ctx: Ctx): T {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return (data as unknown[]).map((item) => applyFieldPolicy(item, policy, ctx)) as unknown as T;
  }

  const rules = Object.entries(policy).sort(
    (a, b) => a[0].split('.').length - b[0].split('.').length,
  );

  const maskedPaths = new Set<string>();
  let result = { ...(data as object) } as Record<string, unknown>;

  for (const [path, rule] of rules) {
    const segments = path.split('.');
    const parentPath = segments.slice(0, -1).join('.');
    if (parentPath && maskedPaths.has(parentPath)) continue;

    const keys = Array.isArray(rule.require) ? rule.require : [rule.require];
    const hasPermission = keys.some((k) => ctx.can(k));
    if (!hasPermission) {
      maskedPaths.add(path);
      result = applyRedaction(result, segments, rule.redact);
    }
  }

  return result as T;
}

function applyRedaction(
  obj: Record<string, unknown>,
  path: string[],
  mode: RedactMode,
): Record<string, unknown> {
  const [head, ...tail] = path;
  if (!Object.prototype.hasOwnProperty.call(obj, head)) return obj;
  const clone = { ...obj };

  if (tail.length === 0) {
    const current = clone[head];
    if (mode === 'ref') {
      if (Array.isArray(current)) {
        clone[head] = current.map((item) =>
          item && typeof item === 'object' ? { id: (item as Record<string, unknown>).id ?? null, masked: true } : item,
        );
      } else if (current && typeof current === 'object') {
        clone[head] = { id: (current as Record<string, unknown>).id ?? null, masked: true };
      }
    } else if (mode === 'null') {
      clone[head] = null;
    } else {
      clone[head] = typeof current === 'string' ? '•••' : null;
    }
    return clone;
  }

  const child = clone[head];
  if (Array.isArray(child)) {
    clone[head] = child.map((item) =>
      item && typeof item === 'object'
        ? applyRedaction(item as Record<string, unknown>, tail, mode)
        : item,
    );
  } else if (child && typeof child === 'object') {
    clone[head] = applyRedaction(child as Record<string, unknown>, tail, mode);
  }
  return clone;
}

// ============================================================
// Politiques par ressource
// ============================================================

/** Colis — client, destinataire, PII contact, données de facturation. */
export const PARCEL_FIELD_POLICY: FieldPolicy = {
  client:             { require: 'client.read',         redact: 'ref'  },
  recipient:          { require: 'client.read',         redact: 'ref'  },
  'client.phone':     { require: 'client.contact.read', redact: 'null' },
  'client.email':     { require: 'client.contact.read', redact: 'null' },
  'recipient.phone':  { require: 'client.contact.read', redact: 'null' },
  'recipient.email':  { require: 'client.contact.read', redact: 'null' },
  price:              { require: 'invoice.read',         redact: 'null' },
  pricingBreakdown:   { require: 'invoice.read',         redact: 'null' },
};

/** Facture — client, parcels imbriqués, historique remises. */
export const INVOICE_FIELD_POLICY: FieldPolicy = {
  client:                 { require: 'client.read',         redact: 'ref'  },
  'client.phone':         { require: 'client.contact.read', redact: 'null' },
  'client.email':         { require: 'client.contact.read', redact: 'null' },
  'parcels':              { require: 'parcel.read',          redact: 'null' },
  'parcels.recipient':    { require: 'client.read',         redact: 'ref'  },
  'discountHistory.user': { require: 'personnel.read',       redact: 'ref'  },
  'payments.receivedBy':  { require: 'personnel.read',       redact: 'ref'  },
};

/** Paiement — caissier, annulant, référence facture. */
export const PAYMENT_FIELD_POLICY: FieldPolicy = {
  receivedBy: { require: 'personnel.read', redact: 'ref'  },
  voidedBy:   { require: 'personnel.read', redact: 'ref'  },
};

/**
 * Ligne de bordereau (données snapshotées = chaînes).
 * clientPhone/Email exigent client.contact.read ; clientName exige client.read.
 */
export const MANIFEST_LINE_FIELD_POLICY: FieldPolicy = {
  clientName:       { require: 'client.read',         redact: 'snap' },
  clientPhone:      { require: 'client.contact.read', redact: 'snap' },
  clientEmail:      { require: 'client.contact.read', redact: 'snap' },
  recipientName:    { require: 'client.read',         redact: 'snap' },
  recipientPhone:   { require: 'client.contact.read', redact: 'snap' },
  recipientEmail:   { require: 'client.contact.read', redact: 'snap' },
  price:            { require: 'invoice.read',         redact: 'null' },
  advanceAmount:    { require: 'invoice.read',         redact: 'null' },
  balanceAmount:    { require: 'invoice.read',         redact: 'null' },
};

/** Dette — client, employé, transporteur. */
export const DEBT_FIELD_POLICY: FieldPolicy = {
  client:   { require: 'client.read',    redact: 'ref' },
  employee: { require: 'personnel.read', redact: 'ref' },
};

/** Dépense — approbateur, payeur. */
export const EXPENSE_FIELD_POLICY: FieldPolicy = {
  approvedBy: { require: 'personnel.read', redact: 'ref' },
  paidBy:     { require: 'personnel.read', redact: 'ref' },
  createdBy:  { require: 'personnel.read', redact: 'ref' },
};

/** Décaissement — ordonnateur, créé par. */
export const DISBURSEMENT_FIELD_POLICY: FieldPolicy = {
  orderedBy:  { require: 'personnel.read', redact: 'ref' },
  approvedBy: { require: 'personnel.read', redact: 'ref' },
  client:     { require: 'client.read',    redact: 'ref' },
};

/** Conversation support — PII client. */
export const CHAT_FIELD_POLICY: FieldPolicy = {
  'client.phone': { require: 'client.contact.read', redact: 'null' },
  'client.email': { require: 'client.contact.read', redact: 'null' },
};

/** Employé — données personnelles visibles uniquement avec personnel.read. */
export const EMPLOYEE_FIELD_POLICY: FieldPolicy = {
  'agency.phone':   { require: 'personnel.read', redact: 'null' },
};

/** Pénalité — client, colis. */
export const PENALTY_FIELD_POLICY: FieldPolicy = {
  client:  { require: 'client.read',  redact: 'ref' },
  parcel:  { require: 'parcel.read',  redact: 'ref' },
};
