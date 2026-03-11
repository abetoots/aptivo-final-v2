/**
 * INT-W6: composition root — builds all platform services with real deps
 * @task INT-W6
 *
 * lazy initialization ensures no cold-start overhead and no crashes at
 * import time when env vars are missing. each getter creates the service
 * on first call.
 */

import { getDb } from './db.js';

// drizzle adapters
import {
  createDrizzleAuditStore,
  createDrizzleDlqStore,
  createDrizzlePreferenceStore,
  createDrizzleDeliveryLogStore,
  createDrizzleTemplateStore,
  createDrizzleTradeSignalStore,
  createDrizzleTradeExecutionStore,
  createDrizzleCandidateStore,
  createDrizzleApplicationStore,
  createDrizzleInterviewStore,
  createDrizzleSecurityReportStore,
  createDrizzleContractStore,
  createDrizzlePositionStore,
  createMetricQueries,
  createDrizzleAdminStore,
  createDrizzleLlmUsageStore,
} from '@aptivo/database/adapters';

// observability
import { createMetricService } from './observability/metric-service.js';

// audit
import {
  createAuditService,
  DEFAULT_MASKING_CONFIG,
} from '@aptivo/audit';
import {
  createProcessAuditEvent,
  createReplayDlqEvents,
} from '@aptivo/audit/async';

// notifications
import {
  createNotificationService,
  NovuNotificationAdapter,
  createTemplateRegistry,
} from '@aptivo/notifications';

// file-storage
import { InMemoryStorageAdapter, createS3StorageAdapter } from '@aptivo/file-storage';

// mcp-layer
import {
  createMcpWrapper,
  McpRateLimiter,
  InMemoryRateLimitStore,
  CircuitBreakerRegistry,
  InMemoryTransportAdapter,
  InMemoryCacheStore,
  createAgentKitTransportAdapter,
} from '@aptivo/mcp-layer';
import { createDataDeletionHandler } from '@aptivo/mcp-layer/workflows';

// hitl-gateway
import type { RequestServiceDeps } from '@aptivo/hitl-gateway';
import { createRequest } from '@aptivo/hitl-gateway';

// llm-gateway
import {
  createLlmGateway,
  BudgetService,
  UsageLogger,
} from '@aptivo/llm-gateway';

// ---------------------------------------------------------------------------
// lazy initialization helper
// ---------------------------------------------------------------------------

function lazy<T>(factory: () => T): () => T {
  let instance: T | undefined;
  return () => {
    if (!instance) instance = factory();
    return instance;
  };
}

// ---------------------------------------------------------------------------
// database
// ---------------------------------------------------------------------------

const db = lazy(() => getDb());

// ---------------------------------------------------------------------------
// audit service + stores
// ---------------------------------------------------------------------------

// drizzle adapters use minimal structural db types; cast through unknown
// to satisfy the narrower interfaces while retaining full drizzle capability
export const getAuditStore = lazy(() =>
  createDrizzleAuditStore(db() as unknown as Parameters<typeof createDrizzleAuditStore>[0]),
);

export const getDlqStore = lazy(() =>
  createDrizzleDlqStore(db() as unknown as Parameters<typeof createDrizzleDlqStore>[0]),
);

export const getAuditService = lazy(() =>
  createAuditService({
    store: getAuditStore(),
    masking: DEFAULT_MASKING_CONFIG,
  }),
);

// ---------------------------------------------------------------------------
// notification service + stores
// ---------------------------------------------------------------------------

export const getPreferenceStore = lazy(() =>
  createDrizzlePreferenceStore(db() as unknown as Parameters<typeof createDrizzlePreferenceStore>[0]),
);

export const getDeliveryLogStore = lazy(() =>
  createDrizzleDeliveryLogStore(db() as unknown as Parameters<typeof createDrizzleDeliveryLogStore>[0]),
);

export const getTemplateStore = lazy(() =>
  createDrizzleTemplateStore(db() as unknown as Parameters<typeof createDrizzleTemplateStore>[0]),
);

export const getTemplateRegistry = lazy(() =>
  createTemplateRegistry(getTemplateStore()),
);

// novu adapter — uses injectable NovuClient; stub until novu sdk is wired
const getNovuAdapter = lazy(() =>
  new NovuNotificationAdapter(
    {
      trigger: async (_workflowId, _payload) => ({ acknowledged: true }),
    },
    { workflowId: process.env.NOVU_WORKFLOW_ID ?? 'generic-notification' },
  ),
);

export const getNotificationService = lazy(() =>
  createNotificationService({
    adapter: getNovuAdapter(),
    preferenceStore: getPreferenceStore(),
    deliveryLogStore: getDeliveryLogStore(),
    templateRegistry: getTemplateRegistry(),
  }),
);

// ---------------------------------------------------------------------------
// hitl gateway
// ---------------------------------------------------------------------------

export const getHitlRequestDeps = lazy((): RequestServiceDeps => ({
  store: {
    // stub store — persists nothing until hitl db adapter is wired
    insert: async (record) => ({ id: record.id }),
  },
  config: {
    baseUrl: process.env.HITL_BASE_URL ?? 'http://localhost:3000',
    signingSecret: process.env.HITL_SIGNING_SECRET ?? 'dev-hitl-secret-key-minimum-32-chars!!',
    audience: 'aptivo-hitl',
    issuer: 'aptivo-platform',
  },
}));

// encapsulated hitl service — hides deps from workflow consumers (CF-3)
export const getHitlService = lazy(() => ({
  createRequest: (input: Parameters<typeof createRequest>[0]) =>
    createRequest(input, getHitlRequestDeps()),
}));

// ---------------------------------------------------------------------------
// mcp wrapper
// ---------------------------------------------------------------------------

// env-gated transport: agentkit when MCP_SERVER_URL is set, in-memory fallback
const getMcpTransport = lazy(() => {
  const serverUrl = process.env.MCP_SERVER_URL;
  if (serverUrl) {
    return createAgentKitTransportAdapter({
      serverUrl,
      timeout: Number(process.env.MCP_TIMEOUT_MS) || 30_000,
    });
  }
  return new InMemoryTransportAdapter('default');
});

export const getMcpWrapper = lazy(() =>
  createMcpWrapper({
    registry: {
      // placeholder in-memory registry; replaced by db adapter when ready
      getServer: async () => null,
      getTool: async () => null,
    },
    transport: getMcpTransport(),
    rateLimiter: new McpRateLimiter(new InMemoryRateLimitStore(), {
      maxTokens: 100,
      refillRate: 10,
    }),
    circuitBreakers: new CircuitBreakerRegistry(),
    cache: new InMemoryCacheStore(),
    allowlist: [],
    signingKey: process.env.MCP_SIGNING_KEY ?? 'dev-signing-key',
  }),
);

// ---------------------------------------------------------------------------
// file storage adapter
// ---------------------------------------------------------------------------

// env-gated storage: s3 when DO_SPACES_BUCKET is set, in-memory fallback
export const getStorageAdapter = lazy(() => {
  const bucket = process.env.DO_SPACES_BUCKET;
  if (bucket) {
    return createS3StorageAdapter({
      bucket,
      region: process.env.DO_SPACES_REGION ?? 'us-east-1',
      endpoint: process.env.DO_SPACES_ENDPOINT ?? `https://${process.env.DO_SPACES_REGION ?? 'nyc3'}.digitaloceanspaces.com`,
      credentials: {
        accessKeyId: process.env.DO_SPACES_KEY ?? '',
        secretAccessKey: process.env.DO_SPACES_SECRET ?? '',
      },
    });
  }
  return new InMemoryStorageAdapter();
});

// ---------------------------------------------------------------------------
// data deletion handler
// ---------------------------------------------------------------------------

export const getDataDeletionHandler = lazy(() =>
  createDataDeletionHandler({
    deleteDbRecords: async (_userId: string) => ({ deletedCount: 0 }),
    deleteS3Files: async (_userId: string) => ({ deletedCount: 0 }),
    maskAuditEntries: async (_userId: string) => ({ maskedCount: 0 }),
  }),
);

// ---------------------------------------------------------------------------
// llm gateway
// ---------------------------------------------------------------------------

export const getLlmGateway = lazy(() =>
  createLlmGateway({
    providers: new Map(),
    budgetService: new BudgetService({
      getConfig: async () => null,
      getDailySpend: async () => 0,
      getMonthlySpend: async () => 0,
    }),
    usageLogger: new UsageLogger({
      insert: async () => {},
    }),
    modelToProvider: {},
  }),
);

// ---------------------------------------------------------------------------
// crypto domain stores (S6-INF-CRY)
// ---------------------------------------------------------------------------

export const getCryptoTradeSignalStore = lazy(() =>
  createDrizzleTradeSignalStore(db() as unknown as Parameters<typeof createDrizzleTradeSignalStore>[0]),
);

export const getCryptoExecutionStore = lazy(() =>
  createDrizzleTradeExecutionStore(db() as unknown as Parameters<typeof createDrizzleTradeExecutionStore>[0]),
);

// ---------------------------------------------------------------------------
// hr domain stores (S6-INF-HR)
// ---------------------------------------------------------------------------

export const getCandidateStore = lazy(() =>
  createDrizzleCandidateStore(db() as unknown as Parameters<typeof createDrizzleCandidateStore>[0]),
);

export const getApplicationStore = lazy(() =>
  createDrizzleApplicationStore(db() as unknown as Parameters<typeof createDrizzleApplicationStore>[0]),
);

export const getInterviewStore = lazy(() =>
  createDrizzleInterviewStore(db() as unknown as Parameters<typeof createDrizzleInterviewStore>[0]),
);

// ---------------------------------------------------------------------------
// crypto security report store (S7-INF-01)
// ---------------------------------------------------------------------------

export const getSecurityReportStore = lazy(() =>
  createDrizzleSecurityReportStore(db() as unknown as Parameters<typeof createDrizzleSecurityReportStore>[0]),
);

// ---------------------------------------------------------------------------
// hr contract + position stores (S7-INF-01)
// ---------------------------------------------------------------------------

export const getContractStore = lazy(() =>
  createDrizzleContractStore(db() as unknown as Parameters<typeof createDrizzleContractStore>[0]),
);

export const getPositionStore = lazy(() =>
  createDrizzlePositionStore(db() as unknown as Parameters<typeof createDrizzlePositionStore>[0]),
);

// ---------------------------------------------------------------------------
// metric service (S7-CF-01)
// ---------------------------------------------------------------------------

export const getMetricService = lazy(() =>
  createMetricService(
    createMetricQueries(db() as unknown as Parameters<typeof createMetricQueries>[0]),
  ),
);

// ---------------------------------------------------------------------------
// admin dashboard store (S7-INT-02)
// ---------------------------------------------------------------------------

export const getAdminStore = lazy(() =>
  createDrizzleAdminStore(db() as unknown as Parameters<typeof createDrizzleAdminStore>[0]),
);

// ---------------------------------------------------------------------------
// llm usage store (S7-INT-03)
// ---------------------------------------------------------------------------

export const getLlmUsageStore = lazy(() =>
  createDrizzleLlmUsageStore(db() as unknown as Parameters<typeof createDrizzleLlmUsageStore>[0]),
);

// ---------------------------------------------------------------------------
// inngest function handler factories
// ---------------------------------------------------------------------------

export const getProcessAuditEventFn = lazy(() =>
  createProcessAuditEvent(getAuditService(), getDlqStore()),
);

export const getReplayDlqEventsFn = lazy(() =>
  createReplayDlqEvents(getAuditService(), getDlqStore()),
);
