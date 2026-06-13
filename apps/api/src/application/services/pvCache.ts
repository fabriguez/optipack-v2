import { prisma } from '../../config/database';

// In-process cache for permissionVersion lookups.
// TTL: 60s — balances staleness vs DB pressure. An override/position change
// explicitly invalidates the affected user entry so the 401 is immediate.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { pv: number; expiresAt: number }>();

export function invalidatePvCache(userId: string): void {
  cache.delete(userId);
}

export async function fetchPermissionVersion(userId: string): Promise<number | null> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.pv;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissionVersion: true },
  });
  if (!user) return null;
  cache.set(userId, { pv: user.permissionVersion, expiresAt: now + CACHE_TTL_MS });
  return user.permissionVersion;
}

export async function bumpPermissionVersion(userId: string): Promise<void> {
  invalidatePvCache(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { permissionVersion: { increment: 1 } },
  });
}

export async function bumpPermissionVersionForPosition(positionId: string): Promise<void> {
  const employees = await prisma.employee.findMany({
    where: { positionId },
    select: { userId: true },
  });
  const userIds = employees.map((e) => e.userId).filter(Boolean) as string[];
  if (!userIds.length) return;
  for (const uid of userIds) invalidatePvCache(uid);
  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { permissionVersion: { increment: 1 } },
  });
}
