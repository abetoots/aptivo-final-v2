/**
 * FEAT-08: Dynamic MCP Server Discovery API tests
 * @task FEAT-08
 *
 * verifies discovery service: server listing, health mapping, error handling,
 * and api route handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDiscoveryService } from '../src/lib/mcp/discovery-service';
import type { DiscoveryServiceDeps } from '../src/lib/mcp/discovery-service';

// ---------------------------------------------------------------------------
// test data
// ---------------------------------------------------------------------------

const testServers = [
  { id: 'server-1', name: 'code-analysis', url: 'http://localhost:4001', tools: ['lint', 'format'] },
  { id: 'server-2', name: 'data-pipeline', url: 'http://localhost:4002', tools: ['transform', 'validate', 'export'] },
  { id: 'server-3', name: 'search-engine', url: 'http://localhost:4003', tools: ['search'] },
];

// ---------------------------------------------------------------------------
// deps helpers
// ---------------------------------------------------------------------------

function createTestDeps(overrides?: Partial<DiscoveryServiceDeps>): DiscoveryServiceDeps {
  return {
    getServers: async () => testServers,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listServers
// ---------------------------------------------------------------------------

describe('createDiscoveryService — listServers', () => {
  it('returns all registered servers', async () => {
    const service = createDiscoveryService(createTestDeps());
    const result = await service.listServers();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value[0].id).toBe('server-1');
    expect(result.value[0].name).toBe('code-analysis');
    expect(result.value[0].url).toBe('http://localhost:4001');
    expect(result.value[0].tools).toEqual(['lint', 'format']);
  });

  it('returns status unknown when no health tracker is provided', async () => {
    const service = createDiscoveryService(createTestDeps({ getHealth: undefined }));
    const result = await service.listServers();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const server of result.value) {
      expect(server.status).toBe('unknown');
    }
  });

  it('maps healthy status from closed circuit breaker', async () => {
    const service = createDiscoveryService(createTestDeps({
      getHealth: () => ({ state: 'closed', failureCount: 0 }),
    }));
    const result = await service.listServers();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].status).toBe('healthy');
  });

  it('maps unhealthy status from open circuit breaker', async () => {
    const service = createDiscoveryService(createTestDeps({
      getHealth: () => ({ state: 'open', failureCount: 10 }),
    }));
    const result = await service.listServers();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].status).toBe('unhealthy');
  });

  it('maps degraded status from half-open circuit breaker', async () => {
    const service = createDiscoveryService(createTestDeps({
      getHealth: () => ({ state: 'half-open', failureCount: 3 }),
    }));
    const result = await service.listServers();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].status).toBe('degraded');
  });

  it('maps degraded when closed but failureCount > 5', async () => {
    const service = createDiscoveryService(createTestDeps({
      getHealth: () => ({ state: 'closed', failureCount: 8 }),
    }));
    const result = await service.listServers();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].status).toBe('degraded');
  });

  it('includes lastChecked timestamp', async () => {
    const before = new Date();
    const service = createDiscoveryService(createTestDeps());
    const result = await service.listServers();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].lastChecked).toBeInstanceOf(Date);
    expect(result.value[0].lastChecked!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('returns empty list when no servers are registered', async () => {
    const service = createDiscoveryService(createTestDeps({
      getServers: async () => [],
    }));
    const result = await service.listServers();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('returns RegistryError when getServers throws', async () => {
    const service = createDiscoveryService(createTestDeps({
      getServers: async () => { throw new Error('registry down'); },
    }));
    const result = await service.listServers();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('RegistryError');
  });
});

// ---------------------------------------------------------------------------
// getServerHealth
// ---------------------------------------------------------------------------

describe('createDiscoveryService — getServerHealth', () => {
  it('returns health details for existing server', async () => {
    const service = createDiscoveryService(createTestDeps({
      getHealth: (id) => {
        if (id === 'server-1') return { state: 'closed', failureCount: 2 };
        return null;
      },
    }));
    const result = await service.getServerHealth('server-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.serverId).toBe('server-1');
    expect(result.value.status).toBe('healthy');
    expect(result.value.circuitBreakerState).toBe('closed');
    expect(result.value.latencyMs).toBe(50);
    expect(result.value.errorRate).toBe(0.02);
  });

  it('returns ServerNotFound for missing server', async () => {
    const service = createDiscoveryService(createTestDeps());
    const result = await service.getServerHealth('non-existent');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ServerNotFound');
    expect(result.error.serverId).toBe('non-existent');
  });

  it('returns high latency for open circuit breaker', async () => {
    const service = createDiscoveryService(createTestDeps({
      getHealth: () => ({ state: 'open', failureCount: 10 }),
    }));
    const result = await service.getServerHealth('server-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.latencyMs).toBe(5000);
    expect(result.value.circuitBreakerState).toBe('open');
    expect(result.value.status).toBe('unhealthy');
  });

  it('returns half-open state with degraded status', async () => {
    const service = createDiscoveryService(createTestDeps({
      getHealth: () => ({ state: 'half-open', failureCount: 4 }),
    }));
    const result = await service.getServerHealth('server-2');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.circuitBreakerState).toBe('half-open');
    expect(result.value.status).toBe('degraded');
  });

  it('defaults to closed circuit breaker when no health tracker', async () => {
    const service = createDiscoveryService(createTestDeps({ getHealth: undefined }));
    const result = await service.getServerHealth('server-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.circuitBreakerState).toBe('closed');
    expect(result.value.errorRate).toBe(0);
  });

  it('returns RegistryError when getServers throws', async () => {
    const service = createDiscoveryService(createTestDeps({
      getServers: async () => { throw new Error('connection refused'); },
    }));
    const result = await service.getServerHealth('server-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('RegistryError');
  });
});

// ---------------------------------------------------------------------------
// route tests
// ---------------------------------------------------------------------------

// mock rbac middleware — allow all in tests
vi.mock('../src/lib/security/rbac-middleware', () => ({
  checkPermissionWithBlacklist: () => () => Promise.resolve(null),
}));

// mock discovery service for route tests
const mockDiscoveryService = createDiscoveryService(createTestDeps({
  getHealth: (id) => {
    if (id === 'server-1') return { state: 'closed', failureCount: 0 };
    if (id === 'server-2') return { state: 'open', failureCount: 10 };
    return null;
  },
}));

vi.mock('../src/lib/services', () => ({
  getDiscoveryService: () => mockDiscoveryService,
}));

// import route handlers after mocks
import { GET as ListServers } from '../src/app/api/mcp/servers/route';
import { GET as GetHealth } from '../src/app/api/mcp/servers/[id]/health/route';

function jsonRequest(method: string, url: string): Request {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { 'x-user-role': 'admin', 'content-type': 'application/json' },
  });
}

function makeRouteParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/mcp/servers', () => {
  it('returns list of servers with health', async () => {
    const req = jsonRequest('GET', '/api/mcp/servers');
    const res = await ListServers(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(3);
    expect(json.count).toBe(3);
    expect(json.data[0].name).toBe('code-analysis');
    expect(json.data[0].status).toBe('healthy');
    expect(json.data[1].status).toBe('unhealthy');
  });
});

describe('GET /api/mcp/servers/[id]/health', () => {
  it('returns health for existing server', async () => {
    const req = jsonRequest('GET', '/api/mcp/servers/server-1/health');
    const res = await GetHealth(req, makeRouteParams('server-1'));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.serverId).toBe('server-1');
    expect(json.data.status).toBe('healthy');
    expect(json.data.circuitBreakerState).toBe('closed');
  });

  it('returns 404 for non-existent server', async () => {
    const req = jsonRequest('GET', '/api/mcp/servers/missing/health');
    const res = await GetHealth(req, makeRouteParams('missing'));
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.type).toContain('not-found');
  });
});
