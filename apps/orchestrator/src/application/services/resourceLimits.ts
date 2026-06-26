/**
 * Repartition des ressources d'un plan tenant entre les services de sa stack
 * docker compose (postgres / redis / minio / api / web / web-client).
 *
 * SOURCE UNIQUE DE VERITE : utilisee a la fois par le provisioning (generation
 * du compose) et par le changement de plan (patch du compose). Toute evolution
 * des proportions se fait ICI uniquement -> les deux chemins restent coherents.
 */

export interface TenantResourceTotals {
  /** Nombre de CPU alloues au tenant (ex: 2 = 2 vCPU). */
  cpuLimit: number;
  /** RAM totale allouee au tenant, en Mo. */
  memoryMb: number;
}

export interface ServiceLimit {
  /** Part CPU (valeur `cpus:` du compose). */
  cpu: number;
  /** Part RAM en Mo (valeur `mem_limit:` = `${memoryMb}m`). */
  memoryMb: number;
}

export interface TenantServiceLimits {
  api: ServiceLimit;
  postgres: ServiceLimit;
  redis: ServiceLimit;
  minio: ServiceLimit;
  web: ServiceLimit;
  webClient: ServiceLimit;
}

const round3 = (n: number): number => Number(n.toFixed(3));

/**
 * Calcule les limites par service a partir des totaux du plan.
 *
 * L'API est le service le plus gourmand (logique metier + Chromium/WhatsApp Web
 * via puppeteer) -> elle recoit la plus grosse part RAM ET CPU. Postgres etait
 * surdimensionne (25% RAM = 1 Go sur un plan 4 Go) -> reduit.
 *
 * RAM : api 45%, postgres 17%, web 12%, web-client 9%, minio 7%, redis = reste
 *       (plancher 64 Mo).
 * CPU : api 1/2, postgres 1/6, web 1/8, web-client 1/8, minio 1/12, redis 1/16
 *       (plancher 0.05). (cpus = plafond, pas reservation -> leger overcommit OK.)
 */
export function computeServiceLimits({ cpuLimit, memoryMb }: TenantResourceTotals): TenantServiceLimits {
  const apiMem = Math.floor(memoryMb * 0.45);
  const pgMem = Math.floor(memoryMb * 0.17);
  const webMem = Math.floor(memoryMb * 0.12);
  const wcMem = Math.floor(memoryMb * 0.09);
  const minioMem = Math.floor(memoryMb * 0.07);
  const redisMem = Math.max(64, memoryMb - apiMem - pgMem - webMem - wcMem - minioMem);

  return {
    api: { cpu: round3(cpuLimit / 2), memoryMb: apiMem },
    postgres: { cpu: round3(cpuLimit / 6), memoryMb: pgMem },
    web: { cpu: round3(cpuLimit / 8), memoryMb: webMem },
    webClient: { cpu: round3(cpuLimit / 8), memoryMb: wcMem },
    minio: { cpu: round3(cpuLimit / 12), memoryMb: minioMem },
    redis: { cpu: round3(Math.max(0.05, cpuLimit / 16)), memoryMb: redisMem },
  };
}
