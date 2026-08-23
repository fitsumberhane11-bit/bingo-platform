import { getRedis } from "./redis";
import { RateLimitError } from "./errors";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

/**
 * Redis-backed fixed-window limiter. Atomic via INCR + conditional EXPIRE,
 * safe across multiple app instances — this is the production path.
 */
class RedisRateLimiter implements RateLimiter {
  constructor(private redis: NonNullable<ReturnType<typeof getRedis>>) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.expire(redisKey, windowSeconds);
    }
    const ttl = await this.redis.ttl(redisKey);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }
}

/**
 * In-memory fixed-window limiter — single-process only. Used automatically
 * when REDIS_URL is not configured (local development). MUST NOT be relied
 * on in a horizontally-scaled production deployment, since each instance
 * would track its own counters.
 */
class InMemoryRateLimiter implements RateLimiter {
  private store = new Map<string, { count: number; resetAt: number }>();

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || entry.resetAt <= now) {
      this.store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { allowed: true, remaining: limit - 1, resetSeconds: windowSeconds };
    }
    entry.count += 1;
    return {
      allowed: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
      resetSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
}

let limiter: RateLimiter | undefined;

export function getRateLimiter(): RateLimiter {
  if (limiter) return limiter;
  const redis = getRedis();
  limiter = redis ? new RedisRateLimiter(redis) : new InMemoryRateLimiter();
  return limiter;
}

/** Throws RateLimitError if the caller has exceeded `limit` hits in `windowSeconds`. */
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const result = await getRateLimiter().consume(key, limit, windowSeconds);
  if (!result.allowed) {
    throw new RateLimitError(
      `Too many requests. Try again in ${result.resetSeconds}s.`,
      result.resetSeconds,
    );
  }
}
