/**
 * ID2-06: Redis-backed JWT token blacklist
 * @task ID2-06
 *
 * provides a service for blacklisting revoked JWT tokens using redis
 * with automatic expiry aligned to token TTL. fail-open semantics
 * ensure redis outages don't block authentication.
 */

import { Result } from '@aptivo/types';

// -- types --

export interface RedisClient {
  set(key: string, value: string, options?: { ex?: number }): Promise<string | null>;
  get(key: string): Promise<string | null>;
  exists(...keys: string[]): Promise<number>;
  del(...keys: string[]): Promise<number>;
  dbsize(): Promise<number>;
  // atomic transaction support (optional for backward compat)
  watch?(key: string): Promise<void>;
  multi?(): RedisMulti;
}

export interface RedisMulti {
  set(key: string, value: string, options?: { ex?: number }): RedisMulti;
  del(...keys: string[]): RedisMulti;
  exec(): Promise<Array<unknown> | null>; // null = WATCH conflict (retry)
}

export interface TokenBlacklistDeps {
  redis: RedisClient;
  keyPrefix?: string; // default: 'bl:'
}

// -- errors --

export type BlacklistError = {
  readonly _tag: 'BlacklistError';
  readonly operation: string;
  readonly cause: unknown;
};

// -- service interface --

export interface TokenBlacklistService {
  blacklist(jti: string, expiresAt: number): Promise<Result<void, BlacklistError>>;
  isBlacklisted(jti: string): Promise<Result<boolean, BlacklistError>>;
  getStats(): Promise<Result<{ count: number }, BlacklistError>>;
}

// -- factory --

export function createTokenBlacklistService(deps: TokenBlacklistDeps): TokenBlacklistService {
  const { redis, keyPrefix = 'bl:' } = deps;

  return {
    async blacklist(jti, expiresAt) {
      try {
        const ttl = expiresAt - Math.floor(Date.now() / 1000);
        // skip if already expired
        if (ttl <= 0) return Result.ok(undefined);

        await redis.set(`${keyPrefix}${jti}`, '1', { ex: ttl });
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({ _tag: 'BlacklistError' as const, operation: 'blacklist', cause });
      }
    },

    async isBlacklisted(jti) {
      try {
        const count = await redis.exists(`${keyPrefix}${jti}`);
        return Result.ok(count > 0);
      } catch (cause) {
        return Result.err({ _tag: 'BlacklistError' as const, operation: 'isBlacklisted', cause });
      }
    },

    async getStats() {
      try {
        const count = await redis.dbsize();
        return Result.ok({ count });
      } catch (cause) {
        return Result.err({ _tag: 'BlacklistError' as const, operation: 'getStats', cause });
      }
    },
  };
}

// -- middleware --

/**
 * creates a middleware function that checks if a token's jti is blacklisted.
 * returns a 401 response if revoked, null if not blacklisted or check is skipped.
 * fail-open: redis errors result in null (permit) with a console warning.
 */
export function checkBlacklist(deps: TokenBlacklistDeps) {
  const service = createTokenBlacklistService(deps);
  return async (_request: Request, jti: string | undefined): Promise<Response | null> => {
    // no jti claim = skip blacklist check
    if (!jti) return null;

    const result = await service.isBlacklisted(jti);
    if (!result.ok) {
      // redis failure = fail-open
      console.warn('token blacklist check failed, failing open:', result.error.cause);
      return null;
    }

    if (result.value) {
      return new Response(
        JSON.stringify({
          type: 'https://aptivo.dev/errors/token-revoked',
          title: 'Token Revoked',
          status: 401,
          detail: 'This token has been revoked',
          errorCode: 'token_revoked',
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      );
    }

    // not blacklisted, proceed
    return null;
  };
}
