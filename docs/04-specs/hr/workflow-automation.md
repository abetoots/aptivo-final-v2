---
id: TSD-HR-WORKFLOW
title: Workflow Automation Module Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
parent: ../../03-architecture/platform-core-add.md
---
# Workflow Automation Module Specification

**FRD Reference:** WA1-WA3 (Section 3.2)

---

## 1. Module Overview

### 1.1 Purpose

Automate repetitive HR workflows through configurable triggers, actions, and sequences to reduce manual administrative burden.

### 1.2 Success Metric

Per BRD v2.0.0: **Automate 60% of routine HR administrative tasks within 12 months of launch.**

### 1.3 Scope

| Feature | FRD Ref | Status |
|---------|---------|--------|
| Visual Workflow Builder | WA1 | ✅ Specified |
| Trigger-Action System | WA2 | ✅ Specified |
| Multi-Step Sequences | WA3 | ✅ Specified |

---

## 2. Architecture Decision

> **⚠️ Strategic Note:** Per BRD v2.0.0, Workflow Automation is classified as **Core Domain (Custom Build)**.
> This specification defines a custom Workflow Engine that owns business logic while leveraging
> Inngest for durable, event-driven workflow execution. This approach balances the BRD mandate for
> custom capability with engineering pragmatism.

### 2.1 Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Workflow Automation                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐│
│  │   Builder    │   │   Engine     │   │      Executor            ││
│  │   (UI)       │   │   (Core)     │   │      (Runtime)           ││
│  └──────────────┘   └──────────────┘   └──────────────────────────┘│
│        │                   │                       │                │
│        │ CRUD definitions  │ Event subscription    │ Step execution │
│        ▼                   ▼                       ▼                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    PostgreSQL + Inngest (Durable Execution)   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

| Component | Responsibility |
|-----------|---------------|
| **Builder** | Visual workflow definition, step configuration |
| **Engine** | Workflow lifecycle, state management, saga orchestration |
| **Executor** | Step execution, retry logic, compensation |

---

## 3. Service Dependencies

```typescript
interface WorkflowServiceDeps extends BaseDependencies {
  // repositories
  definitionRepo: WorkflowDefinitionRepository;
  executionRepo: WorkflowExecutionRepository;

  // action executors
  actionRegistry: ActionRegistry;

  // event bus
  eventBus: EventBus;

  // metrics
  metrics: MetricsClient;
}

interface ActionRegistry {
  register(actionType: string, executor: ActionExecutor): void;
  get(actionType: string): ActionExecutor | undefined;
  list(): ActionType[];
}

interface ActionExecutor {
  execute(context: ActionContext): Promise<Result<ActionResult, ActionError>>;
  compensate?(context: ActionContext, previousResult: ActionResult): Promise<Result<void, ActionError>>;
  validate(config: unknown): ValidationResult;
}
```

---

## 4. Domain Types

### 4.1 Workflow Definition

```typescript
import { z } from 'zod';

// trigger types
export const TriggerTypeSchema = z.enum([
  'event',           // react to domain events
  'schedule',        // cron-based
  'manual',          // user-initiated
  'webhook',         // external HTTP trigger
]);

// workflow definition schema
export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable(),
  status: z.enum(['draft', 'active', 'deprecated', 'archived']),

  // trigger configuration
  trigger: z.object({
    type: TriggerTypeSchema,
    config: z.record(z.unknown()),
  }),

  // workflow steps
  steps: z.array(WorkflowStepSchema),

  // settings
  settings: z.object({
    maxRetries: z.number().int().min(0).max(10).default(3),
    timeoutSeconds: z.number().int().min(60).max(3600).default(300),
    enableCompensation: z.boolean().default(true),
  }),

  // versioning
  version: z.number().int().positive(),
  publishedAt: z.date().nullable(),

  // audit
  createdById: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
```

### 4.2 Workflow Step

```typescript
export const WorkflowStepSchema = z.object({
  id: z.string(),                    // unique within workflow
  name: z.string().max(100),
  type: z.string(),                  // action type from registry
  config: z.record(z.unknown()),     // action-specific configuration

  // flow control
  dependsOn: z.array(z.string()).default([]),   // step IDs
  condition: z.string().optional(),              // JSONPath expression

  // error handling
  onError: z.enum(['fail', 'continue', 'compensate']).default('fail'),
  retryConfig: z.object({
    maxAttempts: z.number().int().min(0).max(5).default(3),
    backoffMultiplier: z.number().min(1).max(10).default(2),
    initialDelayMs: z.number().int().min(100).max(60000).default(1000),
  }).optional(),

  // compensation
  compensateAction: z.object({
    type: z.string(),
    config: z.record(z.unknown()),
  }).optional(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
```

### 4.3 Workflow Execution

```typescript
export const ExecutionStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'canceled',
  'compensating',
  'compensated',
]);

export const WorkflowExecutionSchema = z.object({
  id: z.string().uuid(),
  definitionId: z.string().uuid(),
  definitionVersion: z.number().int(),

  // state
  status: ExecutionStatusSchema,
  currentStepId: z.string().nullable(),

  // context
  triggerData: z.record(z.unknown()),
  variables: z.record(z.unknown()),    // accumulated from step outputs

  // step results
  stepResults: z.array(z.object({
    stepId: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped', 'compensated']),
    startedAt: z.date().nullable(),
    completedAt: z.date().nullable(),
    output: z.record(z.unknown()).nullable(),
    error: z.string().nullable(),
    attempts: z.number().int(),
  })),

  // correlation
  correlationId: z.string().nullable(),

  // timing
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),

  // error
  errorMessage: z.string().nullable(),

  // audit
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;
```

---

## 5. Built-in Action Types

### 5.1 Action Registry

| Action Type | Description | Configuration |
|------------|-------------|---------------|
| `send_email` | Send email via template | `{ templateId, recipientExpr, variables }` |
| `update_entity` | Update database entity | `{ entityType, entityId, changes }` |
| `http_request` | External HTTP call | `{ url, method, headers, body }` |
| `delay` | Wait for duration | `{ durationMs }` |
| `condition` | Branch on condition | `{ expression, trueBranch, falseBranch }` |
| `parallel` | Execute steps in parallel | `{ steps }` |
| `publish_event` | Emit domain event | `{ subject, payload }` |
| `create_task` | Create user task | `{ assignee, title, description }` |

### 5.2 Action Interface

```typescript
interface ActionContext {
  execution: WorkflowExecution;
  step: WorkflowStep;
  variables: Record<string, unknown>;
  services: {
    email: EmailService;
    http: HttpClient;
    eventBus: EventBus;
  };
  logger: Logger;
}

interface ActionResult {
  output: Record<string, unknown>;
  logs?: string[];
}

type ActionError =
  | { _tag: 'ConfigurationError'; message: string }
  | { _tag: 'ExecutionError'; message: string; cause?: unknown }
  | { _tag: 'TimeoutError'; timeoutMs: number }
  | { _tag: 'RetryableError'; message: string; retryAfterMs?: number };
```

### 5.3 Example: Send Email Action

```typescript
const sendEmailAction: ActionExecutor = {
  async execute(context: ActionContext): Promise<Result<ActionResult, ActionError>> {
    const { templateId, recipientExpr, variables } = context.step.config as SendEmailConfig;

    // resolve recipient from expression (e.g., "$.candidate.email")
    const recipient = resolveExpression(recipientExpr, context.variables);

    if (!recipient) {
      return err({ _tag: 'ConfigurationError', message: 'Could not resolve recipient' });
    }

    const result = await context.services.email.sendTemplatedEmail({
      templateId,
      to: recipient,
      variables: {
        ...context.variables,
        ...variables,
      },
    });

    if (!result.ok) {
      return err({ _tag: 'RetryableError', message: 'Email send failed', retryAfterMs: 5000 });
    }

    return ok({ output: { emailSent: true, recipient } });
  },

  validate(config: unknown): ValidationResult {
    const schema = z.object({
      templateId: z.string().uuid(),
      recipientExpr: z.string(),
      variables: z.record(z.unknown()).optional(),
    });
    return schema.safeParse(config);
  },
};
```

---

## 6. Trigger System

### 6.1 Event Trigger

Subscribe to domain events:

```typescript
// trigger configuration
interface EventTriggerConfig {
  eventPattern: string;           // e.g., "aptivo.candidate.status-changed"
  filter?: {                      // optional payload filter
    expression: string;           // JSONPath expression
    value: unknown;               // expected value
  };
}

// example: trigger when candidate moves to "offer" status
{
  type: 'event',
  config: {
    eventPattern: 'aptivo.candidate.status-changed',
    filter: {
      expression: '$.newStatus',
      value: 'offer'
    }
  }
}
```

### 6.2 Schedule Trigger

Cron-based scheduling:

```typescript
interface ScheduleTriggerConfig {
  cron: string;                   // cron expression
  timezone: string;               // IANA timezone
  inputTemplate?: Record<string, unknown>;  // static input data
}

// example: daily at 9am Manila time
{
  type: 'schedule',
  config: {
    cron: '0 9 * * *',
    timezone: 'Asia/Manila'
  }
}
```

### 6.3 Manual Trigger

User-initiated with optional input form:

```typescript
interface ManualTriggerConfig {
  inputSchema?: z.ZodSchema;      // input validation schema
  requiredRole?: string;          // RBAC role required
}
```

---

## 7. Saga Pattern Implementation

### 7.1 Compensation Flow

When a step fails with `onError: 'compensate'`:

```
Step 1 ✓ → Step 2 ✓ → Step 3 ✗ (fails)
                            │
                            ▼
                      Compensate Step 2
                            │
                            ▼
                      Compensate Step 1
                            │
                            ▼
                      Execution: compensated
```

### 7.2 YAML Saga Definition

```yaml
name: candidate-onboarding
version: 1.0.0
description: Complete candidate onboarding after contract signing

trigger:
  type: event
  config:
    eventPattern: aptivo.contract.signed

steps:
  - id: create-user-account
    name: Create User Account
    type: http_request
    config:
      url: "{{ env.IAM_SERVICE_URL }}/users"
      method: POST
      body:
        email: "{{ $.candidate.email }}"
        name: "{{ $.candidate.firstName }} {{ $.candidate.lastName }}"
        role: employee
    compensateAction:
      type: http_request
      config:
        url: "{{ env.IAM_SERVICE_URL }}/users/{{ steps.create-user-account.output.userId }}"
        method: DELETE

  - id: provision-equipment
    name: Request Equipment Provisioning
    type: create_task
    dependsOn: [create-user-account]
    config:
      assignee: it-team
      title: "Provision equipment for {{ $.candidate.firstName }}"
      description: |
        New hire starting {{ $.contract.startDate }}
        - Laptop
        - Monitor
        - Access badge

  - id: send-welcome-kit
    name: Send Welcome Email
    type: send_email
    dependsOn: [create-user-account]
    config:
      templateId: welcome-new-hire
      recipientExpr: "$.candidate.email"
      variables:
        startDate: "{{ $.contract.startDate }}"
        userId: "{{ steps.create-user-account.output.userId }}"

settings:
  maxRetries: 3
  timeoutSeconds: 600
  enableCompensation: true
```

---

## 8. API Endpoints

### 8.1 Workflow Definitions

#### GET /api/v1/workflows

List workflow definitions.

```typescript
// query parameters
interface ListWorkflowsQuery {
  status?: 'draft' | 'active' | 'deprecated' | 'archived';
  page?: number;
  pageSize?: number;
}
```

#### POST /api/v1/workflows

Create workflow definition.

```typescript
// request: WorkflowDefinition (without id, timestamps)
// response: 201 Created with WorkflowDefinition
```

#### PUT /api/v1/workflows/{id}

Update workflow (creates new version if published).

#### POST /api/v1/workflows/{id}/publish

Publish workflow (activates it).

```typescript
// response: 200 OK
// errors: 400 (ValidationError - invalid workflow)
```

### 8.2 Workflow Executions

#### GET /api/v1/workflows/{id}/executions

List executions for a workflow.

#### POST /api/v1/workflows/{id}/trigger

Manually trigger workflow execution.

```typescript
// request
interface TriggerWorkflowRequest {
  input?: Record<string, unknown>;
  correlationId?: string;
}

// response: 202 Accepted with executionId
```

#### GET /api/v1/executions/{id}

Get execution details and step results.

#### POST /api/v1/executions/{id}/cancel

Cancel running execution.

---

## 9. Event Catalog

| Event | When | Payload |
|-------|------|---------|
| `aptivo.workflow.triggered` | Execution started | `{ executionId, workflowId, triggeredBy }` |
| `aptivo.workflow.step-started` | Step begins | `{ executionId, stepId }` |
| `aptivo.workflow.step-completed` | Step succeeds | `{ executionId, stepId, output }` |
| `aptivo.workflow.step-failed` | Step fails | `{ executionId, stepId, error }` |
| `aptivo.workflow.completed` | Execution finishes | `{ executionId, status, duration }` |
| `aptivo.workflow.compensating` | Compensation started | `{ executionId, failedStepId }` |

---

## 10. Non-Functional Requirements

### 10.1 Performance

| Metric | Target |
|--------|--------|
| Workflow trigger latency | < 100ms |
| Step execution overhead | < 50ms |
| Concurrent executions | 100+ per workflow |

### 10.2 Reliability

- **At-least-once delivery:** Steps may execute multiple times; actions must be idempotent
- **Saga compensation:** Automatic rollback on failure (configurable)
- **Dead letter queue:** Failed executions after max retries

### 10.3 Observability

- Execution traces linked to OpenTelemetry
- Step-level metrics (duration, success rate)
- Alert on execution failure rate > 5%

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Workflow automation requirements | [hr-domain-frd.md](../../02-requirements/hr-domain-frd.md) | FR-HR-WA-001 through FR-HR-WA-003 |
| Administrative task automation goal | [brd.md](../../01-strategy/brd.md) | Section 2.2 (HR Domain) |
| Event-driven architecture | [platform-core-add.md](../../03-architecture/platform-core-add.md) | Section 10.1 |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| Workflow database schema | [database.md](../database.md) | Section 3 (Workflow Tables) |
| Event patterns | [common-patterns.md](../common-patterns.md) | Section 5 (Event Patterns) |
| Worker process architecture | [project-structure.md](../project-structure.md) | Section 7 (Worker App) |
