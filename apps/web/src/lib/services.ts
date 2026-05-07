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
  createDrizzleCryptoPositionStore,
  createDrizzleHrOnboardingStore,
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
// S18-B1: crypto live-trade infrastructure
import { createDailyLossCircuitBreaker } from './crypto/daily-loss-circuit-breaker.js';
import { createInMemoryExchangeMcp } from './crypto/exchange-mcp-adapter.js';
// S18-B2: HR consent enforcement (FR-HR-CM-005)
import { createRequireConsent } from './hr/require-consent.js';
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

// mfa client resolver (PR-02: pure env-resolution logic)
import { resolveMfaClient } from './auth/mfa-client-resolver.js';

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

// feature flag resolver (PR-07: pure env-resolution logic)
import { resolveFeatureFlagProvider } from './feature-flags/flag-resolver.js';

// redis resolver (PR-05: pure env-resolution logic)
import { resolveSessionRedisConfig, resolveJobsRedisConfig } from './redis/redis-resolver.js';

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
import {
  createInjectionClassifier,
  createMlInjectionClassifier,
  createReplicateClient,
  asAsyncInjectionClassifier,
  createAnomalyGate,
  createInMemorySafetyCounter,
  type AsyncInjectionClassifier,
  type AnomalyGate,
  type Logger as SafetyLogger,
  type SafetyInferenceCounter,
} from '@aptivo/llm-gateway/safety';
import { createAnomalyDetector, formatAnomalyScopeKey } from '@aptivo/audit';

// FA3-01: department budgeting
import {
  createDepartmentBudgetService,
  type DepartmentBudgetService,
  type Logger as BudgetLogger,
} from '@aptivo/budget';
import {
  createDrizzleDepartmentBudgetStore,
  createDrizzleAnomalyBaselineStore,
  createDrizzleTicketStore,
  createDrizzleTicketSlaConfigStore,
  createTicketReportQueries,
} from '@aptivo/database/adapters';
import { createAdminRateLimit, type AdminRateLimit, type RateLimitRedis } from './security/admin-rate-limit.js';

// safe-logger bridge — adapts apps/web's log.* into the package's minimal
// Logger contract (packages must not import from apps/web directly)
import { log as appLog } from './logging/safe-logger.js';

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

// env-gated storage: s3 when S3_BUCKET is set, in-memory fallback
export const getStorageAdapter = lazy(() => {
  const bucket = process.env.S3_BUCKET;
  if (bucket) {
    return createS3StorageAdapter({
      bucket,
      region: process.env.S3_REGION ?? 'us-east-1',
      endpoint: process.env.S3_ENDPOINT ?? '',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
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
    // S17-B4: pass the safe-logger so persist failures emit structured
    // events (`redis_rate_limit_persist_failed`) rather than plain
    // console.warn — closes one of the legacy console.warn migration
    // sites in @aptivo/llm-gateway.
    return createRedisRateLimitStore({
      redis,
      logger: { warn: (event, ctx) => appLog.warn(event, ctx) },
    });
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

  // S17-B4: shared safe-logger bridge for gateway-level events
  // (budget warnings, unknown-model pricing fallbacks). Same shape
  // matches both GatewayDeps.logger and PricingLogger.
  const gatewayLogger = { warn: (event: string, ctx?: Record<string, unknown>) => appLog.warn(event, ctx) };

  const usageLogger = new UsageLogger(usageLogStore, gatewayLogger);
  const injectionClassifier = buildInjectionClassifier(usageLogger);
  const anomalyGate = buildAnomalyGate();

  return createLlmGateway({
    providers,
    budgetService: new BudgetService(budgetStore),
    usageLogger,
    rateLimiter: new TokenBucket(rateLimitStore),
    modelToProvider,
    router,
    injectionClassifier,
    anomalyGate,
    logger: gatewayLogger,
    // S17-B1: callers stamp `request.actor` directly via the
    // `requireLlmContext` middleware (apps/web/src/lib/middleware).
    // This fallback resolver returns undefined because the gateway
    // package has no request-context store of its own — background
    // workflow callers that need anomaly evaluation must stamp the
    // actor on the CompletionRequest before calling complete().
    //
    // STATUS as of S17-B1: the contract is in place but no
    // production caller stamps `request.actor` yet. Workflows in
    // `apps/web/src/lib/workflows/*` call `gateway.complete(request)`
    // without an actor (their Inngest event payloads don't carry
    // initiating-user context). Wiring those callsites is its own
    // task — sequenced behind the workflow → user actor propagation
    // work. Until then, anomaly evaluation is a no-op for workflow
    // traffic and `llm_usage_logs.department_id` stays NULL — both
    // are documented S16-carry limitations.
    resolveActor: () => undefined,
  });
});

// ---------------------------------------------------------------------------
// LLM3-02 — injection classifier composition (rule-based + optional ML wrapper)
// ---------------------------------------------------------------------------

// adapter so the package's minimal Logger contract doesn't need to import
// from apps/web. log.* from safe-logger accepts a context object that the
// package already passes in the expected shape.
const safetyLoggerBridge: SafetyLogger = {
  debug: (msg, ctx) => appLog.debug(msg, ctx),
  info: (msg, ctx) => appLog.info(msg, ctx),
  warn: (msg, ctx) => appLog.warn(msg, ctx),
  error: (msg, ctx) => appLog.error(msg, ctx),
};

// S17-B4: in-process safety-inference outcome counter. Shared between
// the ML classifier (which records every call) and the MetricService
// (which reads the timeout rate for the SLO cron). Single-instance
// only — multi-instance accuracy requires a Redis-backed counter.
const safetyInferenceCounter = createInMemorySafetyCounter();

export const getSafetyInferenceCounter = lazy(() => safetyInferenceCounter);

function buildInjectionClassifier(usageLogger: UsageLogger): AsyncInjectionClassifier {
  const ruleBasedFallback = asAsyncInjectionClassifier(createInjectionClassifier());

  const modelUrl = process.env.ML_INJECTION_MODEL_URL;
  const modelToken = process.env.ML_INJECTION_MODEL_TOKEN;
  // ML classifier ships only when the environment is configured AND the
  // feature flag is on at call time. With no URL/token the rule-based
  // classifier is the only path — the ML wrapper would be a stub call.
  if (!modelUrl || !modelToken) {
    return ruleBasedFallback;
  }

  const modelClient = createReplicateClient({
    url: modelUrl,
    token: modelToken,
    version: process.env.ML_INJECTION_MODEL_VERSION,
  });

  // S17-B2: bound to the FeatureFlagService sync-peek cache. Composition
  // root warms the cache at startup (see getFeatureFlagService), so the
  // first request after deploy reads the warmed value rather than the
  // defaultValue. Cold-cache requests fail safe (defaultValue: false →
  // ML classifier off → rule-based fallback handles the request).
  const flagService = getFeatureFlagService();
  const isEnabled = (): boolean => {
    return flagService.peekEnabled('ml-injection-classifier', false);
  };

  return createMlInjectionClassifier({
    modelClient,
    ruleBasedFallback,
    isEnabled,
    logger: safetyLoggerBridge,
    timeoutMs: Number(process.env.ML_INJECTION_TIMEOUT_MS) || undefined,
    // S17-B4: every classify() call records to the shared counter so
    // the SLO cron can compute the ml_classifier_timeout rate.
    metrics: safetyInferenceCounter,
    usageSink: {
      logSafetyInference: (rec) => usageLogger.logSafetyInference(rec),
    },
    provider: 'replicate',
    model: process.env.ML_INJECTION_MODEL_VERSION ?? 'aptivo/injection-detector:latest',
    costPerCallUsd: Number(process.env.ML_INJECTION_COST_USD) || 0,
  });
}

// ---------------------------------------------------------------------------
// LLM3-04 — anomaly gate composition
// ---------------------------------------------------------------------------

function buildAnomalyGate(): AnomalyGate | undefined {
  // S17-B2: bound to FeatureFlagService.peekEnabled. The gate is built
  // unconditionally and isEnabled controls runtime behaviour per
  // request — when peekEnabled returns false the gate short-circuits
  // to `{ action: 'pass' }` without touching the audit store or
  // detector (see anomaly-gate.ts:91-95). Composition root warms the
  // cache at startup so the first request after deploy reads the
  // configured flag value, not defaultValue.
  const flagService = getFeatureFlagService();

  const auditStore = getAuditStore();

  // S17-B3: real baseline lookup. The `anomaly-baseline-builder` cron
  // (every 6h) populates `anomaly_baselines` with mean/stdDev/sampleSize
  // per (actor, scope) over the trailing 7 days, bucketed at the same
  // window the gate evaluates over. Cold-start `(actor, scope)` pairs
  // return null → returned `sampleSize: 0` → detector branch
  // `if (sampleSize < minBaselineSamples) return insufficient baseline data`
  // fails open. Closes Sprint-16 enablement gate #5.
  const baselineStore = getAnomalyBaselineStore();
  const detector = createAnomalyDetector({
    getBaseline: async (actor, resourceType, _windowDays) => {
      const row = await baselineStore.findBaseline(actor, resourceType);
      if (!row) {
        // signal "no data yet" via sampleSize=0 — detector handles the
        // rest. Not throwing because cold-start is the expected normal
        // for any new actor or scope.
        return { mean: 0, stdDev: 0, sampleSize: 0 };
      }
      return {
        mean: row.mean,
        stdDev: row.stdDev,
        sampleSize: row.sampleSize,
      };
    },
  });

  const windowMs = getAnomalyWindowMs();

  return createAnomalyGate({
    detector,
    isEnabled: () => flagService.peekEnabled('anomaly-blocking', false),
    logger: safetyLoggerBridge,
    // S17-B1: resolves the S16 BLOCKER comment. The gateway passes
    // `request.domain` ('hr'/'crypto'/'core') as `resourceType`. We map
    // that to the real audit row scope: a list of `resource_type`
    // values + a list of `action` values that ARE actually emitted
    // by the workflows + middleware in this repo. Domain `core` is
    // short-circuited via empty resourceTypes because no `core` PII
    // surface exists today.
    //
    // OPERATIONAL CAVEAT (deliberate; tracked separately): the audit
    // service writes `audit_logs.user_id` ONLY when `actor.type ===
    // 'user'` (see packages/audit/src/audit-service.ts:61). All
    // current workflow emitters use `actor.type: 'system'`, so the
    // `WHERE user_id = ${actor}` filter in aggregateAccessPattern
    // matches zero rows for workflow-originated traffic regardless
    // of resource_type/action. Closing Gate #2 in production
    // therefore requires workflow→user actor propagation (i.e.
    // workflows pass the initiating user through the Inngest event
    // payload and emit audit rows with `actor.type: 'user'`). That
    // work is intentionally out of B1 scope — see the S17 delivery
    // review for the follow-up task. The mapping below is correct
    // for the day actor.type='user' rows start landing.
    getAccessPattern: async (actor, resourceType) => {
      const mapping = DOMAIN_AUDIT_SCOPE[resourceType as keyof typeof DOMAIN_AUDIT_SCOPE]
        ?? DOMAIN_AUDIT_SCOPE.core;
      return auditStore.aggregateAccessPattern({
        actor,
        resourceTypes: mapping.resourceTypes,
        actions: mapping.actions,
        windowMs,
      });
    },
  });
}

/**
 * S17-B1: per-domain anomaly-evaluation scope for the LLM gateway.
 * Each domain maps to:
 *   - resourceTypes: audit `resource_type` values that count toward the
 *     anomaly aggregate (matched via SQL IN clause)
 *   - actions: audit `action` values to filter on; empty = no filter
 *
 * Values were verified against actual emitters at the time of writing
 * (S17-B1 multi-model review caught a phantom-values regression in an
 * earlier draft):
 *   - HR resource types come from the PII audit middleware vocabulary
 *     (`packages/audit/src/middleware/pii-read-audit.ts`). NOTE: no
 *     production callsites for `auditPiiReadBulk`/`auditPiiReadExport`
 *     exist yet — the mapping is correct but inert until HR list/export
 *     endpoints are wrapped with `withPiiReadAudit`. That instrumentation
 *     is its own task tracked alongside Epic 5 HR onboarding (S18).
 *   - Crypto resource types + actions come from
 *     `apps/web/src/lib/workflows/crypto-paper-trade.ts` and
 *     `crypto-security-scan.ts` — the events that *are* emitted today.
 *   - `core` has no audit surface; empty arrays short-circuit the SQL
 *     query in `audit-store-drizzle.aggregateAccessPattern`.
 *
 * Extending: add new domains here AND add their `Domain` value to
 * `packages/llm-gateway/src/providers/types.ts`.
 */
const DOMAIN_AUDIT_SCOPE = {
  hr: {
    resourceTypes: ['candidate', 'employee', 'contract'] as const,
    actions: ['pii.read.bulk', 'pii.read.export'] as const,
  },
  crypto: {
    // verified 2026-04-23 against crypto-paper-trade.ts + crypto-security-scan.ts
    resourceTypes: ['trade-signal', 'trade-execution', 'security-report'] as const,
    actions: [
      'crypto.signal.risk-rejected',
      'crypto.trade.paper-executed',
      'crypto.security.scanned',
    ] as const,
  },
  core: {
    resourceTypes: [] as readonly string[],
    actions: [] as readonly string[],
  },
} as const;

// S17-B3: anomaly baseline store + cron-scope projection.
// `findBaseline(actor, scope.key)` is the lookup the detector uses;
// `getAnomalyBaselineScopes()` is what the cron consumes. Scope `key`
// MUST equal `aggregateAccessPattern`'s returned `resourceType`
// (`resourceTypes.join(',')`) so the cron writes baselines under the
// same key the gate later reads.
export const getAnomalyBaselineStore = lazy(() =>
  createDrizzleAnomalyBaselineStore(
    db() as unknown as Parameters<typeof createDrizzleAnomalyBaselineStore>[0],
  ),
);

/**
 * S17-B3 (post-Codex review): single source for the anomaly evaluation
 * window. The live gate's `aggregateAccessPattern` query and the
 * baseline-builder cron's per-bucket aggregation MUST use the same
 * window size, otherwise the detector compares live counts against
 * baselines computed over mismatched bucket sizes and the z-score is
 * meaningless.
 *
 * Both call sites (`buildAnomalyGate` in services.ts and the cron
 * registration in `app/api/inngest/route.ts`) import this helper.
 * Env-var override: `ANOMALY_WINDOW_MS` (default 10 min).
 */
export function getAnomalyWindowMs(): number {
  return Number(process.env.ANOMALY_WINDOW_MS) || 10 * 60 * 1000;
}

export function getAnomalyBaselineScopes(): readonly {
  key: string;
  resourceTypes: readonly string[];
  actions: readonly string[];
}[] {
  // S17-B3 (post-review): scope.key MUST match what the audit-store
  // writes into AccessPattern.resourceType — both sides go through
  // formatAnomalyScopeKey from @aptivo/audit so they can't drift.
  return Object.values(DOMAIN_AUDIT_SCOPE).map((scope) => ({
    key: formatAnomalyScopeKey(scope.resourceTypes),
    resourceTypes: scope.resourceTypes,
    actions: scope.actions,
  }));
}

// ---------------------------------------------------------------------------
// crypto domain stores (S6-INF-CRY)
// ---------------------------------------------------------------------------

export const getCryptoTradeSignalStore = lazy(() =>
  createDrizzleTradeSignalStore(db() as unknown as Parameters<typeof createDrizzleTradeSignalStore>[0]),
);

export const getCryptoExecutionStore = lazy(() =>
  createDrizzleTradeExecutionStore(db() as unknown as Parameters<typeof createDrizzleTradeExecutionStore>[0]),
);

// S18-B1: live-trade position store (separate from tradeExecutions —
// carries SL/TP prices the monitor cron polls; see schema docs).
export const getCryptoPositionStore = lazy(() =>
  createDrizzleCryptoPositionStore(db() as unknown as Parameters<typeof createDrizzleCryptoPositionStore>[0]),
);

/**
 * S18-B1 (round-1 review fix, Codex HIGH): live-trading is gated by
 * the `CRYPTO_LIVE_TRADE_ENABLED` env var. When this flag is true,
 * production code MUST NOT bind the in-memory adapter or the
 * null-threshold breaker — both are safe-by-construction in their
 * disabled states (in-memory rejects unknown symbols; null threshold
 * allows everything), but the COMBINATION is dangerous: a deploy that
 * forgets to swap one of them silently disables FR-CRYPTO-RISK-002 on
 * a real venue. This guard surfaces that misconfiguration loudly at
 * startup rather than letting losses accrue silently.
 */
function isLiveTradeEnabled(): boolean {
  return process.env.CRYPTO_LIVE_TRADE_ENABLED === 'true';
}

// S18-B1: daily-loss circuit breaker (FR-CRYPTO-RISK-002). Threshold
// lookup is a no-op placeholder today — returns null which the breaker
// reads as "no limit configured" and allows. A per-department config
// table or env-derived map replaces this when the admin route lands
// (S19+). When live trading is enabled the placeholder must be
// swapped to a real lookup; the guard below trips if not.
export const getDailyLossCircuitBreaker = lazy(() => {
  const getThresholdUsd = async (_deptId: string): Promise<string | null> => null;
  if (isLiveTradeEnabled()) {
    throw new Error(
      'CRYPTO_LIVE_TRADE_ENABLED=true but getThresholdUsd is the placeholder ' +
      'returning null — FR-CRYPTO-RISK-002 would be silently disabled. ' +
      'Wire a real per-department threshold lookup before flipping the live-trade flag.',
    );
  }
  return createDailyLossCircuitBreaker({
    positionStore: getCryptoPositionStore(),
    getThresholdUsd,
  });
});

// S18-B1: exchange MCP adapter — in-memory impl by default per
// AD-S18-4. When live trading is enabled, production must bind a real
// venue adapter; this guard fails loudly at first use rather than
// letting `SymbolNotFound` masquerade as a venue rejection.
export const getExchangeMcpAdapter = lazy(() => {
  if (isLiveTradeEnabled()) {
    throw new Error(
      'CRYPTO_LIVE_TRADE_ENABLED=true but the exchange adapter binding ' +
      'is still the in-memory impl. Swap to a real venue MCP adapter ' +
      '(Binance, Coinbase, etc.) before flipping the live-trade flag.',
    );
  }
  return createInMemoryExchangeMcp({
    seedPrices: {}, // empty — production swaps for the real adapter
  });
});

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

// S18-B2: HR onboarding state + task store (Epic 5)
export const getHrOnboardingStore = lazy(() =>
  createDrizzleHrOnboardingStore(db() as unknown as Parameters<typeof createDrizzleHrOnboardingStore>[0]),
);

// S18-B2: requireConsent middleware (FR-HR-CM-005). Looks up
// `consent_records` for the candidate's consent state; falls open
// only on the self-access exemption (candidate's email matches the
// requesting user's email).
//
// Round-1 multi-model review (Codex MEDIUM + test-quality-assessor
// HIGH): the prior SQL filtered `WHERE withdrawn_at IS NULL`, which
// made the `consent-withdrawn` branch in require-consent.ts dead
// code in production. Withdrawn-vs-never-granted produced the same
// `consent-required` user-facing reason. The fix returns the most
// recent record regardless of withdrawn_at; the middleware
// distinguishes the two cases via the `withdrawnAt` field for
// audit/UX clarity.
export const getRequireConsent = lazy(() =>
  createRequireConsent({
    findActiveConsent: async (candidateId, consentType) => {
      const drizzle = db() as unknown as {
        execute: (sql: unknown) => Promise<{ rows?: Array<{
          consent_type: string;
          consent_date: Date;
          withdrawn_at: Date | null;
        }> } | Array<{
          consent_type: string;
          consent_date: Date;
          withdrawn_at: Date | null;
        }>>;
      };
      // raw SQL to avoid coupling to schema-table imports here; the
      // consentRecords table shape is stable per @aptivo/database.
      // NO `withdrawn_at IS NULL` clause — middleware needs the row
      // even if withdrawn so it can surface the distinct deny reason.
      const { sql } = await import('drizzle-orm');
      const result = await drizzle.execute(
        sql`SELECT consent_type, consent_date, withdrawn_at FROM consent_records
            WHERE candidate_id = ${candidateId} AND consent_type = ${consentType}
            ORDER BY consent_date DESC LIMIT 1`,
      );
      const rows = Array.isArray(result) ? result : (result.rows ?? []);
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return {
        consentType: r.consent_type,
        consentDate: r.consent_date,
        withdrawnAt: r.withdrawn_at,
      };
    },
  }),
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
  createMetricService({
    ...createMetricQueries(db() as unknown as Parameters<typeof createMetricQueries>[0]),
    // S17-B4: same in-process counter the ML classifier increments,
    // so the SLO cron's ml_classifier_timeout-rate evaluator reads
    // a coherent view of recent traffic.
    safetyInferenceCounter: getSafetyInferenceCounter(),
    // S17-CT-2: ticket SLA at-risk evaluator. Same instance the
    // /api/tickets routes use — counts are taken from one source.
    ticketSlaService: getTicketSlaService(),
    slaTruncationLogger: { warn: (event, ctx) => appLog.warn(event, ctx) },
  }),
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
// uses resolveSessionRedisConfig for pure env-resolution (PR-05)
export function buildSessionRedis(): RedisClient | null {
  const config = resolveSessionRedisConfig(process.env as Record<string, string | undefined>);
  if (!config) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis') as { Redis: new (opts: { url: string; token: string }) => RedisClient };
    return new Redis({ url: config.url, token: config.token });
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
// uses resolveJobsRedisConfig for pure env-resolution (PR-05)
export function buildJobsRedis(): RedisClient | null {
  const config = resolveJobsRedisConfig(process.env as Record<string, string | undefined>);
  if (!config) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis') as { Redis: new (opts: { url: string; token: string }) => RedisClient };
    return new Redis({ url: config.url, token: config.token });
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
  // PR-02: production guard — uses resolveMfaClient for pure env-resolution
  const resolution = resolveMfaClient({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  if (resolution.type === 'real') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClient } = require('@supabase/supabase-js') as {
        createClient: (url: string, key: string) => { auth: SupabaseAuthClient };
      };
      const supabase = createClient(
        resolution.url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      );
      return createSupabaseMfaClient(supabase.auth);
    } catch (err) {
      // in production, failing to load supabase SDK is fatal — don't fall through to stub
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`@supabase/supabase-js required in production but failed to load: ${err}`);
      }
      console.warn('@supabase/supabase-js not installed, using stub mfa client');
    }
  }

  if (resolution.type === 'error') {
    throw new Error(resolution.message);
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

/**
 * S18-B2 (Codex/Gemini multi-review-style fix): the prior wiring
 * hardcoded `actor.type: 'system'` regardless of caller, which
 * defeats the entire point of S18-A1's anomaly-gate observability
 * fix on the HR scope — `audit_logs.user_id` is only populated when
 * `actor.type === 'user'` per audit-service.ts:61, and the anomaly
 * aggregate's `WHERE user_id = $actor` filter doesn't match
 * 'system'-tagged rows. Now the actor type defaults to 'user'
 * because every PII read DOES have a real user attribution
 * (route handlers must extract authenticated user before calling
 * auditPiiReadBulk/Export). The very limited 'system' case (an
 * automated reconciliation scan reading PII) can be added with a
 * type-discriminated emit shape later if needed.
 */
export const getPiiReadAuditMiddleware = lazy(() =>
  createPiiReadAuditMiddleware({
    emit: async (event) => {
      const auditService = getAuditService();
      await auditService.emit({
        actor: { id: event.actor, type: 'user' },
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
// uses resolveFeatureFlagProvider for pure env-resolution
export const getFeatureFlagService = lazy(() => {
  const providerType = resolveFeatureFlagProvider(process.env as Record<string, string | undefined>);
  const provider = providerType === 'env'
    ? createEnvFlagProvider(DEFAULT_FLAGS)
    : createLocalFlagProvider(DEFAULT_FLAGS);
  const service = createFeatureFlagService({
    provider,
    // S17-B2 (post-review): bind the app's safe-logger so warm()
    // failures surface in operational logs. Without this, a broken
    // provider would silently leave peekEnabled returning defaultValue.
    logger: { warn: (event, ctx) => appLog.warn(event, ctx) },
  });
  // S17-B2: fire-and-forget warm. This kicks off cache population but
  // does NOT block the first request — that would make `getLlmGateway`
  // async and is not compatible with the lazy/sync pattern used here.
  //
  // COLD-START BEHAVIOUR (post-Codex review): until `warm()` resolves,
  // every `peekEnabled(key, defaultValue)` call returns `defaultValue`.
  // For the two safety gates that bind to peekEnabled — `ml-injection-
  // classifier` and `anomaly-blocking` — `defaultValue` is `false`
  // (see buildInjectionClassifier / buildAnomalyGate). `false` means
  // the gate is disabled, which is the SAFE direction: the rule-based
  // injection classifier still runs (ML wrapper falls through), and
  // the anomaly gate short-circuits to `{ action: 'pass' }`. Neither
  // direction exposes user data or bypasses policy. Callers that need
  // to wait for warmup must invoke `service.warm()` explicitly before
  // the first request (e.g., in a startup hook).
  void service.warm();
  return service;
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

// ---------------------------------------------------------------------------
// FA3-01: department budgeting
// ---------------------------------------------------------------------------

const budgetLoggerBridge: BudgetLogger = {
  debug: (msg, ctx) => appLog.debug(msg, ctx),
  info: (msg, ctx) => appLog.info(msg, ctx),
  warn: (msg, ctx) => appLog.warn(msg, ctx),
  error: (msg, ctx) => appLog.error(msg, ctx),
};

export const getDepartmentBudgetService = lazy((): DepartmentBudgetService => {
  const store = createDrizzleDepartmentBudgetStore(
    db() as unknown as Parameters<typeof createDrizzleDepartmentBudgetStore>[0],
  );
  return createDepartmentBudgetService({ store, logger: budgetLoggerBridge });
});

export const getAdminRateLimit = lazy((): AdminRateLimit => {
  const redis = getSessionRedis() as RateLimitRedis | null;
  return createAdminRateLimit(redis);
});

// ---------------------------------------------------------------------------
// S17-CT-1: case-tracking ticket store + service (Epic 4)
// ---------------------------------------------------------------------------

export const getTicketStore = lazy(() =>
  createDrizzleTicketStore(
    db() as unknown as Parameters<typeof createDrizzleTicketStore>[0],
  ),
);

export const getTicketSlaConfigStore = lazy(() =>
  createDrizzleTicketSlaConfigStore(
    db() as unknown as Parameters<typeof createDrizzleTicketSlaConfigStore>[0],
  ),
);

export const getTicketSlaService = lazy(() => {
  // S17-CT-2: lazy require to keep the SLA engine off the cold-load
  // path of every services consumer. Same pattern as getTicketService.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createTicketSlaService } = require('./case-tracking/ticket-sla-service.js') as typeof import('./case-tracking/ticket-sla-service.js');
  return createTicketSlaService({
    slaConfigStore: getTicketSlaConfigStore(),
    ticketStore: getTicketStore(),
  });
});

export const getTicketReportQueries = lazy(() =>
  createTicketReportQueries(
    db() as unknown as Parameters<typeof createTicketReportQueries>[0],
  ),
);

export const getTicketReportService = lazy(() => {
  // S17-CT-4: ticket reporting service. Lazy-imported to keep the
  // dashboard-only path off the cold-load surface for routes that
  // never call /api/tickets/reports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createTicketReportService } = require('./case-tracking/ticket-report-service.js') as typeof import('./case-tracking/ticket-report-service.js');
  return createTicketReportService({
    queries: getTicketReportQueries(),
    slaConfigStore: getTicketSlaConfigStore(),
  });
});

export const getTicketEscalationService = lazy(() => {
  // S17-CT-3: ticket escalation service — wraps the per-priority
  // tier chain over the existing tickets store. Audit emission
  // through the same getAuditService bridge the ticket service
  // uses so a Result.err on emit lands in appLog as
  // ticket_audit_emit_failed (consistent with CT-1).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createTicketEscalationService } = require('./case-tracking/ticket-escalation.js') as typeof import('./case-tracking/ticket-escalation.js');
  const auditService = getAuditService();
  return createTicketEscalationService({
    store: getTicketStore(),
    emitAudit: async (input) => {
      const r = await auditService.emit(input);
      if (!r.ok) appLog.warn('ticket_audit_emit_failed', { action: input.action });
    },
    logger: { warn: (event, ctx) => appLog.warn(event, ctx) },
    // notifications: deferred to S18 — CT-3 ships the service contract
    // and audit emission. Tier-change notifications wire in alongside
    // FA3-02 budget notifications as a single notification-adapter pass.
  });
});

export const getTicketService = lazy(() => {
  // import lazily to avoid pulling case-tracking into every services
  // consumer at module load
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createTicketService } = require('./case-tracking/ticket-service.js') as typeof import('./case-tracking/ticket-service.js');

  const defService = getWorkflowDefinitionService();
  const auditService = getAuditService();

  // S17-CT-1 (post-Codex review): the gate validates graph integrity
  // in addition to existence. The workflow-definition-service runs
  // validateGraph on create/update, but defs persisted before the
  // validator was widened (or seeded) could be invalid; ticket
  // creation should not link to a broken workflow regardless of
  // origin. Lazy-import keeps the validator out of every services
  // consumer's load path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { validateGraph } = require('./workflows/graph-validation.js') as typeof import('./workflows/graph-validation.js');

  return createTicketService({
    store: getTicketStore(),
    verifyWorkflowDefinition: async (id: string) => {
      const result = await defService.findById(id);
      if (!result.ok) return { status: 'not_found' as const };
      const graph = validateGraph(result.value.steps);
      if (!graph.ok) {
        return { status: 'invalid' as const, reason: graph.error._tag };
      }
      return { status: 'ok' as const };
    },
    emitAudit: async (input) => {
      const r = await auditService.emit(input);
      // fire-and-forget — audit emit failure must not block the
      // ticket write path. Service-level errors are already logged.
      if (!r.ok) appLog.warn('ticket_audit_emit_failed', { action: input.action });
    },
  });
});
