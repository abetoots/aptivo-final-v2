# Sprint 3 Implementation Plan: MCP Layer + File Storage

**Theme**: "Tools for agents, storage for humans"
**Duration**: 2 weeks (Week 7–8)
**Total Story Points**: 38 (10 MCP tasks + 3 File Storage tasks)
**Packages**: `@aptivo/mcp-layer` + `@aptivo/file-storage` (new) + `@aptivo/database` + `apps/web`
**FRD Coverage**: FR-CORE-MCP-001 through MCP-003, FR-CORE-BLOB-001, FR-CORE-BLOB-002
**WARNING Closure**: S1-W14 (response size), S3-W11 (event schema validation), S4-W9 (data deletion)

---

## Executive Summary

Sprint 3 delivers two production subsystems:

1. **MCP Layer** — Production wrapper for secure, resilient MCP tool execution. Builds on 83 existing spike tests (SP-06 security, SP-10 circuit breaker, SP-13 supply chain) with new transport integration, rate limiting, caching, event validation, and data deletion workflows.
2. **File Storage** — New `@aptivo/file-storage` package for S3-compatible blob handling (DO Spaces), entity-linked access control, and malware scanning via ClamAV sidecar.

Architecture constraints resolved in [SPRINT_3_ARCH_MULTI_REVIEW.md](./SPRINT_3_ARCH_MULTI_REVIEW.md) and enforced in this plan:

- Inngest native rate limiting/concurrency (no BullMQ)
- Per-package store interfaces with injected Redis adapters (no `@aptivo/redis`)
- AgentKit `MCPClient` for transport lifecycle only (no reasoning/routing)
- ClamAV sidecar behind injectable `FileScanner` adapter

### Multi-Model Consensus

This plan was produced via multi-model synthesis (Claude Opus 4.6 lead + Gemini 3 Flash Preview + Codex/GPT). All three models agree on:

- 3-phase execution: Foundation → Integration → Testing
- Critical path: MCP-01/02 → MCP-03/04/05 → MCP-06 → MCP-08
- FS tasks are independent of MCP tasks and fully parallelizable
- `createMcpWrapper(deps)` factory matches `createLlmGateway(deps)` pattern
- MCP-04 circuit breaker is 85%+ reuse from SP-10
- 38 SP is tight but achievable — FS tasks front-loaded to Web Dev 2

---

## 1. Task Breakdown

### Phase 1: Foundation & Transport (Days 1–4)

#### MCP-01: Tool Registry Schema (2 SP)

**Description**: Define `mcp_servers` and `mcp_tools` Drizzle tables for centralized MCP tool management. Provides the registry data model consumed by MCP-06 wrapper service.

**Acceptance Criteria**:
- [ac] `mcp_servers` table: id, name, transport type (stdio|http), command, args (JSONB), env_allowlist (text[]), max_concurrent, is_enabled, health_check_url
- [ac] `mcp_tools` table: id, server_id (FK), name, description, input_schema (JSONB), max_response_bytes, cache_ttl_seconds, is_enabled
- [ac] Indexes on server name (unique) and tool name + server_id (unique)
- [ac] Schema exported from `@aptivo/database`

**Files**:
- Create: `packages/database/src/schema/mcp-registry.ts`
- Modify: `packages/database/src/schema/index.ts`, `packages/database/src/index.ts`

**Dependencies**: None

**Reuse Assessment**: **40%** — schema patterns from HITL-01/02 directly applicable; column design is new.

**TDD Micro-Tasks**:
1. Red: Import `mcpServers` from `@aptivo/database` — fails (module not found)
2. Green: Define `pgTable('mcp_servers', { ... })` with all columns
3. Red: Import `mcpTools` — fails
4. Green: Define `pgTable('mcp_tools', { ... })` with FK to mcp_servers
5. Red: Assert unique constraint on server name
6. Green: Add unique index
7. Refactor: Add composite unique index on (server_id, tool_name)

**Schema Design**:
```typescript
export const mcpServers = pgTable('mcp_servers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull().unique(),
  transport: varchar('transport', { length: 10 }).notNull(), // 'stdio' | 'http'
  command: varchar('command', { length: 500 }).notNull(),
  args: jsonb('args').$type<string[]>().default([]),
  envAllowlist: text('env_allowlist').array().default([]),
  maxConcurrent: integer('max_concurrent').notNull().default(3),
  isEnabled: boolean('is_enabled').notNull().default(true),
  healthCheckUrl: varchar('health_check_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('mcp_servers_name_idx').on(table.name),
]);

export const mcpTools = pgTable('mcp_tools', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  serverId: uuid('server_id').notNull()
    .references(() => mcpServers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  inputSchema: jsonb('input_schema'),
  maxResponseBytes: integer('max_response_bytes').notNull().default(1_048_576), // 1MB
  cacheTtlSeconds: integer('cache_ttl_seconds'), // null = no caching
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('mcp_tools_server_tool_idx').on(table.serverId, table.name),
]);
```

---

#### MCP-02: AgentKit Setup (3 SP)

**Description**: Integrate AgentKit's `MCPClient` for MCP transport lifecycle management. Per [architecture review Q4](./SPRINT_3_ARCH_MULTI_REVIEW.md#q4-agentkit-integration-depth-mcp-02), we use AgentKit for transport only — no agent reasoning or routing.

**Acceptance Criteria**:
- [ac] `McpTransportAdapter` interface: `connect()`, `callTool(name, input)`, `listTools()`, `close()`
- [ac] `AgentKitTransportAdapter` implementation wrapping `@inngest/agent-kit` MCPClient
- [ac] `InMemoryTransportAdapter` for tests (reuse SP-05 in-process pattern)
- [ac] Startup validates server config against allowlist + sanitizes env (SP-06 reuse)
- [ac] Lifecycle methods return `Result` — never throw from domain surface
- [ac] Handles child process spawning/cleanup for stdio transports

**Files**:
- Create: `packages/mcp-layer/src/transport/transport-types.ts`
- Create: `packages/mcp-layer/src/transport/agentkit-adapter.ts`
- Create: `packages/mcp-layer/src/transport/in-memory-adapter.ts`
- Create: `packages/mcp-layer/src/transport/index.ts`
- Modify: `packages/mcp-layer/src/index.ts`
- Modify: `packages/mcp-layer/package.json` (add `@inngest/agent-kit`, `@modelcontextprotocol/sdk`)
- Create: `packages/mcp-layer/tests/mcp-02-transport.test.ts`

**Dependencies**: MCP-01 (server config from registry)

**Reuse Assessment**: **70%** — SP-05 validated transport modes, SP-01 validated AgentKit. Adapter wrapping is new.

**TDD Micro-Tasks**:
1. Red: Import `McpTransportAdapter` — fails
2. Green: Define interface with Result-returning methods
3. Red: `InMemoryTransportAdapter.callTool()` returns not-implemented
4. Green: Implement in-memory adapter using `@modelcontextprotocol/sdk` InMemoryTransport
5. Red: `AgentKitTransportAdapter` fails on invalid server config
6. Green: Validate config against allowlist before spawning
7. Red: `close()` throws on lifecycle error
8. Green: Wrap in Result, log error
9. Refactor: Extract shared error mapper for transport errors

**Interface Design**:
```typescript
export type McpTransportError =
  | { _tag: 'ConnectionFailed'; server: string; cause: unknown }
  | { _tag: 'ToolNotFound'; tool: string; server: string }
  | { _tag: 'ToolExecutionFailed'; tool: string; message: string }
  | { _tag: 'TransportClosed'; server: string }
  | { _tag: 'ServerNotAllowed'; server: string }
  | { _tag: 'LifecycleError'; operation: string; cause: unknown };

export interface McpTransportAdapter {
  connect(): Promise<Result<void, McpTransportError>>;
  callTool(name: string, input: Record<string, unknown>): Promise<Result<ToolCallResult, McpTransportError>>;
  listTools(): Promise<Result<ToolDefinition[], McpTransportError>>;
  close(): Promise<Result<void, McpTransportError>>;
}

export interface ToolCallResult {
  content: unknown;
  isError: boolean;
  durationMs: number;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}
```

---

#### MCP-03: Rate Limit (3 SP)

**Description**: Implement Inngest-native concurrency controls for MCP tool calls within workflows, plus token bucket fallback for non-Inngest direct call paths.

**Acceptance Criteria**:
- [ac] Inngest function config uses `concurrency: { limit: n, key: 'event.data.serverId' }` + `rateLimit` controls
- [ac] `McpRateLimiter` with injectable `RateLimitStore` (reuse LLM-10 `TokenBucket` pattern)
- [ac] `InMemoryRateLimitStore` for tests
- [ac] Fail-closed: store errors → rate limit denied
- [ac] Backpressure tested under burst (10 concurrent calls, limit 3 → 7 denied)

**Files**:
- Create: `packages/mcp-layer/src/rate-limit/mcp-rate-limiter.ts`
- Create: `packages/mcp-layer/src/rate-limit/rate-limit-types.ts`
- Create: `packages/mcp-layer/src/rate-limit/index.ts`
- Modify: `packages/mcp-layer/src/index.ts`
- Create: `packages/mcp-layer/tests/mcp-03-rate-limit.test.ts`

**Dependencies**: None (independent from MCP-02; Inngest config wired later in MCP-06)

**Reuse Assessment**: **75%** — TokenBucket pattern from `@aptivo/llm-gateway/rate-limit` directly applicable. MCP-specific keying is new.

**TDD Micro-Tasks**:
1. Red: `McpRateLimiter.check(serverId)` returns not-implemented
2. Green: Implement token bucket with `maxTokens` + `refillRate`
3. Red: Burst of 10 calls all pass (should deny 7)
4. Green: Enforce token depletion with fail-closed
5. Red: Store error allows request through
6. Green: Fail-closed on store errors → return denied
7. Red: Tokens don't refill after waiting
8. Green: Implement time-based refill logic
9. Refactor: Extract `RateLimitStore` interface matching LLM-10 pattern

**Interface Design**:
```typescript
export interface McpRateLimitStore {
  get(key: string): Promise<{ tokens: number; lastRefill: number } | null>;
  set(key: string, state: { tokens: number; lastRefill: number }): Promise<void>;
}

export interface McpRateLimiterConfig {
  maxTokens: number;      // burst capacity per server (default: 10)
  refillRate: number;     // tokens per second (default: 2)
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };
```

---

#### MCP-04: Circuit Breaker Hardening (3 SP)

**Description**: Production hardening of SP-10 circuit breaker. Add error categorization helper for MCP-specific errors and ensure integration with wrapper pipeline.

**Acceptance Criteria**:
- [ac] All 25 existing SP-10 tests remain green
- [ac] `classifyMcpError(error)` helper categorizes errors as transient (retriable) or permanent
- [ac] Transient errors: timeout, 429, 5xx, network failures
- [ac] Permanent errors: 4xx (except 429), tool not found, invalid input
- [ac] Only transient errors count toward circuit failure threshold
- [ac] `CircuitOpenError.retryAfterMs` propagated for Inngest retry decisions
- [ac] Per-server circuit breaker instances (keyed by serverId)

**Files**:
- Create: `packages/mcp-layer/src/resilience/error-classifier.ts`
- Modify: `packages/mcp-layer/src/resilience/circuit-breaker.ts` (add error filter option)
- Modify: `packages/mcp-layer/src/resilience/index.ts`
- Create: `packages/mcp-layer/tests/mcp-04-circuit-hardening.test.ts`

**Dependencies**: MCP-02 (error types from transport layer)

**Reuse Assessment**: **85%** — SP-10 circuit breaker is production-ready. Changes: error classifier + per-server keying helper.

**TDD Micro-Tasks**:
1. Red: `classifyMcpError(timeout)` returns not-implemented
2. Green: Implement classifier with transient/permanent categories
3. Red: Circuit trips on permanent errors (shouldn't)
4. Green: Add `shouldRecordFailure` filter option to CircuitBreaker
5. Red: Per-server circuit state not isolated
6. Green: Add `CircuitBreakerRegistry` keyed by serverId
7. Refactor: Ensure all 25 existing tests still pass

**Interface Design**:
```typescript
export type ErrorClassification = 'transient' | 'permanent';

export function classifyMcpError(error: McpTransportError): ErrorClassification;

export class CircuitBreakerRegistry {
  constructor(config?: Partial<CircuitBreakerConfig>);
  getBreaker(serverId: string): CircuitBreaker;
  resetAll(): void;
}
```

---

#### MCP-05: Response Caching (3 SP)

**Description**: Redis-backed response caching for deterministic MCP tool calls with per-tool TTL from registry.

**Acceptance Criteria**:
- [ac] `McpCacheStore` interface: `get(key)`, `set(key, value, ttlSeconds)`, `del(key)`
- [ac] `InMemoryCacheStore` for tests
- [ac] `RedisCacheStore` implementation (follows CF-03 RedisClient pattern)
- [ac] Cache key: `mcp:${serverId}:${toolName}:${sha256(JSON.stringify(sortedInput))}`
- [ac] Per-tool TTL from registry (`cacheTtlSeconds`); null = no caching
- [ac] Cache bypass: fail-open on store errors (log warning, continue to transport)

**Files**:
- Create: `packages/mcp-layer/src/cache/cache-store.ts`
- Create: `packages/mcp-layer/src/cache/in-memory-cache-store.ts`
- Create: `packages/mcp-layer/src/cache/redis-cache-store.ts`
- Create: `packages/mcp-layer/src/cache/index.ts`
- Modify: `packages/mcp-layer/src/index.ts`
- Create: `packages/mcp-layer/tests/mcp-05-response-caching.test.ts`

**Dependencies**: MCP-01 (TTL config from registry)

**Reuse Assessment**: **65%** — Adapter pattern from CF-03 `RedisClient` / `ReplayStore`. Cache key generation and TTL policy are new.

**TDD Micro-Tasks**:
1. Red: `InMemoryCacheStore.get()` returns undefined for missing key
2. Green: Implement Map-based store with TTL via setTimeout
3. Red: Duplicate call misses cache (key mismatch)
4. Green: Implement deterministic key generation with sorted input + SHA-256
5. Red: TTL expiry not respected
6. Green: Add TTL-aware eviction tests
7. Red: Redis store error crashes request
8. Green: Fail-open — catch error, log warning, return cache miss
9. Refactor: Extract `normalizeCacheKey()` pure function

**Interface Design**:
```typescript
export interface McpCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

export function normalizeCacheKey(
  serverId: string,
  toolName: string,
  input: Record<string, unknown>,
): string;
```

---

### Phase 2: Wrapper Service & Workflows (Days 5–7)

#### MCP-06: Wrapper Service (5 SP)

**Description**: Core integration task. Composes transport, security, resilience, and caching into a single production-ready MCP execution service. Follows `createLlmGateway(deps)` factory pattern.

**Acceptance Criteria**:
- [ac] `createMcpWrapper(deps)` factory returns `McpWrapper` with `executeTool(serverId, toolName, input)` method
- [ac] Pipeline order: validate input → check allowlist → generate scoped token → check cache → rate limit → circuit breaker → execute via transport → check response size → cache response → return result
- [ac] **S1-W14**: Reject responses exceeding per-tool `maxResponseBytes` with `ResponseTooLarge` error
- [ac] Returns `Result<ToolCallResult, McpError>` with tagged union errors
- [ac] All dependencies injectable (functional core / imperative shell)
- [ac] Logging hooks at each pipeline stage

**Files**:
- Create: `packages/mcp-layer/src/wrapper/mcp-wrapper.ts`
- Create: `packages/mcp-layer/src/wrapper/mcp-wrapper-types.ts`
- Create: `packages/mcp-layer/src/wrapper/index.ts`
- Modify: `packages/mcp-layer/src/index.ts`
- Create: `packages/mcp-layer/tests/mcp-06-wrapper-service.test.ts`

**Dependencies**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05

**Reuse Assessment**: **80%** — Orchestration pattern from `createLlmGateway`. SP-06 security primitives composed directly. Pipeline wiring is new.

**TDD Micro-Tasks**:
1. Red: `createMcpWrapper(deps).executeTool()` returns not-implemented
2. Green: Implement basic pass-through to transport
3. Red: Unallowlisted server call succeeds (should fail)
4. Green: Add allowlist check as first gate
5. Red: No scoped token generated before transport call
6. Green: Add scoped token generation step
7. Red: Cached response not returned on second call
8. Green: Add cache check before transport, cache save after
9. Red: Oversized response accepted (should fail with S1-W14)
10. Green: Add byte-size check on response content
11. Red: Rate limited request passes through
12. Green: Add rate limiter check before circuit breaker
13. Red: Circuit open error not mapped to McpError
14. Green: Map CircuitOpenError to McpError tagged union
15. Refactor: Extract pure pipeline decision functions from imperative shell

**Interface Design**:
```typescript
export interface McpWrapperDeps {
  registry: ToolRegistry;
  transport: McpTransportAdapter;
  rateLimiter: McpRateLimiter;
  circuitBreakers: CircuitBreakerRegistry;
  cache?: McpCacheStore;
  allowlist: McpServerConfig[];
  signingKey: string;
}

export type McpError =
  | { _tag: 'ValidationError'; message: string }
  | { _tag: 'ServerNotAllowed'; server: string }
  | { _tag: 'ToolNotFound'; tool: string; server: string }
  | { _tag: 'ToolDisabled'; tool: string }
  | { _tag: 'RateLimitExceeded'; server: string; retryAfterMs: number }
  | { _tag: 'CircuitOpen'; server: string; retryAfterMs: number }
  | { _tag: 'ResponseTooLarge'; tool: string; bytes: number; limit: number }
  | { _tag: 'TransportError'; tool: string; message: string }
  | { _tag: 'TokenGenerationError'; message: string };

export interface ToolRegistry {
  getServer(serverId: string): Promise<McpServerRecord | null>;
  getTool(serverId: string, toolName: string): Promise<McpToolRecord | null>;
}

export function createMcpWrapper(deps: McpWrapperDeps): McpWrapper;

export interface McpWrapper {
  executeTool(
    serverId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<Result<ToolCallResult, McpError>>;
}
```

**Pipeline Flow**:
```
executeTool(serverId, toolName, input)
  1. registry.getTool(serverId, toolName) → ToolNotFound | ToolDisabled
  2. validateServerConfig(server, allowlist) → ServerNotAllowed
  3. generateScopedToken({ serverId, permissions }) → TokenGenerationError
  4. cache?.get(cacheKey) → return cached if hit
  5. rateLimiter.check(serverId) → RateLimitExceeded
  6. circuitBreakers.getBreaker(serverId).execute(() =>
       transport.callTool(toolName, input)
     ) → CircuitOpen | TransportError
  7. checkResponseSize(result, tool.maxResponseBytes) → ResponseTooLarge
  8. cache?.set(cacheKey, result, tool.cacheTtlSeconds)
  9. return Result.ok(result)
```

---

#### MCP-07: Mock MCP Server (2 SP)

**Description**: Deterministic mock MCP server for integration and failure-mode testing. Based on SP-05 test server.

**Acceptance Criteria**:
- [ac] Standalone stdio-based server with `echo`, `slow`, `error`, `oversized` tools
- [ac] `echo` tool: returns input as-is
- [ac] `slow` tool: configurable latency before response
- [ac] `error` tool: returns configurable error responses
- [ac] `oversized` tool: returns response exceeding size limit
- [ac] Supports both stdio and in-memory transport modes
- [ac] Shared fixture consumed by MCP-08 integration tests

**Files**:
- Create: `packages/mcp-layer/tests/fixtures/mock-mcp-server.mjs` (standalone process)
- Create: `packages/mcp-layer/tests/fixtures/mock-mcp-tools.ts` (in-memory tool definitions)
- Create: `packages/mcp-layer/tests/mcp-07-mock-server.test.ts`

**Dependencies**: MCP-02 (transport adapter for lifecycle testing)

**Reuse Assessment**: **85%** — SP-05 `apps/spike-runner/src/mcp-test-server.mjs` directly reusable. Add failure injection tools.

**TDD Micro-Tasks**:
1. Red: Mock server `listTools` returns empty
2. Green: Register echo, slow, error, oversized tools
3. Red: `echo` tool returns wrong format
4. Green: Implement echo with proper MCP response envelope
5. Red: Server process doesn't close cleanly
6. Green: Add SIGTERM handler for clean shutdown
7. Refactor: Extract tool behaviors into injectable handlers

---

#### MCP-09: Event Schema Validation (3 SP) — closes S3-W11

**Description**: Publish-time Zod validation for all Inngest events. Invalid payloads are dropped and logged rather than published.

**Acceptance Criteria**:
- [ac] `createValidatedSender(inngest, schemaMap)` factory wraps `inngest.send()`
- [ac] Validates event data against registered Zod schema before publishing
- [ac] Invalid payloads logged as errors and dropped (not published)
- [ac] Event schemas defined as `Record<string, z.ZodType>` registry
- [ac] MCP-specific event schemas: `mcp/tool.called`, `mcp/tool.completed`, `mcp/tool.failed`
- [ac] Closes WARNING S3-W11

**Files**:
- Create: `packages/mcp-layer/src/events/event-schemas.ts`
- Create: `packages/mcp-layer/src/events/validated-sender.ts`
- Create: `packages/mcp-layer/src/events/index.ts`
- Modify: `packages/mcp-layer/src/index.ts`
- Create: `packages/mcp-layer/tests/mcp-09-event-validation.test.ts`

**Dependencies**: MCP-06 (consumes event schemas for tool lifecycle events)

**Reuse Assessment**: **70%** — Inngest typed event patterns from spike-runner. Validation wrapper is new.

**TDD Micro-Tasks**:
1. Red: Invalid event publishes successfully (should be blocked)
2. Green: Add Zod validation gate before `inngest.send()`
3. Red: Valid event rejected (schema mismatch)
4. Green: Register schemas for MCP event types
5. Red: Unknown event type passes through
6. Green: Reject unregistered event types with error log
7. Refactor: Export event schemas for consumer validation

**Schema Design**:
```typescript
export const MCP_EVENT_SCHEMAS = {
  'mcp/tool.called': z.object({
    requestId: z.string().uuid(),
    serverId: z.string(),
    toolName: z.string(),
    workflowId: z.string().optional(),
  }),
  'mcp/tool.completed': z.object({
    requestId: z.string().uuid(),
    serverId: z.string(),
    toolName: z.string(),
    durationMs: z.number().int().nonnegative(),
    cached: z.boolean(),
  }),
  'mcp/tool.failed': z.object({
    requestId: z.string().uuid(),
    serverId: z.string(),
    toolName: z.string(),
    errorTag: z.string(),
    durationMs: z.number().int().nonnegative(),
  }),
} as const;
```

---

#### MCP-10: Data Deletion Workflow (3 SP) — closes S4-W9

**Description**: Multi-step Inngest workflow for GDPR/data deletion requests with per-storage checkpoints for resumability.

**Acceptance Criteria**:
- [ac] `user/data.deletion-requested` event triggers workflow
- [ac] Sequential steps: delete DB records → delete S3 files → mask audit entries
- [ac] Each step checkpoints result using return-value pattern (`safeSagaStep`)
- [ac] Partial failure: records which steps completed, enables manual resume
- [ac] Uses `createValidatedSender` (MCP-09) for status events
- [ac] Closes WARNING S4-W9

**Files**:
- Create: `packages/mcp-layer/src/workflows/data-deletion.ts`
- Create: `packages/mcp-layer/src/workflows/workflow-types.ts`
- Create: `packages/mcp-layer/src/workflows/index.ts`
- Modify: `apps/web/src/app/api/inngest/route.ts` (register function)
- Create: `packages/mcp-layer/tests/mcp-10-data-deletion.test.ts`

**Dependencies**: MCP-06 (wrapper for file deletion), MCP-09 (validated event publishing)

**Reuse Assessment**: **65%** — SP-01 saga compensation pattern + Sprint 2 Inngest workflow patterns. Deletion-specific steps are new.

**TDD Micro-Tasks**:
1. Red: Workflow doesn't checkpoint after DB deletion step
2. Green: Implement with `step.run()` return-value pattern per step
3. Red: S3 deletion failure doesn't record partial progress
4. Green: Return `{ ok: false, completedSteps: ['db'] }` on S3 failure
5. Red: Status event not emitted after each step
6. Green: Add `step.run('emit-status')` after each deletion step
7. Refactor: Extract step result type into reusable `DeletionCheckpoint`

**Interface Design**:
```typescript
export type DeletionStep = 'db-records' | 's3-files' | 'audit-masking';

export type DeletionCheckpoint = {
  step: DeletionStep;
  status: 'completed' | 'failed' | 'skipped';
  error?: string;
};

export type DeletionResult = {
  userId: string;
  checkpoints: DeletionCheckpoint[];
  completedAt?: string;
};
```

---

### Phase 2b: File Storage (Days 2–8, parallel with MCP)

#### FS-01: Storage Adapter (3 SP)

**Description**: Create new `@aptivo/file-storage` package with S3-compatible adapter interface and DO Spaces implementation. Presigned URL-based upload/download.

**Acceptance Criteria**:
- [ac] New package scaffolded: `packages/file-storage/` with build/test/typecheck scripts
- [ac] `StorageAdapter` interface: `createPresignedUpload`, `createPresignedDownload`, `deleteObject`, `getMetadata`
- [ac] `S3StorageAdapter` implementation for DO Spaces (AWS SDK v3 S3 client)
- [ac] `InMemoryStorageAdapter` for tests
- [ac] Max file size configurable (default 50MB per FRD)
- [ac] File metadata schema: id, key, bucket, size_bytes, mime_type, status (pending|ready|quarantined|deleted)
- [ac] `files` and `file_entity_links` Drizzle tables in `@aptivo/database`

**Files**:
- Create: `packages/file-storage/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/file-storage/src/storage/storage-adapter.ts`
- Create: `packages/file-storage/src/storage/s3-adapter.ts`
- Create: `packages/file-storage/src/storage/in-memory-adapter.ts`
- Create: `packages/file-storage/src/storage/storage-types.ts`
- Create: `packages/file-storage/src/storage/index.ts`
- Create: `packages/file-storage/src/index.ts`
- Create: `packages/database/src/schema/file-storage.ts`
- Modify: `packages/database/src/schema/index.ts`, `packages/database/src/index.ts`
- Create: `packages/file-storage/tests/fs-01-storage-adapter.test.ts`

**Dependencies**: None

**Reuse Assessment**: **35%** — Adapter pattern from llm-gateway providers. S3/presigned URL logic is new.

**TDD Micro-Tasks**:
1. Red: Package exports missing (`@aptivo/file-storage` not found)
2. Green: Scaffold package with package.json, tsconfig, vitest config
3. Red: `InMemoryStorageAdapter.createPresignedUpload()` fails
4. Green: Implement in-memory adapter with Map-based storage
5. Red: Upload exceeding 50MB accepted
6. Green: Add max size validation in presigned URL generation
7. Red: File metadata schema missing
8. Green: Define Zod schema for file metadata
9. Red: `files` table not exported from `@aptivo/database`
10. Green: Create Drizzle schema for files + file_entity_links
11. Refactor: Split storage types from adapter implementation

**Interface Design**:
```typescript
export interface StorageAdapter {
  createPresignedUpload(input: PresignUploadInput): Promise<Result<PresignUploadResult, FileStorageError>>;
  createPresignedDownload(key: string): Promise<Result<PresignDownloadResult, FileStorageError>>;
  deleteObject(key: string): Promise<Result<void, FileStorageError>>;
  getMetadata(key: string): Promise<Result<FileMetadata | null, FileStorageError>>;
}

export interface PresignUploadInput {
  fileName: string;
  mimeType: string;
  maxSizeBytes?: number; // default 50MB
  entityType?: string;
  entityId?: string;
}

export interface PresignUploadResult {
  fileId: string;
  uploadUrl: string;
  key: string;
  expiresAt: string;
}

export type FileStatus = 'pending' | 'ready' | 'quarantined' | 'deleted';

export type FileStorageError =
  | { _tag: 'FileTooLarge'; size: number; limit: number }
  | { _tag: 'FileNotFound'; key: string }
  | { _tag: 'UploadFailed'; cause: unknown }
  | { _tag: 'DownloadFailed'; cause: unknown }
  | { _tag: 'DeleteFailed'; cause: unknown }
  | { _tag: 'PersistenceError'; operation: string; cause: unknown };
```

**Database Schema**:
```typescript
export const files = pgTable('files', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  key: varchar('key', { length: 500 }).notNull().unique(),
  bucket: varchar('bucket', { length: 100 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  uploadedBy: uuid('uploaded_by').notNull(),
  scanResult: varchar('scan_result', { length: 50 }), // 'clean' | 'infected' | null
  scanSignature: varchar('scan_signature', { length: 200 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('files_status_idx').on(table.status),
  index('files_uploaded_by_idx').on(table.uploadedBy),
]);

export const fileEntityLinks = pgTable('file_entity_links', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  fileId: uuid('file_id').notNull()
    .references(() => files.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('file_entity_links_file_idx').on(table.fileId),
  index('file_entity_links_entity_idx').on(table.entityType, table.entityId),
  uniqueIndex('file_entity_links_unique_idx').on(table.fileId, table.entityType, table.entityId),
]);
```

---

#### FS-02: Access Control + Entity Linking (3 SP)

**Description**: Permission-based file access inherited from linked business entities. Download audit logging.

**Acceptance Criteria**:
- [ac] `FileAccessService` with injectable `PermissionChecker` and `FileStore`
- [ac] `canAccessFile(userId, fileId)` checks linked entity permissions via RBAC
- [ac] Download authorization requires entity-level permission check
- [ac] All successful downloads write audit row (userId, fileId, timestamp, IP)
- [ac] Unauthorized access returns `AuthorizationError` tagged error
- [ac] File-to-entity linking via `file_entity_links` table (created in FS-01)

**Files**:
- Create: `packages/file-storage/src/access/access-control-service.ts`
- Create: `packages/file-storage/src/access/access-types.ts`
- Create: `packages/file-storage/src/access/index.ts`
- Modify: `packages/file-storage/src/index.ts`
- Create: `packages/file-storage/tests/fs-02-access-control.test.ts`

**Dependencies**: FS-01 (schema + storage adapter), ID-01 from Sprint 2 (RBAC roles)

**Reuse Assessment**: **50%** — RBAC middleware pattern from Sprint 2's `RbacService`. Entity-linking and download audit are new.

**TDD Micro-Tasks**:
1. Red: Unlinked file still downloadable
2. Green: Enforce entity link existence check
3. Red: User without entity permission can download
4. Green: Add `PermissionChecker` dependency + role-based check
5. Red: Download missing audit log entry
6. Green: Add audit write on successful download
7. Red: Unauthorized access throws (should return Result.err)
8. Green: Return `AuthorizationError` tagged error
9. Refactor: Extract `DownloadAuditLogger` interface

**Interface Design**:
```typescript
export interface PermissionChecker {
  canAccessEntity(userId: string, entityType: string, entityId: string): Promise<boolean>;
}

export interface FileStore {
  getFile(fileId: string): Promise<FileRecord | null>;
  getEntityLinks(fileId: string): Promise<FileEntityLink[]>;
}

export interface DownloadAuditLogger {
  logDownload(entry: { userId: string; fileId: string; ipAddress?: string }): Promise<void>;
}

export interface FileAccessDeps {
  fileStore: FileStore;
  permissionChecker: PermissionChecker;
  auditLogger: DownloadAuditLogger;
  storageAdapter: StorageAdapter;
}

export type FileAccessError =
  | { _tag: 'FileNotFound'; fileId: string }
  | { _tag: 'FileNotReady'; fileId: string; status: FileStatus }
  | { _tag: 'AuthorizationError'; userId: string; fileId: string; reason: string }
  | { _tag: 'NoEntityLink'; fileId: string }
  | { _tag: 'DownloadFailed'; cause: unknown };
```

---

#### FS-03: ClamAV Integration (2 SP)

**Description**: Anti-malware scanning pipeline for uploads with injectable `FileScanner` adapter. ClamAV sidecar in production, passthrough in tests/dev.

**Acceptance Criteria**:
- [ac] `FileScanner` interface: `scan(input)` returns `Result<ScanResult, FileScanError>`
- [ac] `ClamAvScanner` connects to sidecar via TCP (clamd protocol)
- [ac] `PassthroughScanner` always returns `clean` (tests + local dev)
- [ac] Scan timeout (configurable, default 30s) → quarantine
- [ac] Health check on scanner before scan attempt
- [ac] Upload finalization blocked until scan completes: pending → ready | quarantined
- [ac] Circuit breaker on scanner failures (reuse existing `CircuitBreaker` pattern)

**Files**:
- Create: `packages/file-storage/src/scanner/file-scanner.ts`
- Create: `packages/file-storage/src/scanner/clamav-scanner.ts`
- Create: `packages/file-storage/src/scanner/passthrough-scanner.ts`
- Create: `packages/file-storage/src/scanner/index.ts`
- Modify: `packages/file-storage/src/index.ts`
- Create: `packages/file-storage/tests/fs-03-scanner.test.ts`

**Dependencies**: FS-01 (file status management)

**Reuse Assessment**: **40%** — Circuit breaker from SP-10, adapter pattern from llm-gateway. ClamAV protocol integration is new.

**TDD Micro-Tasks**:
1. Red: Infected file accepted (should be quarantined)
2. Green: Implement scan result gate before finalization
3. Red: Scanner timeout causes acceptance
4. Green: Timeout → quarantine with `ScanTimeout` error
5. Red: Scanner unavailable — no fallback
6. Green: Health check + circuit breaker on scanner
7. Red: `PassthroughScanner` returns wrong format
8. Green: Implement passthrough returning `{ verdict: 'clean' }`
9. Refactor: Share scanner result type across adapters

**Interface Design**:
```typescript
export interface FileScanner {
  scan(input: ScanInput): Promise<Result<ScanResult, FileScanError>>;
  healthCheck(): Promise<boolean>;
}

export interface ScanInput {
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  stream: NodeJS.ReadableStream;
}

export type ScanResult = {
  verdict: 'clean' | 'infected';
  signature?: string; // malware signature name if infected
  durationMs: number;
};

export type FileScanError =
  | { _tag: 'ScanTimeout'; timeoutMs: number }
  | { _tag: 'ScannerUnavailable'; cause: unknown }
  | { _tag: 'ScanFailed'; cause: unknown };
```

---

### Phase 3: Integration & Testing (Days 8–10)

#### MCP-08: Integration Tests (3 SP)

**Description**: End-to-end validation of the MCP wrapper pipeline with mock server.

**Acceptance Criteria**:
- [ac] Happy path: allowed tool call succeeds through full wrapper pipeline
- [ac] Security: disallowed server rejected, invalid token rejected
- [ac] Rate limit: burst exceeding limit properly throttled
- [ac] Circuit breaker: consecutive failures trip circuit, recovery after timeout
- [ac] Cache: second identical call returns cached response
- [ac] Response size: oversized response rejected with `ResponseTooLarge`
- [ac] 80%+ branch coverage on `@aptivo/mcp-layer`

**Files**:
- Create: `packages/mcp-layer/tests/integration/mcp-pipeline.test.ts`
- Create: `packages/mcp-layer/tests/integration/mcp-failure-modes.test.ts`

**Dependencies**: MCP-06, MCP-07

**Reuse Assessment**: **60%** — SP-05 transport test harness. Integration composition is new.

**TDD Micro-Tasks**:
1. Red: End-to-end call fails (missing wiring)
2. Green: Assemble deps with in-memory adapters + mock server
3. Red: Circuit-open path untested
4. Green: Add controlled failure → trip → rejection scenario
5. Red: Cache hit path absent
6. Green: Add repeated call assertion (second call from cache)
7. Red: Oversized response accepted
8. Green: Add oversized tool call → ResponseTooLarge assertion
9. Refactor: Extract shared integration bootstrap helper

---

## 2. Dependency Graph

```
MCP-01 ──────┬──────────────────────────────────────┐
             │                                       │
             ▼                                       │
MCP-02 ──────┤                                       │
  │          │                                       │
  ├──► MCP-04                                        │
  │                                                  │
  └──► MCP-07                                        │
                                                     │
MCP-03 (independent) ──┐                             │
                       │                             │
MCP-05 ◄── MCP-01 ────┤                             │
                       │                             │
                       ▼                             ▼
                    MCP-06 ◄── MCP-01, MCP-02, MCP-03, MCP-04, MCP-05
                       │
                       ├──► MCP-08 ◄── MCP-07
                       │
                       ├──► MCP-09
                       │
                       └──► MCP-10 ◄── MCP-09

FS-01 (independent) ──┬──► FS-02
                      │
                      └──► FS-03
```

**Critical Path**: `MCP-01 → MCP-02 → MCP-06 → MCP-08`
**Secondary Path**: `MCP-03/04/05 → MCP-06` (must complete before MCP-06 can integrate)
**FS Path**: `FS-01 → FS-02 + FS-03` (fully independent of MCP path)

**Parallelization Opportunities**:
- MCP-03, MCP-04, MCP-05 are mutually independent — assign to different devs
- FS-01 starts day 1 (no MCP dependencies)
- MCP-07 can start once MCP-02 is done (day 3)
- MCP-09 and MCP-10 can overlap with MCP-08 in final days

---

## 3. Reuse Map

| Component | Source | Reuse % | Changes Needed |
|-----------|--------|---------|----------------|
| Env sanitizer | `mcp-layer/src/security/env-sanitizer.ts` | 100% | None — compose into wrapper |
| Server allowlist | `mcp-layer/src/security/allowlist.ts` | 100% | None — compose into wrapper |
| Scoped tokens | `mcp-layer/src/security/scoped-tokens.ts` | 100% | None — compose into wrapper |
| Supply chain | `mcp-layer/src/security/supply-chain.ts` | 100% | None — existing CI gate |
| Circuit breaker | `mcp-layer/src/resilience/circuit-breaker.ts` | 85% | Add error classifier + registry |
| MCP transport | SP-05 `mcp-test-server.mjs` + transport tests | 70% | Wrap in AgentKit adapter |
| Token bucket | `llm-gateway/src/rate-limit/token-bucket.ts` | 75% | MCP-specific keys + config |
| Gateway pattern | `llm-gateway/src/gateway/llm-gateway.ts` | 80% | Adapt pipeline for MCP |
| Inngest patterns | `apps/web/src/lib/inngest.ts` + SP-01/02 | 70% | Production event contracts |
| Mock server | SP-05 `mcp-test-server.mjs` | 85% | Add failure injection tools |
| RBAC patterns | `hitl-gateway/src/auth/rbac-middleware.ts` | 50% | FS entity-level permission checks |
| Result types | `@aptivo/types` | 100% | Already in use |

---

## 4. Risk Areas

| Risk | Severity | Mitigation |
|------|----------|------------|
| **MCP-06 wrapper composition order bug** | HIGH | Lock pipeline sequence in integration tests; fail-closed defaults at every gate |
| **Inngest concurrency misconfiguration** | HIGH | Conservative default limits; burst test in MCP-03; monitor invocation costs |
| **ClamAV operational instability** | MEDIUM | Health check + circuit breaker + configurable timeout + PassthroughScanner fallback for dev |
| **Response size enforcement regression** | MEDIUM | Dedicated oversized payload fixture in MCP-07; hard cap in registry schema |
| **AgentKit MCPClient stdio lifecycle** | MEDIUM | Process cleanup in `close()`; timeout on unresponsive servers; SP-05 validated patterns |
| **Redis cache connectivity** | LOW | Fail-open for caching (log + bypass); fail-closed for rate limiting |
| **38 SP in 10 days with 3 devs** | MEDIUM | Front-load critical path; FS tasks fully parallel; 85%+ spike code reuse on MCP security |
| **New file-storage package scaffolding** | LOW | Start day 1; reuse monorepo conventions from other packages |

---

## 5. Sprint Sequencing

| Day | Senior (MCP Lead) | Web Dev 1 (Resilience + FS) | Web Dev 2 (Storage + Events) |
|-----|-------------------|---------------------------|------------------------------|
| 1 | MCP-01 schema + exports | MCP-04 error classifier | FS-01 package scaffold + schema |
| 2 | MCP-02 transport types + adapter | MCP-04 per-server registry | FS-01 storage adapter interface |
| 3 | MCP-02 AgentKit integration | MCP-03 token bucket core | FS-01 in-memory adapter + tests |
| 4 | MCP-06 wrapper skeleton | MCP-03 Inngest config + burst tests | FS-02 access control service |
| 5 | MCP-06 pipeline integration | MCP-05 cache store interface | FS-02 entity linking + audit |
| 6 | MCP-06 size guard + tests | MCP-05 Redis adapter + tests | FS-03 FileScanner interface |
| 7 | MCP-09 event schema validation | MCP-07 mock server | FS-03 ClamAV + passthrough |
| 8 | MCP-10 deletion workflow | MCP-08 integration harness | FS integration + edge cases |
| 9 | MCP-10 tests + MCP-08 support | MCP-08 failure mode tests | Coverage + cross-package tests |
| 10 | Final regression + typecheck/build | Coverage closure | Coverage closure + docs |

---

## 6. Verification Steps

```bash
# mcp-layer
pnpm -F @aptivo/mcp-layer test
pnpm -F @aptivo/mcp-layer test:coverage  # 80% gate
pnpm -F @aptivo/mcp-layer typecheck

# file-storage (new)
pnpm -F @aptivo/file-storage test
pnpm -F @aptivo/file-storage test:coverage  # 80% gate
pnpm -F @aptivo/file-storage typecheck

# database
pnpm -F @aptivo/database typecheck

# web app
pnpm -F @aptivo/web typecheck

# monorepo
pnpm test
pnpm typecheck
pnpm build
```

---

## 7. Definition of Done Cross-Reference

| DoD Item | Task(s) | Evidence |
|----------|---------|----------|
| Can call MCP tool from Inngest workflow *(MCP-001, MCP-002)* | MCP-02, MCP-06, MCP-08 | Integration tests with mock server + Inngest function config |
| Rate limiting queues requests correctly *(MCP-003)* | MCP-03, MCP-08 | Burst/backpressure tests; Inngest concurrency config |
| Circuit breaker trips on failures *(MCP-003)* | MCP-04, MCP-08 | Circuit integration tests + open-state rejection assertions |
| Responses cached appropriately *(MCP-003)* | MCP-05, MCP-06 | Cache hit/miss/TTL tests |
| File upload via presigned URL stores to DO Spaces *(BLOB-001)* | FS-01 | Adapter contract tests with in-memory implementation |
| File download enforces access control from linked entity *(BLOB-002)* | FS-02 | Authorization + entity link + audit logging tests |
| ClamAV scans uploads before storage confirmation *(BLOB-002)* | FS-03 | Clean/infected/timeout scanner path tests |
| Inngest events validated against Zod schemas at publish-time *(S3-W11)* | MCP-09 | Invalid event drop tests + schema compatibility tests |
| Data deletion workflow checkpoints per storage system *(S4-W9)* | MCP-10 | Checkpoint resume/replay tests |
| 80%+ test coverage | MCP-08 + package suites | `pnpm test:coverage` reports |

---

## 8. FRD Coverage Tracking

| FRD Requirement | Sprint 3 Task | Coverage |
|-----------------|---------------|----------|
| FR-CORE-MCP-001 Register/Manage Tools | MCP-01, MCP-02, MCP-06 | Full |
| FR-CORE-MCP-002 Execute with Error Handling | MCP-06, MCP-08 | Full |
| FR-CORE-MCP-003 Rate Limits/Circuit Breaking | MCP-03, MCP-04, MCP-05 | Full |
| FR-CORE-BLOB-001 S3 Storage Interface | FS-01 | Full |
| FR-CORE-BLOB-002 Access Control/Linking | FS-02, FS-03 | Full |

---

## 9. WARNING Closure Tracking

| WARNING | Finding | Sprint 3 Task | Acceptance Criteria |
|---------|---------|---------------|---------------------|
| S1-W14 | MCP response size enforcement missing | MCP-06 (+ MCP-01 `maxResponseBytes` field) | Wrapper rejects responses exceeding per-tool limit |
| S3-W11 | Event schema validation missing at publish-time | MCP-09 | Invalid payloads blocked before `inngest.send()` |
| S4-W9 | Data deletion requires checkpointed multi-step workflow | MCP-10 | Inngest workflow tracks per-step checkpoints with resumable recovery |
