/**
 * Metro — configuration monorepo (pnpm) pour la tablette.
 * Surveille la racine workspace + resoud les modules hoisted au niveau
 * workspace. Pas de blockList : on suppose le store nettoye, une seule
 * version de react-native (0.74.5 = Expo SDK 51).
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

module.exports = config;
