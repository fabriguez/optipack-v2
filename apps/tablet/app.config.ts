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
  return {
    name: t.name,
    slug: `${slug}-tablet`,
    version: '0.1.0',
    orientation: 'landscape',
    userInterfaceStyle: 'light',
    scheme: t.scheme,
    platforms: ['ios', 'android'],
    icon: t.iconPath ?? './assets/icon.png',
    splash: {
      image: t.splashPath ?? './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: t.splashColor,
    },
    ios: {
      supportsTablet: true,
      requireFullScreen: true,
      bundleIdentifier: t.iosBundleId,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: t.iconPath ?? './assets/adaptive-icon.png',
        backgroundColor: t.splashColor,
      },
      package: t.androidPackage,
    },
    plugins: ['expo-router', 'expo-secure-store'],
    extra: {
      tenantSlug: slug,
    },
  };
};
