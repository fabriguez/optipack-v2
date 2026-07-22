/**
 * Backfill one-shot : cristallise dans les factures le magasinage deja
 * accumule (hors franchise) des colis existants.
 *
 * A lancer UNE fois apres le deploiement, en complement de
 * `seed-storage-charges.ts` (qui cree les ParcelStorageCharge historiques).
 * Ce script injecte ensuite le montant accru de ces charges dans la facture
 * de chaque colis, exactement comme le fera le cron quotidien. Une facture
 * soldee dont le colis est encore en magasin repasse en PARTIAL.
 *
 * Idempotent : rejouable sans risque (les charges deja `billedAt` sont
 * ignorees, le garde de franchise protege les charges encore gratuites).
 *
 * Usage :
 *   DATABASE_URL=... pnpm tsx prisma/backfill-storage-crystallization.ts
 */
import 'reflect-metadata';
import '../src/container'; // enregistre les bindings DI
import { container } from 'tsyringe';
import { prisma } from '../src/config/database';
import { CrystallizeStorageFeesUseCase } from '../src/application/use-cases/storage/CrystallizeStorageFeesUseCase';

async function main() {
  const useCase = container.resolve(CrystallizeStorageFeesUseCase);
  const result = await useCase.execute();
  // eslint-disable-next-line no-console
  console.log('[backfill-storage-crystallization]', result);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[backfill-storage-crystallization] FAILED', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
