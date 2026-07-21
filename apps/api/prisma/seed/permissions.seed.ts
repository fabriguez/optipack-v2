// La logique et les catalogues de seed ABAC vivent desormais dans `src/`
// (compile dans dist) pour etre partages entre le seed CLI (ce fichier, via
// prisma/seed.ts) et le self-heal runtime (src/index.ts -> PermissionSeedService).
// `prisma/` etant exclu du build tsc, aucune donnee de seed ne doit y rester :
// ce module n'est plus qu'un point d'entree retro-compatible.
export {
  PERMISSION_CATALOG,
  POSITION_CATALOG,
  LEGACY_ROLE_TO_POSITION,
} from '../../src/domain/permissions/permission-catalog';
export {
  seedPermissionsAndPositions,
  migrateLegacyRolePositions,
  ensurePermissionCatalog,
} from '../../src/application/services/PermissionSeedService';
