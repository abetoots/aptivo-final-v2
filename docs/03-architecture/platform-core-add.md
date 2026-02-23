---
id: ADD-PLATFORM-CORE
title: Platform Core - Application Design Document
status: Draft
version: 2.0.0
owner: '@owner'
last_updated: '2026-02-03'
parent: ../02-requirements/platform-core-frd.md
---

# Platform Core - Application Design Document (ADD)

**Version**: 2.0.0
**Date**: February 3, 2026
**Status**: Draft (Multi-Model Consensus Applied)
**Parent Document**: `../02-requirements/platform-core-frd.md`

---

## 1. Executive Summary

This document defines **HOW** the Aptivo Agentic Core is architected to meet the functional requirements in the Platform Core FRD. It specifies technology selections, architectural patterns, and component interactions for the shared infrastructure serving both Crypto and HR domains.

### 1.1 Document Boundaries

| Document | Scope |
|----------|-------|
| **BRD** | WHY - Business objectives and constraints |
| **FRD** | WHAT - Functional requirements and acceptance criteria |
| **ADD (this)** | HOW - Architecture patterns, technology choices, component design |
| **TSD** | HOW EXACTLY - Database schemas, API specs, deployment configs |

### 1.2 Key Architectural Decisions

> **Multi-Model Consensus (2026-02-02)**: Build unique differentiators, buy commodity infrastructure.

| Decision | Selection | Rationale |
|----------|-----------|-----------|
| Workflow Engine | **Inngest** (Buy) | AgentKit for MCP consumption, step.waitForEvent for HITL |
| AI Reasoning | **LangGraph.js** (inside Inngest) | Runs as activity within workflow steps |
| Identity | **Supabase Auth** (Buy) | 50K MAU free, magic links, saves 2+ months |
| Notifications | **Novu** (Buy) | Multi-channel, templates, quiet hours, saves 3 weeks |
| Runtime | Node.js 24 LTS + TypeScript | Async I/O, strong typing, LangGraph.js compatibility |
| Database | PostgreSQL 18 | ACID compliance, JSONB, full-text search |
| Cache | Redis 7 | Sub-ms latency, pub/sub, rate limiting |
| Audit | Append-only SQL | Phase 1 simplified; hash-chaining deferred to Phase 3+ |

**Build (unique differentiators)**:
- MCP Integration Layer
- HITL Gateway
- LLM Gateway (BRD-mandated cost tracking)

---

## 2. System Architecture Overview

### 2.1 High-Level Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                      DOMAIN APPLICATIONS                         │
├───────────────────────────┬─────────────────────────────────────┤
│     CRYPTO DOMAIN APP     │          HR DOMAIN APP              │
│  • Trading Dashboard      │  • Candidate Pipeline               │
│  • Exchange MCP Tools     │  • Gmail/Calendar MCP               │
│  • aptivo_trading.*       │  • aptivo_hr.*                      │
├───────────────────────────┴─────────────────────────────────────┤
│                     APTIVO AGENTIC CORE                          │
├─────────────────────────────────────────────────────────────────┤
│  Workflow Engine  │  Durable Execution orchestration            │
│  HITL Gateway     │  Human approval with signed tokens          │
│  MCP Layer        │  Universal external API connector           │
│  LLM Gateway      │  Provider routing + cost tracking           │
│  Notification Bus │  Telegram, Email dispatch                   │
│  Audit Service    │  Immutable event logging                    │
│  Identity Service │  Passwordless auth, RBAC                    │
│  File Storage     │  S3-compatible blob service                 │
├─────────────────────────────────────────────────────────────────┤
│                      INFRASTRUCTURE                              │
│  PostgreSQL (separate schemas) │ Redis │ NATS │ S3/Minio        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Architectural Principles

1. **Durable Execution**: Workflows persist state, survive restarts, sleep without threads
2. **Domain Isolation**: Separate database schemas, separate deployments, separate secrets
3. **Functional Core, Imperative Shell**: Pure business logic in domain/, side effects in infrastructure/
4. **LLM-Agnostic**: Provider abstraction enables runtime switching
5. **MCP-Based Integration**: Standardized external service access

---

## 3. Workflow Engine Architecture

**FRD Reference**: FR-CORE-WFE-001 to FR-CORE-WFE-007
**Pattern**: Durable Execution

### 3.1 Technology Selection

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Inngest** | TypeScript-native, AgentKit for MCP, step.waitForEvent for HITL | Cloud-first (not open source) | **Selected** |
| **Trigger.dev** | Open source, warm starts | MCP exposes server only, no consumption | Not selected |
| **Temporal.io** | Production-proven, full durable execution | Heavy infrastructure, Java SDK primary | Consider for scale |

**Decision**: **Inngest** selected as Platform Core Workflow Engine.

**Rationale** (Multi-Model Consensus 2026-02-02):
1. **MCP Consumption**: AgentKit natively supports calling external MCP servers (required for 13+ crypto integrations)
2. **HITL Pattern**: `step.waitForEvent()` is industry standard for approval gates
3. **Operational Velocity**: No separate worker fleet (critical for 3-dev team)
4. **AI Integration**: LangGraph runs cleanly inside `step.run()` activities

> **LangGraph.js Clarification**: LangGraph.js runs **inside Inngest `step.run()` activities** for AI reasoning tasks (sentiment analysis, narrative clustering). Inngest owns orchestration, state, timers, and retries. LangGraph provides cognitive capabilities within individual workflow steps only.

### 3.2 Inngest SDK Usage (Direct, No Abstraction)

> **Multi-Model Consensus**: Do NOT build custom workflow abstractions on top of Inngest. Use Inngest SDK directly to avoid "platform within a platform" complexity.

```typescript
// direct inngest function definition (Phase 1)
import { inngest } from './client';

export const smartMoneyWorkflow = inngest.createFunction(
  { id: 'smart-money-tracking', name: 'Smart Money Tracking' },
  { event: 'crypto/wallet.transaction' },
  async ({ event, step }) => {
    // step 1: analyze transaction
    const analysis = await step.run('analyze-transaction', async () => {
      return analyzeTransaction(event.data);
    });

    // step 2: run langgraph reasoning (AI activity)
    const reasoning = await step.run('generate-reasoning', async () => {
      return runLangGraphAnalysis(analysis); // langgraph runs HERE
    });

    // step 3: check if signal worthy
    if (reasoning.confidenceScore < 7) {
      return { skipped: true, reason: 'low_confidence' };
    }

    // step 4: create HITL approval request
    const approval = await step.waitForEvent('hitl-approval', {
      event: 'hitl/decision',
      match: 'data.requestId',
      timeout: '24h',
    });

    if (!approval || approval.data.decision !== 'approved') {
      return { skipped: true, reason: 'not_approved' };
    }

    // step 5: execute trade
    return await step.run('execute-trade', async () => {
      return executeTrade(event.data, reasoning);
    });
  }
);

### 3.3 Inngest Idempotency Guarantees

**Scope**: This section documents which operations are protected by Inngest's built-in idempotency (memoization) and which require additional application-level handling.

#### 3.3.1 Operations Protected by Inngest Memoization

| Operation | Idempotency Mechanism | Behavior on Replay |
|-----------|----------------------|-------------------|
| `step.run()` activities | Step ID memoization | Returns cached result |
| `step.sleep()` timers | Timer state persistence | Skips if already elapsed |
| `step.waitForEvent()` | Event correlation | Returns cached event |
| Local variable assignment | Workflow state persistence | Restored from snapshot |

**How It Works**: When a workflow step completes, Inngest persists the result. If the workflow restarts (server crash, deployment), Inngest replays the workflow but skips already-completed steps, returning their cached results.

**Example**:
```typescript
// this entire function can be replayed safely
export const exampleWorkflow = inngest.createFunction(
  { id: 'example' },
  { event: 'example/trigger' },
  async ({ event, step }) => {
    // step 1: memoized - only executes once
    const data = await step.run('fetch-data', async () => {
      return fetchExternalAPI(event.data.id); // only called once
    });

    // step 2: memoized - only executes once
    const processed = await step.run('process-data', async () => {
      return processData(data); // only called once
    });

    // step 3: if crash happens here, steps 1 and 2 are NOT re-executed
    await step.run('save-result', async () => {
      return saveToDatabase(processed); // only called once
    });
  }
);
```

#### 3.3.2 Operations Requiring Application-Level Idempotency

| Operation | Why Not Covered | Required Handling |
|-----------|-----------------|-------------------|
| Inbound webhook triggers | Before workflow starts | Deduplicate webhook IDs (see §12.3) |
| HITL approval endpoints | External to workflow | Check request status (see §4.5) |
| Audit log writes | Inside step.run but generates new UUID | Use deterministic IDs (see §9.3) |
| MCP tool calls with side effects | External system may not support replay | Pass idempotency key (see §5.1) |
| Notification sends | External system (Novu) | Novu handles; document behavior |

**Key Insight**: Inngest protects workflow-internal operations. Operations that cross trust boundaries (external APIs, webhooks, databases with non-deterministic IDs) require explicit idempotency handling at the application layer.

#### 3.3.3 Event Deduplication

Inngest supports event-level deduplication via the `id` field:

```typescript
// event with idempotency key
await inngest.send({
  id: `webhook:${sourceId}:${webhookId}`, // dedupe key
  name: 'webhook/received',
  data: { sourceId, webhookId, payload },
});

// duplicate events with same ID are ignored
```

**Window**: Event deduplication window is 24 hours (Inngest default).

### 3.4 Durable Timer Implementation

```typescript
// sleep without consuming resources (FR-CORE-WFE-003)
async function durableSleep(duration: Duration): Promise<void> {
  // persists wake time to database
  // releases worker
  // scheduler resumes at wake time
  await workflow.sleep(duration);
}

// usage in workflow
async function interviewSchedulingWorkflow(ctx: Context) {
  await sendInterviewProposal(ctx);

  // sleep 24 hours for reminder - no thread consumed
  await durableSleep({ hours: 24 });

  await sendReminder(ctx);
}
```

### 3.4 Retry and Compensation

```typescript
// exponential backoff pattern (FR-CORE-WFE-005)
const retryPolicy: RetryPolicy = {
  maxAttempts: 3,
  initialInterval: '1s',
  backoffCoefficient: 2,
  maxInterval: '30s',
  nonRetryableErrors: ['VALIDATION_ERROR', 'AUTH_ERROR'],
};

// compensation for rollback
async function transferFunds(ctx: Context) {
  const debit = await debitAccount(ctx.from, ctx.amount);

  try {
    await creditAccount(ctx.to, ctx.amount);
  } catch (error) {
    // compensation: reverse the debit
    await creditAccount(ctx.from, ctx.amount);
    throw error;
  }
}
```

---

## 4. HITL Gateway Architecture

**FRD Reference**: FR-CORE-HITL-001 to FR-CORE-HITL-006

### 4.1 Approval Token Design

```typescript
interface HITLRequest {
  id: string;                    // unique request ID
  workflowId: string;            // parent workflow
  token: string;                 // cryptographically signed
  payload: ApprovalPayload;      // what's being approved
  expiresAt: Date;               // auto-reject after
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  channels: NotificationChannel[];
}

interface ApprovalPayload {
  actionType: string;            // e.g., 'trade_execution', 'contract_approval'
  summary: string;               // human-readable
  details: Record<string, unknown>;
  reasoning?: string;            // AI-generated explanation
}
```

### 4.2 Token Security

```typescript
// JWT-based signed tokens (jose library)
import { SignJWT, jwtVerify } from 'jose';

async function generateApprovalToken(request: HITLRequest): Promise<string> {
  const secret = new TextEncoder().encode(process.env.HITL_SECRET);

  return new SignJWT({
    requestId: request.id,
    workflowId: request.workflowId,
    action: request.payload.actionType,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(request.expiresAt)
    .sign(secret);
}

async function verifyApprovalToken(token: string): Promise<HITLRequest> {
  const secret = new TextEncoder().encode(process.env.HITL_SECRET);
  const { payload } = await jwtVerify(token, secret);
  // validate not expired, not already used
  return await getRequest(payload.requestId);
}
```

### 4.3 Multi-Channel Delivery

```
┌─────────────┐
│ HITL Request│
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│           Notification Bus               │
├─────────────┬─────────────┬─────────────┤
│   Telegram  │    Email    │  Web Push   │
│   (urgent)  │  (standard) │  (optional) │
└─────────────┴─────────────┴─────────────┘
```

### 4.4 Approval Policy Engine

**FRD Reference**: FR-CORE-HITL-004

```typescript
// approval policy configuration
interface ApprovalPolicy {
  type: 'single' | 'multi' | 'sequential';
  approvers: ApproverSpec[];
  quorum?: number;           // for multi: how many must approve
  expiryTTL: Duration;       // auto-reject after
  escalation?: EscalationPolicy;
}

interface ApproverSpec {
  type: 'user' | 'role' | 'group';
  id: string;
  required?: boolean;        // for sequential: must approve in order
}

// policy evaluation
async function evaluateApproval(
  request: HITLRequest,
  decisions: Decision[]
): Promise<'pending' | 'approved' | 'rejected'> {
  const policy = request.policy;

  if (policy.type === 'single') {
    return decisions.length > 0 ? decisions[0].outcome : 'pending';
  }

  if (policy.type === 'multi') {
    const approvals = decisions.filter(d => d.outcome === 'approved');
    if (approvals.length >= policy.quorum!) return 'approved';
    const rejections = decisions.filter(d => d.outcome === 'rejected');
    if (rejections.length > (policy.approvers.length - policy.quorum!)) return 'rejected';
    return 'pending';
  }

  // sequential: each required approver must approve in order
  // ... implementation
}
```

### 4.5 HITL API Endpoints

**FRD Reference**: FR-CORE-HITL-005

#### 4.5.1 Idempotent Approval Handling

**Idempotency Guarantee**: Approving an already-approved request returns success without side effects.

**Mechanism**: Check `request.status` before processing; return existing decision if already resolved.

**Duplicate Behavior**:
| Current Status | Action | Response |
|----------------|--------|----------|
| `pending` | Process approval | 200 OK with new decision |
| `approved` | Return existing | 200 OK with `idempotent: true` |
| `rejected` | Conflict | 409 Conflict (cannot change) |
| `expired` | Gone | 410 Gone |

**Retry Sources Considered**:
- User double-click on approve button
- Network retry on timeout
- Mobile app background retry
- Telegram/email link clicked multiple times

**Rationale**: Prevents user confusion; safe for retry at any layer.

```typescript
// idempotent RESTful endpoints for approval actions
router.post('/api/v1/hitl/:requestId/approve', authenticate, async (req, res) => {
  const { requestId } = req.params;
  const { token, comment } = req.body;

  // verify token matches request and is not expired
  const request = await verifyApprovalToken(token);

  // idempotency check: handle already-resolved requests
  if (request.status === 'approved') {
    // idempotent success: return existing decision without side effects
    const existingDecision = await db.hitlDecisions.findByRequestId(requestId);
    logger.info({ requestId, approver: req.user.id }, 'Duplicate approval attempt - returning cached');
    return res.json({
      status: 'approved',
      idempotent: true,
      originalDecision: {
        approver: existingDecision.approver,
        timestamp: existingDecision.timestamp,
        comment: existingDecision.comment,
      },
    });
  }

  if (request.status === 'rejected') {
    // cannot change a rejection to approval
    return res.status(409).json({
      error: 'DECISION_CONFLICT',
      message: 'Request was already rejected and cannot be approved',
      existingStatus: 'rejected',
    });
  }

  if (request.status === 'expired') {
    return res.status(410).json({
      error: 'REQUEST_EXPIRED',
      message: 'Approval request has expired',
      expiredAt: request.expiresAt,
    });
  }

  // record decision with audit trail (idempotent via requestId constraint)
  // returns { inserted: boolean } to prevent race condition double-signal
  const result = await recordDecision(requestId, {
    decision: 'approved',
    approver: req.user.id,
    comment,
    timestamp: new Date(),
    channel: req.headers['x-approval-channel'] || 'web',
  });

  // CRITICAL: only signal if we actually inserted the decision
  // prevents race condition where two requests both pass status check
  if (result.inserted) {
    await workflowEngine.signal(request.workflowId, 'approval', { approved: true });
  } else {
    // another request won the race - return idempotent success
    logger.info({ requestId }, 'Decision race detected - returning idempotent success');
    return res.json({ status: 'approved', idempotent: true, raceResolved: true });
  }

  res.json({ status: 'approved' });
});

router.post('/api/v1/hitl/:requestId/reject', authenticate, async (req, res) => {
  const { requestId } = req.params;
  const { token, reason } = req.body;

  const request = await verifyApprovalToken(token);

  // idempotency check
  if (request.status === 'rejected') {
    const existingDecision = await db.hitlDecisions.findByRequestId(requestId);
    return res.json({
      status: 'rejected',
      idempotent: true,
      originalDecision: {
        approver: existingDecision.approver,
        timestamp: existingDecision.timestamp,
        reason: existingDecision.comment,
      },
    });
  }

  if (request.status === 'approved') {
    return res.status(409).json({
      error: 'DECISION_CONFLICT',
      message: 'Request was already approved and cannot be rejected',
      existingStatus: 'approved',
    });
  }

  if (request.status === 'expired') {
    return res.status(410).json({
      error: 'REQUEST_EXPIRED',
      message: 'Approval request has expired',
    });
  }

  const result = await recordDecision(requestId, {
    decision: 'rejected',
    approver: req.user.id,
    comment: reason,
    timestamp: new Date(),
    channel: req.headers['x-approval-channel'] || 'web',
  });

  // only signal if we actually inserted (prevent race double-signal)
  if (result.inserted) {
    await workflowEngine.signal(request.workflowId, 'approval', { approved: false, reason });
  } else {
    return res.json({ status: 'rejected', idempotent: true, raceResolved: true });
  }

  res.json({ status: 'rejected' });
});

router.post('/api/v1/hitl/:requestId/request-changes', authenticate, async (req, res) => {
  // records request for more info, does not resolve workflow
  // idempotent: multiple change requests are allowed and logged
});
```

### 4.6 HITL Audit Integration

**FRD Reference**: FR-CORE-HITL-006

#### 4.6.1 Idempotent Decision Recording

**Idempotency Guarantee**: Each decision is recorded exactly once per request.

**Mechanism**:
- Decision uses `requestId` as natural idempotency key
- INSERT uses `ON CONFLICT (request_id) DO NOTHING`
- Audit log uses deterministic ID derived from `requestId + decision`

**Duplicate Behavior**: Silent ignore (decision already recorded)

**Retry Sources Considered**:
- Workflow step retry after crash
- Network retry on DB timeout
- Concurrent approval attempts (race condition)

```typescript
interface RecordDecisionResult {
  inserted: boolean;  // true if new decision, false if duplicate (race loser)
}

// idempotent decision recording - returns insertion status for race handling
async function recordDecision(requestId: string, decision: Decision): Promise<RecordDecisionResult> {
  // store decision with idempotency via request_id unique constraint
  const result = await db.hitlDecisions.insert({
    requestId,
    ...decision,
  }).onConflict('request_id').ignore();

  // if no rows inserted, decision already exists (race loser or duplicate)
  if (result.rowCount === 0) {
    logger.info({ requestId }, 'Decision already recorded - race loser or duplicate');
    return { inserted: false };
  }

  // update request status atomically
  await db.hitlRequests.update(requestId, {
    status: decision.decision,
    resolvedAt: decision.timestamp,
  });

  // emit immutable audit event with deterministic ID
  await auditService.log({
    id: generateDeterministicUUID(requestId, 'HITL_DECISION', decision.decision),
    action: 'HITL_DECISION',
    resourceType: 'hitl_request',
    resourceId: requestId,
    actorId: decision.approver,
    metadata: {
      decision: decision.decision,
      comment: decision.comment,
      channel: decision.channel,
      originalRequestPayload: await getRequestPayload(requestId),
    },
  });

  return { inserted: true };
}

// deterministic UUID generation for audit idempotency
function generateDeterministicUUID(...components: string[]): string {
  const input = components.join(':');
  return uuidv5(input, AUDIT_UUID_NAMESPACE);
}
```

---

## 5. MCP Integration Layer

**FRD Reference**: FR-CORE-MCP-001 to FR-CORE-MCP-003

### 5.1 MCP Server Registry

#### 5.1.1 Idempotency for Side-Effecting Tools

**Idempotency Guarantee**: Side-effecting MCP tool calls can be safely retried.

**Mechanism**:
- Optional `idempotencyKey` parameter derived from workflow context
- Key format: `${workflowId}:${stepId}:${toolName}:${argsHash}`
- Idempotency state stored in Redis with configurable TTL
- MCP servers supporting idempotency receive key in request headers

**Duplicate Behavior**:
| Tool supports idempotency | Behavior |
|---------------------------|----------|
| Yes | MCP server returns cached result |
| No | Core layer checks Redis for cached result |

**Idempotency Window**: Tool-specific, default 24 hours

**Retry Sources Considered**:
- Cockatiel retry policy (3 attempts with exponential backoff)
- Workflow step retry (configurable, default 3)
- Circuit breaker recovery retry
- **Max Retry Depth**: cockatiel 3x × workflow 3x = 9x potential executions

**Critical Tools Requiring Idempotency**:
- `executeTrade` (crypto domain) - financial impact
- `sendEmail` (HR domain) - duplicate notifications
- `createCandidate` (HR domain) - duplicate records
- Any tool that mutates external state

```typescript
interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'websocket';
  endpoint?: string;
  capabilities: string[];
  rateLimit?: RateLimitConfig;
  cacheTTL?: Record<string, number>;
  enabled: boolean;
  supportsIdempotency?: boolean; // server supports X-Idempotency-Key header
}

interface MCPInvokeOptions {
  idempotencyKey?: string;       // explicit key (overrides auto-generation)
  workflowContext?: {            // for auto-generating idempotency key
    workflowId: string;
    stepId: string;
  };
  skipIdempotencyCheck?: boolean; // for read-only operations
}

// registry pattern with idempotency support
class MCPRegistry {
  private servers: Map<string, MCPServer> = new Map();
  private idempotencyStore: Redis;

  async discover(): Promise<void> {
    for (const config of this.configs) {
      const server = await this.connect(config);
      const tools = await server.listTools();
      this.servers.set(config.id, { config, tools, client: server });
    }
  }

  async invoke(
    serverId: string,
    tool: string,
    args: unknown,
    options?: MCPInvokeOptions
  ): Promise<Result<unknown, MCPError>> {
    const server = this.servers.get(serverId);
    if (!server?.config.enabled) {
      return Result.err({ code: 'SERVER_DISABLED', message: `${serverId} is disabled` });
    }

    // generate or use provided idempotency key
    const idempotencyKey = this.resolveIdempotencyKey(serverId, tool, args, options);

    // check idempotency cache for side-effecting tools
    if (idempotencyKey && !options?.skipIdempotencyCheck) {
      const cachedResult = await this.checkIdempotencyCache(idempotencyKey);
      if (cachedResult) {
        logger.info({ serverId, tool, idempotencyKey }, 'MCP call deduplicated - returning cached result');
        return Result.ok(cachedResult);
      }
    }

    // execute with resilience
    const result = await this.executeWithResilience(server, tool, args, idempotencyKey);

    // cache successful results for idempotency
    if (idempotencyKey && Result.isOk(result)) {
      await this.cacheIdempotencyResult(idempotencyKey, result.data, server.config.cacheTTL?.[tool] || 86400);
    }

    return result;
  }

  private resolveIdempotencyKey(
    serverId: string,
    tool: string,
    args: unknown,
    options?: MCPInvokeOptions
  ): string | null {
    // explicit key takes precedence
    if (options?.idempotencyKey) {
      return options.idempotencyKey;
    }

    // auto-generate from workflow context if provided
    if (options?.workflowContext) {
      const argsHash = createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16);
      return `${options.workflowContext.workflowId}:${options.workflowContext.stepId}:${serverId}:${tool}:${argsHash}`;
    }

    return null; // no idempotency for this call
  }

  private async checkIdempotencyCache(key: string): Promise<unknown | null> {
    const cached = await this.idempotencyStore.get(`mcp:idempotency:${key}`);
    return cached ? JSON.parse(cached) : null;
  }

  private async cacheIdempotencyResult(key: string, result: unknown, ttlSeconds: number): Promise<void> {
    await this.idempotencyStore.set(
      `mcp:idempotency:${key}`,
      JSON.stringify(result),
      'EX',
      ttlSeconds
    );
  }
}
```

### 5.2 Resilience Patterns

```typescript
// circuit breaker + retry + timeout composition
import { circuitBreaker, retry, timeout, wrap } from 'cockatiel';

const mcpPolicy = wrap(
  retry(handleAll, { maxAttempts: 3, backoff: new ExponentialBackoff() }),
  circuitBreaker(handleAll, {
    halfOpenAfter: 30_000,
    breaker: new ConsecutiveBreaker(5),
  }),
  timeout(10_000)
);

async function callMCPTool(server: MCPServer, tool: string, args: unknown) {
  return mcpPolicy.execute(() => server.client.callTool(tool, args));
}
```

### 5.3 Schema Validation

**FRD Reference**: FR-CORE-MCP-002

```typescript
import { z } from 'zod';

// tool output schemas defined per MCP server
const toolSchemas: Record<string, z.ZodSchema> = {
  'dexscreener.getTokenInfo': z.object({
    address: z.string(),
    symbol: z.string(),
    price: z.number(),
    liquidity: z.number(),
  }),
  'gmail.sendEmail': z.object({
    messageId: z.string(),
    threadId: z.string(),
  }),
  // ... domain-specific schemas
};

async function executeWithValidation(
  server: MCPServer,
  tool: string,
  args: unknown
): Promise<Result<unknown, MCPError>> {
  const result = await callMCPTool(server, tool, args);

  if (Result.isErr(result)) return result;

  const schema = toolSchemas[`${server.id}.${tool}`];
  if (schema) {
    const validation = schema.safeParse(result.data);
    if (!validation.success) {
      logger.error({ tool, errors: validation.error }, 'MCP output schema validation failed');
      return Result.err({ code: 'SCHEMA_VALIDATION_ERROR', tool, errors: validation.error });
    }
  }

  return result;
}
```

### 5.4 Rate Limit Queueing

**FRD Reference**: FR-CORE-MCP-003 (queue, not reject)

#### 5.4.1 Idempotent Queue Processing

**Idempotency Guarantee**: Queued MCP requests are processed exactly once.

**Mechanism**:
- Job ID derived from idempotency key (if provided)
- BullMQ deduplicates jobs with same ID
- Worker checks idempotency cache before execution

**Duplicate Behavior**: Job silently deduplicated by BullMQ

```typescript
import { Queue, Worker } from 'bullmq';

// rate-limited requests are queued, not rejected
const mcpQueue = new Queue('mcp-requests', { connection: redis });

interface QueuedMCPRequest {
  serverId: string;
  tool: string;
  args: unknown;
  workflowId: string;
  stepId: string;
  idempotencyKey: string | null;
  priority: number;
}

async function invokeWithRateLimiting(
  serverId: string,
  tool: string,
  args: unknown,
  workflowContext: { workflowId: string; stepId: string }
): Promise<Result<unknown, MCPError>> {
  const server = registry.get(serverId);
  const limit = server.config.rateLimit;

  // generate idempotency key from workflow context
  const argsHash = createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16);
  const idempotencyKey = `${workflowContext.workflowId}:${workflowContext.stepId}:${serverId}:${tool}:${argsHash}`;

  if (limit && await isRateLimited(serverId)) {
    // queue instead of reject - use idempotency key as job ID for deduplication
    const jobId = `mcp-${idempotencyKey}`;
    const job = await mcpQueue.add('mcp-request', {
      serverId,
      tool,
      args,
      workflowId: workflowContext.workflowId,
      stepId: workflowContext.stepId,
      idempotencyKey,
      priority: 1,
    }, {
      jobId, // BullMQ deduplicates by jobId
      delay: limit.windowMs,
      attempts: 3,
    });

    // workflow will be signaled when job completes
    return Result.ok({ queued: true, jobId: job.id });
  }

  return registry.invoke(serverId, tool, args, {
    idempotencyKey,
    workflowContext,
  });
}

// worker processes queued requests with idempotency
const worker = new Worker('mcp-requests', async (job) => {
  const { serverId, tool, args, workflowId, idempotencyKey } = job.data;

  // execute with idempotency check
  const result = await registry.invoke(serverId, tool, args, {
    idempotencyKey,
    skipIdempotencyCheck: false,
  });

  // signal workflow with result (idempotent via Inngest's event deduplication)
  await workflowEngine.signal(workflowId, 'mcp-result', {
    tool,
    result,
    idempotencyKey,
  });
}, { connection: redis });
```

### 5.5 Tool Registry Query

**FRD Reference**: FR-CORE-MCP-001 (queryable by domain/capability)

```typescript
// query tools by domain and capability
class MCPRegistry {
  // ... existing code

  queryTools(filter: {
    domain?: 'crypto' | 'hr' | 'core';
    capability?: string;
    enabled?: boolean;
  }): ToolInfo[] {
    return Array.from(this.servers.values())
      .filter(s => filter.enabled === undefined || s.config.enabled === filter.enabled)
      .filter(s => filter.domain === undefined || s.config.domain === filter.domain)
      .flatMap(s => s.tools.map(t => ({
        serverId: s.config.id,
        tool: t.name,
        capabilities: t.capabilities,
        domain: s.config.domain,
      })))
      .filter(t => filter.capability === undefined ||
        t.capabilities.includes(filter.capability));
  }
}
```

### 5.6 Caching Strategy

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Price data | 60s | Market volatility |
| Transactions | 5min | Block finality |
| Social posts | 15min | Engagement lag |
| Security scans | 24h | Contract code static |
| Calendar availability | 5min | Meeting changes |

---

## 6. Notification Bus Architecture

**FRD Reference**: FR-CORE-NOTIF-001 to FR-CORE-NOTIF-003

> **Multi-Model Consensus (2026-02-02)**: Replace custom notification bus with **Novu** (open-source notification infrastructure). Custom templating, priority routing, and quiet hours management is not defensible for a 3-person team when SaaS handles it out of the box.

### 6.1 Technology Selection

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Novu (self-hosted)** | Open source, full control, unlimited events | Requires infrastructure (~$20/mo) | **Phase 2+** |
| **Novu (cloud)** | Managed, 10K events/mo free | Vendor dependency | **Phase 1** |
| **Custom build** | Full control | 3+ weeks dev time | Not selected |

**Decision**: Novu Cloud (free tier) for Phase 1. Self-hosted option for Phase 2+ if volume increases.

### 6.2 Novu Integration Pattern

#### 6.2.1 Notification Idempotency

**Idempotency Guarantee**: Critical notifications (HITL approvals) are sent exactly once.

**Mechanism**:
- Novu supports `transactionId` for deduplication
- For HITL notifications: use `hitl:{requestId}` as transactionId
- Novu deduplicates within 24-hour window

**Duplicate Behavior**: Novu silently ignores duplicate transactionIds

**Retry Sources Considered**:
- Workflow step retry
- Novu internal retry (on delivery failure)
- Application-level retry on timeout

**Non-Critical Notifications**:

| Type | Idempotency | Duplicate Behavior | Rationale |
|------|-------------|-------------------|-----------|
| Critical (HITL, alerts) | Required | Deduplicated via transactionId | Business impact |
| Normal (reminders) | Best-effort | May duplicate on retry | User inconvenience only |
| Low (digests) | Not required | Batched, natural dedup | Aggregated content |

**Non-Critical Notification Handling**:
- transactionId optional (set to `undefined` if not provided)
- Novu may send duplicate on retry - acceptable for reminders
- For digest notifications, batch aggregation provides natural deduplication

```typescript
import { Novu } from '@novu/node';

const novu = new Novu(process.env.NOVU_API_KEY);

// idempotent notification sending
async function sendNotification(request: NotificationRequest): Promise<void> {
  // generate transactionId for idempotency (critical notifications)
  const transactionId = request.idempotencyKey
    || (request.critical ? `${request.type}:${request.resourceId}` : undefined);

  await novu.trigger('hitl-approval-request', {
    to: {
      subscriberId: request.recipientId,
      email: request.email,
      // telegram handled via novu integration
    },
    payload: {
      actionType: request.actionType,
      actionSummary: request.summary,
      approvalUrl: request.approvalUrl,
      rejectUrl: request.rejectUrl,
    },
    transactionId, // novu deduplicates on this
  });
}

// example: HITL approval notification (critical, must be idempotent)
async function notifyApprover(hitlRequest: HITLRequest): Promise<void> {
  await sendNotification({
    type: 'hitl-approval-request',
    resourceId: hitlRequest.id,
    recipientId: hitlRequest.approverId,
    email: hitlRequest.approverEmail,
    actionType: hitlRequest.payload.actionType,
    summary: hitlRequest.payload.summary,
    approvalUrl: generateApprovalUrl(hitlRequest),
    rejectUrl: generateRejectUrl(hitlRequest),
    critical: true, // enables idempotency
    idempotencyKey: `hitl:${hitlRequest.id}`, // explicit key
  });
}

// novu handles: templating, channel routing, quiet hours, retries
```

### 6.3 Notification Templates (Managed in Novu)

Templates are configured in Novu dashboard, not code:
- `hitl-approval-request` - HITL approval notifications
- `trade-signal-alert` - Crypto trade signal alerts
- `interview-reminder` - HR interview reminders
- `contract-ready` - Contract approval notifications

### 6.4 Channel Configuration

| Channel | Provider | Phase |
|---------|----------|-------|
| Email | Resend (via Novu) | Phase 1 |
| Telegram | Novu Telegram integration | Phase 1 |
| Push | Deferred | Phase 2 |
| SMS | Deferred | Phase 2 |

### 6.5 Priority Routing

Novu's workflow editor handles priority-based routing:
- **Critical**: All channels immediately, bypass quiet hours
- **Normal**: Email + Telegram, respect quiet hours
- **Low**: Email only, batched into digest

---

## 7. LLM Gateway Architecture

**FRD Reference**: FR-CORE-LLM-001 to FR-CORE-LLM-003

### 7.1 Provider Abstraction

#### 7.1.1 LLM Request Idempotency

**Idempotency Posture for LLM Requests**:

| Operation | Type | Idempotency | Duplicate Behavior | Notes |
|-----------|------|-------------|-------------------|-------|
| Completion request | Outbound API | **Non-idempotent** | Each request generates new response | Intentional - AI responses vary |
| Provider fallback | Retry pattern | **Non-idempotent** | Fallback generates different response | Acceptable for availability |

**Important**: LLM completion requests are intentionally NOT idempotent. Each request may produce different output due to:
- Model temperature/sampling
- Context window differences
- Provider-specific behavior

**Retry Safety**:
- Retry on network failure is safe (no side effects beyond cost)
- Retry on timeout may result in duplicate cost but no data corruption
- Inngest memoization prevents workflow-level duplicate LLM calls

**Retry Sources Considered**:
- Provider timeout (30s default)
- Network failure
- Rate limit (429) with exponential backoff
- Fallback to secondary provider

**Cost Protection**: Usage logging (§7.2) is idempotent; duplicate requests are logged once per workflow step.

```typescript
interface LLMProvider {
  id: string;
  generateCompletion(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>>;
  estimateCost(tokens: TokenCount): number;
  isAvailable(): Promise<boolean>;
}

class LLMGateway {
  private providers: Map<string, LLMProvider>;
  private primary: string;
  private fallback: string;

  // LLM requests are non-idempotent by design (each call may produce different response)
  // Inngest memoization at workflow level prevents duplicate calls on step retry
  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>> {
    const result = await this.providers.get(this.primary)?.generateCompletion(request);

    if (Result.isErr(result)) {
      logger.warn({ error: result.error }, 'Primary LLM failed, trying fallback');
      return this.providers.get(this.fallback)?.generateCompletion(request);
    }

    await this.trackUsage(request, result.data);
    return result;
  }
}
```

### 7.2 Cost Tracking

#### 7.2.1 Idempotent Usage Logging

**Idempotency Guarantee**: Each LLM request is logged exactly once for cost tracking.

**Mechanism**:
- Log ID is deterministically generated from `workflowId + stepId + requestHash`
- INSERT uses `ON CONFLICT (id) DO NOTHING`

**Duplicate Behavior**: Silent ignore (log entry already exists)

**Rationale**: Accurate cost tracking requires no duplicate entries on workflow step retry.

```typescript
// per-workflow cost attribution (FR-CORE-LLM-002)
interface LLMUsageLog {
  id: string;                    // deterministic: hash(workflowId + stepId + requestHash)
  workflowId: string;
  stepId: string;                // for idempotency
  domain: 'crypto' | 'hr';
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUSD: number;
  timestamp: Date;
}

// budget enforcement (FR-CORE-LLM-002 requires daily cap)
const DAILY_BUDGET_USD = 50;    // configurable per domain
const MONTHLY_BUDGET_USD = 500; // per BRD constraint

async function checkBudget(domain: 'crypto' | 'hr'): Promise<BudgetStatus> {
  const [dailyTotal, monthlyTotal] = await Promise.all([
    db.query(`
      SELECT SUM(cost_usd) FROM llm_usage_logs
      WHERE domain = $1 AND timestamp >= date_trunc('day', NOW())
    `, [domain]),
    db.query(`
      SELECT SUM(cost_usd) FROM llm_usage_logs
      WHERE domain = $1 AND timestamp >= date_trunc('month', NOW())
    `, [domain]),
  ]);

  return {
    dailyUsed: dailyTotal,
    dailyLimit: DAILY_BUDGET_USD,
    dailyExceeded: dailyTotal >= DAILY_BUDGET_USD,
    monthlyUsed: monthlyTotal,
    monthlyLimit: MONTHLY_BUDGET_USD,
    monthlyExceeded: monthlyTotal >= MONTHLY_BUDGET_USD,
    warningAt90: dailyTotal >= DAILY_BUDGET_USD * 0.9 || monthlyTotal >= MONTHLY_BUDGET_USD * 0.9,
  };
}

// gateway enforces budget before request
async function complete(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>> {
  const budget = await checkBudget(request.domain);

  if (budget.dailyExceeded) {
    return Result.err({ code: 'DAILY_BUDGET_EXCEEDED', ...budget });
  }
  if (budget.monthlyExceeded) {
    return Result.err({ code: 'MONTHLY_BUDGET_EXCEEDED', ...budget });
  }

  // proceed with request...
  const result = await this.providers.get(this.primary)?.generateCompletion(request);

  if (Result.isOk(result)) {
    await this.trackUsage(request, result.data);
  }

  return result;
}

// idempotent usage tracking
async function trackUsage(
  request: CompletionRequest,
  response: CompletionResponse
): Promise<void> {
  // generate deterministic ID from request context
  const requestHash = createHash('sha256')
    .update(JSON.stringify(request.messages))
    .digest('hex')
    .slice(0, 16);

  const deterministicId = uuidv5(
    `${request.workflowId}:${request.stepId}:${requestHash}`,
    LLM_USAGE_UUID_NAMESPACE
  );

  // idempotent insert
  await db.llmUsageLogs.insert({
    id: deterministicId,
    workflowId: request.workflowId,
    stepId: request.stepId,
    domain: request.domain,
    provider: response.provider,
    model: response.model,
    promptTokens: response.usage.promptTokens,
    completionTokens: response.usage.completionTokens,
    costUSD: calculateCost(response),
    timestamp: new Date(),
  }).onConflict('id').ignore();
}
```

---

## 8. Identity Service Architecture

**FRD Reference**: FR-CORE-ID-001 to FR-CORE-ID-003

> **Multi-Model Consensus (2026-02-02)**: Replace custom WebAuthn/JWT implementation with **Supabase Auth** (managed). Custom identity is a "velocity killer" for a 3-person team. Supabase Auth provides passwordless (magic links), social login, and session management out of the box.

### 8.1 Technology Selection

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Supabase Auth** | 50K MAU free, magic links, social login | Vendor dependency | **Selected** |
| **Clerk** | Best DX, WebAuthn native | Per-MAU pricing risk | Alternative |
| **Custom WebAuthn** | Full control | 2+ months dev time | Not selected |

**Decision**: Supabase Auth (free tier) for Phase 1. Supports magic links (passwordless) per BRD requirement.

**Exit Strategy**: Standard OIDC/JWT tokens; can migrate to Keycloak/Authentik if needed.

### 8.2 Supabase Auth Integration

#### 8.2.1 Identity Service Idempotency

**Idempotency Posture for Auth Operations**:

| Operation | Type | Idempotency | Duplicate Behavior | Notes |
|-----------|------|-------------|-------------------|-------|
| `signInWithOtp` (magic link) | Outbound API | **Safe to retry** | Supabase sends new email; user clicks latest link | Multiple emails acceptable |
| `signInWithOAuth` | Outbound redirect | **Inherently idempotent** | OAuth flow is stateless redirect | User re-authenticates |
| `auth.getUser` | Outbound API | **Read-only** | No side effects | Safe for any retry |
| Session validation | Outbound API | **Read-only** | No side effects | Safe for any retry |

**Retry Sources Considered**:
- User retry on slow email delivery
- Network timeout on OAuth redirect
- Session check retry on API gateway

**Rationale**: Authentication operations are either read-only (session validation) or user-initiated with clear feedback (magic link email). Supabase handles rate limiting. Duplicate magic link sends are acceptable (user clicks latest).

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// magic link login (passwordless) - safe to retry; sends new email
async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${APP_URL}/auth/callback` },
  });
  if (error) throw error;
}

// social login (OAuth) - inherently idempotent redirect
async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${APP_URL}/auth/callback` },
  });
  if (error) throw error;
}

// get current user - read-only, no side effects
async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

### 8.3 RBAC Model (Application Layer)

Supabase handles authentication; RBAC is managed in application layer:

```typescript
// roles stored in app database, linked to supabase user id
type CoreRole = 'admin' | 'user' | 'viewer';
type HRRole = CoreRole | 'recruiter' | 'interviewer' | 'hiring_manager' | 'client';
type CryptoRole = CoreRole | 'trader';

// permission check (app layer)
async function hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
  const userRoles = await db.userRoles.findByUserId(userId);
  const permissions = getRolePermissions(userRoles);
  return permissions.some(p => p.resource === resource && p.actions.includes(action));
}
```

### 8.4 Session Management (Supabase Managed)

Supabase Auth handles session management automatically:
- **Session persistence**: Managed by Supabase client
- **Token refresh**: Automatic refresh tokens
- **Session revocation**: Via Supabase dashboard or API

```typescript
// session validation (middleware)
async function validateSession(req: Request): Promise<User | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return user;
}
```

### 8.5 Phase 2: WebAuthn/Passkeys

Full WebAuthn support deferred to Phase 2. Supabase Auth roadmap includes passkey support; evaluate when available.
```

---

## 9. Data Architecture

### 9.1 Schema Isolation

```
PostgreSQL
├── public (shared)
│   ├── users
│   ├── authenticators
│   ├── audit_logs
│   └── llm_usage_logs
├── aptivo_hr (HR domain)
│   ├── candidates
│   ├── applications
│   ├── interviews
│   └── contracts
└── aptivo_trading (Crypto domain)
    ├── monitored_wallets
    ├── trade_signals
    ├── trade_executions
    └── security_reports
```

### 9.2 Audit Log Schema

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id UUID REFERENCES users(id),
  actor_type VARCHAR(50) NOT NULL, -- 'user', 'system', 'workflow'
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  domain VARCHAR(50), -- 'hr', 'crypto', 'core'
  metadata JSONB,
  ip_address INET,
  user_agent TEXT
);

-- append-only: no UPDATE/DELETE permissions
-- partitioned by month for retention management

-- tamper-evident: each row references previous hash
CREATE INDEX idx_audit_logs_timestamp ON audit_logs (timestamp);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id);
```

### 9.3 Audit Tamper-Evidence

**FRD Reference**: FR-CORE-AUD-001

> **Multi-Model Consensus (2026-02-02)**: Simplify to append-only SQL for Phase 1. Cryptographic hash-chaining adds complexity (concurrency edge cases, schema migration issues) without immediate regulatory requirement. Defer to Phase 3+ when compliance demands it.

#### Phase 1: Append-Only SQL with Idempotent Inserts

**Idempotency Guarantee**: Each audit event is recorded exactly once.

**Mechanism**:
- ID is deterministically generated from caller-provided `eventId` OR `hash(workflowId + stepId + action + resourceId + eventSequence)`
- INSERT uses `ON CONFLICT (id) DO NOTHING`
- Event sequence (caller-provided or metadata hash) ensures distinct events within same second are not collapsed

**Duplicate Behavior**: Silent ignore (audit entry already exists)

**Retry Sources Considered**:
- Workflow step retry after crash (most common)
- Database connection retry
- Service restart during write

**Rationale**: Workflow step retry after crash must not create duplicate audit records; audit trail integrity is critical for compliance.

**Important**: The caller SHOULD provide an `eventId` or include distinguishing data in `metadata` to prevent false deduplication of legitimate distinct events within the same second.

```sql
-- tamper protection via database permissions
-- app user has INSERT only, no UPDATE/DELETE
GRANT INSERT ON audit_logs TO app_user;
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;

-- only admin can query (read-only)
GRANT SELECT ON audit_logs TO app_user;

-- idempotency: unique constraint on deterministic ID
-- (already covered by PRIMARY KEY, but explicit for clarity)
```

```typescript
import { v5 as uuidv5 } from 'uuid';

// namespace UUID for audit log idempotency (fixed, never changes)
const AUDIT_UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

interface AuditLogEntry {
  // ... existing fields
  eventId?: string;  // caller-provided unique event ID (preferred)
}

// idempotent append-only audit logging
async function appendAuditLog(entry: AuditLogEntry): Promise<AuditLog | null> {
  let deterministicId: string;

  if (entry.eventId) {
    // preferred: caller provides unique event ID
    deterministicId = entry.eventId;
  } else if (entry.id) {
    // caller provided explicit ID
    deterministicId = entry.id;
  } else {
    // fallback: generate from content
    // include metadata hash to distinguish multiple events with same action/resource
    const metadataHash = entry.metadata
      ? createHash('sha256').update(JSON.stringify(entry.metadata)).digest('hex').slice(0, 8)
      : 'no-meta';

    const idempotencyInput = [
      entry.workflowId || 'no-workflow',
      entry.stepId || 'no-step',
      entry.action,
      entry.resourceType,
      entry.resourceId || 'no-resource',
      metadataHash,  // distinguishes events with different metadata
    ].join(':');

    deterministicId = uuidv5(idempotencyInput, AUDIT_UUID_NAMESPACE);
  }

  // idempotent insert: ON CONFLICT DO NOTHING
  const result = await db.auditLogs.insert({
    id: deterministicId,
    timestamp: new Date(),
    ...entry,
  }).onConflict('id').ignore();

  if (result.rowCount === 0) {
    // duplicate detected - this is expected on retry
    logger.debug({ deterministicId, action: entry.action }, 'Audit log entry already exists - idempotent skip');
    return null;
  }

  return result.rows[0];
}

// convenience wrapper for workflow context - always use eventId for clarity
async function auditFromWorkflow(
  ctx: WorkflowContext,
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  // generate stable eventId from workflow context
  const eventId = generateDeterministicUUID(
    ctx.workflowId,
    ctx.stepId,
    action,
    ctx.resourceId || 'no-resource'
  );

  await appendAuditLog({
    eventId,
    workflowId: ctx.workflowId,
    stepId: ctx.stepId,
    action,
    resourceType: ctx.resourceType,
    resourceId: ctx.resourceId,
    actorId: ctx.actorId,
    actorType: ctx.actorType,
    domain: ctx.domain,
    metadata,
  });
}
```

#### Phase 3+: Cryptographic Hash-Chaining (Deferred)

When regulatory compliance requires cryptographic proof of integrity:

```typescript
// future: tamper-evident chain
interface AuditLogWithChain extends AuditLog {
  previousHash: string | null;
  currentHash: string;
}

// implementation deferred to Phase 3+
```

### 9.4 Audit Retention Policies

**FRD Reference**: FR-CORE-AUD-003

```typescript
interface RetentionPolicy {
  id: string;
  domain: 'core' | 'hr' | 'crypto';
  resourceType?: string;         // optional: specific resource type
  retentionYears: number;        // default: 7
  overrideAllowed: boolean;      // can domain override?
}

// default: 7 years platform-wide
const DEFAULT_RETENTION_YEARS = 7;

// domain can override if allowed
const domainOverrides: Record<string, number> = {
  'hr.candidate': 5,           // GDPR consideration
  'crypto.trade_execution': 10, // financial record keeping
};

async function getRetentionPolicy(domain: string, resourceType: string): Promise<number> {
  const override = domainOverrides[`${domain}.${resourceType}`];
  return override ?? DEFAULT_RETENTION_YEARS;
}

#### 9.4.1 Retention Enforcement Idempotency

**Idempotency Guarantee**: Running retention multiple times in same period has no additional effect.

**Mechanism**:
- Archive operation uses date-based selection (inherently idempotent)
- Already-archived records are skipped
- Audit log for enforcement uses deterministic ID (date + policy)

**Duplicate Behavior**: Archive returns 0 count if already run; audit log deduplicated

**Retry Sources Considered**:
- Cron job re-execution on failure
- Manual retry

```typescript
// scheduled job: archive/delete expired records (idempotent)
async function enforceRetention(): Promise<void> {
  const policies = await db.retentionPolicies.findAll();
  const runDate = new Date().toISOString().split('T')[0]; // daily bucket

  for (const policy of policies) {
    const cutoffDate = subYears(new Date(), policy.retentionYears);

    // archive is idempotent: already-archived records are skipped
    const expiredCount = await db.auditLogs.archiveOlderThan(cutoffDate, policy.domain);

    // deterministic audit ID for this run (daily + policy)
    await auditService.log({
      eventId: generateDeterministicUUID('RETENTION_ENFORCED', policy.id, runDate),
      action: 'RETENTION_ENFORCED',
      resourceType: 'audit_log',
      metadata: { policy: policy.id, archivedCount: expiredCount, cutoffDate, runDate },
    });
  }
}
```

### 9.5 Audit Export with Integrity

**FRD Reference**: FR-CORE-AUD-002

#### 9.5.1 Export Idempotency

**Idempotency Guarantee**: Export requests with same parameters produce same result.

**Mechanism**:
- Export ID is deterministic: `hash(requestedBy + params + date_bucket)`
- Export record uses upsert on deterministic ID
- S3 presigned URL generation is read-only (inherently idempotent)

**Duplicate Behavior**: Return existing export record if parameters match within 1-hour window

**Idempotency Window**: 1 hour (same user + same params = same export)

**Retry Sources Considered**:
- User retry on timeout
- API gateway retry

```typescript
interface AuditExport {
  format: 'csv' | 'json';
  startDate: Date;
  endDate: Date;
  filters?: {
    actorId?: string;
    resourceType?: string;
    domain?: string;
  };
}

async function exportAuditLogs(params: AuditExport, requestedBy: string): Promise<ExportResult> {
  // generate deterministic export ID for idempotency (1-hour bucket)
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  const exportId = generateDeterministicUUID(
    requestedBy,
    JSON.stringify(params),
    hourBucket.toString()
  );

  // check for existing export (idempotent return)
  const existing = await db.auditExports.findById(exportId);
  if (existing && existing.status === 'completed') {
    return {
      downloadUrl: generatePresignedUrl(`exports/${exportId}.${params.format}`),
      checksum: existing.checksum,
      recordCount: existing.recordCount,
      idempotent: true,
    };
  }

  // audit the export action itself (idempotent via deterministic audit ID)
  await auditService.log({
    id: generateDeterministicUUID(exportId, 'AUDIT_EXPORT_REQUESTED'),
    action: 'AUDIT_EXPORT_REQUESTED',
    resourceType: 'audit_log',
    actorId: requestedBy,
    metadata: { params, exportId },
  });

  const logs = await db.auditLogs.findByFilters(params);

  // generate export content
  const content = params.format === 'json'
    ? JSON.stringify(logs, null, 2)
    : convertToCSV(logs);

  // compute checksum for integrity verification
  const checksum = computeSHA256(content);

  // store export metadata (idempotent via exportId)
  await db.auditExports.upsert({
    id: exportId,
    requestedBy,
    requestedAt: new Date(),
    params,
    recordCount: logs.length,
    checksum,
    status: 'completed',
    expiresAt: addDays(new Date(), 7),
  });

  return {
    downloadUrl: generatePresignedUrl(`exports/${exportId}.${params.format}`),
    checksum,
    recordCount: logs.length,
  };
}
```

### 9.6 File Storage

#### 9.6.1 File Storage Idempotency

**Idempotency Guarantee**: File uploads and metadata operations are idempotent.

**Mechanism by Operation**:

| Operation | Idempotency Key | Duplicate Behavior |
|-----------|-----------------|-------------------|
| Upload URL generation | Read-only, inherently idempotent | Same URL returned |
| Download URL generation | Read-only, inherently idempotent | Same URL returned |
| Metadata insert | Client-provided `fileId` or content hash | ON CONFLICT update |
| Scan status update | `fileId` | Upsert (idempotent) |
| File delete | `fileId` | S3 delete is idempotent |
| Access logging | Deterministic audit ID | ON CONFLICT ignore |

**Retry Sources Considered**:
- Client retry on upload timeout
- Workflow step retry
- Scan worker retry

```typescript
// S3-compatible interface (FR-CORE-BLOB-001/002)
interface FileStorage {
  generateUploadUrl(key: string, contentType: string, expiresIn: number): Promise<string>;
  generateDownloadUrl(key: string, expiresIn: number): Promise<string>;
  deleteFile(key: string): Promise<void>;  // S3 delete is idempotent
  getMetadata(key: string): Promise<FileMetadata>;
}

// metadata stored in PostgreSQL, binary in S3/Minio
interface FileMetadata {
  id: string;           // client-provided or content-hash for idempotency
  key: string;          // S3 object key
  filename: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
  linkedEntities: EntityLink[];
  scanStatus: 'pending' | 'clean' | 'infected' | 'error';
  version: number;
}

// idempotent file metadata creation
async function createFileMetadata(
  params: CreateFileParams,
  workflowContext?: { workflowId: string; stepId: string }
): Promise<FileMetadata> {
  // generate deterministic ID from content hash or workflow context
  const fileId = params.fileId
    || (params.contentHash ? `hash:${params.contentHash}` : null)
    || (workflowContext ? generateDeterministicUUID(workflowContext.workflowId, workflowContext.stepId, params.filename) : generateUUID());

  return db.files.upsert({
    id: fileId,
    key: params.key,
    filename: params.filename,
    contentType: params.contentType,
    size: params.size,
    uploadedBy: params.uploadedBy,
    uploadedAt: new Date(),
    scanStatus: 'pending',
    version: 1,
  });
}

### 9.7 File Access Control

**FRD Reference**: FR-CORE-BLOB-002

```typescript
interface EntityLink {
  entityType: string;   // 'candidate', 'contract', 'trade_execution'
  entityId: string;
  domain: 'hr' | 'crypto';
  accessLevel: 'read' | 'write' | 'admin';
}

// access control inherits from linked entity permissions
async function canAccessFile(userId: string, fileId: string, action: 'read' | 'write'): Promise<boolean> {
  const file = await db.files.findById(fileId);
  if (!file) return false;

  // check each linked entity - user needs permission on at least one
  for (const link of file.linkedEntities) {
    const entityPermission = await getEntityPermission(userId, link.entityType, link.entityId);

    if (action === 'read' && entityPermission !== null) return true;
    if (action === 'write' && ['write', 'admin'].includes(entityPermission)) return true;
  }

  return false;
}

// file access is logged
async function logFileAccess(userId: string, fileId: string, action: 'view' | 'download'): Promise<void> {
  await auditService.log({
    action: `FILE_${action.toUpperCase()}`,
    resourceType: 'file',
    resourceId: fileId,
    actorId: userId,
    metadata: {
      filename: (await db.files.findById(fileId))?.filename,
    },
  });
}
```

### 9.8 Malware Scanning Integration

**FRD Reference**: FR-CORE-BLOB-002

#### 9.8.1 Scan Idempotency

**Idempotency Guarantee**: Each file is scanned exactly once; scan results are stable.

**Mechanism**:
- Scan triggered by file upload event (deduplicated by Inngest)
- Scan status update uses upsert (idempotent)
- Quarantine (S3 delete) is inherently idempotent

**Duplicate Behavior**: Re-scanning returns cached result if scanStatus != 'pending'

**Retry Sources Considered**:
- Scan worker crash/retry
- ClamAV timeout retry
- Workflow step retry

```typescript
// malware scan integration point
interface MalwareScanResult {
  fileId: string;
  status: 'clean' | 'infected' | 'error';
  engine: string;
  scanTimestamp: Date;
  threats?: string[];
}

// scan triggered after upload, before file is "confirmed"
async function scanUploadedFile(fileId: string): Promise<MalwareScanResult> {
  const file = await db.files.findById(fileId);
  const fileBuffer = await s3.getObject(file.key);

  // integration with ClamAV or external service
  const scanResult = await malwareScanner.scan(fileBuffer);

  await db.files.update(fileId, {
    scanStatus: scanResult.infected ? 'infected' : 'clean',
  });

  if (scanResult.infected) {
    // quarantine: delete from S3, mark as infected
    await s3.deleteObject(file.key);
    await auditService.log({
      action: 'FILE_QUARANTINED',
      resourceType: 'file',
      resourceId: fileId,
      metadata: { threats: scanResult.threats },
    });
  }

  return {
    fileId,
    status: scanResult.infected ? 'infected' : 'clean',
    engine: 'clamav',
    scanTimestamp: new Date(),
    threats: scanResult.threats,
  };
}

// files with scanStatus !== 'clean' cannot be downloaded
async function generateDownloadUrl(fileId: string, userId: string): Promise<Result<string, FileError>> {
  const file = await db.files.findById(fileId);

  if (file.scanStatus !== 'clean') {
    return Result.err({ code: 'FILE_NOT_AVAILABLE', reason: file.scanStatus });
  }

  await logFileAccess(userId, fileId, 'download');
  return Result.ok(await s3.getSignedUrl(file.key, { expiresIn: 3600 }));
}
```

---

## 10. Deployment Architecture

### 10.1 Environment Topology

| Environment | Purpose | Infrastructure |
|-------------|---------|----------------|
| Development | Local dev | Docker Compose |
| Staging | Integration testing | DigitalOcean (preview) |
| Production | Live system | DigitalOcean (production) |

### 10.2 Container Structure

```yaml
# docker-compose structure
services:
  # Core Services
  api:
    image: aptivo/api
    depends_on: [postgres, redis, nats]

  workflow-worker:
    image: aptivo/worker
    depends_on: [postgres, redis, nats]

  # Infrastructure
  postgres:
    image: postgres:16

  redis:
    image: redis:7

  nats:
    image: nats:latest
    command: ["--jetstream"]

  minio:
    image: minio/minio
```

### 10.3 Infrastructure Selection Rationale

> **Multi-Model Consensus (2026-02-03)**: DigitalOcean App Platform over Kubernetes. Unanimous decision by Claude Opus 4.5, OpenAI Codex, Gemini 3 Pro.

**BRD Constraints Driving Selection**:

| Constraint | BRD Reference | Impact on Selection |
|------------|---------------|---------------------|
| 3-developer team | BRD-PLATFORM-CORE §2.2 | Cannot absorb K8s operational overhead |
| Self-funded | BRD-PLATFORM-CORE §2.2 | Cost-effective solutions required |
| "Buy commodity infrastructure" | BRD-PLATFORM-CORE §2.1 | PaaS over self-managed K8s |

**Traceability**: BRD-PLATFORM-CORE Section 2.2 Constraints

**K8s Upgrade Triggers** (documented, not currently met):

| Trigger | Threshold | Current Status |
|---------|-----------|----------------|
| Custom networking/sidecars required | Service mesh, custom ingress | Not needed |
| Fine-grained autoscaling beyond PaaS | Custom HPA metrics | Not needed |
| Multi-tenant isolation or compliance mandates | Namespace-level isolation | Not needed |
| Cost inflection where PaaS > K8s + ops overhead | ~$500/mo with dedicated ops | Not reached |
| Team growth with K8s expertise | 5+ engineers | Currently 3 |

**Decision Record**:
- **Date**: 2026-02-03
- **Decision**: Use DigitalOcean App Platform
- **Status**: Active
- **Review Trigger**: Any K8s upgrade trigger met, or quarterly review

---

## 11. Cross-Cutting Concerns

### 11.1 Error Handling Pattern

```typescript
// Result type for all fallible operations in domain layer
import { Result } from '@satoshibits/functional';

// ReaderResult for application/orchestration layer (explicit dependencies)
// See: docs/05-guidelines/05c-ReaderResult-Guide.md
type ReaderResult<R, E, A> = (deps: R) => Promise<Result<A, E>>;

// domain errors are tagged unions
type DomainError =
  | { _tag: 'ValidationError'; field: string; message: string }
  | { _tag: 'NotFoundError'; resource: string; id: string }
  | { _tag: 'AuthorizationError'; required: string }
  | { _tag: 'ExternalServiceError'; service: string; cause: unknown };

// API errors use RFC 7807 Problem Details
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}
```

### 11.2 Observability

```typescript
// structured logging (Pino)
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// OpenTelemetry tracing
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('aptivo-core');

async function processWorkflow(ctx: Context) {
  return tracer.startActiveSpan('workflow.process', async (span) => {
    span.setAttribute('workflow.id', ctx.workflowId);
    span.setAttribute('domain', ctx.domain);
    // ... workflow logic
    span.end();
  });
}
```

---

## 12. Interoperability Architecture

**FRD Reference**: FR-CORE-INT-001 to FR-CORE-INT-002

### 12.1 Workflow Definition Export API

**FRD Reference**: FR-CORE-INT-001

#### 12.1.1 Cursor-Based Pagination Standard

All list endpoints use cursor-based pagination to ensure consistency in multi-tenant environments with high-volume data streams (especially audit logs).

**Why Cursor (not Offset)**:
- Offset pagination causes drift when items are inserted/deleted during pagination
- Audit logs are append-only and high-volume — offset guarantees skipped/duplicate records
- Cursor scales better for large datasets without full table scans

**Standard Parameters**:
| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `cursor` | string | `null` | - | Opaque cursor from previous response |
| `limit` | number | 50 | 200 | Number of items to return |

**Standard Response**:
```typescript
interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;  // null when no more results
  has_more: boolean;
}
```

**Cursor Format**: Base64url-encoded JSON containing `{ id, ts }` for stable ordering by creation time.

```typescript
// API endpoint for workflow definition export
router.get('/api/v1/workflows/:id/export', authenticate, authorize('workflow:export'), async (req, res) => {
  const { id } = req.params;
  const { format = 'json' } = req.query;

  const workflow = await workflowEngine.getDefinition(id);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }

  const exportData: WorkflowExport = {
    id: workflow.id,
    version: workflow.version,
    name: workflow.name,
    status: workflow.active ? 'enabled' : 'disabled',
    states: Object.entries(workflow.states).map(([name, def]) => ({
      name,
      transitions: Object.keys(def.transitions),
      onEnter: def.onEnter?.map(a => a.name) ?? [],
      onExit: def.onExit?.map(a => a.name) ?? [],
    })),
    triggers: workflow.triggers.map(t => ({
      type: t.type,
      config: t.config,
    })),
    exportedAt: new Date().toISOString(),
  };

  res.setHeader('Content-Type', 'application/json');
  res.json(exportData);
});

// list all workflows (cursor-paginated)
router.get('/api/v1/workflows', authenticate, authorize('workflow:list'), async (req, res) => {
  const { domain, status, cursor, limit = 50 } = req.query;
  const parsedLimit = Math.min(parseInt(limit, 10) || 50, 200); // max 200

  const workflows = await workflowEngine.listDefinitions({
    domain,
    active: status === 'enabled' ? true : status === 'disabled' ? false : undefined,
    cursor,        // opaque cursor from previous response
    limit: parsedLimit + 1, // fetch one extra to determine has_more
  });

  const hasMore = workflows.items.length > parsedLimit;
  const items = hasMore ? workflows.items.slice(0, parsedLimit) : workflows.items;
  const lastItem = items[items.length - 1];

  res.json({
    data: items.map(w => ({
      id: w.id,
      name: w.name,
      version: w.version,
      status: w.active ? 'enabled' : 'disabled',
      domain: w.domain,
    })),
    next_cursor: hasMore && lastItem ? encodeCursor(lastItem.id, lastItem.createdAt) : null,
    has_more: hasMore,
  });
});

// cursor encoding/decoding helpers
function encodeCursor(id: string, timestamp: Date): string {
  return Buffer.from(JSON.stringify({ id, ts: timestamp.toISOString() })).toString('base64url');
}

function decodeCursor(cursor: string): { id: string; ts: string } | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
```

### 12.2 Outbound Webhooks

**FRD Reference**: FR-CORE-INT-002

#### 12.2.1 Webhook Idempotency for Receivers

**Idempotency Guarantee**: Webhook payloads include unique event ID for receiver-side deduplication.

**Mechanism**:
- Each webhook includes `X-Webhook-ID` header containing the unique `eventId`
- `eventId` is deterministically generated from workflow context (see §12.2.2)
- Same ID sent on every retry attempt
- Receivers SHOULD deduplicate based on this ID

**Receiver Contract**:
| Header | Purpose |
|--------|---------|
| `X-Webhook-ID` | Unique event identifier for deduplication |
| `X-Webhook-Signature` | HMAC signature for payload verification |
| `X-Webhook-Timestamp` | Event timestamp (for replay attack prevention) |

**Retry Behavior**:
- On delivery failure: retry up to 3 times with exponential backoff
- Same `X-Webhook-ID` sent on each retry
- Receiver must handle duplicate deliveries idempotently

**Documentation for Webhook Consumers**:
```
## Handling Aptivo Webhooks

Your endpoint MUST:
1. Verify the X-Webhook-Signature header
2. Deduplicate based on X-Webhook-ID
3. Return 200 OK within 30 seconds
4. Process asynchronously if needed

Example deduplication:
- Check if X-Webhook-ID exists in your processed set
- If yes, return 200 OK (already processed)
- If no, process event and store ID with TTL
```

#### 12.2.2 Sender-Side Idempotency

**Idempotency Guarantee**: Each event is sent exactly once per webhook subscription.

**Mechanism**:
- Event ID generated deterministically: `hash(workflowId + stepId + event + webhookConfigId)`
- BullMQ deduplicates jobs by event ID (jobId)
- Same event ID used on retry (stable across attempts)
- No timestamp in ID ensures same workflow step always produces same eventId

**Duplicate Behavior**: BullMQ silently deduplicates; delivery table uses event ID as key

**Idempotency Window**: Job lifetime + delivery record retention (7 days)

```typescript
interface WebhookConfig {
  id: string;
  url: string;
  events: string[];           // e.g., ['workflow.completed', 'hitl.approved']
  secret: string;             // for HMAC signature verification
  active: boolean;
  retryPolicy: RetryPolicy;
}

// workflow actions can include webhook calls - with sender-side idempotency
const webhookAction: ActionFn = async (ctx: WorkflowContext) => {
  const webhooks = await db.webhooks.findByEvent(ctx.event);

  for (const webhook of webhooks) {
    if (!webhook.active) continue;

    // generate stable event ID for idempotency (same ID on retry)
    const eventId = generateDeterministicUUID(
      ctx.workflowId,
      ctx.stepId,
      ctx.event,
      webhook.id
    );

    const payload = {
      id: eventId,              // event ID included in payload
      event: ctx.event,
      timestamp: new Date().toISOString(),
      workflowId: ctx.workflowId,
      data: ctx.eventData,
    };

    // sign payload for verification
    const signature = computeHMAC(JSON.stringify(payload), webhook.secret);

    // use eventId as jobId for BullMQ deduplication
    await webhookQueue.add('send-webhook', {
      url: webhook.url,
      payload,
      signature,
      eventId,
      webhookConfigId: webhook.id,
    }, {
      jobId: `webhook:${eventId}`,  // BullMQ deduplicates by jobId
      attempts: webhook.retryPolicy.maxAttempts,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }
};

// webhook worker with logging - uses eventId for stable tracking
const webhookWorker = new Worker('send-webhook', async (job) => {
  const { url, payload, signature, eventId, webhookConfigId } = job.data;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-ID': eventId,         // event ID, not config ID
        'X-Webhook-Timestamp': payload.timestamp,
      },
      body: JSON.stringify(payload),
    });

    // idempotent delivery logging via eventId
    await db.webhookDeliveries.upsert({
      id: eventId,
      webhookConfigId,
      payload,
      status: response.ok ? 'delivered' : 'failed',
      statusCode: response.status,
      attemptNumber: job.attemptsMade + 1,
      lastAttemptAt: new Date(),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  } catch (error) {
    await db.webhookDeliveries.upsert({
      id: eventId,
      webhookConfigId,
      payload,
      status: 'failed',
      error: error.message,
      attemptNumber: job.attemptsMade + 1,
      lastAttemptAt: new Date(),
    });
    throw error; // trigger retry
  }
});
```

### 12.3 Inbound Webhooks

**FRD Reference**: FR-CORE-INT-002

#### 12.3.1 Webhook Deduplication

**Idempotency Guarantee**: Each webhook is processed exactly once within the deduplication window.

**Mechanism**:
- Webhook ID extracted from `X-Webhook-ID` header, `X-Request-ID` header, or `body.id`
- ID checked against Redis set `webhooks:processed:{sourceId}`
- If present: return 200 OK without re-processing (idempotent success)
- If absent: add to set with configurable TTL before processing

**Duplicate Behavior**: Return HTTP 200 with `{ received: true, deduplicated: true }`

**Idempotency Window**: 7 days default (configurable per source via `source.deduplicationTTL`)

**Retry Sources Considered**:
- Webhook provider retry (e.g., Stripe retries for 72h, GitHub for 24h)
- Network timeout/retry at load balancer level
- Client-side replay on perceived failure

```typescript
// idempotent webhook handler with deduplication
router.post('/api/v1/webhooks/inbound/:sourceId', async (req, res) => {
  const { sourceId } = req.params;
  const signature = req.headers['x-webhook-signature'];

  // verify source is registered
  const source = await db.webhookSources.findById(sourceId);
  if (!source || !source.active) {
    return res.status(404).json({ error: 'Unknown webhook source' });
  }

  // verify signature
  const expectedSignature = computeHMAC(JSON.stringify(req.body), source.secret);
  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // extract webhook ID for deduplication (priority order)
  const webhookId = req.headers['x-webhook-id']
    || req.headers['x-request-id']
    || req.body.id
    || req.body.event_id;

  if (!webhookId) {
    logger.warn({ sourceId }, 'Webhook received without ID - cannot deduplicate');
    // fall through to process, but log warning
  }

  // idempotency check: has this webhook been processed?
  if (webhookId) {
    const dedupeKey = `webhooks:processed:${sourceId}:${webhookId}`;
    const alreadyProcessed = await redis.get(dedupeKey);

    if (alreadyProcessed) {
      logger.info({ sourceId, webhookId }, 'Duplicate webhook detected - returning cached response');
      return res.status(200).json({
        received: true,
        deduplicated: true,
        originalProcessedAt: alreadyProcessed,
      });
    }

    // mark as processing BEFORE triggering workflow (crash-safe)
    const ttlSeconds = source.deduplicationTTL || 7 * 24 * 60 * 60; // 7 days default
    await redis.set(dedupeKey, new Date().toISOString(), 'EX', ttlSeconds);
  }

  // map external event to internal workflow trigger
  const trigger = source.eventMappings[req.body.event];
  if (trigger) {
    await workflowEngine.triggerEvent(trigger.workflowId, trigger.event, {
      source: sourceId,
      webhookId,
      externalEvent: req.body.event,
      payload: req.body.data,
    });
  }

  // log receipt (idempotent via webhookId)
  await db.inboundWebhooks.upsert({
    id: webhookId ? `${sourceId}:${webhookId}` : generateUUID(),
    sourceId,
    webhookId,
    event: req.body.event,
    payload: req.body,
    receivedAt: new Date(),
    triggered: !!trigger,
  });

  res.status(200).json({ received: true });
});
```

---

## 13. Idempotency Summary (Cross-Cutting)

This section provides a quick reference for all idempotency patterns used across the platform.

### 13.1 Idempotency by Component

| Component | Operation | Mechanism | Duplicate Behavior | Window |
|-----------|-----------|-----------|-------------------|--------|
| **Workflow Engine** | Step execution | Inngest memoization | Return cached result | Workflow lifetime |
| **Workflow Engine** | Event trigger | Inngest event ID | Ignore duplicate | 24 hours |
| **HITL Gateway** | Approval endpoint | Request status check + race guard | Return existing decision | Request lifetime |
| **HITL Gateway** | Decision recording | requestId constraint | ON CONFLICT ignore | Permanent |
| **HITL Gateway** | Workflow signal | Gated by recordDecision result | Only signal if inserted | N/A |
| **MCP Layer** | Tool execution | idempotencyKey + Redis cache | Return cached result | 24 hours (configurable) |
| **MCP Layer** | Queued requests | BullMQ jobId | Job deduplicated | Job lifetime |
| **Audit Service** | Log append | eventId or content hash | ON CONFLICT ignore | Permanent |
| **Audit Service** | Export | Deterministic exportId | Return existing export | 1 hour |
| **Audit Service** | Retention | Date-based archive | Already-archived skipped | Daily |
| **LLM Gateway** | Usage tracking | Deterministic UUID | ON CONFLICT ignore | Permanent |
| **Notification Bus** | Critical notifications | Novu transactionId | Novu ignores duplicate | 24 hours |
| **Notification Bus** | Non-critical | Best-effort | May duplicate (acceptable) | N/A |
| **Inbound Webhooks** | Webhook receipt | webhookId + Redis | Return cached response | 7 days (configurable) |
| **Outbound Webhooks** | Event enqueue | BullMQ jobId (eventId) | Job deduplicated | Job lifetime |
| **Outbound Webhooks** | HTTP send | X-Webhook-ID (eventId) | Receiver deduplicates | Receiver-defined |
| **File Storage** | Metadata create | fileId or content hash | Upsert | Permanent |
| **File Storage** | Scan status | fileId | Upsert | Permanent |
| **File Storage** | Delete | S3 key | Inherently idempotent | N/A |
| **Identity Service** | Magic link send | None (safe to retry) | Sends new email | N/A |
| **Identity Service** | OAuth redirect | Inherently idempotent | User re-authenticates | N/A |
| **Identity Service** | Session validation | Read-only | No side effects | N/A |
| **LLM Gateway** | Completion request | Non-idempotent (by design) | New response each call | Inngest memoizes |
| **LLM Gateway** | Provider fallback | Non-idempotent | Different provider response | Acceptable |

### 13.2 Idempotency Key Generation Patterns

```typescript
// pattern 1: deterministic UUID from components
import { v5 as uuidv5 } from 'uuid';
const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const id = uuidv5(`${workflowId}:${stepId}:${action}`, NAMESPACE);

// pattern 2: natural key (preferred when available)
const id = `${sourceId}:${webhookId}`;

// pattern 3: content hash (for variable-length inputs)
const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
const id = `${prefix}:${hash}`;
```

### 13.3 Database Idempotency Pattern

```sql
-- standard idempotent insert
INSERT INTO table_name (id, ...)
VALUES ($1, ...)
ON CONFLICT (id) DO NOTHING;
```

```typescript
// with return value check
const result = await db.table.insert({...}).onConflict('id').ignore();
if (result.rowCount === 0) {
  // duplicate - idempotent success
  return;
}
// new record inserted
```

### 13.4 Redis Idempotency Pattern

```typescript
// check-then-set with TTL
const key = `prefix:${idempotencyKey}`;
const existing = await redis.get(key);
if (existing) {
  return JSON.parse(existing); // cached result
}

// set before processing (crash-safe)
await redis.set(key, JSON.stringify({ status: 'processing' }), 'EX', ttlSeconds);

// process...
const result = await doWork();

// update with actual result
await redis.set(key, JSON.stringify(result), 'EX', ttlSeconds);
return result;
```

### 13.5 Retry Source Checklist

When documenting a new trust-boundary operation, consider these retry sources:

| Source | Example | Typical Multiplier |
|--------|---------|-------------------|
| User action | Double-click, refresh | 2-3x |
| Client SDK | Built-in retry on timeout | 3x |
| Load balancer | Retry on 502/503 | 2x |
| Message queue | At-least-once delivery | 2-3x |
| Workflow engine | Step retry policy | 3x |
| External provider | Webhook retry (Stripe, GitHub) | 5-10x |

**Max retry depth calculation**: Multiply all applicable sources.
Example: client 3x × LB 2x × workflow 3x = 18x potential executions.

---

## 14. References

| Document | Purpose |
|----------|---------|
| Platform Core FRD | Functional requirements this ADD implements |
| Platform Core BRD | Business requirements and constraints |
| Original ADD (HR) | Historical reference (`docs/03-architecture/add.md`) |
| Original ADD (Crypto) | Historical reference (`docs/temp/`) |
| Coding Guidelines | Development standards (`docs/05-guidelines/`) |

---

**END OF PLATFORM CORE ADD**
