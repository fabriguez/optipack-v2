import { injectable } from 'tsyringe';
import type { WarehouseStorageFeeRule } from '@prisma/client';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

interface StorageFeeBreakdown {
  applicable: boolean;
  reason?: string;
  daysInWarehouse: number;
  freeDays: number;
  chargeableDays: number;
  dailyRate: number;
  totalFee: number;
  enteredAt: string | null;
  warehouseName: string | null;
  /** Id de la regle appliquee, null si fallback legacy. */
  ruleId: string | null;
  ruleSource: 'rule' | 'legacy' | 'none';
}

/**
 * Selection de la regle WarehouseStorageFeeRule applicable a un colis.
 *
 * Regles selon le type de transit :
 *  - AIR  : intervalle masse obligatoire (kg)
 *  - SEA  : intervalle volume obligatoire (m3)
 *  - LAND : intervalle masse OU volume (les deux peuvent matcher)
 *
 * Priorite :
 *  1) Regle avec transitRouteId == parcel.transitRouteId bat la regle sans.
 *  2) Sinon priorite manuelle (`priority`) gagne.
 *  3) Sinon createdAt le plus recent.
 */
function pickRule(
  rules: WarehouseStorageFeeRule[],
  parcel: {
    transitRouteId: string | null;
    transitType: string | null;
    weight: number | null;
    volume: number | null;
  },
): WarehouseStorageFeeRule | null {
  const transitType = parcel.transitType;
  if (!transitType) return null;

  const inRange = (
    val: number | null,
    min: number | null,
    max: number | null,
  ): boolean => {
    if (val == null) return min == null && max == null;
    if (min != null && val < min) return false;
    if (max != null && val > max) return false;
    return true;
  };

  const matches = (r: WarehouseStorageFeeRule) => {
    if (!r.isActive) return false;
    if (r.transitType !== transitType) return false;
    if (r.transitRouteId && r.transitRouteId !== parcel.transitRouteId) return false;

    const minW = r.minWeight != null ? Number(r.minWeight) : null;
    const maxW = r.maxWeight != null ? Number(r.maxWeight) : null;
    const minV = r.minVolume != null ? Number(r.minVolume) : null;
    const maxV = r.maxVolume != null ? Number(r.maxVolume) : null;
    const hasWeightRange = minW != null || maxW != null;
    const hasVolumeRange = minV != null || maxV != null;

    if (transitType === 'AIR') return hasWeightRange ? inRange(parcel.weight, minW, maxW) : true;
    if (transitType === 'SEA') return hasVolumeRange ? inRange(parcel.volume, minV, maxV) : true;
    // LAND : au moins une dimension dont l'intervalle est defini doit matcher
    if (hasWeightRange && hasVolumeRange) {
      return inRange(parcel.weight, minW, maxW) && inRange(parcel.volume, minV, maxV);
    }
    if (hasWeightRange) return inRange(parcel.weight, minW, maxW);
    if (hasVolumeRange) return inRange(parcel.volume, minV, maxV);
    return true;
  };

  const candidates = rules.filter(matches);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aScoped = a.transitRouteId === parcel.transitRouteId ? 1 : 0;
    const bScoped = b.transitRouteId === parcel.transitRouteId ? 1 : 0;
    if (aScoped !== bScoped) return bScoped - aScoped;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return candidates[0]!;
}

@injectable()
export class ComputeStorageFeeUseCase {
  async execute(parcelId: string, asOf?: Date): Promise<StorageFeeBreakdown> {
    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId },
      include: {
        warehouse: { include: { storageFeeRules: true } },
        transitRoute: { select: { id: true, type: true } },
      },
    });
    if (!parcel) throw new NotFoundError('Colis', parcelId);

    const refDate = asOf ?? new Date();
    const warehouse = parcel.warehouse;

    if (!parcel.lastContainerId) {
      return {
        applicable: false,
        reason: 'Colis non issu d\'un conteneur',
        daysInWarehouse: 0,
        freeDays: 0,
        chargeableDays: 0,
        dailyRate: 0,
        totalFee: 0,
        enteredAt: null,
        warehouseName: warehouse?.name ?? null,
        ruleId: null,
        ruleSource: 'none',
      };
    }
    if (!warehouse) {
      return {
        applicable: false,
        reason: 'Colis sans magasin',
        daysInWarehouse: 0,
        freeDays: 0,
        chargeableDays: 0,
        dailyRate: 0,
        totalFee: 0,
        enteredAt: null,
        warehouseName: null,
        ruleId: null,
        ruleSource: 'none',
      };
    }

    const enteredAt = parcel.warehouseEnteredAt ?? parcel.createdAt;
    const ms = refDate.getTime() - new Date(enteredAt).getTime();
    const days = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));

    const rule = pickRule(warehouse.storageFeeRules, {
      transitRouteId: parcel.transitRouteId ?? null,
      transitType: parcel.transitRoute?.type ?? null,
      weight: parcel.weight != null ? Number(parcel.weight) : null,
      volume: parcel.volume != null ? Number(parcel.volume) : null,
    });

    const freeDays = rule ? rule.freeDays : warehouse.storageFreeDays;
    const dailyRate = rule ? Number(rule.dailyRate) : Number(warehouse.storageDailyRate);
    const chargeable = Math.max(0, days - freeDays);
    const totalFee = chargeable * dailyRate;

    return {
      applicable: true,
      daysInWarehouse: days,
      freeDays,
      chargeableDays: chargeable,
      dailyRate,
      totalFee,
      enteredAt: new Date(enteredAt).toISOString(),
      warehouseName: warehouse.name,
      ruleId: rule?.id ?? null,
      ruleSource: rule ? 'rule' : (dailyRate > 0 ? 'legacy' : 'none'),
    };
  }
}
