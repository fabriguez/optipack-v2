import type { ExpoConfig } from 'expo/config';

/**
 * Multi-tenant white-label tablet build.
 * Voir apps/mobile/app.config.ts pour la strategie generale.
 *
 * Tablette = backoffice admin. Un tenant veut typiquement sa propre app
 * brandee pour ses agents (logo et nom propres sur l'iPad).
 */

interface TenantBranding {
  name: string;
  scheme: string;
  iosBundleId: string;
  androidPackage: string;
  iconPath?: string;
  splashPath?: string;
  splashColor: string;
}

const TENANTS: Record<string, TenantBranding> = {
  default: {
    name: 'TransitSoftServices Tablet',
    scheme: 'transitsoftservices-tablet',
    iosBundleId: 'com.transitsoftservices.tablet',
    androidPackage: 'com.transitsoftservices.tablet',
    splashColor: '#1B5E20',
  },
};

export default (): ExpoConfig => {
  const slug = process.env.EXPO_PUBLIC_TENANT_SLUG ?? 'default';
  const t = TENANTS[slug] ?? TENANTS.default;
  // Si pas d'icone tenant defini, on omet le champ : Expo utilisera son icone
  // par defaut au prebuild (evite ENOENT si ./assets/icon.png est absent).
  const config: ExpoConfig = {
    name: t.name,
    slug: `${slug}-tablet`,
    version: '0.1.0',
    orientation: 'default',
    userInterfaceStyle: 'light',
    scheme: t.scheme,
    platforms: ['ios', 'android'],
    ios: {
      supportsTablet: true,
      requireFullScreen: true,
      bundleIdentifier: t.iosBundleId,
    },
    android: {
      package: t.androidPackage,
    },
    plugins: [
      // Fix monorepo pnpm : patche android/settings.gradle apres le prebuild EAS
      // (resolution de @react-native/gradle-plugin via react-native).
      './plugins/withMonorepoSettingsGradle',
      'expo-router',
      'expo-secure-store',
      [
        'expo-image-picker',
        {
          photosPermission:
            "L'application accede a vos photos pour vous permettre d'ajouter une photo de profil ou un justificatif.",
          cameraPermission: "L'application utilise la camera pour prendre une photo de document.",
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission:
            "L'application utilise la camera pour scanner les QR codes et codes-barres des colis.",
        },
      ],
    ],
    extra: {
      tenantSlug: slug,
      eas: {
        projectId: '156d1bd1-3e44-4672-91db-65cd2dd51d38',
      },
    },
  };
  if (t.iconPath) {
    config.icon = t.iconPath;
    config.android = {
      ...config.android,
      adaptiveIcon: { foregroundImage: t.iconPath, backgroundColor: t.splashColor },
    };
  }
  if (t.splashPath) {
    (config.plugins as unknown[]).push([
      'expo-splash-screen',
      { image: t.splashPath, resizeMode: 'contain', backgroundColor: t.splashColor },
    ]);
  }
  return config;
};
