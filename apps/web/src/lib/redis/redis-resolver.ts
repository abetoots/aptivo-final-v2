/**
 * PR-05: Redis URL Resolution Logic
 * @task PR-05
 *
 * pure functions that resolve redis connection config from env vars.
 * no side effects, no async, no heavy imports — safe to import in tests.
 */

// -- types --

export interface RedisConfig {
  url: string;
  token: string;
}

// -- resolvers --

/**
 * resolve session redis config: prefers session-specific env vars,
 * falls back to shared redis url.
 */
export function resolveSessionRedisConfig(
  env: Record<string, string | undefined>,
): RedisConfig | null {
  const url = env.UPSTASH_REDIS_SESSION_URL ?? env.UPSTASH_REDIS_URL;
  const token = env.UPSTASH_REDIS_SESSION_TOKEN ?? env.UPSTASH_REDIS_TOKEN;
  if (!url) return null;
  return { url, token: token ?? '' };
}

/**
 * resolve jobs redis config: prefers jobs-specific env vars,
 * falls back to shared redis url.
 */
export function resolveJobsRedisConfig(
  env: Record<string, string | undefined>,
): RedisConfig | null {
  const url = env.UPSTASH_REDIS_JOBS_URL ?? env.UPSTASH_REDIS_URL;
  const token = env.UPSTASH_REDIS_JOBS_TOKEN ?? env.UPSTASH_REDIS_TOKEN;
  if (!url) return null;
  return { url, token: token ?? '' };
}
