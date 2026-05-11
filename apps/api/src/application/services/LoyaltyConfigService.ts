import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';

export interface LoyaltyConfig {
  /** Master switch : tout le systeme fidelite est inactif si false. */
  enabled: boolean;
  /** Points accumules par FCFA paye (ex: 1/1000 = 1 point pour 1000 FCFA payes). */
  pointsPerXaf: number;
  /** Taux de conversion : N points = 1 FCFA de remise (ex: 100 points = 100 FCFA). */
  fcfaPerPoint: number;
  /** Seuils palier (en points cumules) pour la progression de tier. */
  tierThresholds: {
    SILVER: number;
    GOLD: number;
    VIP: number;
  };
}

const DEFAULTS: LoyaltyConfig = {
  enabled: false,
  pointsPerXaf: 1 / 1000, // 1 point gagne pour 1000 FCFA payes
  fcfaPerPoint: 1,        // 1 point = 1 FCFA de remise
  tierThresholds: { SILVER: 500, GOLD: 2000, VIP: 5000 },
};

const KEYS = {
  enabled: 'loyalty_enabled',
  pointsPerXaf: 'loyalty_points_per_xaf',
  fcfaPerPoint: 'loyalty_fcfa_per_point',
  tierSilver: 'loyalty_tier_silver_threshold',
  tierGold: 'loyalty_tier_gold_threshold',
  tierVip: 'loyalty_tier_vip_threshold',
} as const;

/**
 * Centralise la lecture/ecriture de la politique de fidelite via SystemConfig.
 * Quand `enabled=false` (defaut a l'install), tous les flux fidelite sont
 * inertes : pas d'accumulation, pas de conversion possible.
 */
@injectable()
export class LoyaltyConfigService {
  /** Lit toute la config de fidelite pour une organisation. */
  async get(organizationId: string): Promise<LoyaltyConfig> {
    const rows = await prisma.systemConfig.findMany({
      where: {
        organizationId,
        key: { in: Object.values(KEYS) as string[] },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const num = (key: string, fallback: number): number => {
      const v = map.get(key);
      if (v == null || v === '') return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    return {
      enabled: (map.get(KEYS.enabled) ?? 'false').toLowerCase() === 'true',
      pointsPerXaf: num(KEYS.pointsPerXaf, DEFAULTS.pointsPerXaf),
      fcfaPerPoint: num(KEYS.fcfaPerPoint, DEFAULTS.fcfaPerPoint),
      tierThresholds: {
        SILVER: num(KEYS.tierSilver, DEFAULTS.tierThresholds.SILVER),
        GOLD: num(KEYS.tierGold, DEFAULTS.tierThresholds.GOLD),
        VIP: num(KEYS.tierVip, DEFAULTS.tierThresholds.VIP),
      },
    };
  }

  /** Verifie rapidement si le systeme est actif (utilise dans les flux paiement). */
  async isEnabled(organizationId: string): Promise<boolean> {
    const cfg = await prisma.systemConfig.findUnique({
      where: { organizationId_key: { organizationId, key: KEYS.enabled } },
    });
    return (cfg?.value ?? 'false').toLowerCase() === 'true';
  }

  /** Met a jour la config. Les champs absents conservent leur valeur. */
  async update(organizationId: string, patch: Partial<LoyaltyConfig>): Promise<LoyaltyConfig> {
    const upserts: Array<{ key: string; value: string; description: string }> = [];
    if (patch.enabled !== undefined) {
      upserts.push({
        key: KEYS.enabled,
        value: String(patch.enabled),
        description: 'Active ou desactive le systeme de fidelite.',
      });
    }
    if (patch.pointsPerXaf !== undefined) {
      if (patch.pointsPerXaf < 0) throw new Error('pointsPerXaf doit etre >= 0');
      upserts.push({
        key: KEYS.pointsPerXaf,
        value: String(patch.pointsPerXaf),
        description: 'Points gagnes par FCFA paye (ex: 0.001 = 1 point pour 1000 FCFA).',
      });
    }
    if (patch.fcfaPerPoint !== undefined) {
      if (patch.fcfaPerPoint < 0) throw new Error('fcfaPerPoint doit etre >= 0');
      upserts.push({
        key: KEYS.fcfaPerPoint,
        value: String(patch.fcfaPerPoint),
        description: 'Valeur FCFA d\'1 point lors de la conversion en remise.',
      });
    }
    if (patch.tierThresholds) {
      const { SILVER, GOLD, VIP } = patch.tierThresholds;
      if (SILVER !== undefined) {
        upserts.push({ key: KEYS.tierSilver, value: String(SILVER), description: 'Seuil de points pour le palier Silver.' });
      }
      if (GOLD !== undefined) {
        upserts.push({ key: KEYS.tierGold, value: String(GOLD), description: 'Seuil de points pour le palier Gold.' });
      }
      if (VIP !== undefined) {
        upserts.push({ key: KEYS.tierVip, value: String(VIP), description: 'Seuil de points pour le palier VIP.' });
      }
    }
    await Promise.all(
      upserts.map((u) =>
        prisma.systemConfig.upsert({
          where: { organizationId_key: { organizationId, key: u.key } },
          create: { organizationId, ...u },
          update: { value: u.value, description: u.description },
        }),
      ),
    );
    return this.get(organizationId);
  }
}
