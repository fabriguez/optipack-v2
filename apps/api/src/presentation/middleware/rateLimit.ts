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

/** Lit un max depuis l'env (>0), sinon le defaut. Permet de resserrer les
 *  limites en prod sans redeploy. Les defauts sont volontairement TRES laxistes. */
function envMax(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : def;
}

// Endpoints d'auth (login/register/refresh). Defense brute-force / credential-
// stuffing. Defaut tres laxiste (10000 / 15 min par IP) — resserrer via
// RATE_LIMIT_AUTH_MAX. Fail-open (cf. RedisRateLimitStore).
export const authLimiter = makeLimiter({
  prefix: 'auth',
  windowMs: 15 * 60_000,
  max: envMax('RATE_LIMIT_AUTH_MAX', 10_000),
});

// Demande de code (anti-spam SMS/email). Defaut tres laxiste — RATE_LIMIT_FORGOT_MAX.
export const forgotPasswordLimiter = makeLimiter({
  prefix: 'forgot-pwd',
  windowMs: 15 * 60_000,
  max: envMax('RATE_LIMIT_FORGOT_MAX', 10_000),
});

// Verification de code (en plus du compteur `attempts` par token cote use-case).
// Defaut tres laxiste — RATE_LIMIT_RESET_MAX.
export const resetPasswordLimiter = makeLimiter({
  prefix: 'reset-pwd',
  windowMs: 15 * 60_000,
  max: envMax('RATE_LIMIT_RESET_MAX', 10_000),
});
