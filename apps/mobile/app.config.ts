import type { ExpoConfig } from 'expo/config';

/**
 * Multi-tenant white-label build.
 *
 * Lit `EXPO_PUBLIC_TENANT_SLUG` (build-time) pour produire une app brandee.
 * - Sans slug : build "generic" non destine au store (utile pour dev/QA).
 * - Avec slug : nom + bundleId + scheme + icones propres au tenant.
 *
 * Couleurs / logo dynamiques (changement runtime sans rebuild) :
 *   GET /api/v1/tenant-meta/public retourne logoUrl + name + primaryColor.
 *   L'app fetche au demarrage et applique dans le theme.
 *
 * Build par tenant : `EXPO_PUBLIC_TENANT_SLUG=acme eas build -p ios --profile acme`.
 */

interface TenantBranding {
  name: string;
  scheme: string;
  iosBundleId: string;
  androidPackage: string;
  iconPath?: string;
  splashPath?: string;
  splashColor: string;
  /** ID projet EAS dedie a cette app tenant (cf. `eas init`). Requis pour le push. */
  easProjectId?: string;
}

// Registry des tenants connus. Ajouter une entree ici quand un tenant
// veut une app brandee. Les assets sont attendus dans
// assets/tenants/<slug>/icon.png + splash.png + adaptive-icon.png.
const TENANTS: Record<string, TenantBranding> = {
  default: {
    name: 'TransitSoftServices',
    scheme: 'transitsoftservices',
    iosBundleId: 'com.transitsoftservices.mobile',
    androidPackage: 'com.transitsoftservices.mobile',
    splashColor: '#1B5E20',
    easProjectId: 'd2adc804-7c97-4c62-a704-af7ca078882f',
  },
  // Exemple — repliquer pour chaque tenant brandé
  // acme: {
  //   name: 'Acme Express',
  //   scheme: 'acme-express',
  //   iosBundleId: 'com.acme.express',
  //   androidPackage: 'com.acme.express',
  //   iconPath: './assets/tenants/acme/icon.png',
  //   splashPath: './assets/tenants/acme/splash.png',
  //   splashColor: '#003366',
  // },
};

export default (): ExpoConfig => {
  const slug = process.env.EXPO_PUBLIC_TENANT_SLUG ?? 'default';
  const t = TENANTS[slug] ?? TENANTS.default;
  // Icones + splash optionnels : omis si tenant n'a pas d'assets dedies
  // (Expo utilise alors ses defauts). Evite ENOENT au prebuild.
  const config: ExpoConfig = {
    name: t.name,
    slug: `${slug}-mobile`,
    // Compte EAS proprietaire du projet (@brightky/<slug>-mobile).
    owner: 'brightky',
    version: '0.1.6',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    scheme: t.scheme,
    platforms: ['ios', 'android'],
    ios: {
      supportsTablet: false,
      bundleIdentifier: t.iosBundleId,
    },
    android: {
      package: t.androidPackage
    },
    plugins: [
      // Fix monorepo pnpm : patche android/settings.gradle apres le prebuild EAS
      // (resolution de @react-native/gradle-plugin via react-native).
      './plugins/withMonorepoSettingsGradle',
      'expo-router',
      'expo-secure-store',
      'expo-notifications',
      [
        'expo-image-picker',
        {
          photosPermission:
            "L'application accede a vos photos pour vous permettre d'ajouter une photo de profil ou de telecharger une piece d'identite.",
          cameraPermission:
            "L'application utilise la camera pour prendre une photo de votre piece d'identite.",
        },
      ],
    ],
    extra: {
      tenantSlug: slug,
      // projectId EAS requis pour activer le push + lier le build EAS. Priorite
      // a l'env (override CI/multi-tenant), sinon valeur du registry tenant.
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? t.easProjectId ?? undefined,
      },
    },
  };
  if (t.iconPath) {
    config.icon = t.iconPath;
    config.android = { ...config.android, adaptiveIcon: { foregroundImage: t.iconPath, backgroundColor: t.splashColor } };
  }
  if (t.splashPath) {
    (config.plugins as unknown[]).push([
      'expo-splash-screen',
      { image: t.splashPath, resizeMode: 'contain', backgroundColor: t.splashColor },
    ]);
  }
  return config;
};
