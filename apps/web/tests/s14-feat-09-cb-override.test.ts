/**
 * FEAT-09: Per-Tool MCP Circuit Breaker Override tests
 * @task FEAT-09
 *
 * verifies cb config service: get/set/remove/list overrides, validation,
 * defaults fallback, error handling, and composition root wiring.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCbConfigService,
  createInMemoryCbConfigStore,
  DEFAULT_CB_CONFIG,
  type CbConfigStore,
  type CircuitBreakerOverride,
} from '../src/lib/mcp/circuit-breaker-config-service';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createTestService(storeOverrides?: Partial<CbConfigStore>) {
  const store = createInMemoryCbConfigStore();
  const mergedStore: CbConfigStore = { ...store, ...storeOverrides };
  return { service: createCbConfigService({ store: mergedStore }), store: mergedStore };
}

// ---------------------------------------------------------------------------
// getConfig
// ---------------------------------------------------------------------------

describe('CbConfigService.getConfig', () => {
  it('returns default config when no override exists', async () => {
    const { service } = createTestService();
    const result = await service.getConfig('server-1', 'tool-a');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(DEFAULT_CB_CONFIG);
  });

  it('returns override when one is set', async () => {
    const { service } = createTestService();

    // set an override first
    await service.setOverride('server-1', 'tool-a', {
      failureThreshold: 10,
      resetTimeoutMs: 60_000,
      halfOpenMaxAttempts: 3,
    }, 'admin');

    const result = await service.getConfig('server-1', 'tool-a');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failureThreshold).toBe(10);
    expect(result.value.resetTimeoutMs).toBe(60_000);
    expect(result.value.halfOpenMaxAttempts).toBe(3);
  });

  it('returns default for a different tool on the same server', async () => {
    const { service } = createTestService();

    await service.setOverride('server-1', 'tool-a', {
      failureThreshold: 10,
      resetTimeoutMs: 60_000,
      halfOpenMaxAttempts: 3,
    }, 'admin');

    // different tool — should get default
    const result = await service.getConfig('server-1', 'tool-b');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(DEFAULT_CB_CONFIG);
  });

  it('returns ConfigError when store throws', async () => {
    const { service } = createTestService({
      getOverride: async () => { throw new Error('db down'); },
    });

    const result = await service.getConfig('server-1', 'tool-a');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ConfigError');
  });
});

// ---------------------------------------------------------------------------
// setOverride
// ---------------------------------------------------------------------------

describe('CbConfigService.setOverride', () => {
  it('sets a valid override', async () => {
    const { service } = createTestService();
    const result = await service.setOverride('server-1', 'tool-a', {
      failureThreshold: 15,
      resetTimeoutMs: 45_000,
      halfOpenMaxAttempts: 2,
    }, 'admin-user');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.serverId).toBe('server-1');
    expect(result.value.toolName).toBe('tool-a');
    expect(result.value.failureThreshold).toBe(15);
    expect(result.value.resetTimeoutMs).toBe(45_000);
    expect(result.value.halfOpenMaxAttempts).toBe(2);
    expect(result.value.overriddenBy).toBe('admin-user');
    expect(result.value.overriddenAt).toBeInstanceOf(Date);
  });

  it('rejects failureThreshold < 1', async () => {
    const { service } = createTestService();
    const result = await service.setOverride('s', 't', {
      failureThreshold: 0,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
    }, 'admin');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    expect(result.error.message).toContain('failureThreshold');
  });

  it('rejects failureThreshold > 100', async () => {
    const { service } = createTestService();
    const result = await service.setOverride('s', 't', {
      failureThreshold: 101,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
    }, 'admin');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    expect(result.error.message).toContain('failureThreshold');
  });

  it('rejects resetTimeoutMs < 1000', async () => {
    const { service } = createTestService();
    const result = await service.setOverride('s', 't', {
      failureThreshold: 5,
      resetTimeoutMs: 999,
      halfOpenMaxAttempts: 1,
    }, 'admin');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    expect(result.error.message).toContain('resetTimeoutMs');
  });

  it('rejects resetTimeoutMs > 300000', async () => {
    const { service } = createTestService();
    const result = await service.setOverride('s', 't', {
      failureThreshold: 5,
      resetTimeoutMs: 300_001,
      halfOpenMaxAttempts: 1,
    }, 'admin');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    expect(result.error.message).toContain('resetTimeoutMs');
  });

  it('rejects halfOpenMaxAttempts < 1', async () => {
    const { service } = createTestService();
    const result = await service.setOverride('s', 't', {
      failureThreshold: 5,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 0,
    }, 'admin');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    expect(result.error.message).toContain('halfOpenMaxAttempts');
  });

  it('rejects halfOpenMaxAttempts > 20', async () => {
    const { service } = createTestService();
    const result = await service.setOverride('s', 't', {
      failureThreshold: 5,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 21,
    }, 'admin');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    expect(result.error.message).toContain('halfOpenMaxAttempts');
  });

  it('accepts boundary values (1, 1000, 1)', async () => {
    const { service } = createTestService();
    const result = await service.setOverride('s', 't', {
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      halfOpenMaxAttempts: 1,
    }, 'admin');

    expect(result.ok).toBe(true);
  });

  it('accepts boundary values (100, 300000, 20)', async () => {
    const { service } = createTestService();
    const result = await service.setOverride('s', 't', {
      failureThreshold: 100,
      resetTimeoutMs: 300_000,
      halfOpenMaxAttempts: 20,
    }, 'admin');

    expect(result.ok).toBe(true);
  });

  it('overwrites existing override for same server+tool', async () => {
    const { service } = createTestService();

    await service.setOverride('server-1', 'tool-a', {
      failureThreshold: 5,
      resetTimeoutMs: 10_000,
      halfOpenMaxAttempts: 1,
    }, 'admin');

    await service.setOverride('server-1', 'tool-a', {
      failureThreshold: 20,
      resetTimeoutMs: 50_000,
      halfOpenMaxAttempts: 5,
    }, 'admin-2');

    const result = await service.getConfig('server-1', 'tool-a');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failureThreshold).toBe(20);
    expect((result.value as CircuitBreakerOverride).overriddenBy).toBe('admin-2');
  });

  it('returns ConfigError when store throws', async () => {
    const { service } = createTestService({
      setOverride: async () => { throw new Error('write failed'); },
    });

    const result = await service.setOverride('s', 't', {
      failureThreshold: 5,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
    }, 'admin');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ConfigError');
  });
});

// ---------------------------------------------------------------------------
// removeOverride
// ---------------------------------------------------------------------------

describe('CbConfigService.removeOverride', () => {
  it('removes an existing override', async () => {
    const { service } = createTestService();

    await service.setOverride('server-1', 'tool-a', {
      failureThreshold: 10,
      resetTimeoutMs: 10_000,
      halfOpenMaxAttempts: 2,
    }, 'admin');

    const removeResult = await service.removeOverride('server-1', 'tool-a');
    expect(removeResult.ok).toBe(true);

    // verify it falls back to default
    const getResult = await service.getConfig('server-1', 'tool-a');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value).toEqual(DEFAULT_CB_CONFIG);
  });

  it('returns OverrideNotFound when key does not exist', async () => {
    const { service } = createTestService();
    const result = await service.removeOverride('server-x', 'tool-y');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('OverrideNotFound');
    expect(result.error.key).toBe('server-x:tool-y');
  });

  it('returns ConfigError when store throws', async () => {
    const { service } = createTestService({
      removeOverride: async () => { throw new Error('delete failed'); },
    });

    const result = await service.removeOverride('s', 't');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ConfigError');
  });
});

// ---------------------------------------------------------------------------
// listOverrides
// ---------------------------------------------------------------------------

describe('CbConfigService.listOverrides', () => {
  it('returns empty list when no overrides exist', async () => {
    const { service } = createTestService();
    const result = await service.listOverrides();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('returns all overrides across servers and tools', async () => {
    const { service } = createTestService();

    await service.setOverride('server-1', 'tool-a', {
      failureThreshold: 5,
      resetTimeoutMs: 10_000,
      halfOpenMaxAttempts: 1,
    }, 'admin');

    await service.setOverride('server-1', 'tool-b', {
      failureThreshold: 10,
      resetTimeoutMs: 20_000,
      halfOpenMaxAttempts: 2,
    }, 'admin');

    await service.setOverride('server-2', 'tool-c', {
      failureThreshold: 15,
      resetTimeoutMs: 30_000,
      halfOpenMaxAttempts: 3,
    }, 'admin');

    const result = await service.listOverrides();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value.map((o) => `${o.serverId}:${o.toolName}`).sort()).toEqual([
      'server-1:tool-a',
      'server-1:tool-b',
      'server-2:tool-c',
    ]);
  });

  it('returns ConfigError when store throws', async () => {
    const { service } = createTestService({
      listOverrides: async () => { throw new Error('read failed'); },
    });

    const result = await service.listOverrides();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ConfigError');
  });
});

// ---------------------------------------------------------------------------
// in-memory store
// ---------------------------------------------------------------------------

describe('createInMemoryCbConfigStore', () => {
  let store: CbConfigStore;

  beforeEach(() => {
    store = createInMemoryCbConfigStore();
  });

  it('stores and retrieves an override', async () => {
    const override: CircuitBreakerOverride = {
      serverId: 'srv-1',
      toolName: 'ping',
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
      overriddenAt: new Date(),
      overriddenBy: 'test',
    };

    await store.setOverride(override);
    const result = await store.getOverride('srv-1', 'ping');
    expect(result).toEqual(override);
  });

  it('returns null for unknown key', async () => {
    const result = await store.getOverride('unknown', 'unknown');
    expect(result).toBeNull();
  });

  it('removes an override and returns true', async () => {
    await store.setOverride({
      serverId: 'srv-1',
      toolName: 'ping',
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
      overriddenAt: new Date(),
      overriddenBy: 'test',
    });

    const removed = await store.removeOverride('srv-1', 'ping');
    expect(removed).toBe(true);

    const result = await store.getOverride('srv-1', 'ping');
    expect(result).toBeNull();
  });

  it('returns false when removing non-existent key', async () => {
    const removed = await store.removeOverride('no', 'key');
    expect(removed).toBe(false);
  });

  it('lists all overrides', async () => {
    await store.setOverride({
      serverId: 's1',
      toolName: 't1',
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      halfOpenMaxAttempts: 1,
      overriddenAt: new Date(),
      overriddenBy: 'test',
    });
    await store.setOverride({
      serverId: 's2',
      toolName: 't2',
      failureThreshold: 2,
      resetTimeoutMs: 2000,
      halfOpenMaxAttempts: 2,
      overriddenAt: new Date(),
      overriddenBy: 'test',
    });

    const list = await store.listOverrides();
    expect(list).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// default config constant
// ---------------------------------------------------------------------------

describe('DEFAULT_CB_CONFIG', () => {
  it('has correct structure', () => {
    expect(DEFAULT_CB_CONFIG.failureThreshold).toBe(5);
    expect(DEFAULT_CB_CONFIG.resetTimeoutMs).toBe(30_000);
    expect(DEFAULT_CB_CONFIG.halfOpenMaxAttempts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// composition root
// ---------------------------------------------------------------------------

describe('composition root', () => {
  it('exports getCbConfigService', async () => {
    const services = await import('../src/lib/services');
    expect(typeof services.getCbConfigService).toBe('function');
  });
});
