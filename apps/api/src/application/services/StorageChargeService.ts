import { injectable } from 'tsyringe';
import type { Prisma, ParcelStorageCharge } from '@prisma/client';
import { prisma } from '../../config/database';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type StoragePhase = 'DEPARTURE' | 'TRANSIT' | 'DESTINATION';
export type StopReason =
  | 'PAYMENT'
  | 'CONTAINER_DEPART'
  | 'CONTAINER_ARRIVE_INTERMEDIATE'
  | 'TRANSFER'
  | 'HANDOVER'
  | 'MANUAL';

interface OpenChargeInput {
  parcelId: string;
  warehouseId: string;
  phase: StoragePhase;
  /** Si true, freeDays force a 0 (re-transfer apres butoir / transfer avant transit). */
  noGrace?: boolean;
  /** Date de debut. Defaut now(). */
  startedAt?: Date;
  tx?: Prisma.TransactionClient;
}

interface StopChargeInput {
  parcelId: string;
  reason: StopReason;
  /** Date de stop. Defaut now(). */
  stoppedAt?: Date;
  /** Si fourni, ne stoppe que la charge de ce magasin. */
  warehouseId?: string;
  tx?: Prisma.TransactionClient;
}

interface RuleSnapshot {
  freeDays: number;
  dailyRate: number;
  ruleLabel: string;
  agencyId: string;
}

/**
 * Service centralise pour gerer les charges de magasinage par colis.
 * Une charge = periode pendant laquelle un colis est stocke dans un magasin
 * sous une regle (freeDays + dailyRate) snapshotee a l'ouverture. La somme
 * des charges = total facturable de magasinage du colis.
 *
 * Politique :
 *  - DEPARTURE : grace period appliquee a la 1ere charge du magasin de
 *    depart. Re-transferts entre magasins de la meme agence depart =
 *    nouvelle charge SANS grace (noGrace = true).
 *  - TRANSIT : phase intermediaire, AUCUNE charge facturable (skip).
 *  - DESTINATION : grace period appliquee a la 1ere charge du magasin
 *    destination. Re-transferts apres butoir atteint = nouvelle charge
 *    SANS grace (noGrace = true).
 */
@injectable()
export class StorageChargeService {
  private db(tx?: Prisma.TransactionClient) {
    return tx ?? prisma;
  }

  /**
   * Resout la regle applicable a un colis dans un magasin donne.
   * Cherche d'abord WarehouseStorageFeeRule scopee (par route puis par type
   * + intervalle masse/volume), sinon retombe sur les champs legacy du
   * magasin (storageFreeDays + storageDailyRate).
   */
  async resolveRule(
    parcelId: string,
    warehouseId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<RuleSnapshot | null> {
    const db = this.db(tx);
    const parcel = await db.parcel.findUnique({
      where: { id: parcelId },
      select: {
        weight: true, volume: true, transitRouteId: true,
        transitRoute: { select: { type: true } },
      },
    });
    const warehouse = await db.warehouse.findUnique({
      where: { id: warehouseId },
      select: {
        agencyId: true,
        storageFreeDays: true,
        storageDailyRate: true,
        storageFeeRules: true,
      },
    });
    if (!parcel || !warehouse) return null;

    const type = parcel.transitRoute?.type ?? null;
    const w = parcel.weight != null ? Number(parcel.weight) : null;
    const v = parcel.volume != null ? Number(parcel.volume) : null;
    const inRange = (val: number | null, min: number | null, max: number | null) => {
      if (val == null) return min == null && max == null;
      if (min != null && val < min) return false;
      if (max != null && val > max) return false;
      return true;
    };

    let rule: typeof warehouse.storageFeeRules[number] | null = null;
    if (type) {
      const candidates = warehouse.storageFeeRules.filter((r) => {
        if (!r.isActive) return false;
        if (r.transitType !== type) return false;
        if (r.transitRouteId && r.transitRouteId !== parcel.transitRouteId) return false;
        const minW = r.minWeight != null ? Number(r.minWeight) : null;
        const maxW = r.maxWeight != null ? Number(r.maxWeight) : null;
        const minV = r.minVolume != null ? Number(r.minVolume) : null;
        const maxV = r.maxVolume != null ? Number(r.maxVolume) : null;
        if (!inRange(w, minW, maxW)) return false;
        if (!inRange(v, minV, maxV)) return false;
        return true;
      });
      // Specificite : route scopee > general, puis priority desc.
      candidates.sort((a, b) => {
        const aScoped = a.transitRouteId ? 1 : 0;
        const bScoped = b.transitRouteId ? 1 : 0;
        if (aScoped !== bScoped) return bScoped - aScoped;
        return b.priority - a.priority;
      });
      rule = candidates[0] ?? null;
    }

    if (rule) {
      return {
        freeDays: rule.freeDays,
        dailyRate: Number(rule.dailyRate),
        ruleLabel: `Regle ${rule.transitType}${rule.transitRouteId ? ' (route specifique)' : ''}`,
        agencyId: warehouse.agencyId,
      };
    }
    // Fallback legacy
    const fbRate = Number(warehouse.storageDailyRate);
    return {
      freeDays: warehouse.storageFreeDays,
      dailyRate: fbRate,
      ruleLabel: 'Tarif magasin (legacy)',
      agencyId: warehouse.agencyId,
    };
  }

  /**
   * Ouvre une nouvelle charge active pour un colis dans un magasin.
   * Aucune action si phase TRANSIT (jamais facture).
   * Stoppe d'abord toute charge active prealable du meme parcel.
   */
  async openCharge(input: OpenChargeInput): Promise<ParcelStorageCharge | null> {
    if (input.phase === 'TRANSIT') return null;

    const tx = input.tx;
    const db = this.db(tx);

    // Stoppe charges actives existantes (reason TRANSFER) avant d'en ouvrir une.
    await this.stopActive({ parcelId: input.parcelId, reason: 'TRANSFER', tx });

    const rule = await this.resolveRule(input.parcelId, input.warehouseId, tx);
    if (!rule || rule.dailyRate <= 0) return null;

    const freeDays = input.noGrace ? 0 : rule.freeDays;

    return db.parcelStorageCharge.create({
      data: {
        parcelId: input.parcelId,
        warehouseId: input.warehouseId,
        agencyId: rule.agencyId,
        dailyRate: rule.dailyRate,
        freeDays,
        ruleLabel: rule.ruleLabel,
        phase: input.phase,
        startedAt: input.startedAt ?? new Date(),
      },
    });
  }

  /**
   * Stoppe la (ou les) charge(s) active(s) d'un colis. Materialise
   * chargedDays + feeAmount en fonction de la duree ecoulee.
   */
  async stopActive(input: StopChargeInput): Promise<number> {
    const db = this.db(input.tx);
    const where: Prisma.ParcelStorageChargeWhereInput = {
      parcelId: input.parcelId,
      stoppedAt: null,
      ...(input.warehouseId && { warehouseId: input.warehouseId }),
    };
    const actives = await db.parcelStorageCharge.findMany({ where });
    const stoppedAt = input.stoppedAt ?? new Date();
    let count = 0;
    for (const c of actives) {
      const { chargedDays, feeAmount } = computeAccrual(c, stoppedAt);
      await db.parcelStorageCharge.update({
        where: { id: c.id },
        data: {
          stoppedAt,
          stopReason: input.reason,
          chargedDays,
          feeAmount,
        },
      });
      count++;
    }
    return count;
  }

  /**
   * Aggrege toutes les charges (actives + stoppees) pour un set de colis.
   * Pour les actives, recompute live l'accrual jusqu'a now().
   */
  async aggregateForParcels(parcelIds: string[]): Promise<{
    perParcel: Map<string, AggregatedStorage>;
    total: number;
  }> {
    if (parcelIds.length === 0) return { perParcel: new Map(), total: 0 };

    const charges = await prisma.parcelStorageCharge.findMany({
      where: { parcelId: { in: parcelIds } },
      include: {
        warehouse: { select: { id: true, name: true, agencyId: true, agency: { select: { city: true } } } },
      },
      orderBy: { startedAt: 'asc' },
    });

    const now = new Date();
    const perParcel = new Map<string, AggregatedStorage>();
    let grandTotal = 0;

    for (const c of charges) {
      const isActive = c.stoppedAt == null;
      const { chargedDays, feeAmount } = isActive ? computeAccrual(c, now) : { chargedDays: c.chargedDays, feeAmount: Number(c.feeAmount) };
      const entry: StorageChargeLine = {
        id: c.id,
        warehouseId: c.warehouseId,
        warehouseName: c.warehouse?.name ?? null,
        warehouseCity: c.warehouse?.agency?.city ?? null,
        phase: c.phase as StoragePhase,
        startedAt: c.startedAt,
        stoppedAt: c.stoppedAt,
        endedAt: c.stoppedAt ?? now,
        dailyRate: Number(c.dailyRate),
        freeDays: c.freeDays,
        chargedDays,
        feeAmount,
        ruleLabel: c.ruleLabel,
        isActive,
        stopReason: c.stopReason as StopReason | null,
      };
      grandTotal += feeAmount;
      const bucket = perParcel.get(c.parcelId) ?? { lines: [], total: 0 };
      bucket.lines.push(entry);
      bucket.total += feeAmount;
      perParcel.set(c.parcelId, bucket);
    }

    return { perParcel, total: grandTotal };
  }
}

export interface StorageChargeLine {
  id: string;
  warehouseId: string;
  warehouseName: string | null;
  warehouseCity: string | null;
  phase: StoragePhase;
  startedAt: Date;
  stoppedAt: Date | null;
  endedAt: Date;
  dailyRate: number;
  freeDays: number;
  chargedDays: number;
  feeAmount: number;
  ruleLabel: string | null;
  isActive: boolean;
  stopReason: StopReason | null;
}

export interface AggregatedStorage {
  lines: StorageChargeLine[];
  total: number;
}

/**
 * Calcule (chargedDays, feeAmount) pour une charge donnee a une date limite.
 * chargedDays = max(0, floor((endedAt - startedAt) / day) - freeDays).
 */
export function computeAccrual(
  c: { startedAt: Date; freeDays: number; dailyRate: any },
  endedAt: Date,
): { chargedDays: number; feeAmount: number } {
  const elapsed = Math.max(0, endedAt.getTime() - new Date(c.startedAt).getTime());
  const days = Math.floor(elapsed / ONE_DAY_MS);
  const chargeable = Math.max(0, days - c.freeDays);
  const rate = Number(c.dailyRate);
  return { chargedDays: chargeable, feeAmount: chargeable * rate };
}
