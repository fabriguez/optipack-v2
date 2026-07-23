// Reseed ABAC ciblé : rejoue l'UNION des presets de postes systeme sur TOUTES
// les organisations, pour propager les nouvelles cles du catalogue (ex.
// expense.update / expense.delete) aux postes existants. Non destructif :
// createMany skipDuplicates n'ajoute que les cles manquantes, ne retire rien.
//
// Usage (depuis apps/api, avec DATABASE_URL pointant la bonne base) :
//   pnpm exec tsx prisma/reseed-permissions.ts
//
// En prod (image compilee sans tsx), preferer le flag de boot :
//   FORCE_PERMISSION_RESEED=true  puis redemarrer l'API une fois, puis retirer.
import { PrismaClient } from '@prisma/client';
import { seedPermissionsAndPositions } from './seed/permissions.seed';

const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`Reseed permissions : ${orgs.length} organisation(s)`);
  for (const org of orgs) {
    await seedPermissionsAndPositions(prisma, org.id);
    console.log(`  ✓ ${org.name} (${org.id})`);
  }
  console.log('Termine.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('Reseed permissions echoue :', err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
