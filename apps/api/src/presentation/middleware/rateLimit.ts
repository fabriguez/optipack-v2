import rateLimit, { type Store, type IncrementResponse, type Options } from 'express-rate-limit';
import { redis } from '../../config/redis';
import { logger } from '../../config/logger';

/**
 * Store express-rate-limit adosse au Redis partage (ioredis). Distribue : les
 * compteurs sont coherents entre plusieurs instances API derriere Caddy.
 *
 * Fail-open : si Redis est indisponible, on laisse passer la requete plutot que
 * de bloquer l'authentification (le rate-limit est une defense en profondeur,
 * pas le seul garde-fou -- cf. OTP hashe + TTL + tentatives cote use-case).
 */
class RedisRateLimitStore implements Store {
  private windowMs = 60_000;
  constructor(private readonly keyPrefix: string) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const k = `rl:${this.keyPrefix}:${key}`;
    try {
      const totalHits = await redis.incr(k);
      if (totalHits === 1) {
        await redis.pexpire(k, this.windowMs);
      }
      let ttl = await redis.pttl(k);
      if (ttl < 0) {
        await redis.pexpire(k, this.windowMs);
        ttl = this.windowMs;
      }
      return { totalHits, resetTime: new Date(Date.now() + ttl) };
    } catch (err) {
      logger.warn({ err, key: k }, 'Rate-limit store indisponible (fail-open)');
      return { totalHits: 0, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await redis.decr(`rl:${this.keyPrefix}:${key}`);
    } catch {
      /* fail-open */
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await redis.del(`rl:${this.keyPrefix}:${key}`);
    } catch {
      /* fail-open */
    }
  }
}

function makeLimiter(opts: { prefix: string; windowMs: number; max: number }) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisRateLimitStore(opts.prefix),
    message: {
      success: false,
      message: 'Trop de tentatives. Reessayez dans quelques minutes.',
    },
  });
}

// Endpoints d'auth (login/register/refresh) : 10 tentatives / 15 min par IP.
// Defense contre le credential-stuffing / brute-force et la creation de comptes
// en masse. Fail-open comme les autres (cf. RedisRateLimitStore).
export const authLimiter = makeLimiter({
  prefix: 'auth',
  windowMs: 15 * 60_000,
  max: 10,
});

// Demande de code : 5 envois / 15 min par IP (anti-spam SMS/email).
export const forgotPasswordLimiter = makeLimiter({
  prefix: 'forgot-pwd',
  windowMs: 15 * 60_000,
  max: 5,
});

// Verification de code : 10 essais / 15 min par IP (en plus du compteur
// `attempts` par token cote use-case).
export const resetPasswordLimiter = makeLimiter({
  prefix: 'reset-pwd',
  windowMs: 15 * 60_000,
  max: 10,
});
