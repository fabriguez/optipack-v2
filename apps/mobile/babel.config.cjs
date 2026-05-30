/** Babel — Expo + alias @/ ancre sur __dirname (mobile) + Reanimated en dernier. */
const path = require('path');

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: [__dirname],
          alias: { '@': __dirname },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};

// Ancre `@` sur le dossier du babel.config (apps/mobile). Sans cela,
// './' resout via cwd : si Metro a tourne depuis apps/tablet en parallele,
// `@` pointe sur tablet -> "Unable to resolve module ../../../tablet/...".
void path;
