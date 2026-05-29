// Wrapper local autour de expo-router/entry. Path explicite avec
// extension .js pour eviter que Metro+pnpm cherche via la map "exports"
// du package (qui peut faire echouer la resolution dans certains setups
// monorepo).
require('expo-router/entry.js');
