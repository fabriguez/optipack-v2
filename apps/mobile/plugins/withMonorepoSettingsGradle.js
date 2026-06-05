const { withSettingsGradle } = require('expo/config-plugins');

/**
 * Fix monorepo pnpm pour EAS prebuild.
 *
 * Le template Expo SDK 51 genere dans android/settings.gradle (ligne ~7) :
 *
 *   includeBuild(new File([... "require.resolve('@react-native/gradle-plugin/package.json')" ...]))
 *
 * En pnpm (node_modules isoles, pas de hoisting plat), `@react-native/gradle-plugin`
 * n'est PAS un dependance directe de l'app : la resolution "bare" depuis le dossier
 * android echoue -> chaine vide -> `File('').getParentFile()` == null ->
 * `includeBuild('.../null')` -> "Included build '.../android/null' does not exist".
 *
 * On reecrit la resolution en passant par `react-native` (dont gradle-plugin EST
 * une dependance), forme deja utilisee plus bas dans le meme fichier :
 *
 *   require.resolve('@react-native/gradle-plugin/package.json',
 *     { paths: [require.resolve('react-native/package.json')] })
 *
 * Idempotent : si la forme `paths:` est deja presente, on ne touche pas.
 */
const BARE = "require.resolve('@react-native/gradle-plugin/package.json')";
const FIXED =
  "require.resolve('@react-native/gradle-plugin/package.json', { paths: [require.resolve('react-native/package.json')] })";

module.exports = function withMonorepoSettingsGradle(config) {
  return withSettingsGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(BARE)) {
      cfg.modResults.contents = cfg.modResults.contents.split(BARE).join(FIXED);
    }
    return cfg;
  });
};
