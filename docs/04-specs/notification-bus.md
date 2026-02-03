---
id: SPEC-NOTIFICATION-BUS
title: Notification Bus Specification (Novu Integration)
status: Draft
version: 2.0.0
owner: '@owner'
last_updated: '2026-02-03'
parent: ../03-architecture/platform-core-add.md
---
# Notification Bus Specification

**Platform Core – Novu Integration for Multi-Channel Notifications**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v2.0.0 | 2026-02-03 | Multi-Model Consensus | Replaced custom notification bus with Novu SaaS |
| v1.0.0 | 2026-02-02 | Initial | Custom notification bus (superseded) |

---

## 1. Overview

The Notification Bus provides unified delivery for all user communications across multiple channels. Per **multi-model consensus**, this is implemented using **Novu** (SaaS) instead of a custom build.

### 1.1 FRD Requirements Implemented

| Requirement | Description | Implementation |
|-------------|-------------|----------------|
| FR-CORE-NOTIF-001 | Send notifications via multiple channels | Novu multi-channel |
| FR-CORE-NOTIF-002 | Template-based messaging | Novu template engine |
| FR-CORE-NOTIF-003 | Priority routing and quiet hours | Novu preferences |

### 1.2 Why Novu (Buy vs Build Decision)

| Aspect | Custom Build | Novu SaaS |
|--------|--------------|-----------|
| **Dev Time** | ~3 weeks | ~2 days integration |
| **Channels** | Build each provider | 15+ pre-built |
| **Templates** | Build Handlebars engine | Visual editor + API |
| **Preferences** | Build preference system | Built-in preference center |
| **Cost** | Infrastructure + maintenance | 10K events/mo free |

**Multi-Model Consensus**: Building a custom notification bus is not defensible when SaaS handles templating, routing, and quiet hours out of the box.

---

## 2. Novu Integration

### 2.1 Setup

```typescript
// lib/novu.ts
import { Novu } from '@novu/node';

export const novu = new Novu(process.env.NOVU_API_KEY);

// sync subscribers on user creation
export async function syncSubscriber(user: User): Promise<void> {
  await novu.subscribers.identify(user.id, {
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    data: {
      timezone: user.timezone ?? 'Asia/Manila',
      domain: user.domain,
    },
  });
}
```

### 2.2 Notification Dispatch

```typescript
// lib/notifications.ts
import { novu } from './novu';

interface NotificationParams {
  templateId: string;
  subscriberId: string;
  payload: Record<string, unknown>;
  overrides?: {
    channels?: string[];
  };
}

export async function sendNotification(params: NotificationParams): Promise<void> {
  await novu.trigger(params.templateId, {
    to: { subscriberId: params.subscriberId },
    payload: params.payload,
    overrides: params.overrides,
  });
}

// example: HITL approval request
export async function sendApprovalNotification(request: HITLRequest): Promise<void> {
  const approvalUrl = `${APP_URL}/approve/${request.id}?token=${request.token}`;
  const rejectUrl = `${APP_URL}/reject/${request.id}?token=${request.token}`;

  await sendNotification({
    templateId: 'hitl-approval-request',
    subscriberId: request.approverId,
    payload: {
      actionType: request.actionType,
      summary: request.summary,
      approvalUrl,
      rejectUrl,
      expiresAt: request.tokenExpiresAt.toISOString(),
    },
  });
}

// example: LLM budget warning
export async function sendBudgetWarning(domain: string, budget: BudgetStatus): Promise<void> {
  await sendNotification({
    templateId: 'llm-budget-warning',
    subscriberId: 'admin', // or team channel
    payload: {
      domain,
      dailyUsed: budget.dailyUsed.toFixed(2),
      dailyLimit: budget.dailyLimit,
      monthlyUsed: budget.monthlyUsed.toFixed(2),
      monthlyLimit: budget.monthlyLimit,
    },
  });
}
```

---

## 3. Novu Templates (Configured in Novu Dashboard)

### 3.1 Core Templates

| Template ID | Channels | Purpose |
|-------------|----------|---------|
| `hitl-approval-request` | Email, Push, In-App | Request human approval |
| `hitl-decision-made` | Email, In-App | Notify requester of decision |
| `llm-budget-warning` | Email, Slack | Budget threshold alert |
| `workflow-error` | Email, Slack | Workflow failure notification |
| `welcome` | Email | New user onboarding |

### 3.2 Domain-Specific Templates

**Crypto Domain:**

| Template ID | Channels | Purpose |
|-------------|----------|---------|
| `crypto-signal-alert` | Push, Telegram | Trading signal notification |
| `crypto-trade-executed` | Email, In-App | Trade confirmation |
| `crypto-wallet-alert` | Push, Telegram | Smart money movement |

**HR Domain:**

| Template ID | Channels | Purpose |
|-------------|----------|---------|
| `hr-interview-reminder` | Email, SMS | Upcoming interview |
| `hr-contract-ready` | Email, In-App | Contract awaiting signature |
| `hr-candidate-update` | Email | Pipeline status change |

---

## 4. User Preferences (Novu Preference Center)

### 4.1 Preference Categories

```typescript
// configured in Novu dashboard
const preferenceCategories = [
  {
    id: 'critical',
    name: 'Critical Alerts',
    description: 'Security and approval requests',
    channels: ['email', 'push', 'in_app'],
    defaultEnabled: true,
    canDisable: false, // always on
  },
  {
    id: 'trading',
    name: 'Trading Notifications',
    description: 'Signals, executions, and market alerts',
    channels: ['email', 'push', 'telegram'],
    defaultEnabled: true,
    canDisable: true,
  },
  {
    id: 'hr',
    name: 'HR Notifications',
    description: 'Interviews, contracts, and pipeline updates',
    channels: ['email', 'in_app'],
    defaultEnabled: true,
    canDisable: true,
  },
  {
    id: 'digest',
    name: 'Daily Digest',
    description: 'Summary of low-priority notifications',
    channels: ['email'],
    defaultEnabled: true,
    canDisable: true,
  },
];
```

### 4.2 Quiet Hours

Novu handles quiet hours per subscriber timezone automatically when configured in the dashboard.

---

## 5. Workflow Integration

### 5.1 Inngest + Novu Pattern

```typescript
// workflows/smart-money.ts
import { inngest } from '../client';
import { sendNotification } from '../lib/notifications';

export const smartMoneyWorkflow = inngest.createFunction(
  { id: 'smart-money-tracking' },
  { event: 'crypto/wallet.transaction' },
  async ({ event, step }) => {
    const transaction = event.data;

    // analyze transaction
    const analysis = await step.run('analyze', async () => {
      return analyzeTransaction(transaction);
    });

    // notify user if significant
    if (analysis.isSignificant) {
      await step.run('notify', async () => {
        await sendNotification({
          templateId: 'crypto-wallet-alert',
          subscriberId: transaction.userId,
          payload: {
            walletAddress: transaction.from,
            tokenSymbol: transaction.token,
            amount: transaction.amount,
            action: transaction.type,
            significance: analysis.reason,
          },
        });
      });
    }

    return { analyzed: true, notified: analysis.isSignificant };
  }
);
```

---

## 6. Database Schema (Minimal)

Novu handles delivery tracking. We only store a reference for audit purposes.

```typescript
export const notificationRefs = pgTable('notification_refs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // novu reference
  novuTransactionId: varchar('novu_transaction_id', { length: 255 }).notNull(),
  // context
  templateId: varchar('template_id', { length: 100 }).notNull(),
  subscriberId: varchar('subscriber_id', { length: 255 }).notNull(),
  workflowId: uuid('workflow_id'),
  domain: varchar('domain', { length: 50 }),
  // timing
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  novuIdx: index('notification_refs_novu_idx').on(table.novuTransactionId),
  workflowIdx: index('notification_refs_workflow_idx').on(table.workflowId),
}));
```

---

## 7. Error Handling

```typescript
type NotificationError =
  | { _tag: 'SubscriberNotFound'; subscriberId: string }
  | { _tag: 'TemplateNotFound'; templateId: string }
  | { _tag: 'NovuAPIError'; statusCode: number; message: string }
  | { _tag: 'RateLimited'; retryAfter: number };

async function sendNotificationSafe(
  params: NotificationParams
): Promise<Result<void, NotificationError>> {
  try {
    await novu.trigger(params.templateId, {
      to: { subscriberId: params.subscriberId },
      payload: params.payload,
    });
    return Result.ok(undefined);
  } catch (error) {
    if (error.statusCode === 404) {
      return Result.err({ _tag: 'TemplateNotFound', templateId: params.templateId });
    }
    if (error.statusCode === 429) {
      return Result.err({ _tag: 'RateLimited', retryAfter: error.retryAfter ?? 60 });
    }
    return Result.err({ _tag: 'NovuAPIError', statusCode: error.statusCode, message: error.message });
  }
}
```

---

## 8. Configuration

```typescript
const notificationConfig = z.object({
  // novu
  NOVU_API_KEY: z.string().min(1),
  NOVU_APP_ID: z.string().min(1).optional(), // for in-app notifications

  // app urls (for links in notifications)
  APP_URL: z.string().url(),

  // defaults
  DEFAULT_TIMEZONE: z.string().default('Asia/Manila'),
}).parse(process.env);
```

---

## 9. Migration from Custom (if applicable)

If migrating from a custom notification system:

1. **Subscriber Sync**: Batch migrate users to Novu subscribers
2. **Template Migration**: Recreate templates in Novu dashboard
3. **Preference Migration**: Map existing preferences to Novu categories
4. **Parallel Run**: Run both systems for 1 week, compare delivery
5. **Cutover**: Switch to Novu-only, deprecate custom

---

## Appendix: Superseded Custom Implementation

The original custom notification bus specification (v1.0.0) included:

- Custom Handlebars template engine
- Custom digest scheduling
- Custom quiet hours logic
- Custom channel providers (Email, Telegram, Push, SMS)

These are now handled by Novu SaaS. The original specification is preserved in git history for reference.

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Multi-Channel Notifications | platform-core-frd.md | FR-CORE-NOTIF-001 |
| Template-Based Messaging | platform-core-frd.md | FR-CORE-NOTIF-002 |
| Priority and Quiet Hours | platform-core-frd.md | FR-CORE-NOTIF-003 |
| Notification Service | platform-core-add.md | Section 6 |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| Trade Alert Notifications | crypto/workflow-engine.md | Notification triggers |
| Interview Reminders | hr/workflow-automation.md | Notification triggers |

---

**END OF NOTIFICATION BUS SPECIFICATION**
