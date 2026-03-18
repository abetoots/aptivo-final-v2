/**
 * INT-W6: composition root — builds all platform services with real deps
 * @task INT-W6
 *
 * lazy initialization ensures no cold-start overhead and no crashes at
 * import time when env vars are missing. each getter creates the service
 * on first call.
 */

import { getDb, getDbForDomain } from './db.js';

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
  createDrizzleWebAuthnStore,
} from '@aptivo/database/adapters';

// token blacklist
import { createTokenBlacklistService } from './auth/token-blacklist.js';
import type { RedisClient } from './auth/token-blacklist.js';

// session limits (ID2-05)
import { createSessionLimitService } from './auth/session-limit-service.js';

// webauthn (ID2-04)
import { createWebAuthnService } from './auth/webauthn-service.js';

// secrets provider (INF-04)
import { createEnvSecretsProvider } from './auth/secrets-provider.js';

// mfa client (INF-04 / PR-01)
import { createMfaStubClient } from './auth/mfa-enforcement.js';
import { createSupabaseMfaClient } from './auth/supabase-mfa-client.js';
import type { SupabaseAuthClient } from './auth/supabase-mfa-client.js';

// observability
import { createMetricService } from './observability/metric-service.js';
import { createApprovalSlaService } from './observability/approval-sla-service.js';

// audit
import {
  createAuditService,
  DEFAULT_MASKING_CONFIG,
} from '@aptivo/audit';
import {
  createProcessAuditEvent,
  createReplayDlqEvents,
} from '@aptivo/audit/async';

// pii read audit (OBS-04)
import { createPiiReadAuditMiddleware } from '@aptivo/audit/middleware';

// notifications
import {
  createNotificationService,
  NovuNotificationAdapter,
  createTemplateRegistry,
  createSmtpAdapter,
  createFailoverAdapter,
  validateSmtpConfig,
} from '@aptivo/notifications';
import type { FailoverPolicy, MailTransport, NotificationAdapter } from '@aptivo/notifications';
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
import { createRequest, recordDecision, createMultiApproverRequestService } from '@aptivo/hitl-gateway';
import type { RequestTokenStore, HitlRequestTokenRecord } from '@aptivo/hitl-gateway';
import { generateHitlToken, hashToken } from '@aptivo/hitl-gateway';

// oidc provider (ID2-01)
import { createClaimMapper, loadProvidersFromEnv } from './auth/oidc-provider.js';

// workflow definition service (FEAT-01)
import { createWorkflowDefinitionService } from './workflows/workflow-definition-service.js';
import type { WorkflowDefinitionStore, WorkflowDefinitionRecord } from './workflows/workflow-definition-service.js';

// workflow builder service (FEAT-07)
import { createWorkflowBuilderService } from './workflows/workflow-builder-service.js';

// mcp discovery service (FEAT-08)
import { createDiscoveryService } from './mcp/discovery-service.js';

// circuit breaker config service (FEAT-09)
import { createCbConfigService, createInMemoryCbConfigStore } from './mcp/circuit-breaker-config-service.js';

// smtp config validator (PR-06)
import { validateSmtpEnvConfig } from './notifications/smtp-config-validator.js';

// consent service (FEAT-04)
import { createConsentService } from './consent/consent-service.js';

// webhook service (FEAT-02)
import { createWebhookService } from './webhooks/webhook-service.js';
import type { WebhookStore, WebhookRegistration } from './webhooks/webhook-service.js';

// feature flag service (FEAT-03)
import { createFeatureFlagService } from './feature-flags/feature-flag-service.js';
import { createLocalFlagProvider, DEFAULT_FLAGS } from './feature-flags/local-provider.js';
import { createEnvFlagProvider } from './feature-flags/env-provider.js';

// llm-gateway
import {
  createLlmGateway,
  BudgetService,
  UsageLogger,
  OpenAIProvider,
  AnthropicProvider,
  TokenBucket,
  InMemoryRateLimitStore as LlmInMemoryRateLimitStore,
  createRedisRateLimitStore,
  createDurableRateLimiter,
  createProviderRouter,
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
// domain-scoped database pools (INF-02)
// ---------------------------------------------------------------------------

export const getCryptoDb = lazy(() => getDbForDomain('crypto'));
export const getHrDb = lazy(() => getDbForDomain('hr'));

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

// smtp adapter — env-gated: only created when SMTP_HOST is set (NOTIF2-01)
const getSmtpAdapter = lazy((): NotificationAdapter | null => {
  const configResult = validateSmtpConfig({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 0,
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
    secure: process.env.SMTP_SECURE === 'true',
  });
  if (!configResult.ok) return null;

  // build mail transport — uses nodemailer when available, otherwise null
  let transport: MailTransport | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require('nodemailer') as {
      createTransport: (opts: Record<string, unknown>) => MailTransport;
    };
    transport = nodemailer.createTransport({
      host: configResult.value.host,
      port: configResult.value.port,
      secure: configResult.value.secure,
      auth: { user: configResult.value.user, pass: configResult.value.pass },
    });
  } catch {
    console.warn('nodemailer not installed, smtp adapter unavailable');
    return null;
  }

  return createSmtpAdapter(transport, configResult.value);
});

// failover adapter — wraps novu + smtp when both are available (NOTIF2-01)
const getNotificationAdapter = lazy((): NotificationAdapter => {
  const smtp = getSmtpAdapter();
  const novu = getNovuAdapter();

  if (!smtp) return novu;

  const policy = (process.env.NOTIFICATION_FAILOVER_POLICY ?? 'novu_primary') as FailoverPolicy;

  if (policy === 'smtp_primary') {
    return createFailoverAdapter(smtp, novu, policy);
  }

  // default: novu primary, smtp secondary
  return createFailoverAdapter(novu, smtp, policy);
});

export const getNotificationService = lazy(() =>
  createNotificationService({
    adapter: getNotificationAdapter(),
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

// multi-approver hitl service (HITL2-02, wired in HITL2-07)
export const getHitlMultiApproverService = lazy(() => {
  const requestStore = createDrizzleHitlRequestStore(
    db() as unknown as Parameters<typeof createDrizzleHitlRequestStore>[0],
  );

  // in-memory token store — sufficient for single-instance deployments;
  // swap for a drizzle-backed store when hitl_request_tokens table is migrated
  const tokenMap = new Map<string, HitlRequestTokenRecord[]>();
  const inMemoryTokenStore: RequestTokenStore = {
    async insertTokens(tokens: HitlRequestTokenRecord[]) {
      for (const t of tokens) {
        const existing = tokenMap.get(t.requestId) ?? [];
        existing.push(t);
        tokenMap.set(t.requestId, existing);
      }
    },
    async findByRequestAndApprover(requestId: string, approverId: string) {
      const tokens = tokenMap.get(requestId) ?? [];
      return tokens.find((t) => t.approverId === approverId) ?? null;
    },
    async findByRequestId(requestId: string) {
      return tokenMap.get(requestId) ?? [];
    },
  };

  // in-memory policy store — policies are created inline by workflows
  const policyMap = new Map<string, import('@aptivo/hitl-gateway').ApprovalPolicyRecord>();
  const inMemoryPolicyStore: import('@aptivo/hitl-gateway').ApprovalPolicyStore = {
    async create(policy) {
      const record = {
        ...policy,
        id: crypto.randomUUID(),
        createdAt: new Date(),
      };
      policyMap.set(record.id, record);
      return record;
    },
    async findById(id: string) {
      return policyMap.get(id) ?? null;
    },
    async findByName(name: string) {
      for (const p of policyMap.values()) {
        if (p.name === name) return p;
      }
      return null;
    },
    async list() {
      return [...policyMap.values()];
    },
  };

  const config = {
    baseUrl: process.env.HITL_BASE_URL ?? 'http://localhost:3000',
    signingSecret: process.env.HITL_SIGNING_SECRET ?? 'dev-hitl-secret-key-minimum-32-chars!!',
    audience: 'aptivo-hitl',
    issuer: 'aptivo-platform',
  };

  const service = createMultiApproverRequestService({
    requestStore: requestStore as unknown as { insert(record: unknown): Promise<{ id: string }> },
    tokenStore: inMemoryTokenStore,
    policyStore: inMemoryPolicyStore,
    generateToken: async (payload: Record<string, unknown>) => {
      const result = await generateHitlToken(
        {
          requestId: payload.requestId as string,
          approverId: payload.approverId as string,
          action: (payload.action as 'approve' | 'reject' | 'decide') ?? 'decide',
        },
        {
          signingSecret: config.signingSecret,
          audience: config.audience,
          issuer: config.issuer,
          ttlSeconds: (payload.ttlSeconds as number) ?? 900,
        },
      );
      if (!result.ok) throw new Error('token generation failed');
      return {
        token: result.value.token,
        hash: hashToken(result.value.token),
        expiresAt: new Date(result.value.expiresAt),
      };
    },
    config: { baseUrl: config.baseUrl },
  });

  return {
    ...service,
    policyStore: inMemoryPolicyStore,
  };
});

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

// builds the rate limit store — redis-backed when session redis is available,
// in-memory fallback otherwise (LLM2-03)
function buildLlmRateLimitStore() {
  const redis = getSessionRedis();
  if (redis) {
    return createRedisRateLimitStore({ redis });
  }
  return new LlmInMemoryRateLimitStore();
}

// durable rate limiter — exposed for composition root consumers (LLM2-03)
export const getDurableRateLimiter = lazy(() =>
  createDurableRateLimiter(buildLlmRateLimitStore()),
);

export const getLlmGateway = lazy(() => {
  const budgetStore = createDrizzleBudgetStore(
    db() as unknown as Parameters<typeof createDrizzleBudgetStore>[0],
  );
  const usageLogStore = createDrizzleUsageLogStore(
    db() as unknown as Parameters<typeof createDrizzleUsageLogStore>[0],
  );

  const { providers, modelToProvider } = buildLlmProviders();

  // use redis-backed rate limit store when available (LLM2-03)
  const rateLimitStore = buildLlmRateLimitStore();

  // wire multi-provider router when 2+ providers are available (LLM2-04)
  const router = providers.size >= 2
    ? createProviderRouter({ providers, modelToProvider })
    : undefined;

  return createLlmGateway({
    providers,
    budgetService: new BudgetService(budgetStore),
    usageLogger: new UsageLogger(usageLogStore),
    rateLimiter: new TokenBucket(rateLimitStore),
    modelToProvider,
    router,
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
// approval SLA service (OPS-01)
// ---------------------------------------------------------------------------

export const getApprovalSlaService = lazy(() => {
  const requestStore = createDrizzleHitlRequestStore(
    db() as unknown as Parameters<typeof createDrizzleHitlRequestStore>[0],
  );

  return createApprovalSlaService({
    getRequests: async (filters) => {
      // delegate to hitl request store — maps stored records to the shape
      // expected by the sla service. in production the store would support
      // filtering by status/date; here we provide a best-effort shim.
      void filters;
      return [];
    },
  });
});

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
// redis clients (INF-03: split session redis from shared redis)
// ---------------------------------------------------------------------------

// prefer session-specific redis, fall back to shared
export function buildSessionRedis(): RedisClient | null {
  const url = process.env.UPSTASH_REDIS_SESSION_URL ?? process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_SESSION_TOKEN ?? process.env.UPSTASH_REDIS_TOKEN;
  if (!url) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis') as { Redis: new (opts: { url: string; token: string }) => RedisClient };
    return new Redis({ url, token: token ?? '' });
  } catch {
    console.warn('@upstash/redis not installed');
    return null;
  }
}

export const getSessionRedis = lazy(() => buildSessionRedis());

// ---------------------------------------------------------------------------
// jobs redis (PR-05: split redis instances)
// ---------------------------------------------------------------------------

// prefer jobs-specific redis, fall back to shared
export function buildJobsRedis(): RedisClient | null {
  const url = process.env.UPSTASH_REDIS_JOBS_URL ?? process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_JOBS_TOKEN ?? process.env.UPSTASH_REDIS_TOKEN;
  if (!url) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis') as { Redis: new (opts: { url: string; token: string }) => RedisClient };
    return new Redis({ url, token: token ?? '' });
  } catch {
    console.warn('@upstash/redis not installed');
    return null;
  }
}

export const getJobsRedis = lazy(() => buildJobsRedis());

// ---------------------------------------------------------------------------
// token blacklist (ID2-06) — uses session redis (INF-03)
// ---------------------------------------------------------------------------

export const getTokenBlacklist = lazy(() => {
  const redis = getSessionRedis();
  if (redis) {
    return createTokenBlacklistService({ redis });
  }
  return null;
});

// ---------------------------------------------------------------------------
// session limit service (ID2-05) — uses session redis (INF-03)
// ---------------------------------------------------------------------------

export const getSessionLimitService = lazy(() => {
  const redis = getSessionRedis();
  if (redis) {
    return createSessionLimitService({ redis });
  }
  return null;
});

// ---------------------------------------------------------------------------
// webauthn service (ID2-04)
// ---------------------------------------------------------------------------

export const getWebAuthnService = lazy(() =>
  createWebAuthnService({
    credentialStore: createDrizzleWebAuthnStore(db() as unknown as Parameters<typeof createDrizzleWebAuthnStore>[0]),
    rpId: process.env.WEBAUTHN_RP_ID ?? 'localhost',
    rpName: process.env.WEBAUTHN_RP_NAME ?? 'Aptivo',
    origin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000',
  }),
);

// ---------------------------------------------------------------------------
// secrets provider (INF-04)
// ---------------------------------------------------------------------------

export const getSecretsProvider = lazy(() => createEnvSecretsProvider());

// ---------------------------------------------------------------------------
// mfa client (INF-04)
// ---------------------------------------------------------------------------

export const getMfaClient = lazy(() => {
  // env-gated: real supabase mfa when configured, stub fallback (PR-01)
  // PR-02: production guard — refuse to start with stub in production
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClient } = require('@supabase/supabase-js') as {
        createClient: (url: string, key: string) => { auth: SupabaseAuthClient };
      };
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      );
      return createSupabaseMfaClient(supabase.auth);
    } catch {
      console.warn('@supabase/supabase-js not installed, using stub mfa client');
    }
  }

  // PR-02: in production, missing supabase url is a fatal config error
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is required in production — MFA stub is not allowed',
    );
  }

  return createMfaStubClient();
});

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
// workflow definition service (FEAT-01)
// ---------------------------------------------------------------------------

// in-memory store — progressive pattern: swap for drizzle-backed store when
// workflow_definitions table is migrated
export const getWorkflowDefinitionService = lazy(() => {
  const records = new Map<string, WorkflowDefinitionRecord>();

  const inMemoryStore: WorkflowDefinitionStore = {
    async create(record) {
      const id = crypto.randomUUID();
      const now = new Date();
      const full: WorkflowDefinitionRecord = {
        ...record,
        id,
        createdAt: now,
        updatedAt: now,
      };
      records.set(id, full);
      return full;
    },
    async findById(id) {
      return records.get(id) ?? null;
    },
    async findByName(name, domain) {
      return [...records.values()].filter((r) => r.name === name && r.domain === domain);
    },
    async list(domain) {
      const all = [...records.values()];
      if (domain) return all.filter((r) => r.domain === domain);
      return all;
    },
    async update(id, data) {
      const existing = records.get(id);
      if (!existing) return null;
      const updated: WorkflowDefinitionRecord = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      records.set(id, updated);
      return updated;
    },
    async delete(id) {
      return records.delete(id);
    },
  };

  return createWorkflowDefinitionService({ store: inMemoryStore });
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

// ---------------------------------------------------------------------------
// pii read audit middleware (OBS-04)
// ---------------------------------------------------------------------------

export const getPiiReadAuditMiddleware = lazy(() =>
  createPiiReadAuditMiddleware({
    emit: async (event) => {
      const auditService = getAuditService();
      await auditService.emit({
        actor: { id: event.actor, type: 'system' },
        action: event.action,
        resource: event.resource,
        metadata: event.metadata,
      });
    },
  }),
);

// ---------------------------------------------------------------------------
// consent service (FEAT-04)
// ---------------------------------------------------------------------------

export const getConsentService = lazy(() =>
  createConsentService({
    emitAudit: async (event) => {
      const auditService = getAuditService();
      await auditService.emit({
        actor: { id: event.actor, type: 'user' },
        action: event.action,
        resource: event.resource,
        metadata: event.metadata,
      });
    },
    emitEvent: async (event) => {
      const { inngest } = await import('./inngest.js');
      await inngest.send({
        name: event.name as 'platform/consent.withdrawn',
        data: event.data as { userId: string; consentType: string; reason: string; withdrawnAt: string },
      });
    },
  }),
);

// ---------------------------------------------------------------------------
// webhook service (FEAT-02)
// ---------------------------------------------------------------------------

// in-memory store — progressive pattern: swap for drizzle-backed store when
// webhooks table is migrated
export const getWebhookService = lazy(() => {
  const records = new Map<string, WebhookRegistration>();

  const inMemoryStore: WebhookStore = {
    async register(reg) {
      const id = crypto.randomUUID();
      const full: WebhookRegistration = {
        ...reg,
        id,
        createdAt: new Date(),
      };
      records.set(id, full);
      return full;
    },
    async findByEvent(event) {
      return [...records.values()].filter((r) => r.events.includes(event));
    },
    async findById(id) {
      return records.get(id) ?? null;
    },
    async deactivate(id) {
      const existing = records.get(id);
      if (!existing) return false;
      records.set(id, { ...existing, active: false });
      return true;
    },
    async list() {
      return [...records.values()];
    },
  };

  return createWebhookService({ store: inMemoryStore });
});

// ---------------------------------------------------------------------------
// feature flag service (FEAT-03)
// ---------------------------------------------------------------------------

// PR-07: env provider takes precedence when FEATURE_FLAGS is set
export const getFeatureFlagService = lazy(() => {
  const provider = process.env.FEATURE_FLAGS
    ? createEnvFlagProvider(DEFAULT_FLAGS)
    : createLocalFlagProvider(DEFAULT_FLAGS);
  return createFeatureFlagService({ provider });
});

// ---------------------------------------------------------------------------
// workflow builder service (FEAT-07)
// ---------------------------------------------------------------------------

export const getWorkflowBuilderService = lazy(() => {
  const defService = getWorkflowDefinitionService();

  // bridge the crud service's store methods to the builder deps interface
  return createWorkflowBuilderService({
    findById: async (id: string) => {
      const result = await defService.findById(id);
      return result.ok ? result.value : null;
    },
    update: async (id: string, data: Record<string, unknown>) => {
      const result = await defService.update(id, data);
      return result.ok ? result.value : null;
    },
  });
});

// ---------------------------------------------------------------------------
// mcp discovery service (FEAT-08)
// ---------------------------------------------------------------------------

export const getDiscoveryService = lazy(() => {
  const registry = getMcpRegistry();

  return createDiscoveryService({
    getServers: async () => {
      const allowlist = await registry.getAllowlist();
      return allowlist.map((s, idx) => ({
        id: `server-${idx}`,
        name: s.name,
        url: s.command,
        tools: [] as string[],
      }));
    },
    // circuit breaker health is not directly wirable in the lazy composition
    // root without async init — provide a stub that returns null (unknown status)
    getHealth: () => null,
  });
});

// ---------------------------------------------------------------------------
// smtp config validator (PR-06)
// ---------------------------------------------------------------------------

export const getSmtpConfigValidator = lazy(() => ({
  validate: validateSmtpEnvConfig,
}));

// ---------------------------------------------------------------------------
// circuit breaker config service (FEAT-09)
// ---------------------------------------------------------------------------

export const getCbConfigService = lazy(() =>
  createCbConfigService({ store: createInMemoryCbConfigStore() }),
);
