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

### 3.3 Durable Timer Implementation

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

```typescript
// RESTful endpoints for approval actions
router.post('/api/hitl/:requestId/approve', authenticate, async (req, res) => {
  const { requestId } = req.params;
  const { token, comment } = req.body;

  // verify token matches request and is not expired
  const request = await verifyApprovalToken(token);

  // record decision with audit trail
  await recordDecision(requestId, {
    decision: 'approved',
    approver: req.user.id,
    comment,
    timestamp: new Date(),
    channel: req.headers['x-approval-channel'] || 'web',
  });

  // signal workflow to resume
  await workflowEngine.signal(request.workflowId, 'approval', { approved: true });

  res.json({ status: 'approved' });
});

router.post('/api/hitl/:requestId/reject', authenticate, async (req, res) => {
  // similar structure with decision: 'rejected'
});

router.post('/api/hitl/:requestId/request-changes', authenticate, async (req, res) => {
  // records request for more info, does not resolve workflow
});
```

### 4.6 HITL Audit Integration

**FRD Reference**: FR-CORE-HITL-006

```typescript
// every HITL action emits an audit event
async function recordDecision(requestId: string, decision: Decision): Promise<void> {
  // store decision
  await db.hitlDecisions.insert(decision);

  // emit immutable audit event
  await auditService.log({
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
}
```

---

## 5. MCP Integration Layer

**FRD Reference**: FR-CORE-MCP-001 to FR-CORE-MCP-003

### 5.1 MCP Server Registry

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
}

// registry pattern
class MCPRegistry {
  private servers: Map<string, MCPServer> = new Map();

  async discover(): Promise<void> {
    for (const config of this.configs) {
      const server = await this.connect(config);
      const tools = await server.listTools();
      this.servers.set(config.id, { config, tools, client: server });
    }
  }

  async invoke(serverId: string, tool: string, args: unknown): Promise<Result<unknown, MCPError>> {
    const server = this.servers.get(serverId);
    if (!server?.config.enabled) {
      return Result.err({ code: 'SERVER_DISABLED', message: `${serverId} is disabled` });
    }
    return this.executeWithResilience(server, tool, args);
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

```typescript
import { Queue, Worker } from 'bullmq';

// rate-limited requests are queued, not rejected
const mcpQueue = new Queue('mcp-requests', { connection: redis });

interface QueuedMCPRequest {
  serverId: string;
  tool: string;
  args: unknown;
  workflowId: string;
  priority: number;
}

async function invokeWithRateLimiting(
  serverId: string,
  tool: string,
  args: unknown,
  workflowId: string
): Promise<Result<unknown, MCPError>> {
  const server = registry.get(serverId);
  const limit = server.config.rateLimit;

  if (limit && await isRateLimited(serverId)) {
    // queue instead of reject
    const job = await mcpQueue.add('mcp-request', {
      serverId,
      tool,
      args,
      workflowId,
      priority: 1,
    }, {
      delay: limit.windowMs,
      attempts: 3,
    });

    // workflow will be signaled when job completes
    return Result.ok({ queued: true, jobId: job.id });
  }

  return executeWithValidation(server, tool, args);
}

// worker processes queued requests
const worker = new Worker('mcp-requests', async (job) => {
  const { serverId, tool, args, workflowId } = job.data;
  const result = await executeWithValidation(registry.get(serverId), tool, args);

  // signal workflow with result
  await workflowEngine.signal(workflowId, 'mcp-result', { tool, result });
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

```typescript
import { Novu } from '@novu/node';

const novu = new Novu(process.env.NOVU_API_KEY);

// send notification via novu
async function sendNotification(request: NotificationRequest): Promise<void> {
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

```typescript
// per-workflow cost attribution (FR-CORE-LLM-002)
interface LLMUsageLog {
  id: string;
  workflowId: string;
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

  // ... proceed with request
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

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// magic link login (passwordless)
async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${APP_URL}/auth/callback` },
  });
  if (error) throw error;
}

// social login (OAuth)
async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${APP_URL}/auth/callback` },
  });
  if (error) throw error;
}

// get current user
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

#### Phase 1: Append-Only SQL

```sql
-- tamper protection via database permissions
-- app user has INSERT only, no UPDATE/DELETE
GRANT INSERT ON audit_logs TO app_user;
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;

-- only admin can query (read-only)
GRANT SELECT ON audit_logs TO app_user;
```

```typescript
// simple append-only audit logging
async function appendAuditLog(entry: AuditLogEntry): Promise<AuditLog> {
  return db.auditLogs.insert({
    id: generateUUID(),
    timestamp: new Date(),
    ...entry,
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

// scheduled job: archive/delete expired records
async function enforceRetention(): Promise<void> {
  const policies = await db.retentionPolicies.findAll();

  for (const policy of policies) {
    const cutoffDate = subYears(new Date(), policy.retentionYears);
    const expiredCount = await db.auditLogs.archiveOlderThan(cutoffDate, policy.domain);

    await auditService.log({
      action: 'RETENTION_ENFORCED',
      resourceType: 'audit_log',
      metadata: { policy: policy.id, archivedCount: expiredCount, cutoffDate },
    });
  }
}
```

### 9.5 Audit Export with Integrity

**FRD Reference**: FR-CORE-AUD-002

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
  // audit the export action itself
  await auditService.log({
    action: 'AUDIT_EXPORT_REQUESTED',
    resourceType: 'audit_log',
    actorId: requestedBy,
    metadata: { params },
  });

  const logs = await db.auditLogs.findByFilters(params);

  // generate export content
  const content = params.format === 'json'
    ? JSON.stringify(logs, null, 2)
    : convertToCSV(logs);

  // compute checksum for integrity verification
  const checksum = computeSHA256(content);

  // store export metadata
  const exportRecord = await db.auditExports.insert({
    requestedBy,
    requestedAt: new Date(),
    params,
    recordCount: logs.length,
    checksum,
    expiresAt: addDays(new Date(), 7), // download link expires
  });

  return {
    downloadUrl: generatePresignedUrl(`exports/${exportRecord.id}.${params.format}`),
    checksum,
    recordCount: logs.length,
  };
}
```

### 9.6 File Storage

```typescript
// S3-compatible interface (FR-CORE-BLOB-001/002)
interface FileStorage {
  generateUploadUrl(key: string, contentType: string, expiresIn: number): Promise<string>;
  generateDownloadUrl(key: string, expiresIn: number): Promise<string>;
  deleteFile(key: string): Promise<void>;
  getMetadata(key: string): Promise<FileMetadata>;
}

// metadata stored in PostgreSQL, binary in S3/Minio
interface FileMetadata {
  id: string;
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

```typescript
// API endpoint for workflow definition export
router.get('/api/workflows/:id/export', authenticate, authorize('workflow:export'), async (req, res) => {
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

// list all workflows (paginated)
router.get('/api/workflows', authenticate, authorize('workflow:list'), async (req, res) => {
  const { domain, status, page = 1, limit = 20 } = req.query;

  const workflows = await workflowEngine.listDefinitions({
    domain,
    active: status === 'enabled' ? true : status === 'disabled' ? false : undefined,
    offset: (page - 1) * limit,
    limit,
  });

  res.json({
    data: workflows.items.map(w => ({
      id: w.id,
      name: w.name,
      version: w.version,
      status: w.active ? 'enabled' : 'disabled',
      domain: w.domain,
    })),
    pagination: {
      page,
      limit,
      total: workflows.total,
    },
  });
});
```

### 12.2 Outbound Webhooks

**FRD Reference**: FR-CORE-INT-002

```typescript
interface WebhookConfig {
  id: string;
  url: string;
  events: string[];           // e.g., ['workflow.completed', 'hitl.approved']
  secret: string;             // for HMAC signature verification
  active: boolean;
  retryPolicy: RetryPolicy;
}

// workflow actions can include webhook calls
const webhookAction: ActionFn = async (ctx: WorkflowContext) => {
  const webhooks = await db.webhooks.findByEvent(ctx.event);

  for (const webhook of webhooks) {
    if (!webhook.active) continue;

    const payload = {
      event: ctx.event,
      timestamp: new Date().toISOString(),
      workflowId: ctx.workflowId,
      data: ctx.eventData,
    };

    // sign payload for verification
    const signature = computeHMAC(JSON.stringify(payload), webhook.secret);

    await webhookQueue.add('send-webhook', {
      url: webhook.url,
      payload,
      signature,
      webhookId: webhook.id,
    }, {
      attempts: webhook.retryPolicy.maxAttempts,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }
};

// webhook worker with logging
const webhookWorker = new Worker('send-webhook', async (job) => {
  const { url, payload, signature, webhookId } = job.data;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-ID': webhookId,
      },
      body: JSON.stringify(payload),
    });

    await db.webhookDeliveries.insert({
      webhookId,
      payload,
      status: response.ok ? 'delivered' : 'failed',
      statusCode: response.status,
      attemptNumber: job.attemptsMade + 1,
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  } catch (error) {
    await db.webhookDeliveries.insert({
      webhookId,
      payload,
      status: 'failed',
      error: error.message,
      attemptNumber: job.attemptsMade + 1,
    });
    throw error; // trigger retry
  }
});
```

### 12.3 Inbound Webhooks

**FRD Reference**: FR-CORE-INT-002

```typescript
// receive external webhooks to trigger workflow events
router.post('/api/webhooks/inbound/:sourceId', async (req, res) => {
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

  // map external event to internal workflow trigger
  const trigger = source.eventMappings[req.body.event];
  if (trigger) {
    await workflowEngine.triggerEvent(trigger.workflowId, trigger.event, {
      source: sourceId,
      externalEvent: req.body.event,
      payload: req.body.data,
    });
  }

  // log receipt
  await db.inboundWebhooks.insert({
    sourceId,
    event: req.body.event,
    payload: req.body,
    receivedAt: new Date(),
    triggered: !!trigger,
  });

  res.status(200).json({ received: true });
});
```

---

## 13. References

| Document | Purpose |
|----------|---------|
| Platform Core FRD | Functional requirements this ADD implements |
| Platform Core BRD | Business requirements and constraints |
| Original ADD (HR) | Historical reference (`docs/03-architecture/add.md`) |
| Original ADD (Crypto) | Historical reference (`docs/temp/`) |
| Coding Guidelines | Development standards (`docs/05-guidelines/`) |

---

**END OF PLATFORM CORE ADD**
