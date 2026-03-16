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
  createDrizzleHitlRequestStore,
  createDrizzleHitlDecisionStore,
  createDrizzleBudgetStore,
  createDrizzleUsageLogStore,
  createDrizzleMcpRegistryAdapter,
} from '@aptivo/database/adapters';

// token blacklist
import { createTokenBlacklistService } from './auth/token-blacklist.js';
import type { RedisClient } from './auth/token-blacklist.js';

// session limits (ID2-05)
import { createSessionLimitService } from './auth/session-limit-service.js';

// webauthn (ID2-04)
import { createWebAuthnService, createInMemoryWebAuthnStore } from './auth/webauthn-service.js';

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
import { createNovuSdkClient, createNovuStubClient } from './novu-client.js';
import type { NovuSdkInstance } from './novu-client.js';

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
import type { RequestServiceDeps, DecisionServiceDeps } from '@aptivo/hitl-gateway';
import { createRequest, recordDecision } from '@aptivo/hitl-gateway';

// oidc provider (ID2-01)
import { createClaimMapper, loadProvidersFromEnv } from './auth/oidc-provider.js';

// llm-gateway
import {
  createLlmGateway,
  BudgetService,
  UsageLogger,
  OpenAIProvider,
  AnthropicProvider,
} from '@aptivo/llm-gateway';
import type { LLMProvider } from '@aptivo/llm-gateway';

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

// async variant — caches the resolved promise so the factory runs only once
function lazyAsync<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => {
    if (!promise) promise = factory();
    return promise;
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

// novu client — env-gated: real SDK when NOVU_API_KEY is set, stub fallback
const getNovuClient = lazy(() => {
  const apiKey = process.env.NOVU_API_KEY;
  if (apiKey) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Novu } = require('@novu/node') as { Novu: new (opts: { secretKey: string }) => NovuSdkInstance };
      return createNovuSdkClient(new Novu({ secretKey: apiKey }));
    } catch {
      // @novu/node not installed — fall through to stub
      console.warn('@novu/node sdk not installed, using stub novu client');
    }
  }
  return createNovuStubClient();
});

const getNovuAdapter = lazy(() =>
  new NovuNotificationAdapter(
    getNovuClient(),
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
  store: createDrizzleHitlRequestStore(db() as unknown as Parameters<typeof createDrizzleHitlRequestStore>[0]),
  config: {
    baseUrl: process.env.HITL_BASE_URL ?? 'http://localhost:3000',
    signingSecret: process.env.HITL_SIGNING_SECRET ?? 'dev-hitl-secret-key-minimum-32-chars!!',
    audience: 'aptivo-hitl',
    issuer: 'aptivo-platform',
  },
}));

export const getHitlDecisionStore = lazy(() =>
  createDrizzleHitlDecisionStore(db() as unknown as Parameters<typeof createDrizzleHitlDecisionStore>[0]),
);

// encapsulated hitl service — hides deps from workflow consumers (CF-3)
export const getHitlService = lazy(() => ({
  createRequest: (input: Parameters<typeof createRequest>[0]) =>
    createRequest(input, getHitlRequestDeps()),
}));

// ---------------------------------------------------------------------------
// mcp wrapper (P1.5-04: real db-backed registry + allowlist)
// ---------------------------------------------------------------------------

// env-gated transport: agentkit when MCP_SERVER_URL is set, in-memory fallback
// accepts optional envAllowlist for RR-1 sanitization (P1.5-06)
function buildMcpTransport(envAllowlist?: string[]) {
  const serverUrl = process.env.MCP_SERVER_URL;
  if (serverUrl) {
    return createAgentKitTransportAdapter({
      serverUrl,
      timeout: Number(process.env.MCP_TIMEOUT_MS) || 30_000,
      envAllowlist,
    });
  }
  return new InMemoryTransportAdapter('default');
}

// drizzle-backed mcp registry — provides ToolRegistry + getAllowlist
export const getMcpRegistry = lazy(() =>
  createDrizzleMcpRegistryAdapter(
    db() as unknown as Parameters<typeof createDrizzleMcpRegistryAdapter>[0],
  ),
);

// async because the allowlist must be loaded from the db on first access
export const getMcpWrapper = lazyAsync(async () => {
  const registry = getMcpRegistry();
  const allowlist = await registry.getAllowlist();

  // collect unique envAllowlist entries from all registered servers
  const allEnvVars = allowlist.flatMap((s) => s.allowedEnv ?? []);
  const uniqueEnvAllowlist = [...new Set(allEnvVars)];

  return createMcpWrapper({
    registry,
    transport: buildMcpTransport(uniqueEnvAllowlist),
    rateLimiter: new McpRateLimiter(new InMemoryRateLimitStore(), {
      maxTokens: 100,
      refillRate: 10,
    }),
    circuitBreakers: new CircuitBreakerRegistry(),
    cache: new InMemoryCacheStore(),
    allowlist,
    signingKey: process.env.MCP_SIGNING_KEY ?? 'dev-signing-key',
  });
});

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
// llm gateway (P1.5-02: real budget/usage stores + env-gated providers)
// ---------------------------------------------------------------------------

/** builds the provider map based on available api keys */
function buildLlmProviders(): {
  providers: Map<string, LLMProvider>;
  modelToProvider: Record<string, string>;
} {
  const providers = new Map<string, LLMProvider>();
  const modelToProvider: Record<string, string> = {};

  // openai — env-gated: only added when OPENAI_API_KEY is present
  // wrapped in try/catch for graceful degradation when sdk is not installed
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      // the real openai sdk already matches the OpenAIClient interface shape
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { default: OpenAI } = require('openai') as { default: new (opts: { apiKey: string }) => import('@aptivo/llm-gateway').OpenAIClient };
      const client = new OpenAI({ apiKey: openaiKey });
      providers.set('openai', new OpenAIProvider(client));
      modelToProvider['gpt-4o'] = 'openai';
      modelToProvider['gpt-4o-mini'] = 'openai';
      modelToProvider['gpt-4-turbo'] = 'openai';
      modelToProvider['gpt-3.5-turbo'] = 'openai';
    } catch {
      // openai sdk not installed — skip provider
      console.warn('openai sdk not installed, skipping openai provider');
    }
  }

  // anthropic — env-gated: only added when ANTHROPIC_API_KEY is present
  // wrapped in try/catch for graceful degradation when sdk is not installed
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      // the real anthropic sdk already matches the AnthropicClient interface shape
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { default: Anthropic } = require('@anthropic-ai/sdk') as { default: new (opts: { apiKey: string }) => import('@aptivo/llm-gateway').AnthropicClient };
      const client = new Anthropic({ apiKey: anthropicKey });
      providers.set('anthropic', new AnthropicProvider(client));
      modelToProvider['claude-3-opus'] = 'anthropic';
      modelToProvider['claude-3-5-sonnet'] = 'anthropic';
      modelToProvider['claude-3-5-haiku'] = 'anthropic';
    } catch {
      // anthropic sdk not installed — skip provider
      console.warn('anthropic sdk not installed, skipping anthropic provider');
    }
  }

  return { providers, modelToProvider };
}

export const getLlmGateway = lazy(() => {
  const budgetStore = createDrizzleBudgetStore(
    db() as unknown as Parameters<typeof createDrizzleBudgetStore>[0],
  );
  const usageLogStore = createDrizzleUsageLogStore(
    db() as unknown as Parameters<typeof createDrizzleUsageLogStore>[0],
  );

  const { providers, modelToProvider } = buildLlmProviders();

  return createLlmGateway({
    providers,
    budgetService: new BudgetService(budgetStore),
    usageLogger: new UsageLogger(usageLogStore),
    modelToProvider,
  });
});

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
// token blacklist (ID2-06)
// ---------------------------------------------------------------------------

export const getTokenBlacklist = lazy(() => {
  // env-gated: real redis when UPSTASH_REDIS_URL is set, null fallback
  const redisUrl = process.env.UPSTASH_REDIS_URL;
  if (redisUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require('@upstash/redis') as { Redis: new (opts: { url: string; token: string }) => RedisClient };
      const redis = new Redis({
        url: redisUrl,
        token: process.env.UPSTASH_REDIS_TOKEN ?? '',
      });
      return createTokenBlacklistService({ redis });
    } catch {
      console.warn('@upstash/redis not installed, token blacklist disabled');
    }
  }
  return null;
});

// ---------------------------------------------------------------------------
// session limit service (ID2-05)
// ---------------------------------------------------------------------------

export const getSessionLimitService = lazy(() => {
  const redisUrl = process.env.UPSTASH_REDIS_URL;
  if (redisUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require('@upstash/redis') as { Redis: new (opts: { url: string; token: string }) => RedisClient };
      const redis = new Redis({
        url: redisUrl,
        token: process.env.UPSTASH_REDIS_TOKEN ?? '',
      });
      return createSessionLimitService({ redis });
    } catch {
      console.warn('@upstash/redis not installed, session limits disabled');
    }
  }
  return null;
});

// ---------------------------------------------------------------------------
// webauthn service (ID2-04)
// ---------------------------------------------------------------------------

export const getWebAuthnService = lazy(() =>
  createWebAuthnService({
    credentialStore: createInMemoryWebAuthnStore(),
    rpId: process.env.WEBAUTHN_RP_ID ?? 'localhost',
    rpName: process.env.WEBAUTHN_RP_NAME ?? 'Aptivo',
    origin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000',
  }),
);

// ---------------------------------------------------------------------------
// oidc provider (ID2-01)
// ---------------------------------------------------------------------------

export const getOidcClaimMapper = lazy(() => {
  const providersResult = loadProvidersFromEnv();
  if (!providersResult.ok) {
    console.warn('oidc provider config error:', providersResult.error.message);
    return createClaimMapper({ providers: [] });
  }
  return createClaimMapper({ providers: providersResult.value });
});

// ---------------------------------------------------------------------------
// inngest function handler factories
// ---------------------------------------------------------------------------

export const getProcessAuditEventFn = lazy(() =>
  createProcessAuditEvent(getAuditService(), getDlqStore()),
);

export const getReplayDlqEventsFn = lazy(() =>
  createReplayDlqEvents(getAuditService(), getDlqStore()),
);
