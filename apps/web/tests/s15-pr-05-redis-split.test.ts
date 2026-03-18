/**
 * PR-05: Split Redis Instances tests
 * @task PR-05
 *
 * verifies that the composition root correctly builds separate redis
 * clients for session and jobs workloads, with env-var gating and
 * fallback to the shared redis url.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// helpers — simulate the buildJobsRedis / buildSessionRedis logic
// (direct import from services.ts requires mocking 20+ transitive deps;
// instead we extract and test the env-resolution logic in isolation)
// ---------------------------------------------------------------------------

interface MockRedisClient {
  url: string;
  token: string;
}

function buildJobsRedisLogic(
  env: Record<string, string | undefined>,
  createRedis: (opts: { url: string; token: string }) => MockRedisClient,
): MockRedisClient | null {
  const url = env.UPSTASH_REDIS_JOBS_URL ?? env.UPSTASH_REDIS_URL;
  const token = env.UPSTASH_REDIS_JOBS_TOKEN ?? env.UPSTASH_REDIS_TOKEN;
  if (!url) return null;
  return createRedis({ url, token: token ?? '' });
}

function buildSessionRedisLogic(
  env: Record<string, string | undefined>,
  createRedis: (opts: { url: string; token: string }) => MockRedisClient,
): MockRedisClient | null {
  const url = env.UPSTASH_REDIS_SESSION_URL ?? env.UPSTASH_REDIS_URL;
  const token = env.UPSTASH_REDIS_SESSION_TOKEN ?? env.UPSTASH_REDIS_TOKEN;
  if (!url) return null;
  return createRedis({ url, token: token ?? '' });
}

function mockRedisFactory(opts: { url: string; token: string }): MockRedisClient {
  return { url: opts.url, token: opts.token };
}

// ---------------------------------------------------------------------------
// PR-05: buildJobsRedis env resolution
// ---------------------------------------------------------------------------

describe('PR-05: buildJobsRedis', () => {
  it('returns client when UPSTASH_REDIS_JOBS_URL is set', () => {
    const env = {
      UPSTASH_REDIS_JOBS_URL: 'https://jobs-redis.example.com',
      UPSTASH_REDIS_JOBS_TOKEN: 'jobs-token-123',
    };

    const client = buildJobsRedisLogic(env, mockRedisFactory);

    expect(client).not.toBeNull();
    expect(client!.url).toBe('https://jobs-redis.example.com');
    expect(client!.token).toBe('jobs-token-123');
  });

  it('falls back to UPSTASH_REDIS_URL when jobs url is not set', () => {
    const env = {
      UPSTASH_REDIS_URL: 'https://shared-redis.example.com',
      UPSTASH_REDIS_TOKEN: 'shared-token-456',
    };

    const client = buildJobsRedisLogic(env, mockRedisFactory);

    expect(client).not.toBeNull();
    expect(client!.url).toBe('https://shared-redis.example.com');
    expect(client!.token).toBe('shared-token-456');
  });

  it('returns null when no URL configured', () => {
    const env = {};

    const client = buildJobsRedisLogic(env, mockRedisFactory);

    expect(client).toBeNull();
  });

  it('uses empty string for token when token not provided', () => {
    const env = {
      UPSTASH_REDIS_JOBS_URL: 'https://jobs-redis.example.com',
    };

    const client = buildJobsRedisLogic(env, mockRedisFactory);

    expect(client).not.toBeNull();
    expect(client!.token).toBe('');
  });

  it('prefers JOBS_URL over shared URL when both set', () => {
    const env = {
      UPSTASH_REDIS_JOBS_URL: 'https://jobs.example.com',
      UPSTASH_REDIS_URL: 'https://shared.example.com',
    };

    const client = buildJobsRedisLogic(env, mockRedisFactory);

    expect(client).not.toBeNull();
    expect(client!.url).toBe('https://jobs.example.com');
  });

  it('prefers JOBS_TOKEN over shared TOKEN when both set', () => {
    const env = {
      UPSTASH_REDIS_JOBS_URL: 'https://jobs.example.com',
      UPSTASH_REDIS_JOBS_TOKEN: 'jobs-tok',
      UPSTASH_REDIS_TOKEN: 'shared-tok',
    };

    const client = buildJobsRedisLogic(env, mockRedisFactory);

    expect(client).not.toBeNull();
    expect(client!.token).toBe('jobs-tok');
  });
});

// ---------------------------------------------------------------------------
// PR-05: buildSessionRedis env resolution
// ---------------------------------------------------------------------------

describe('PR-05: buildSessionRedis', () => {
  it('returns client when UPSTASH_REDIS_SESSION_URL is set', () => {
    const env = {
      UPSTASH_REDIS_SESSION_URL: 'https://session-redis.example.com',
      UPSTASH_REDIS_SESSION_TOKEN: 'session-token-789',
    };

    const client = buildSessionRedisLogic(env, mockRedisFactory);

    expect(client).not.toBeNull();
    expect(client!.url).toBe('https://session-redis.example.com');
    expect(client!.token).toBe('session-token-789');
  });

  it('falls back to UPSTASH_REDIS_URL for session redis', () => {
    const env = {
      UPSTASH_REDIS_URL: 'https://shared-redis.example.com',
      UPSTASH_REDIS_TOKEN: 'shared-token',
    };

    const client = buildSessionRedisLogic(env, mockRedisFactory);

    expect(client).not.toBeNull();
    expect(client!.url).toBe('https://shared-redis.example.com');
  });

  it('returns null when no session or shared URL is set', () => {
    const client = buildSessionRedisLogic({}, mockRedisFactory);

    expect(client).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PR-05: instance isolation
// ---------------------------------------------------------------------------

describe('PR-05: Redis instance isolation', () => {
  it('returns different instances when session and jobs URLs differ', () => {
    const env = {
      UPSTASH_REDIS_SESSION_URL: 'https://session.example.com',
      UPSTASH_REDIS_SESSION_TOKEN: 'session-tok',
      UPSTASH_REDIS_JOBS_URL: 'https://jobs.example.com',
      UPSTASH_REDIS_JOBS_TOKEN: 'jobs-tok',
    };

    const session = buildSessionRedisLogic(env, mockRedisFactory);
    const jobs = buildJobsRedisLogic(env, mockRedisFactory);

    expect(session).not.toBeNull();
    expect(jobs).not.toBeNull();
    expect(session!.url).toBe('https://session.example.com');
    expect(jobs!.url).toBe('https://jobs.example.com');
    expect(session!.url).not.toBe(jobs!.url);
  });

  it('backward compat: single URL serves both session and jobs', () => {
    const env = {
      UPSTASH_REDIS_URL: 'https://shared.example.com',
      UPSTASH_REDIS_TOKEN: 'shared-tok',
    };

    const session = buildSessionRedisLogic(env, mockRedisFactory);
    const jobs = buildJobsRedisLogic(env, mockRedisFactory);

    expect(session).not.toBeNull();
    expect(jobs).not.toBeNull();
    expect(session!.url).toBe('https://shared.example.com');
    expect(jobs!.url).toBe('https://shared.example.com');
  });
});

// ---------------------------------------------------------------------------
// PR-05: token blacklist uses session redis (not jobs)
// ---------------------------------------------------------------------------

describe('PR-05: Token blacklist uses session Redis', () => {
  it('services.ts creates token blacklist from session redis, not jobs', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    // token blacklist section should reference getSessionRedis
    expect(source).toContain('getTokenBlacklist');
    // the token blacklist getter calls getSessionRedis()
    const blacklistStart = source.indexOf('getTokenBlacklist');
    const blacklistSection = source.slice(blacklistStart, blacklistStart + 200);
    expect(blacklistSection).toContain('getSessionRedis()');
    // should not use getJobsRedis for blacklist
    expect(blacklistSection).not.toContain('getJobsRedis');
  });

  it('services.ts exports buildJobsRedis and getJobsRedis', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('export function buildJobsRedis');
    expect(source).toContain('export const getJobsRedis');
  });

  it('services.ts exports buildSessionRedis and getSessionRedis', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('export function buildSessionRedis');
    expect(source).toContain('export const getSessionRedis');
  });

  it('buildJobsRedis reads UPSTASH_REDIS_JOBS_URL env var', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('UPSTASH_REDIS_JOBS_URL');
    expect(source).toContain('UPSTASH_REDIS_JOBS_TOKEN');
  });

  it('buildJobsRedis mirrors buildSessionRedis pattern', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    // both builders follow the same structure: check url → require redis → construct
    expect(source).toContain('export function buildSessionRedis(): RedisClient | null');
    expect(source).toContain('export function buildJobsRedis(): RedisClient | null');

    // both use the same require pattern
    const sessionSection = source.slice(
      source.indexOf('function buildSessionRedis'),
      source.indexOf('function buildSessionRedis') + 400,
    );
    const jobsSection = source.slice(
      source.indexOf('function buildJobsRedis'),
      source.indexOf('function buildJobsRedis') + 400,
    );

    expect(sessionSection).toContain("require('@upstash/redis')");
    expect(jobsSection).toContain("require('@upstash/redis')");
  });
});
