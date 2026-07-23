/**
 * Cles de permission reservees au ROLE admin (ADMIN / SUPER_ADMIN), jamais
 * assignables a un poste ni via un override individuel. L'admin du tenant
 * obtient le wildcard '*' via PermissionService ; ces cles n'ont donc pas
 * besoin d'etre distribuees — les exposer dans la matrice ouvrirait une
 * escalade de privileges (un gestionnaire de postes pourrait s'auto-accorder
 * la gestion des permissions). Cf. PERMISSIONS-PLAN.md decision 3.
 *
 * Chacune de ces cles garde une route dont le routeur applique EN PLUS un
 * `authorize('ADMIN','SUPER_ADMIN')` dur (audit.routes, config.routes,
 * system.routes, tenant-meta, positions/permissions). Les rendre non
 * assignables aligne l'enforcement API (garde dur role) avec le catalogue
 * (libelles « Reserve aux administrateurs »), et evite qu'un poste se voie
 * accorder une cle qui produirait un 403 a l'usage (front la montrerait, l'API
 * la refuserait). Cf. audit X3 (docs/permissions-audit.md).
 */
export const ADMIN_ONLY_PERMISSION_KEYS: readonly string[] = [
  'permission.manage',
  'audit.read',
  'settings.read',
  'system.config',
  'branding.manage',
  'sitestudio.manage',
  'position.manage',
  'user.manage',
];
