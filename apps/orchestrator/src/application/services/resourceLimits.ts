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
 * RAM : api 30%, postgres 25%, web 15%, web-client 15%, minio 10%, redis = reste
 *       (plancher 64 Mo).
 * CPU : api /3, postgres /4, web /8, web-client /8, minio /12, redis /16
 *       (plancher 0.05).
 */
export function computeServiceLimits({ cpuLimit, memoryMb }: TenantResourceTotals): TenantServiceLimits {
  const apiMem = Math.floor(memoryMb * 0.3);
  const pgMem = Math.floor(memoryMb * 0.25);
  const webMem = Math.floor(memoryMb * 0.15);
  const wcMem = Math.floor(memoryMb * 0.15);
  const minioMem = Math.floor(memoryMb * 0.1);
  const redisMem = Math.max(64, memoryMb - apiMem - pgMem - webMem - wcMem - minioMem);

  return {
    api: { cpu: round3(cpuLimit / 3), memoryMb: apiMem },
    postgres: { cpu: round3(cpuLimit / 4), memoryMb: pgMem },
    web: { cpu: round3(cpuLimit / 8), memoryMb: webMem },
    webClient: { cpu: round3(cpuLimit / 8), memoryMb: wcMem },
    minio: { cpu: round3(cpuLimit / 12), memoryMb: minioMem },
    redis: { cpu: round3(Math.max(0.05, cpuLimit / 16)), memoryMb: redisMem },
  };
}
