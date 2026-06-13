/**
 * Cles de permission reservees au ROLE admin (ADMIN / SUPER_ADMIN), jamais
 * assignables a un poste ni via un override individuel. L'admin du tenant
 * obtient le wildcard '*' via PermissionService ; ces cles n'ont donc pas
 * besoin d'etre distribuees — les exposer dans la matrice ouvrirait une
 * escalade de privileges (un gestionnaire de postes pourrait s'auto-accorder
 * la gestion des permissions). Cf. PERMISSIONS-PLAN.md decision 3.
 */
export const ADMIN_ONLY_PERMISSION_KEYS: readonly string[] = ['permission.manage'];
