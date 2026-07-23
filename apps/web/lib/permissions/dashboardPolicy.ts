// ============================================================
// SOURCE DE VERITE UNIQUE — Politique de permissions des routes du dashboard
// ============================================================
// Carte route -> permission(s) requise(s), consommee par <PermissionGate> (web
// et web-desktop). Regle de resolution : PREFIXE LE PLUS LONG (le plus
// specifique gagne) — c'est ce qui permet a `/clients/kyc` de primer sur
// `/clients`, et a `/admin/personnel/permissions` de primer sur `/admin`.
//
// Semantique :
//   - `anyOf` : l'utilisateur passe s'il detient AU MOINS UNE de ces cles.
//     Tableau vide => aucune contrainte de permission (route libre).
//   - `adminOnly` : reserve au role ADMIN / SUPER_ADMIN. Les permissions ne
//     suffisent PAS ; seul le role admin passe. Utilise pour les surfaces
//     verrouillees cote API par `authorize('ADMIN','SUPER_ADMIN')` (KYC, audit
//     n'est PAS adminOnly cote API mais reste sensible — voir plus bas — ;
//     admin RH matrice/exceptions, /admin/loyalty via /system/loyalty-config,
//     tout /settings).
//
// IMPORTANT : ce guard n'est QUE de l'UX. La securite reelle est cote API
// (requirePermission + authorize). Toute entree ici doit refleter le gardien
// backend correspondant. Cf. docs/permissions-audit.md.

export interface RoutePolicy {
  /** Prefixe de chemin (sans slash final). */
  prefix: string;
  /** Une de ces cles suffit. Vide = libre (si !adminOnly). */
  anyOf: string[];
  /** Reserve ADMIN/SUPER_ADMIN quelles que soient les permissions. */
  adminOnly?: boolean;
}

// L'ordre de declaration n'importe pas : `matchRoutePolicy` trie par longueur
// de prefixe decroissante. On garde un ordre lisible par domaine.
export const ROUTE_POLICY: RoutePolicy[] = [
  // --- Logistique -------------------------------------------------------
  { prefix: '/agencies', anyOf: ['agency.read'] },
  { prefix: '/warehouses', anyOf: ['warehouse.read'] },
  // KYC : dossiers d'identite (PII sensible). Cote API la liste `pending` et
  // l'action `verify` sont sous authorize('ADMIN','SUPER_ADMIN') -> adminOnly
  // pour eviter qu'un simple `client.read` monte la page puis se prenne un 403.
  { prefix: '/clients/kyc', anyOf: [], adminOnly: true },
  { prefix: '/clients', anyOf: ['client.read'] },
  { prefix: '/parcels', anyOf: ['parcel.read'] },
  { prefix: '/parcel-groups', anyOf: ['parcel.read', 'parcelgroup.manage'] },
  { prefix: '/containers', anyOf: ['container.read'] },
  { prefix: '/carriers', anyOf: ['carrier.read'] },
  { prefix: '/transit-routes', anyOf: ['transitroute.read'] },

  // --- Finance ----------------------------------------------------------
  { prefix: '/invoices', anyOf: ['invoice.read'] },
  { prefix: '/payments', anyOf: ['payment.read'] },
  { prefix: '/cash-register', anyOf: ['cashregister.read'] },
  { prefix: '/disbursements', anyOf: ['disbursement.read'] },
  { prefix: '/fund-transfers', anyOf: ['transfer.read'] },
  { prefix: '/accounting', anyOf: ['accounting.read'] },
  { prefix: '/expenses', anyOf: ['expense.read'] },
  { prefix: '/debts', anyOf: ['debt.read'] },
  { prefix: '/finance-history', anyOf: ['finance.history.read', 'finance.dashboard.read'] },

  // --- Systeme ----------------------------------------------------------
  { prefix: '/employees', anyOf: ['personnel.read'] },
  { prefix: '/loyalty', anyOf: ['loyalty.read'] },
  { prefix: '/penalties', anyOf: ['penalty.read'] },
  { prefix: '/notification-center', anyOf: ['notification.read'] },
  { prefix: '/notifications', anyOf: ['notification.read'] },
  { prefix: '/chat', anyOf: ['support.read'] },
  { prefix: '/reports', anyOf: ['report.read'] },
  { prefix: '/audit-log', anyOf: ['audit.read'] },

  // --- Administration RH (les 5 onglets — prefixe long => specifique) ----
  { prefix: '/admin/personnel/permissions', anyOf: ['permission.manage'], adminOnly: true },
  { prefix: '/admin/personnel/exceptions', anyOf: ['permission.manage'], adminOnly: true },
  { prefix: '/admin/personnel/postes', anyOf: ['position.manage', 'personnel.read'] },
  { prefix: '/admin/personnel/plannings', anyOf: ['schedule.manage'] },
  { prefix: '/admin/personnel/jours-non-ouvres', anyOf: ['holiday.manage'] },
  { prefix: '/admin/personnel', anyOf: ['position.manage', 'personnel.read', 'schedule.manage', 'holiday.manage'] },
  // /admin/loyalty tape /system/loyalty-config, verrouille authorize('ADMIN').
  { prefix: '/admin/loyalty', anyOf: [], adminOnly: true },
  // Filet de securite : toute autre page /admin est reservee admin.
  { prefix: '/admin', anyOf: [], adminOnly: true },

  // --- Parametres / branding / studio site (tous admin tenant) ----------
  { prefix: '/settings', anyOf: [], adminOnly: true },
];

// Precalcule l'ordre par prefixe decroissant (le plus specifique en premier).
const SORTED_POLICY = [...ROUTE_POLICY].sort((a, b) => b.prefix.length - a.prefix.length);

/**
 * Resout la politique applicable a un chemin par prefixe LE PLUS LONG.
 * Chemin sans entree => libre (anyOf vide, adminOnly false).
 */
export function matchRoutePolicy(pathname: string): { anyOf: string[]; adminOnly: boolean } {
  const match = SORTED_POLICY.find(
    (m) => pathname === m.prefix || pathname.startsWith(m.prefix + '/'),
  );
  return { anyOf: match?.anyOf ?? [], adminOnly: !!match?.adminOnly };
}
