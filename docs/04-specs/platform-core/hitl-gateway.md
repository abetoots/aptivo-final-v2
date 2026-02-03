---
id: TSD-HITL-GATEWAY
title: HITL Gateway Specification
status: Draft
version: 1.1.0
owner: '@owner'
last_updated: '2026-02-03'
parent: ../../03-architecture/platform-core-add.md
domain: core
---

# HITL Gateway Specification

**Platform Core – Human-in-the-Loop Approval System**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.1.0 | 2026-02-03 | Document Consolidation | Merged comprehensive schemas from root spec |
| v1.0.0 | 2026-02-03 | Multi-Model Consensus | Initial creation |

---

## 1. Overview

The HITL Gateway pauses automated workflows for human approval and resumes upon decision. This is a unique differentiator that cannot be bought as SaaS.

**FRD Reference**: FR-CORE-HITL-001 to FR-CORE-HITL-006

### 1.1 Phase 1 Scope

| Feature | Phase 1 | Phase 2+ |
|---------|---------|----------|
| Single approver | ✅ | ✅ |
| Multi-approver/quorum | ❌ | ✅ |
| Sequential approval | ❌ | ✅ |
| Escalation policies | ❌ | ✅ |
| Request changes | ❌ | ✅ |

---

## 2. Inngest Integration

### 2.1 Workflow Pause Pattern

```typescript
// workflows/trade-signal.ts
import { inngest } from '../client';
import { createHITLRequest, sendApprovalNotification } from '../lib/hitl';

export const tradeSignalWorkflow = inngest.createFunction(
  { id: 'trade-signal-approval' },
  { event: 'crypto/signal.generated' },
  async ({ event, step }) => {
    const signal = event.data;

    // step 1: create hitl request
    const hitlRequest = await step.run('create-hitl-request', async () => {
      return createHITLRequest({
        workflowId: event.id,
        actionType: 'trade_execution',
        summary: `Execute ${signal.direction} trade: ${signal.tokenSymbol} at $${signal.entryPrice}`,
        details: signal,
        approvers: [signal.userId],
        expiresIn: '24h',
      });
    });

    // step 2: send notification via novu
    await step.run('send-notification', async () => {
      return sendApprovalNotification(hitlRequest);
    });

    // step 3: wait for approval (up to 24 hours)
    const approval = await step.waitForEvent('wait-for-approval', {
      event: 'hitl/decision',
      match: 'data.requestId',
      timeout: '24h',
    });

    // step 4: handle decision
    if (!approval) {
      return { status: 'expired', requestId: hitlRequest.id };
    }

    if (approval.data.decision === 'rejected') {
      return {
        status: 'rejected',
        requestId: hitlRequest.id,
        reason: approval.data.reason,
      };
    }

    // step 5: execute approved action
    return await step.run('execute-trade', async () => {
      return executeTrade(signal);
    });
  }
);
```

---

## 3. Database Schema (Drizzle ORM)

### 3.1 HITL Requests Table

```typescript
export const hitlStatusEnum = pgEnum('hitl_status', [
  'pending',
  'approved',
  'rejected',
  'expired',
  'canceled',
]);

export const hitlRequests = pgTable('hitl_requests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // workflow reference
  workflowId: uuid('workflow_id').notNull(),
  workflowStepId: varchar('workflow_step_id', { length: 100 }),
  // status
  status: hitlStatusEnum('status').default('pending').notNull(),
  // token
  token: varchar('token', { length: 2048 }).notNull().unique(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  // payload
  actionType: varchar('action_type', { length: 100 }).notNull(),
  summary: text('summary').notNull(),
  details: jsonb('details').$type<Record<string, unknown>>(),
  reasoning: text('reasoning'),
  // policy (Phase 2+)
  policyId: uuid('policy_id'), // .references(() => hitlPolicies.id) in Phase 2
  quorumRequired: integer('quorum_required').default(1),
  // domain context
  domain: varchar('domain', { length: 50 }).notNull(), // 'hr', 'crypto'
  // timing
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => ({
  workflowIdx: index('hitl_requests_workflow_id_idx').on(table.workflowId),
  statusIdx: index('hitl_requests_status_idx').on(table.status),
  tokenIdx: uniqueIndex('hitl_requests_token_idx').on(table.token),
  expiresIdx: index('hitl_requests_expires_at_idx').on(table.tokenExpiresAt),
}));
```

### 3.2 HITL Decisions Table

```typescript
export const hitlDecisionEnum = pgEnum('hitl_decision', [
  'approved',
  'rejected',
  'request_changes', // Phase 2+
]);

export const hitlDecisions = pgTable('hitl_decisions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  requestId: uuid('request_id').references(() => hitlRequests.id, { onDelete: 'cascade' }).notNull(),
  // approver
  approverId: uuid('approver_id').references(() => users.id).notNull(),
  // decision
  decision: hitlDecisionEnum('decision').notNull(),
  comment: text('comment'),
  // channel info
  channel: varchar('channel', { length: 50 }).notNull(), // 'web', 'telegram', 'email'
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  // timing
  decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  requestIdx: index('hitl_decisions_request_id_idx').on(table.requestId),
  approverIdx: index('hitl_decisions_approver_id_idx').on(table.approverId),
}));
```

### 3.3 HITL Policies Table (Phase 2+)

```typescript
// deferred to phase 2 - schema for reference
export const hitlPolicyTypeEnum = pgEnum('hitl_policy_type', [
  'single',      // one approver
  'multi',       // multiple approvers, quorum-based
  'sequential',  // ordered approval chain
]);

export const hitlPolicies = pgTable('hitl_policies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // policy type
  type: hitlPolicyTypeEnum('type').default('single').notNull(),
  // approvers (JSON array of ApproverSpec)
  approvers: jsonb('approvers').$type<ApproverSpec[]>().notNull(),
  quorum: integer('quorum').default(1), // for multi-approver
  // timing
  expiryTTLMinutes: integer('expiry_ttl_minutes').default(15).notNull(),
  // escalation
  escalationEnabled: boolean('escalation_enabled').default(false),
  escalationAfterMinutes: integer('escalation_after_minutes'),
  escalationTo: jsonb('escalation_to').$type<ApproverSpec[]>(),
  // scope
  domain: varchar('domain', { length: 50 }), // null = all domains
  actionTypes: text('action_types').array(), // null = all action types
  // audit
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps,
});

// approverSpec type
interface ApproverSpec {
  type: 'user' | 'role' | 'group';
  id: string;
  required?: boolean; // for sequential: must approve in order
}
```

### 3.4 TypeScript Types

```typescript
interface HITLRequest {
  id: string;
  workflowId: string;
  workflowStepId?: string;
  actionType: string;
  summary: string;
  details: Record<string, unknown>;
  reasoning?: string;
  token: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'canceled';
  policyId?: string;
  quorumRequired: number;
  domain: 'hr' | 'crypto';
  createdAt: Date;
  tokenExpiresAt: Date;
  resolvedAt?: Date;
}

interface HITLDecision {
  id: string;
  requestId: string;
  approverId: string;
  decision: 'approved' | 'rejected' | 'request_changes';
  comment?: string;
  channel: string;
  ipAddress?: string;
  userAgent?: string;
  decidedAt: Date;
}

interface CreateHITLRequestParams {
  workflowId: string;
  workflowStepId?: string;
  actionType: string;
  summary: string;
  details: Record<string, unknown>;
  reasoning?: string;
  approvers: string[];
  expiresIn: string; // e.g., '24h', '1d'
  domain: 'hr' | 'crypto';
  policyId?: string; // Phase 2+
  channels?: ('email' | 'telegram' | 'push')[];
}

---

## 4. Token Security

### 4.1 JWT-Signed Tokens

```typescript
// lib/hitl-token.ts
import { SignJWT, jwtVerify } from 'jose';

const HITL_SECRET = new TextEncoder().encode(process.env.HITL_SECRET);

export async function generateApprovalToken(request: HITLRequest): Promise<string> {
  return new SignJWT({
    requestId: request.id,
    workflowId: request.workflowId,
    action: request.actionType,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(request.expiresAt)
    .setIssuedAt()
    .sign(HITL_SECRET);
}

export async function verifyApprovalToken(token: string): Promise<{
  requestId: string;
  workflowId: string;
  action: string;
}> {
  const { payload } = await jwtVerify(token, HITL_SECRET);
  return {
    requestId: payload.requestId as string,
    workflowId: payload.workflowId as string,
    action: payload.action as string,
  };
}
```

---

## 5. API Endpoints

### 5.1 Approve Request

```typescript
// POST /api/hitl/:requestId/approve
router.post('/api/hitl/:requestId/approve', authenticate, async (req, res) => {
  const { requestId } = req.params;
  const { token, comment } = req.body;

  // verify token
  const tokenPayload = await verifyApprovalToken(token);
  if (tokenPayload.requestId !== requestId) {
    return res.status(401).json({ error: 'Token mismatch' });
  }

  // get request
  const request = await db.hitlRequests.findById(requestId);
  if (!request || request.status !== 'pending') {
    return res.status(404).json({ error: 'Request not found or already decided' });
  }

  // check expiry
  if (new Date() > request.expiresAt) {
    await db.hitlRequests.update(requestId, { status: 'expired' });
    return res.status(410).json({ error: 'Request expired' });
  }

  // record decision
  await db.hitlRequests.update(requestId, {
    status: 'approved',
    decidedAt: new Date(),
    decisionReason: comment,
    decisionChannel: req.headers['x-approval-channel'] || 'web',
  });

  // signal inngest workflow
  await inngest.send({
    name: 'hitl/decision',
    data: {
      requestId,
      workflowId: request.workflowId,
      decision: 'approved',
      reason: comment,
      approvedBy: req.user.id,
    },
  });

  // audit log
  await auditLog({
    action: 'HITL_APPROVED',
    resourceType: 'hitl_request',
    resourceId: requestId,
    actorId: req.user.id,
    metadata: { actionType: request.actionType, comment },
  });

  res.json({ status: 'approved' });
});
```

### 5.2 Reject Request

```typescript
// POST /api/hitl/:requestId/reject
router.post('/api/hitl/:requestId/reject', authenticate, async (req, res) => {
  const { requestId } = req.params;
  const { token, reason } = req.body;

  // similar verification as approve...

  await db.hitlRequests.update(requestId, {
    status: 'rejected',
    decidedAt: new Date(),
    decisionReason: reason,
    decisionChannel: req.headers['x-approval-channel'] || 'web',
  });

  await inngest.send({
    name: 'hitl/decision',
    data: {
      requestId,
      workflowId: request.workflowId,
      decision: 'rejected',
      reason,
      rejectedBy: req.user.id,
    },
  });

  await auditLog({
    action: 'HITL_REJECTED',
    resourceType: 'hitl_request',
    resourceId: requestId,
    actorId: req.user.id,
    metadata: { actionType: request.actionType, reason },
  });

  res.json({ status: 'rejected' });
});
```

---

## 6. Notification Integration

```typescript
// lib/hitl-notification.ts
import { novu } from '../lib/novu';

export async function sendApprovalNotification(request: HITLRequest): Promise<void> {
  const approvalUrl = `${APP_URL}/approve/${request.id}?token=${request.token}`;
  const rejectUrl = `${APP_URL}/reject/${request.id}?token=${request.token}`;

  await novu.trigger('hitl-approval-request', {
    to: { subscriberId: request.approverId },
    payload: {
      actionType: request.actionType,
      summary: request.summary,
      approvalUrl,
      rejectUrl,
      expiresAt: request.expiresAt.toISOString(),
    },
  });
}
```

---

## 7. Expiry Handling

```typescript
// scheduled job: expire pending requests
export const expireHITLRequests = inngest.createFunction(
  { id: 'expire-hitl-requests' },
  { cron: '*/5 * * * *' }, // every 5 minutes
  async ({ step }) => {
    const expired = await step.run('find-expired', async () => {
      return db.hitlRequests.findMany({
        where: {
          status: 'pending',
          expiresAt: { lt: new Date() },
        },
      });
    });

    for (const request of expired) {
      await step.run(`expire-${request.id}`, async () => {
        await db.hitlRequests.update(request.id, { status: 'expired' });

        // signal workflow that request expired
        await inngest.send({
          name: 'hitl/decision',
          data: {
            requestId: request.id,
            workflowId: request.workflowId,
            decision: 'expired',
          },
        });
      });
    }

    return { expiredCount: expired.length };
  }
);
```

---

## 8. Approval Policy Engine (Phase 2+)

### 8.1 Policy Evaluation

```typescript
type PolicyResult = 'pending' | 'approved' | 'rejected';

async function evaluatePolicy(
  request: HITLRequest,
  decisions: HITLDecision[]
): Promise<PolicyResult> {
  const policy = await getPolicy(request.policyId);

  switch (policy.type) {
    case 'single':
      return evaluateSingle(decisions);

    case 'multi':
      return evaluateMulti(decisions, policy.quorum, policy.approvers.length);

    case 'sequential':
      return evaluateSequential(decisions, policy.approvers);

    default:
      throw new Error(`Unknown policy type: ${policy.type}`);
  }
}

function evaluateSingle(decisions: HITLDecision[]): PolicyResult {
  if (decisions.length === 0) return 'pending';
  return decisions[0].decision === 'approved' ? 'approved' : 'rejected';
}

function evaluateMulti(
  decisions: HITLDecision[],
  quorum: number,
  totalApprovers: number
): PolicyResult {
  const approvals = decisions.filter(d => d.decision === 'approved').length;
  const rejections = decisions.filter(d => d.decision === 'rejected').length;

  if (approvals >= quorum) return 'approved';
  if (rejections > totalApprovers - quorum) return 'rejected';
  return 'pending';
}

function evaluateSequential(
  decisions: HITLDecision[],
  approvers: ApproverSpec[]
): PolicyResult {
  const requiredApprovers = approvers.filter(a => a.required !== false);

  for (let i = 0; i < requiredApprovers.length; i++) {
    const decision = decisions.find(d => matchesApprover(d.approverId, requiredApprovers[i]));
    if (!decision) return 'pending';
    if (decision.decision === 'rejected') return 'rejected';
  }

  return 'approved';
}
```

### 8.2 Policy Examples (Phase 2+)

```typescript
// single approver (phase 1 default)
const singlePolicy: HITLPolicy = {
  type: 'single',
  approvers: [{ type: 'role', id: 'trading_lead' }],
  quorum: 1,
  expiryTTLMinutes: 15,
};

// multi-approver with quorum (phase 2+)
const multiPolicy: HITLPolicy = {
  type: 'multi',
  approvers: [
    { type: 'user', id: 'user-1' },
    { type: 'user', id: 'user-2' },
    { type: 'user', id: 'user-3' },
  ],
  quorum: 2, // 2 of 3 must approve
  expiryTTLMinutes: 60,
};

// sequential approval chain (phase 2+)
const sequentialPolicy: HITLPolicy = {
  type: 'sequential',
  approvers: [
    { type: 'role', id: 'recruiter', required: true },
    { type: 'role', id: 'hiring_manager', required: true },
    { type: 'role', id: 'hr_director', required: false }, // optional
  ],
  expiryTTLMinutes: 1440, // 24 hours
};
```

---

## 9. Audit Integration

### 9.1 Audited Events

| Event | Trigger | Metadata |
|-------|---------|----------|
| `HITL_REQUEST_CREATED` | Request created | actionType, domain, policyId |
| `HITL_DECISION_RECORDED` | Approver decides | decision, channel, approverId |
| `HITL_REQUEST_RESOLVED` | Policy evaluation complete | finalStatus, totalDecisions |
| `HITL_REQUEST_EXPIRED` | TTL exceeded | originalExpiry |
| `HITL_REQUEST_CANCELED` | Workflow canceled | reason |

### 9.2 Audit Log Entry

```typescript
async function auditHITLDecision(request: HITLRequest, decision: HITLDecision): Promise<void> {
  await auditService.log({
    action: 'HITL_DECISION_RECORDED',
    resourceType: 'hitl_request',
    resourceId: request.id,
    actorId: decision.approverId,
    domain: request.domain,
    metadata: {
      decision: decision.decision,
      channel: decision.channel,
      comment: decision.comment,
      actionType: request.actionType,
      workflowId: request.workflowId,
    },
  });
}
```

---

## 10. Error Types

```typescript
type HITLError =
  | { _tag: 'TokenExpired' }
  | { _tag: 'TokenInvalid'; cause: unknown }
  | { _tag: 'RequestNotFound'; requestId: string }
  | { _tag: 'RequestAlreadyResolved'; status: string }
  | { _tag: 'UnauthorizedApprover'; userId: string }
  | { _tag: 'PolicyViolation'; message: string };
```

---

## 11. Phase 2+ Roadmap

- Multi-approver with quorum (e.g., 2 of 3 must approve)
- Sequential approval chains
- Escalation policies (notify manager after X hours)
- Delegation (approve on behalf of)
- Request changes (does NOT resolve workflow, just records feedback)
- Approval dashboard with filtering

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Pause Workflow for Human Decision | platform-core-frd.md | FR-CORE-HITL-001 |
| Approval Token Security | platform-core-frd.md | FR-CORE-HITL-002 |
| Timeout and Escalation | platform-core-frd.md | FR-CORE-HITL-003 |
| Approval Metadata | platform-core-frd.md | FR-CORE-HITL-004 |
| Approval Policies | platform-core-frd.md | FR-CORE-HITL-005 |
| HITL Notification | platform-core-frd.md | FR-CORE-HITL-006 |
| HITL Gateway | platform-core-add.md | Section 4 |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| Trade Signal Approvals | crypto/workflow-engine.md | HITL integration |
| Contract Approvals | hr/workflow-automation.md | HITL integration |
