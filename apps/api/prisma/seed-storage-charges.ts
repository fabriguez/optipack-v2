/**
 * Seed retroactif des ParcelStorageCharge pour les colis existants avant
 * la mise en place du modele de charges.
 *
 * Strategie : pour chaque colis (non supprime, non livre), on cree au
 * maximum 2 charges historiques :
 *   1) DEPARTURE : si le colis a un warehouseEnteredAt anterieur a son
 *      depart en conteneur (lastContainerId != null OU status >= IN_TRANSIT).
 *      Periode = [warehouseEnteredAt, container.departureDate ?? now].
 *      Stop reason = CONTAINER_DEPART si conteneur ayant deja parti.
 *   2) DESTINATION : si le colis est arrive a sa destination finale
 *      (status RECEIVED dans le magasin destination). Periode =
 *      [warehouseEnteredAt apres reception, stoppedAt = now si actif].
 *
 * Idempotent : si une charge existe deja pour (parcelId, warehouseId,
 * startedAt), on saute.
 *
 * Usage :
 *   DATABASE_URL=... pnpm tsx prisma/seed-storage-charges.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const ONE_DAY = 24 * 60 * 60 * 1000;

interface RuleSnapshot {
  freeDays: number;
  dailyRate: number;
  ruleLabel: string;
  agencyId: string;
}

async function resolveRule(parcelId: string, warehouseId: string): Promise<RuleSnapshot | null> {
  const parcel = await prisma.parcel.findUnique({
    where: { id: parcelId },
    select: {
      weight: true, volume: true, transitRouteId: true,
      transitRoute: { select: { type: true } },
    },
  });
  const warehouse = await prisma.warehouse.findUnique({
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
  const rate = Number(warehouse.storageDailyRate);
  return {
    freeDays: warehouse.storageFreeDays,
    dailyRate: rate,
    ruleLabel: 'Tarif magasin (legacy)',
    agencyId: warehouse.agencyId,
  };
}

function computeAccrual(start: Date, end: Date, freeDays: number, dailyRate: number) {
  const elapsed = Math.max(0, end.getTime() - start.getTime());
  const days = Math.floor(elapsed / ONE_DAY);
  const chargedDays = Math.max(0, days - freeDays);
  return { chargedDays, feeAmount: chargedDays * dailyRate };
}

async function seed() {
  const parcels = await prisma.parcel.findMany({
    where: { isDeleted: false, status: { notIn: ['DELIVERED' as never, 'LOST' as never] } },
    select: {
      id: true,
      warehouseId: true,
      lastContainerId: true,
      warehouseEnteredAt: true,
      createdAt: true,
      status: true,
      destinationAgencyId: true,
      lastContainer: {
        select: { id: true, departureDate: true, actualArrivalDate: true, arrivalAgencyId: true },
      },
      warehouse: { select: { id: true, agencyId: true } },
    },
  });

  console.log(`[seed-storage-charges] ${parcels.length} colis candidats. dry-run=${DRY_RUN}`);
  let created = 0;
  let skipped = 0;

  for (const p of parcels) {
    if (!p.warehouseId || !p.warehouse) continue;

    // 1. Charge DEPARTURE retroactif si le colis a un warehouseEnteredAt
    //    et a deja ete charge dans un conteneur (lastContainerId), ou est
    //    actuellement IN_STOCK pre-transit.
    const enteredAt = p.warehouseEnteredAt ?? p.createdAt;
    const isPreTransit = ['IN_STOCK'].includes(p.status) && !p.lastContainerId;
    const wasShipped = !!p.lastContainerId;

    if (isPreTransit || wasShipped) {
      // Charge DEPARTURE
      const stopAt = wasShipped && p.lastContainer?.departureDate
        ? p.lastContainer.departureDate
        : null; // null = encore active pour pre-transit

      const exists = await prisma.parcelStorageCharge.findFirst({
        where: {
          parcelId: p.id,
          warehouseId: p.warehouseId,
          phase: 'DEPARTURE',
          startedAt: enteredAt,
        },
      });
      if (!exists) {
        const rule = await resolveRule(p.id, p.warehouseId);
        if (rule && rule.dailyRate > 0) {
          const data: any = {
            parcelId: p.id,
            warehouseId: p.warehouseId,
            agencyId: rule.agencyId,
            dailyRate: rule.dailyRate,
            freeDays: rule.freeDays,
            ruleLabel: rule.ruleLabel,
            phase: 'DEPARTURE',
            startedAt: enteredAt,
            stoppedAt: stopAt,
            stopReason: stopAt ? 'CONTAINER_DEPART' : null,
          };
          if (stopAt) {
            const accr = computeAccrual(enteredAt, stopAt, rule.freeDays, rule.dailyRate);
            data.chargedDays = accr.chargedDays;
            data.feeAmount = accr.feeAmount;
          }
          if (!DRY_RUN) {
            await prisma.parcelStorageCharge.create({ data });
          }
          created++;
          continue;
        }
      } else {
        skipped++;
        continue;
      }
    }

    // 2. Charge DESTINATION : colis RECEIVED dans son magasin destination.
    if (
      p.status === 'RECEIVED' &&
      p.warehouse.agencyId === p.destinationAgencyId
    ) {
      const exists = await prisma.parcelStorageCharge.findFirst({
        where: {
          parcelId: p.id,
          warehouseId: p.warehouseId,
          phase: 'DESTINATION',
          startedAt: enteredAt,
        },
      });
      if (!exists) {
        const rule = await resolveRule(p.id, p.warehouseId);
        if (rule && rule.dailyRate > 0) {
          if (!DRY_RUN) {
            await prisma.parcelStorageCharge.create({
              data: {
                parcelId: p.id,
                warehouseId: p.warehouseId,
                agencyId: rule.agencyId,
                dailyRate: rule.dailyRate,
                freeDays: rule.freeDays,
                ruleLabel: rule.ruleLabel,
                phase: 'DESTINATION',
                startedAt: enteredAt,
                stoppedAt: null,
              },
            });
          }
          created++;
        }
      } else {
        skipped++;
      }
    }
  }

  console.log(`[seed-storage-charges] created=${created} skipped=${skipped} dry-run=${DRY_RUN}`);
  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
