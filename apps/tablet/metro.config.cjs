/**
 * Metro — configuration monorepo (pnpm) pour la tablette.
 * Surveille la racine workspace + resoud les modules hoisted au niveau
 * workspace. blockList exclut apps/mobile pour eviter que Metro ou
 * Expo Router ne traversent les fichiers de l'app mobile voisine.
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
const mobileRoot = path.resolve(workspaceRoot, 'apps', 'mobile').replace(/\\/g, '/');
config.resolver.blockList = new RegExp(`^${mobileRoot}(/.*)?$`);

module.exports = config;
