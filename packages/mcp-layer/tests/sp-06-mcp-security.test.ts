/**
 * @testcase SP-06-COMP-001 through SP-06-SEC-003
 * @requirements FR-CORE-MCP-001
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-06
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  sanitizeEnvForMcp,
  isBlockedEnvVar,
} from '../src/security/env-sanitizer.js';
import {
  validateServerConfig,
  type McpServerConfig,
} from '../src/security/allowlist.js';
import {
  generateScopedToken,
  verifyScopedToken,
} from '../src/security/scoped-tokens.js';

// ---------------------------------------------------------------------------
// environment sanitization
// ---------------------------------------------------------------------------
describe('SP-06: MCP Server Security', () => {
  describe('Environment Sanitization', () => {
    const fakeEnv: Record<string, string> = {
      NODE_ENV: 'production',
      PATH: '/usr/bin',
      HOME: '/home/user',
      DATABASE_URL: 'postgres://secret',
      REDIS_URL: 'redis://secret',
      AUTH_SECRET: 'shhh',
      SUPABASE_KEY: 'sb-key',
      OPENAI_API_KEY: 'sk-xxx',
      ANTHROPIC_API_KEY: 'ant-xxx',
      CUSTOM_SAFE_VAR: 'safe-value',
      MCP_SERVER_PORT: '8080',
    };

    it('blocks DATABASE_ prefixed variables', () => {
      expect(isBlockedEnvVar('DATABASE_URL')).toBe(true);
    });

    it('blocks SECRET-containing variables', () => {
      expect(isBlockedEnvVar('MY_SECRET_VALUE')).toBe(true);
    });

    it('blocks TOKEN-containing variables', () => {
      expect(isBlockedEnvVar('ACCESS_TOKEN')).toBe(true);
    });

    it('blocks KEY-containing variables', () => {
      expect(isBlockedEnvVar('OPENAI_API_KEY')).toBe(true);
      expect(isBlockedEnvVar('SUPABASE_KEY')).toBe(true);
    });

    it('allows non-sensitive variables', () => {
      expect(isBlockedEnvVar('NODE_ENV')).toBe(false);
      expect(isBlockedEnvVar('PATH')).toBe(false);
      expect(isBlockedEnvVar('CUSTOM_SAFE_VAR')).toBe(false);
    });

    it('returns only safe system vars with empty allowlist', () => {
      const result = sanitizeEnvForMcp(fakeEnv, []);
      expect(result).toEqual({
        NODE_ENV: 'production',
        PATH: '/usr/bin',
        HOME: '/home/user',
      });
    });

    it('includes allowlisted non-blocked vars', () => {
      const result = sanitizeEnvForMcp(fakeEnv, ['CUSTOM_SAFE_VAR', 'MCP_SERVER_PORT']);
      expect(result.CUSTOM_SAFE_VAR).toBe('safe-value');
      expect(result.MCP_SERVER_PORT).toBe('8080');
    });

    it('blocks vars even if they appear in allowlist', () => {
      // someone tries to allowlist a sensitive var — blocked patterns win
      const result = sanitizeEnvForMcp(fakeEnv, ['DATABASE_URL', 'OPENAI_API_KEY']);
      expect(result.DATABASE_URL).toBeUndefined();
      expect(result.OPENAI_API_KEY).toBeUndefined();
    });

    it('strips all blocked patterns from env', () => {
      const result = sanitizeEnvForMcp(fakeEnv);
      const keys = Object.keys(result);
      for (const key of keys) {
        expect(isBlockedEnvVar(key)).toBe(false);
      }
    });

    it('omits undefined values', () => {
      const envWithUndef: Record<string, string | undefined> = {
        NODE_ENV: 'test',
        MISSING_VAR: undefined,
      };
      const result = sanitizeEnvForMcp(envWithUndef, ['MISSING_VAR']);
      expect(result.MISSING_VAR).toBeUndefined();
      expect(Object.values(result).every((v) => v !== undefined)).toBe(true);
    });

    it('produces zero secrets in output across all blocked patterns', () => {
      // exhaustive: create env with every blocked pattern prefix
      const sensitiveEnv: Record<string, string> = {
        DATABASE_HOST: 'x', REDIS_PORT: 'x', AUTH_PROVIDER: 'x',
        SUPABASE_URL: 'x', INNGEST_SIGNING_KEY: 'x', NOVU_API_KEY: 'x',
        OPENAI_ORG: 'x', ANTHROPIC_KEY: 'x', GOOGLE_AI_KEY: 'x',
        SENTRY_DSN: 'x', HITL_SECRET: 'x',
        MY_SECRET: 'x', DB_PASSWORD: 'x', ACCESS_TOKEN: 'x', API_KEY: 'x',
        PATH: '/usr/bin', NODE_ENV: 'test',
      };
      const result = sanitizeEnvForMcp(sensitiveEnv, Object.keys(sensitiveEnv));
      // only safe system vars should survive
      expect(Object.keys(result).sort()).toEqual(['NODE_ENV', 'PATH']);
    });
  });

  // -----------------------------------------------------------------------
  // server allowlist
  // -----------------------------------------------------------------------
  describe('Server Allowlist', () => {
    const allowlist: McpServerConfig[] = [
      { name: 'calendar', command: 'node', args: ['./mcp-servers/calendar/index.js'] },
      { name: 'filesystem', command: 'node', args: ['./mcp-servers/fs/index.js'], maxConcurrent: 2 },
      { name: 'weather', command: 'npx', args: ['@acme/weather-mcp'] },
    ];

    it('validates config matching an allowlist entry', () => {
      const config: McpServerConfig = {
        name: 'calendar',
        command: 'node',
        args: ['./mcp-servers/calendar/index.js'],
      };
      expect(validateServerConfig(config, allowlist)).toBe(true);
    });

    it('rejects servers not in allowlist', () => {
      const config: McpServerConfig = {
        name: 'malicious-server',
        command: 'node',
        args: ['./evil.js'],
      };
      expect(validateServerConfig(config, allowlist)).toBe(false);
    });

    it('rejects if command differs', () => {
      const config: McpServerConfig = {
        name: 'calendar',
        command: 'npx', // should be 'node'
        args: ['./mcp-servers/calendar/index.js'],
      };
      expect(validateServerConfig(config, allowlist)).toBe(false);
    });

    it('rejects if args differ', () => {
      const config: McpServerConfig = {
        name: 'calendar',
        command: 'node',
        args: ['./mcp-servers/OTHER/index.js'],
      };
      expect(validateServerConfig(config, allowlist)).toBe(false);
    });

    it('rejects name match with wrong command (partial match)', () => {
      const config: McpServerConfig = {
        name: 'filesystem',
        command: 'python3', // wrong command
        args: ['./mcp-servers/fs/index.js'],
      };
      expect(validateServerConfig(config, allowlist)).toBe(false);
    });

    it('rejects against empty allowlist', () => {
      const config: McpServerConfig = { name: 'any', command: 'node' };
      expect(validateServerConfig(config, [])).toBe(false);
    });

    it('rejects if extra args are supplied', () => {
      const config: McpServerConfig = {
        name: 'weather',
        command: 'npx',
        args: ['@acme/weather-mcp', '--admin'],
      };
      expect(validateServerConfig(config, allowlist)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // scoped tokens
  // -----------------------------------------------------------------------
  describe('Scoped Tokens', () => {
    const signingKey = 'a-sufficiently-long-signing-key-for-tests-32chars!';

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('generates a token that can be verified', () => {
      const token = generateScopedToken(
        { serverId: 'calendar', permissions: ['read', 'write'], ttlSeconds: 300 },
        signingKey,
      );
      expect(typeof token).toBe('string');
      expect(token).toContain('.'); // payload.signature format

      const payload = verifyScopedToken(token, signingKey);
      expect(payload).not.toBeNull();
      expect(payload!.serverId).toBe('calendar');
      expect(payload!.permissions).toEqual(['read', 'write']);
    });

    it('binds token to specific server ID', () => {
      const token = generateScopedToken(
        { serverId: 'calendar', permissions: ['read'], ttlSeconds: 60 },
        signingKey,
      );
      const payload = verifyScopedToken(token, signingKey);
      expect(payload!.serverId).toBe('calendar');
    });

    it('enforces TTL — rejects expired tokens', () => {
      // mock Date.now to issue token in the past
      const pastTime = Date.now() - 120_000; // 2 minutes ago
      vi.spyOn(Date, 'now').mockReturnValueOnce(pastTime);

      const token = generateScopedToken(
        { serverId: 'cal', permissions: [], ttlSeconds: 60 },
        signingKey,
      );

      // restore real time — token should be expired
      vi.restoreAllMocks();
      const payload = verifyScopedToken(token, signingKey);
      expect(payload).toBeNull();
    });

    it('rejects tokens with wrong signing key', () => {
      const token = generateScopedToken(
        { serverId: 'cal', permissions: ['read'], ttlSeconds: 300 },
        signingKey,
      );
      const payload = verifyScopedToken(token, 'wrong-key-that-is-also-at-least-32chars!');
      expect(payload).toBeNull();
    });

    it('rejects tampered tokens', () => {
      const token = generateScopedToken(
        { serverId: 'cal', permissions: ['read'], ttlSeconds: 300 },
        signingKey,
      );
      // tamper with the payload portion
      const tampered = 'dGFtcGVyZWQ' + token.slice(10);
      const payload = verifyScopedToken(tampered, signingKey);
      expect(payload).toBeNull();
    });

    it('rejects malformed tokens', () => {
      expect(verifyScopedToken('not-a-valid-token', signingKey)).toBeNull();
      expect(verifyScopedToken('', signingKey)).toBeNull();
      expect(verifyScopedToken('.', signingKey)).toBeNull();
    });

    it('throws if TTL exceeds 1 hour', () => {
      expect(() =>
        generateScopedToken(
          { serverId: 'cal', permissions: [], ttlSeconds: 7200 },
          signingKey,
        ),
      ).toThrow('TTL must be between 1 and 3600 seconds');
    });

    it('throws if TTL is zero or negative', () => {
      expect(() =>
        generateScopedToken(
          { serverId: 'cal', permissions: [], ttlSeconds: 0 },
          signingKey,
        ),
      ).toThrow('TTL must be between 1 and 3600 seconds');
    });

    it('throws if signing key is too short', () => {
      expect(() =>
        generateScopedToken(
          { serverId: 'cal', permissions: [], ttlSeconds: 60 },
          'short',
        ),
      ).toThrow('Signing key must be at least 32 characters');
    });

    it('includes correct timestamps in payload', () => {
      const before = Math.floor(Date.now() / 1_000);
      const token = generateScopedToken(
        { serverId: 'cal', permissions: [], ttlSeconds: 300 },
        signingKey,
      );
      const after = Math.floor(Date.now() / 1_000);

      const payload = verifyScopedToken(token, signingKey)!;
      expect(payload.issuedAt).toBeGreaterThanOrEqual(before);
      expect(payload.issuedAt).toBeLessThanOrEqual(after);
      expect(payload.expiresAt).toBe(payload.issuedAt + 300);
    });
  });
});
