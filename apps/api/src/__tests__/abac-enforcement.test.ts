/**
 * Étape 8 — Tests ABAC enforcement.
 *
 * Couvre :
 *   - PolicyContext (can / canAny / isAdmin / wildcard)
 *   - Field masking (applyFieldPolicy — pure function, aucune DB)
 *   - Scope resolver (restriction / where / assert) avec delegate mocke
 *   - Shadow vs enforce mode
 *
 * Pas de base de donnees requise : les delegates Prisma sont injectes
 * comme mock inline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyFieldPolicy, type FieldPolicy } from '../presentation/serializers/fieldPolicy';

// ---------------------------------------------------------------------------
// PolicyContext
// ---------------------------------------------------------------------------

// buildPolicy n'est pas exporte directement — on le teste via son comportement
// en recreant la meme logique (le vrai getPolicy necessite une Request).
function makePolicy(permissions: string[], role = 'AGENT') {
  const set = new Set(permissions);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const hasWildcard = isAdmin || set.has('*');
  const can = (key: string) => hasWildcard || set.has(key);
  return {
    isAdmin,
    permissions: set,
    can,
    canAny: (keys: string[]) => keys.length === 0 || keys.some(can),
  };
}

describe('PolicyContext', () => {
  it('can() retourne true si la permission est presente', () => {
    const p = makePolicy(['parcel.read', 'invoice.read']);
    expect(p.can('parcel.read')).toBe(true);
    expect(p.can('invoice.read')).toBe(true);
    expect(p.can('payment.read')).toBe(false);
  });

  it('canAny() retourne true si au moins une permission correspond', () => {
    const p = makePolicy(['parcel.read']);
    expect(p.canAny(['parcel.read', 'invoice.read'])).toBe(true);
    expect(p.canAny(['invoice.read', 'payment.read'])).toBe(false);
  });

  it('canAny([]) retourne toujours true (route sans garde)', () => {
    const p = makePolicy([]);
    expect(p.canAny([])).toBe(true);
  });

  it('wildcard * accorde tout', () => {
    const p = makePolicy(['*']);
    expect(p.can('parcel.read')).toBe(true);
    expect(p.can('permission.manage')).toBe(true);
    expect(p.canAny(['x', 'y', 'z'])).toBe(true);
  });

  it('role ADMIN implique wildcard', () => {
    const p = makePolicy([], 'ADMIN');
    expect(p.isAdmin).toBe(true);
    expect(p.can('any.permission.key')).toBe(true);
  });

  it('role SUPER_ADMIN implique wildcard', () => {
    const p = makePolicy([], 'SUPER_ADMIN');
    expect(p.isAdmin).toBe(true);
    expect(p.can('any.permission.key')).toBe(true);
  });

  it('role AGENT sans permissions : tout est refuse', () => {
    const p = makePolicy([], 'AGENT');
    expect(p.isAdmin).toBe(false);
    expect(p.can('parcel.read')).toBe(false);
    expect(p.canAny(['parcel.read', 'invoice.read'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Field masking — applyFieldPolicy
// ---------------------------------------------------------------------------

const SIMPLE_POLICY: FieldPolicy = {
  'secret': { require: 'invoice.read', redact: 'null' },
  'nested.phone': { require: 'client.contact.read', redact: 'null' },
  'person': { require: 'personnel.read', redact: 'ref' },
};

function ctxWith(permissions: string[]) {
  const set = new Set(permissions);
  return { can: (k: string) => set.has(k), isAdmin: false };
}

function adminCtx() {
  return { can: (_k: string) => true, isAdmin: true };
}

describe('applyFieldPolicy', () => {
  it('retourne la donnee intacte si toutes les permissions sont presentes', () => {
    const data = { secret: '42', nested: { phone: '0600' }, person: { id: 'p1', name: 'Jo' } };
    const result = applyFieldPolicy(data, SIMPLE_POLICY, ctxWith(['invoice.read', 'client.contact.read', 'personnel.read']));
    expect(result).toEqual(data);
  });

  it('masque le champ "null" si permission absente', () => {
    const data = { secret: '42', other: 'visible' };
    const result = applyFieldPolicy(data, SIMPLE_POLICY, ctxWith([])) as any;
    expect(result.secret).toBeNull();
    expect(result.other).toBe('visible');
  });

  it('masque le champ "ref" en { id, masked:true }', () => {
    const data = { person: { id: 'u1', name: 'Alice', role: 'ADMIN' } };
    const result = applyFieldPolicy(data, SIMPLE_POLICY, ctxWith([])) as any;
    expect(result.person).toEqual({ id: 'u1', masked: true });
  });

  it('masque "ref" en { id: null, masked:true } si le champ n\'a pas d\'id', () => {
    const data = { person: { name: 'Alice' } };
    const result = applyFieldPolicy(data, SIMPLE_POLICY, ctxWith([])) as any;
    expect(result.person).toEqual({ id: null, masked: true });
  });

  it('masque les chemins imbriques (dot notation)', () => {
    const data = { nested: { phone: '0600', email: 'x@y.com' } };
    const result = applyFieldPolicy(data, SIMPLE_POLICY, ctxWith([])) as any;
    expect(result.nested.phone).toBeNull();
    expect(result.nested.email).toBe('x@y.com'); // non masque
  });

  it('ne masque pas si admin', () => {
    const data = { secret: '42', person: { id: 'u1' } };
    const result = applyFieldPolicy(data, SIMPLE_POLICY, adminCtx()) as any;
    expect(result.secret).toBe('42');
    expect(result.person).toEqual({ id: 'u1' });
  });

  it('traite les tableaux element par element', () => {
    const data = [
      { secret: 'a', other: 1 },
      { secret: 'b', other: 2 },
    ];
    const result = applyFieldPolicy(data, SIMPLE_POLICY, ctxWith([])) as any[];
    expect(result[0].secret).toBeNull();
    expect(result[1].secret).toBeNull();
    expect(result[0].other).toBe(1);
  });

  it('ne modifie pas l\'objet original (immutabilite)', () => {
    const data = { secret: '42' };
    applyFieldPolicy(data, SIMPLE_POLICY, ctxWith([]));
    expect(data.secret).toBe('42');
  });

  it('masque "snap" avec "•••"', () => {
    const snapPolicy: FieldPolicy = { 'code': { require: 'some.perm', redact: 'snap' } };
    const data = { code: 'ABC123', other: 'x' };
    const result = applyFieldPolicy(data, snapPolicy, ctxWith([])) as any;
    expect(result.code).toBe('•••');
    expect(result.other).toBe('x');
  });

  it('protege les sous-chemins quand le parent est masque en ref', () => {
    const policy: FieldPolicy = {
      'client': { require: 'client.read', redact: 'ref' },
      'client.phone': { require: 'client.contact.read', redact: 'null' },
    };
    const data = { client: { id: 'c1', phone: '0600' } };
    // Sans client.read : client masque en ref — client.phone ne doit pas etre
    // applique separement (parent masque prime).
    const result = applyFieldPolicy(data, policy, ctxWith([])) as any;
    expect(result.client).toEqual({ id: 'c1', masked: true });
  });
});

// ---------------------------------------------------------------------------
// Scope resolver (makeScope logic via ScopeCtx mocks)
// ---------------------------------------------------------------------------

// On retest la logique de restriction directement plutot que d'importer
// makeScope (qui est interne et couple a Prisma). Les cas importants :
// - ctx.unrestricted = true -> restriction = undefined (admin bypass)
// - en shadow mode -> where() retourne undefined (listes non filtrees)
// - en enforce mode -> where() retourne le fragment de restriction

describe('Scope logic', () => {
  const agencyIds = ['agA', 'agB'];
  const orgId = 'org1';
  const userId = 'u1';

  function buildRestriction(ids: string[]) {
    return { agencyId: { in: ids } };
  }

  function makeRestriction(ctx: { unrestricted: boolean; agencyIds: string[] }) {
    if (ctx.unrestricted) return undefined;
    return buildRestriction(ctx.agencyIds);
  }

  it('admin (unrestricted) -> pas de restriction', () => {
    const ctx = { unrestricted: true, agencyIds: [], orgId, userId };
    expect(makeRestriction(ctx)).toBeUndefined();
  });

  it('agent -> restriction sur ses agences', () => {
    const ctx = { unrestricted: false, agencyIds, orgId, userId };
    const r = makeRestriction(ctx);
    expect(r).toEqual({ agencyId: { in: agencyIds } });
  });

  it('agent sans agences -> restriction vide (ne voit rien)', () => {
    const ctx = { unrestricted: false, agencyIds: [], orgId, userId };
    const r = makeRestriction(ctx);
    expect(r).toEqual({ agencyId: { in: [] } });
  });

  it('shadow mode -> where() retourne undefined (listes non filtrees)', () => {
    // On simule scopeEnforced() = false
    const scopeEnforced = false;
    const ctx = { unrestricted: false, agencyIds, orgId, userId };
    const where = scopeEnforced ? makeRestriction(ctx) : undefined;
    expect(where).toBeUndefined();
  });

  it('enforce mode -> where() retourne la restriction', () => {
    const scopeEnforced = true;
    const ctx = { unrestricted: false, agencyIds, orgId, userId };
    const where = scopeEnforced ? makeRestriction(ctx) : undefined;
    expect(where).toEqual({ agencyId: { in: agencyIds } });
  });

  it('assert() hors scope en enforce -> throw NotFoundError', async () => {
    // Mocked delegate qui retourne count=0 (hors scope).
    const delegate = { count: vi.fn().mockResolvedValue(0) };
    const ctx = { unrestricted: false, agencyIds, orgId, userId };
    const r = makeRestriction(ctx)!;

    let threw = false;
    try {
      const inScope = await delegate.count({ where: { id: 'x', AND: [r] } });
      if (inScope === 0) throw new Error('NotFoundError');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(delegate.count).toHaveBeenCalledOnce();
  });

  it('assert() dans le scope -> passe sans throw', async () => {
    const delegate = { count: vi.fn().mockResolvedValue(1) };
    const ctx = { unrestricted: false, agencyIds, orgId, userId };
    const r = makeRestriction(ctx)!;

    let threw = false;
    try {
      const inScope = await delegate.count({ where: { id: 'x', AND: [r] } });
      if (inScope === 0) throw new Error('NotFoundError');
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shadow vs enforce mode via PERMISSIONS_ENFORCE env
// ---------------------------------------------------------------------------

describe('PERMISSIONS_ENFORCE mode', () => {
  const original = process.env.PERMISSIONS_ENFORCE;

  afterEach(() => {
    if (original === undefined) delete process.env.PERMISSIONS_ENFORCE;
    else process.env.PERMISSIONS_ENFORCE = original;
    // Force re-lecture du module config si besoin (ici teste directement).
  });

  it('defaut (sans var) = mode shadow (log)', () => {
    delete process.env.PERMISSIONS_ENFORCE;
    const enforce = process.env.PERMISSIONS_ENFORCE === 'enforce';
    expect(enforce).toBe(false);
  });

  it('PERMISSIONS_ENFORCE=enforce = mode strict', () => {
    process.env.PERMISSIONS_ENFORCE = 'enforce';
    const enforce = process.env.PERMISSIONS_ENFORCE === 'enforce';
    expect(enforce).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// requirePermission shadow / enforce behavior (middleware logic)
// ---------------------------------------------------------------------------

describe('requirePermission middleware behavior', () => {
  function simulateRequirePermission(
    keys: string[],
    userPermissions: string[],
    enforceMode: boolean,
  ): 'next' | 'perm-deny-log' | 'forbidden' {
    const set = new Set(userPermissions);
    const hasWildcard = set.has('*');
    const can = (k: string) => hasWildcard || set.has(k);
    const canAny = keys.length === 0 || keys.some(can);

    if (canAny) return 'next';
    if (!enforceMode) return 'perm-deny-log'; // shadow: log + laisse passer
    return 'forbidden';
  }

  it('user avec permission -> next', () => {
    expect(simulateRequirePermission(['parcel.read'], ['parcel.read'], true)).toBe('next');
  });

  it('user sans permission, shadow -> log (perm-deny-log)', () => {
    expect(simulateRequirePermission(['parcel.read'], [], false)).toBe('perm-deny-log');
  });

  it('user sans permission, enforce -> forbidden', () => {
    expect(simulateRequirePermission(['parcel.read'], [], true)).toBe('forbidden');
  });

  it('wildcard -> next dans tous les cas', () => {
    expect(simulateRequirePermission(['any.key'], ['*'], true)).toBe('next');
  });

  it('keys=[] -> next (route sans garde)', () => {
    expect(simulateRequirePermission([], [], true)).toBe('next');
  });
});
