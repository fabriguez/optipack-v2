// ============================================================
// SOURCE DE VERITE UNIQUE — Politique de permissions des routes du dashboard
// ============================================================
// Copie synchronisee de apps/web/lib/permissions/dashboardPolicy.ts. Les deux
// apps (web Next.js + web-desktop Tauri) partagent EXACTEMENT la meme carte.
// TODO(shared) : extraire dans packages/shared pour un import unique.
//
// Regle de resolution : PREFIXE LE PLUS LONG (le plus specifique gagne) — c'est
// ce qui permet a `/clients/kyc` de primer sur `/clients`, et a
// `/admin/personnel/permissions` de primer sur `/admin`.
//
// IMPORTANT : ce guard n'est QUE de l'UX. La securite reelle est cote API.

export interface RoutePolicy {
  prefix: string;
  anyOf: string[];
  adminOnly?: boolean;
}

export const ROUTE_POLICY: RoutePolicy[] = [
  // --- Logistique -------------------------------------------------------
  { prefix: '/agencies', anyOf: ['agency.read'] },
  { prefix: '/warehouses', anyOf: ['warehouse.read'] },
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

  // --- Administration RH (prefixe long => specifique) -------------------
  { prefix: '/admin/personnel/permissions', anyOf: ['permission.manage'], adminOnly: true },
  { prefix: '/admin/personnel/exceptions', anyOf: ['permission.manage'], adminOnly: true },
  { prefix: '/admin/personnel/postes', anyOf: ['position.manage', 'personnel.read'] },
  { prefix: '/admin/personnel/plannings', anyOf: ['schedule.manage'] },
  { prefix: '/admin/personnel/jours-non-ouvres', anyOf: ['holiday.manage'] },
  { prefix: '/admin/personnel', anyOf: ['position.manage', 'personnel.read', 'schedule.manage', 'holiday.manage'] },
  { prefix: '/admin/loyalty', anyOf: [], adminOnly: true },
  { prefix: '/admin', anyOf: [], adminOnly: true },

  // --- Parametres / branding / studio site (admin tenant) ---------------
  { prefix: '/settings', anyOf: [], adminOnly: true },
];

const SORTED_POLICY = [...ROUTE_POLICY].sort((a, b) => b.prefix.length - a.prefix.length);

export function matchRoutePolicy(pathname: string): { anyOf: string[]; adminOnly: boolean } {
  const match = SORTED_POLICY.find(
    (m) => pathname === m.prefix || pathname.startsWith(m.prefix + '/'),
  );
  return { anyOf: match?.anyOf ?? [], adminOnly: !!match?.adminOnly };
}
