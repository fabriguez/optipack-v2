/**
 * Metro — configuration monorepo (pnpm).
 * Metro doit surveiller la racine et resoudre les modules hoisted
 * a la racine du workspace, pas seulement dans apps/mobile.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// pnpm monorepo : .pnpm/ contient plusieurs versions de react-native
// (RN 0.85 hois ailleurs, RN 0.74 ici). On bloque toutes les versions RN
// du store sauf celle attendue. Sans ce blockList, Metro pioche la 0.85
// (TS non-transpile) -> SyntaxError "as ReactNativePublicAPI".
config.resolver.blockList = [
  /\/\.pnpm\/react-native@(?!0\.74\.5)[^/]+\/.*/,
];

module.exports = config;
