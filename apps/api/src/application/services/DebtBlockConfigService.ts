import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';

/**
 * Cles SystemConfig + valeurs par defaut pour le blocage automatique des
 * actions colis quand le client a des dettes impayees.
 *
 * Valeurs par defaut :
 *  - handover.enabled = true (active par defaut : refuse retrait colis si
 *    cumul dettes > seuil)
 *  - handover.threshold = 0 (= toute dette active bloque). Mettre 50000
 *    pour autoriser des petits soldes residuels.
 *  - shipment.enabled = true (active par defaut : refuse creation colis
 *    si cumul dettes > seuil)
 *  - shipment.threshold = 0
 */
export const DEBT_BLOCK_DEFAULTS = {
  handover: {
    enabled: 'true',
    threshold: '0',
  },
  shipment: {
    enabled: 'true',
    threshold: '0',
  },
} as const;

const KEYS = {
  HANDOVER_ENABLED: 'debt_handover_block_enabled',
  HANDOVER_THRESHOLD: 'debt_handover_block_threshold',
  SHIPMENT_ENABLED: 'debt_shipment_block_enabled',
  SHIPMENT_THRESHOLD: 'debt_shipment_block_threshold',
} as const;

const DESCRIPTIONS: Record<string, string> = {
  [KEYS.HANDOVER_ENABLED]: 'Bloque la remise d\'un colis si cumul dettes client > seuil',
  [KEYS.HANDOVER_THRESHOLD]: 'Seuil cumul dettes en FCFA pour bloquer la remise (0 = bloque toute dette)',
  [KEYS.SHIPMENT_ENABLED]: 'Bloque la creation d\'un nouveau colis si cumul dettes client > seuil',
  [KEYS.SHIPMENT_THRESHOLD]: 'Seuil cumul dettes en FCFA pour bloquer une nouvelle expedition',
};

export interface DebtBlockConfig {
  handoverEnabled: boolean;
  handoverThreshold: number;
  shipmentEnabled: boolean;
  shipmentThreshold: number;
}

@injectable()
export class DebtBlockConfigService {
  /**
   * Recupere la config courante avec auto-seed des defaults si manquant.
   * Idempotent : utilise upsert pour eviter race conditions.
   */
  async get(organizationId: string): Promise<DebtBlockConfig> {
    await this.ensureDefaults(organizationId);
    const rows = await prisma.systemConfig.findMany({
      where: {
        organizationId,
        key: { in: Object.values(KEYS) },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      handoverEnabled: (map.get(KEYS.HANDOVER_ENABLED) ?? DEBT_BLOCK_DEFAULTS.handover.enabled) === 'true',
      handoverThreshold: Number(map.get(KEYS.HANDOVER_THRESHOLD) ?? DEBT_BLOCK_DEFAULTS.handover.threshold),
      shipmentEnabled: (map.get(KEYS.SHIPMENT_ENABLED) ?? DEBT_BLOCK_DEFAULTS.shipment.enabled) === 'true',
      shipmentThreshold: Number(map.get(KEYS.SHIPMENT_THRESHOLD) ?? DEBT_BLOCK_DEFAULTS.shipment.threshold),
    };
  }

  async update(organizationId: string, patch: Partial<DebtBlockConfig>): Promise<DebtBlockConfig> {
    const entries: Array<[string, string]> = [];
    if (patch.handoverEnabled !== undefined) entries.push([KEYS.HANDOVER_ENABLED, String(patch.handoverEnabled)]);
    if (patch.handoverThreshold !== undefined) entries.push([KEYS.HANDOVER_THRESHOLD, String(patch.handoverThreshold)]);
    if (patch.shipmentEnabled !== undefined) entries.push([KEYS.SHIPMENT_ENABLED, String(patch.shipmentEnabled)]);
    if (patch.shipmentThreshold !== undefined) entries.push([KEYS.SHIPMENT_THRESHOLD, String(patch.shipmentThreshold)]);
    for (const [key, value] of entries) {
      await prisma.systemConfig.upsert({
        where: { organizationId_key: { organizationId, key } },
        update: { value },
        create: {
          organizationId,
          key,
          value,
          description: DESCRIPTIONS[key] ?? null,
        },
      });
    }
    return this.get(organizationId);
  }

  /**
   * Seed des valeurs par defaut si absentes. Appele au premier read.
   * Aucune ecriture si toutes les cles existent deja.
   */
  private async ensureDefaults(organizationId: string): Promise<void> {
    const existing = await prisma.systemConfig.findMany({
      where: { organizationId, key: { in: Object.values(KEYS) } },
      select: { key: true },
    });
    const existingKeys = new Set(existing.map((r) => r.key));
    const missing: Array<{ key: string; value: string }> = [];
    if (!existingKeys.has(KEYS.HANDOVER_ENABLED)) missing.push({ key: KEYS.HANDOVER_ENABLED, value: DEBT_BLOCK_DEFAULTS.handover.enabled });
    if (!existingKeys.has(KEYS.HANDOVER_THRESHOLD)) missing.push({ key: KEYS.HANDOVER_THRESHOLD, value: DEBT_BLOCK_DEFAULTS.handover.threshold });
    if (!existingKeys.has(KEYS.SHIPMENT_ENABLED)) missing.push({ key: KEYS.SHIPMENT_ENABLED, value: DEBT_BLOCK_DEFAULTS.shipment.enabled });
    if (!existingKeys.has(KEYS.SHIPMENT_THRESHOLD)) missing.push({ key: KEYS.SHIPMENT_THRESHOLD, value: DEBT_BLOCK_DEFAULTS.shipment.threshold });
    if (missing.length === 0) return;
    await prisma.$transaction(
      missing.map((m) =>
        prisma.systemConfig.upsert({
          where: { organizationId_key: { organizationId, key: m.key } },
          update: {},
          create: {
            organizationId,
            key: m.key,
            value: m.value,
            description: DESCRIPTIONS[m.key] ?? null,
          },
        }),
      ),
    );
  }
}
