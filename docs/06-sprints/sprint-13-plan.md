# Sprint 13 Implementation Plan: Notifications + Platform Features

**Theme**: "Deliver, discover, decide" — notification resilience, workflow CRUD, extensible hooks, runtime feature flags, consent compliance
**Duration**: 2 weeks (Phase 2, Weeks 9-10)
**Total Story Points**: 29 SP (10 tasks)
**Packages**: `@aptivo/notifications` (SMTP fallback, monitoring, routing, per-approver webhooks) + `apps/web` (workflow CRUD, webhooks, feature flags, consent, anomaly detection, composition root, integration) + `@aptivo/database` (adapters, schema) + `@aptivo/audit` (anomaly detection)
**FRD Coverage**: FR-CORE-NOTIF-003 (priority routing + quiet hours), FR-CORE-INT-001 (workflow definition CRUD), FR-CORE-INT-002 (extensible webhook action points), RR-6 (anomaly detection for bulk data access)
**Sprint 12 Residuals**: 2/2 absorbed — OBS-05 (anomaly detection, deferred from S12) + per-approver webhook notifications (deferred from S12)
**Derived from**: [Phase 2 Sprint Plan](./phase-2-sprint-plan.md) Sprint 5, [S12 Plan](./sprint-12-plan.md) §9
**Multi-Model Review**: [S13_PLAN_MULTI_REVIEW.md](./S13_PLAN_MULTI_REVIEW.md) — Claude Opus 4.6 + Codex/GPT

---

## Executive Summary

Sprint 13 broadens the notification subsystem with SMTP failover (NOTIF2-01), silent-drop monitoring (NOTIF2-02), priority routing with quiet-hours enforcement (NOTIF2-03), and per-approver webhook notifications (NOTIF2-04). In parallel, the platform grows a workflow definition CRUD API (FEAT-01), extensible webhook action points (FEAT-02), a runtime feature flag service (FEAT-03), and a consent withdrawal API (FEAT-04). The observability track gains anomaly detection for bulk PII access (OBS-05), building on the PII read audit trail shipped in Sprint 12 (OBS-04). Two Sprint 12 deferred items are absorbed: OBS-05 (anomaly detection, 3 SP) and per-approver webhook notifications (2 SP).

The notification track hardens delivery reliability: SMTP fallback ensures HITL approval notifications reach approvers even when Novu is degraded, while silent-drop monitoring detects discrepancies between Novu's acknowledgement and actual delivery. Priority routing (FR-CORE-NOTIF-003) introduces four priority tiers and per-user quiet-hours windows so that critical alerts always get through while normal notifications respect off-hours preferences.

The platform features track lays the foundation for a visual workflow builder (Sprint 14): FEAT-01 delivers a versioned workflow definition CRUD API with Zod step schema validation, FEAT-02 adds extensible webhook action points that fire on workflow lifecycle events, and FEAT-03 provides a runtime feature flag service with a local JSON provider and an interface ready for LaunchDarkly/Unleash in Sprint 14. The consent withdrawal API (FEAT-04) satisfies DPA Article 7 requirements by exposing a POST endpoint that records consent changes in the audit trail and emits an Inngest event for downstream processors.

### Sprint 12 Baseline (What Exists)

| Component | Sprint 12 State | Sprint 13 Target |
|-----------|----------------|-----------------|
| Notification delivery | Novu adapter only, no failover | Novu primary + SMTP fallback with failover policy |
| Delivery monitoring | Delivery log per-attempt | Silent-drop detection comparing ack vs receipt |
| Notification routing | All notifications same priority | 4-tier priority routing with per-user quiet hours |
| Workflow definitions | Hard-coded Inngest function definitions | CRUD API with versioning, draft/active/archived lifecycle |
| Webhooks | No webhook support | Extensible action points on workflow lifecycle events |
| Feature flags | No feature flag infrastructure | Local JSON provider with LaunchDarkly-ready interface |
| Consent management | No consent withdrawal mechanism | API + audit trail + Inngest event (MVP) |
| Per-approver webhooks | Multi-approver tokens exist (S11) | Webhook notification per approver on HITL request |
| Anomaly detection | PII read audit trail captured (OBS-04) | Rule-based anomaly detection on PII access patterns |

---

## 1. Task Breakdown

### Phase 1: Notification Resilience (Days 1-4)

#### NOTIF2-01: SMTP Fallback for HITL Notifications (3 SP)

**Description**: Build an `SmtpAdapter` that implements the existing `NotificationAdapter` interface and wire a failover policy into the notification service. When the primary Novu adapter returns a `DeliveryFailed` error, the service automatically retries via the SMTP adapter. The SMTP adapter uses `nodemailer` for transport, reading connection details from environment variables. Delivery status is mapped between Novu statuses and SMTP receipt codes. The failover policy is configurable: `novu_primary` (default — Novu first, SMTP fallback), `smtp_primary` (SMTP first, Novu fallback), or `single` (no fallback).

**Acceptance Criteria**:
- [ac] `SmtpAdapter` implements `NotificationAdapter` interface: `send(params)` and `upsertSubscriber(id, data)`
- [ac] SMTP config from env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- [ac] `createSmtpAdapter(config)` factory with `SmtpConfig` type: `{ host, port, user, pass, from, secure? }`
- [ac] `SmtpAdapter.send()` maps `AdapterSendParams` to nodemailer `sendMail({ to, subject, html, text })` and returns `Result<{ id: string }, NotificationError>`
- [ac] SMTP delivery error maps to `{ _tag: 'DeliveryFailed', message, cause, attempts: 1 }`
- [ac] `FailoverPolicy` type: `'novu_primary' | 'smtp_primary' | 'single'`
- [ac] `createFailoverAdapter(primary, secondary, policy)` factory wraps two adapters with try-secondary-on-primary-failure logic
- [ac] Failover only triggers on `DeliveryFailed` errors (not `InvalidParams`, `RecipientOptedOut`)
- [ac] Failover adapter logs a warning when falling back to secondary
- [ac] `SmtpAdapter.upsertSubscriber()` is a no-op (SMTP has no subscriber management) returning `Result.ok(undefined)`
- [ac] Barrel export in `packages/notifications/src/index.ts`
- [ac] Tests for SMTP send success and failure mapping
- [ac] Tests for failover trigger on Novu failure and no failover on non-delivery errors
- [ac] Tests for each failover policy mode

**Files**:
- Create: `packages/notifications/src/adapters/smtp-adapter.ts`
- Create: `packages/notifications/src/adapters/failover-adapter.ts`
- Modify: `packages/notifications/src/adapters/index.ts` (export SmtpAdapter, FailoverAdapter)
- Modify: `packages/notifications/src/index.ts` (barrel export)
- Modify: `apps/web/src/lib/services.ts` (wire failover adapter when SMTP env vars are set)
- Create: `apps/web/tests/s13-notif2-01-smtp-fallback.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `SmtpAdapter.send({ recipientId, channel: 'email', subject, body })` returns `Result.ok({ id })` on successful send
2. Green: implement `createSmtpAdapter` factory, map `AdapterSendParams` to `nodemailer.sendMail()`, return messageId
3. Red: `SmtpAdapter.send()` returns `DeliveryFailed` when nodemailer transport throws connection error
4. Green: wrap `sendMail` in try/catch, map error to `{ _tag: 'DeliveryFailed' }`
5. Red: `createFailoverAdapter(novuAdapter, smtpAdapter, 'novu_primary')` — novu succeeds, smtp not called
6. Green: implement failover adapter: call primary, return on success
7. Red: failover adapter — novu returns `DeliveryFailed`, smtp called and succeeds
8. Green: catch `DeliveryFailed` from primary, call secondary, return secondary result
9. Red: failover adapter — novu returns `RecipientOptedOut`, no failover attempted
10. Green: only failover on `_tag === 'DeliveryFailed'`, pass through other errors
11. Red: `SmtpAdapter.upsertSubscriber()` returns `Result.ok(undefined)` (no-op)
12. Green: implement no-op subscriber method

---

#### NOTIF2-02: Novu Delivery Rate Monitoring (2 SP)

**Description**: Build a delivery rate monitor that detects "silent drops" — cases where Novu acknowledges a trigger (`acknowledged: true`) but the notification is never actually delivered. The monitor compares the count of acknowledged triggers (from the delivery log) against confirmed delivery receipts over a configurable window. When the delivery rate drops below a threshold, an alert is emitted via the existing SLO alerting framework. This closes a reliability gap: Novu's acknowledgement only means the message entered the queue, not that it reached the recipient.

**Acceptance Criteria**:
- [ac] `DeliveryRateMonitor` interface: `evaluate(windowMs: number)` returns `{ acknowledged: number, delivered: number, rate: number, alert: boolean }`
- [ac] `DeliveryRateConfig` type: `{ windowMs: number, minThreshold: number, minSamples: number }`
- [ac] Default config: `{ windowMs: 3_600_000 (1 hour), minThreshold: 0.85 (85%), minSamples: 5 }`
- [ac] Alert fires when `delivered / acknowledged < minThreshold` and `acknowledged >= minSamples`
- [ac] Monitor queries the `notification_deliveries` table for the evaluation window
- [ac] `createDeliveryRateMonitor(deps)` factory with `DeliveryLogStore` dependency
- [ac] `DeliveryLogStore` extended: `countByStatusInWindow(status, windowMs)` query method
- [ac] Alert emits `platform/notification.delivery.degraded` Inngest event with rate and window details
- [ac] Inngest cron function: `notification/delivery-check` runs every 15 minutes
- [ac] Tests for alert firing below threshold
- [ac] Tests for alert suppression below minSamples
- [ac] Tests for rate calculation accuracy

**Files**:
- Create: `packages/notifications/src/monitoring/delivery-rate-monitor.ts`
- Create: `packages/notifications/src/monitoring/monitoring-types.ts`
- Create: `packages/notifications/src/monitoring/index.ts`
- Modify: `packages/notifications/src/index.ts` (barrel export monitoring module)
- Modify: `packages/database/src/adapters/delivery-log-drizzle.ts` (add `countByStatusInWindow`)
- Modify: `apps/web/src/lib/inngest.ts` (add `platform/notification.delivery.degraded` event type)
- Modify: `apps/web/src/lib/services.ts` (add `getDeliveryRateMonitor`)
- Create: `apps/web/tests/s13-notif2-02-delivery-monitoring.test.ts`

**Dependencies**: NOTIF2-01

**TDD Micro-Tasks**:
1. Red: `evaluate(3_600_000)` returns `{ acknowledged: 10, delivered: 9, rate: 0.9, alert: false }` when rate above threshold
2. Green: implement `createDeliveryRateMonitor`, query delivery log for window, compute rate
3. Red: `evaluate(3_600_000)` returns `{ alert: true }` when rate is 0.7 (below 0.85 threshold)
4. Green: compare rate against `minThreshold`, set `alert: true` when below
5. Red: `evaluate(3_600_000)` returns `{ alert: false }` when acknowledged is 2 (below minSamples of 5)
6. Green: add `minSamples` guard — suppress alert when sample size is insufficient
7. Red: `countByStatusInWindow('delivered', 3_600_000)` returns count of delivered records in the last hour
8. Green: implement drizzle query with `createdAt >= now - windowMs` and status filter

---

#### NOTIF2-03: Priority Routing + Quiet Hours (3 SP)

**Description**: Implement priority-based notification routing with per-user quiet-hours enforcement to satisfy FR-CORE-NOTIF-003. Notifications are assigned one of four priority levels: `critical` (always send immediately), `high` (skip quiet hours for admins), `normal` (respect quiet hours), `low` (batch into digest). The quiet-hours window is configurable per user with timezone awareness. Critical notifications (HITL approvals, security alerts) always bypass quiet hours. Low-priority notifications are queued and delivered in a daily digest batch.

**Acceptance Criteria**:
- [ac] `NotificationPriority` type: `'critical' | 'high' | 'normal' | 'low'`
- [ac] `NotificationParams` extended with optional `priority?: NotificationPriority` (defaults to `'normal'`)
- [ac] `QuietHoursConfig` type: `{ enabled: boolean, startHour: number, endHour: number, timezone: string }`
- [ac] Default quiet hours: `{ enabled: true, startHour: 22, endHour: 7, timezone: 'UTC' }`
- [ac] `QuietHoursStore` interface: `getConfig(userId: string)` returns user-specific quiet hours or defaults
- [ac] `quiet_hours` table: `userId`, `enabled`, `startHour`, `endHour`, `timezone`, `updatedAt`
- [ac] `isInQuietHours(config, now)` pure function checks if current time falls within the quiet window
- [ac] `critical` priority: always bypasses quiet hours, always sent immediately
- [ac] `high` priority: bypasses quiet hours for users with `admin` role, deferred for others
- [ac] `normal` priority: deferred during quiet hours, sent immediately outside quiet hours
- [ac] `low` priority: always queued for daily digest (Inngest cron at 09:00 user-local)
- [ac] `createPriorityRouter(deps)` factory with `QuietHoursStore` dependency
- [ac] `PriorityRouter` interface: `route(params, userId)` returns `'send_now' | 'defer' | 'queue_digest'`
- [ac] Priority router integrates into notification service pipeline between opt-out check and adapter send
- [ac] Deferred notifications stored in `notification_queue` table: `id`, `params (jsonb)`, `scheduledFor`, `status`
- [ac] Inngest cron function: `notification/process-deferred` runs every 5 minutes to process deferred queue
- [ac] Inngest cron function: `notification/daily-digest` runs at 09:00 UTC daily for digest batching
- [ac] Tests for each priority level's routing behavior
- [ac] Tests for quiet-hours timezone calculation (UTC+5:30, DST transition)
- [ac] Tests for `isInQuietHours` pure function with edge cases (midnight wrap-around)

**Files**:
- Create: `packages/notifications/src/routing/priority-router.ts`
- Create: `packages/notifications/src/routing/quiet-hours.ts`
- Create: `packages/notifications/src/routing/routing-types.ts`
- Create: `packages/notifications/src/routing/index.ts`
- Modify: `packages/notifications/src/types.ts` (add `priority` to `NotificationParams`)
- Modify: `packages/notifications/src/notification-service.ts` (integrate priority router before send)
- Modify: `packages/notifications/src/index.ts` (barrel export routing module)
- Create: `packages/database/src/schema/notification-queue.ts` (quiet_hours + notification_queue tables)
- Create: `packages/database/src/adapters/quiet-hours-store.ts`
- Create: `packages/database/src/adapters/notification-queue-store.ts`
- Modify: `packages/database/src/adapters/index.ts` (barrel export new stores)
- Modify: `packages/database/src/schema/index.ts` (barrel export new tables)
- Modify: `apps/web/src/lib/inngest.ts` (add cron event types for deferred processing and digest)
- Modify: `apps/web/src/lib/services.ts` (add `getPriorityRouter`, `getQuietHoursStore`, `getNotificationQueueStore`)
- Create: `apps/web/tests/s13-notif2-03-priority-routing.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `isInQuietHours({ startHour: 22, endHour: 7, timezone: 'UTC' }, new Date('2026-03-17T23:30:00Z'))` returns `true`
2. Green: implement `isInQuietHours` pure function with midnight wrap-around logic
3. Red: `isInQuietHours({ startHour: 22, endHour: 7, timezone: 'America/New_York' }, ...)` converts to local time
4. Green: use `Intl.DateTimeFormat` to resolve timezone offset before comparison
5. Red: `route(params({ priority: 'critical' }), userId)` returns `'send_now'` during quiet hours
6. Green: implement `createPriorityRouter` — critical always returns `'send_now'`
7. Red: `route(params({ priority: 'normal' }), userId)` returns `'defer'` during quiet hours
8. Green: check quiet-hours config, return `'defer'` when `isInQuietHours` is true
9. Red: `route(params({ priority: 'low' }), userId)` returns `'queue_digest'` regardless of time
10. Green: low priority always returns `'queue_digest'`
11. Red: `route(params({ priority: 'high' }), adminUserId)` returns `'send_now'` during quiet hours
12. Green: resolve user role, bypass quiet hours for admins on `high` priority
13. Red: notification service defers a `normal` notification during quiet hours (writes to queue)
14. Green: integrate priority router into pipeline, write deferred notifications to queue store

---

### Phase 2: Platform Features (Days 3-7)

#### FEAT-01: Workflow Definition CRUD API (5 SP)

**Description**: Build a workflow definition management layer with a `workflow_definitions` table, a versioned CRUD API, and Zod step schema validation. Each workflow definition has a lifecycle status (`draft`, `active`, `archived`). Updates create a new version — previous versions are automatically archived. The API exposes five REST endpoints protected by RBAC. Step definitions are stored as JSONB with validation against a step schema. This lays the groundwork for FR-CORE-INT-001 and the Sprint 14 visual workflow builder.

**Acceptance Criteria**:
- [ac] `workflow_definitions` table: `id (uuid)`, `name (varchar 255)`, `version (integer)`, `domain (varchar 50)`, `steps (jsonb)`, `status ('draft' | 'active' | 'archived')`, `createdBy (uuid)`, `createdAt`, `updatedAt`
- [ac] `WorkflowDefinitionStore` interface: `create(input)`, `findById(id)`, `findByName(name, version?)`, `list(filters)`, `updateStatus(id, status)`, `archive(id)`
- [ac] `createDrizzleWorkflowDefinitionStore(db)` adapter in `@aptivo/database`
- [ac] `WorkflowStep` Zod schema: `{ id: string, type: 'action' | 'decision' | 'wait' | 'parallel', name: string, config: Record<string, unknown>, next?: string[] }`
- [ac] `WorkflowDefinitionInput` Zod schema validates `name`, `domain`, `steps` (array of `WorkflowStep`)
- [ac] Version auto-increment: `create()` with existing name increments version, archives previous active version
- [ac] API routes with RBAC permission `workflow:write` (mutating) and `workflow:read` (listing):
  - `POST /api/workflows` — create new definition (returns `{ id, version }`)
  - `GET /api/workflows` — list definitions with optional `domain`, `status` filters, paginated
  - `GET /api/workflows/:id` — get single definition by id
  - `PUT /api/workflows/:id` — update definition (creates new version)
  - `DELETE /api/workflows/:id` — archive definition (soft delete)
- [ac] Pagination: `limit` (clamped to 100), `offset`
- [ac] `status` transition rules: `draft → active`, `active → archived`, `draft → archived` (no reactivation)
- [ac] Audit trail: workflow create/update/archive actions emit `platform/audit.event` via audit service
- [ac] Tests for CRUD operations
- [ac] Tests for version auto-increment and previous-version archival
- [ac] Tests for step schema validation (valid + invalid payloads)
- [ac] Tests for status transition rules (invalid transitions rejected)

**Files**:
- Create: `packages/database/src/schema/workflow-definitions.ts`
- Create: `packages/database/src/adapters/workflow-definition-store.ts`
- Modify: `packages/database/src/adapters/index.ts` (barrel export)
- Modify: `packages/database/src/schema/index.ts` (barrel export)
- Create: `apps/web/src/app/api/workflows/route.ts` (POST + GET list)
- Create: `apps/web/src/app/api/workflows/[id]/route.ts` (GET + PUT + DELETE)
- Create: `apps/web/src/lib/workflows/workflow-definition-service.ts`
- Create: `apps/web/src/lib/workflows/workflow-definition-types.ts`
- Modify: `apps/web/src/lib/services.ts` (add `getWorkflowDefinitionStore`, `getWorkflowDefinitionService`)
- Create: `apps/web/tests/s13-feat-01-workflow-crud.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `WorkflowDefinitionInput.parse({ name: 'test', domain: 'core', steps: [{ id: 's1', type: 'action', name: 'step-1', config: {} }] })` succeeds
2. Green: implement Zod schema for `WorkflowDefinitionInput` with `WorkflowStep` array validation
3. Red: `WorkflowStep.parse({ id: 's1', type: 'invalid', name: 'step-1', config: {} })` fails with type enum error
4. Green: constrain `type` to `z.enum(['action', 'decision', 'wait', 'parallel'])`
5. Red: `store.create({ name: 'my-workflow', domain: 'hr', steps: [...] })` returns `{ id, version: 1 }`
6. Green: implement `createDrizzleWorkflowDefinitionStore` with INSERT returning new record
7. Red: `store.create({ name: 'my-workflow', ... })` when v1 exists returns `{ id: newId, version: 2 }` and archives v1
8. Green: query existing versions, increment max version, UPDATE previous active → archived
9. Red: `store.updateStatus(id, 'active')` succeeds for draft, fails for archived
10. Green: implement status transition validation: `draft → active | archived`, `active → archived`
11. Red: `POST /api/workflows` returns 201 with `{ id, version }` on valid input
12. Green: wire route handler with schema validation, store call, audit emit
13. Red: `GET /api/workflows?domain=hr&status=active&limit=10` returns paginated list
14. Green: implement list with filter params, `Math.min(limit, 100)` clamping

---

#### FEAT-02: Extensible Webhook Action Points (3 SP)

**Description**: Build a webhook action point system that fires HTTP callbacks on workflow lifecycle events. Action points are registered per workflow definition and trigger on configurable events (`workflow.started`, `workflow.completed`, `workflow.failed`, `step.completed`, `hitl.requested`). Each action point specifies a target URL, HTTP method, optional headers, and a retry policy. Webhook delivery is executed via Inngest step functions for durability and retry. Webhook payloads include an HMAC signature header for receiver verification.

**Acceptance Criteria**:
- [ac] `webhook_action_points` table: `id (uuid)`, `workflowDefinitionId (uuid)`, `event ('workflow.started' | 'workflow.completed' | 'workflow.failed' | 'step.completed' | 'hitl.requested')`, `url (varchar 2048)`, `method ('POST' | 'PUT')`, `headers (jsonb)`, `secret (varchar 255, for HMAC)`, `retryPolicy (jsonb: { maxRetries, backoffMs })`, `enabled (boolean)`, `createdAt`, `updatedAt`
- [ac] `WebhookActionPointStore` interface: `create(input)`, `findById(id)`, `findByWorkflow(workflowDefinitionId)`, `findByEvent(workflowDefinitionId, event)`, `update(id, input)`, `delete(id)`
- [ac] `createDrizzleWebhookActionPointStore(db)` adapter
- [ac] `WebhookDispatcher` interface: `dispatch(actionPoint, payload)` returns `Result<{ statusCode: number, responseTime: number }, WebhookError>`
- [ac] `WebhookError` type: `{ _tag: 'WebhookDeliveryFailed', url: string, statusCode?: number, message: string }`
- [ac] HMAC signature: `X-Aptivo-Signature` header with `sha256=hmac(secret, JSON.stringify(payload))`
- [ac] Webhook payload schema: `{ event, workflowId, workflowName, timestamp, data: Record<string, unknown> }`
- [ac] Retry policy: configurable per action point, default `{ maxRetries: 3, backoffMs: 1000 }`
- [ac] Backpressure: max 10 concurrent webhook dispatches per workflow (configurable)
- [ac] API routes with RBAC permission `webhook:write`:
  - `POST /api/workflows/:id/webhooks` — register action point
  - `GET /api/workflows/:id/webhooks` — list action points for workflow
  - `DELETE /api/workflows/:id/webhooks/:webhookId` — remove action point
- [ac] `fireWebhooks(workflowDefinitionId, event, payload)` helper for workflow code to trigger registered webhooks
- [ac] Tests for HMAC signature generation and verification
- [ac] Tests for retry on 5xx response, no retry on 4xx
- [ac] Tests for backpressure enforcement
- [ac] Tests for webhook store CRUD

**Files**:
- Create: `packages/database/src/schema/webhook-action-points.ts`
- Create: `packages/database/src/adapters/webhook-action-point-store.ts`
- Modify: `packages/database/src/adapters/index.ts` (barrel export)
- Modify: `packages/database/src/schema/index.ts` (barrel export)
- Create: `apps/web/src/lib/webhooks/webhook-dispatcher.ts`
- Create: `apps/web/src/lib/webhooks/webhook-types.ts`
- Create: `apps/web/src/lib/webhooks/index.ts`
- Create: `apps/web/src/app/api/workflows/[id]/webhooks/route.ts` (POST + GET)
- Create: `apps/web/src/app/api/workflows/[id]/webhooks/[webhookId]/route.ts` (DELETE)
- Modify: `apps/web/src/lib/inngest.ts` (add `platform/webhook.dispatched` event type)
- Modify: `apps/web/src/lib/services.ts` (add `getWebhookActionPointStore`, `getWebhookDispatcher`)
- Create: `apps/web/tests/s13-feat-02-webhook-action-points.test.ts`

**Dependencies**: FEAT-01

**TDD Micro-Tasks**:
1. Red: `store.create({ workflowDefinitionId, event: 'workflow.completed', url: 'https://example.com/hook', method: 'POST', secret: 's3cret' })` returns `{ id }`
2. Green: implement `createDrizzleWebhookActionPointStore` with INSERT
3. Red: `store.findByEvent(workflowDefinitionId, 'workflow.completed')` returns registered action point
4. Green: implement SELECT with workflowDefinitionId + event filter
5. Red: `dispatch(actionPoint, payload)` sends POST with `X-Aptivo-Signature` header containing valid HMAC
6. Green: compute `crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')`, set header
7. Red: `dispatch(actionPoint, payload)` returns `Result.ok({ statusCode: 200, responseTime })` on success
8. Green: implement fetch call, measure response time, return result
9. Red: `dispatch()` retries on 503 response up to `maxRetries` times
10. Green: check status code, retry on 5xx with exponential backoff
11. Red: `dispatch()` does not retry on 400 response
12. Green: only retry when `statusCode >= 500`
13. Red: `fireWebhooks(workflowDefinitionId, 'workflow.completed', payload)` dispatches to all matching action points
14. Green: query store for matching event, dispatch to each, collect results

---

#### FEAT-03: Runtime Feature Flag Service (4 SP)

**Description**: Build a runtime feature flag service with a local JSON provider (MVP) and an interface ready for drop-in LaunchDarkly or Unleash integration in Sprint 14. The service resolves flags by key with optional evaluation context (userId, domain, environment) for targeted rollout. The local provider reads flag definitions from a JSON config file or environment variable. Flags support boolean evaluation (`isEnabled`) and string variant evaluation (`getVariant`). A management API allows admin users to toggle flags at runtime.

**Acceptance Criteria**:
- [ac] `FeatureFlagService` interface: `isEnabled(flag: string, context?: FlagContext)`, `getVariant(flag: string, context?: FlagContext)`, `getAllFlags()`, `setFlag(flag: string, value: FlagDefinition)`
- [ac] `FlagContext` type: `{ userId?: string, domain?: string, environment?: string, attributes?: Record<string, unknown> }`
- [ac] `FlagDefinition` type: `{ key: string, enabled: boolean, variant?: string, rules?: FlagRule[], description?: string }`
- [ac] `FlagRule` type: `{ attribute: string, operator: 'eq' | 'neq' | 'in' | 'not_in', value: unknown, variant?: string }`
- [ac] Rule evaluation: when context matches a rule, return rule's variant; otherwise return default
- [ac] `LocalFlagProvider` reads from `feature-flags.json` or `FEATURE_FLAGS_JSON` env var
- [ac] `createFeatureFlagService(provider)` factory with `FlagProvider` interface dependency
- [ac] `FlagProvider` interface: `getFlag(key)`, `getAllFlags()`, `setFlag(key, value)` — enables LaunchDarkly drop-in
- [ac] `createLocalFlagProvider(config?)` factory with optional initial flags
- [ac] Hot reload: local provider watches `feature-flags.json` for changes (file watcher with debounce)
- [ac] API routes with RBAC permission `flags:read` and `flags:write`:
  - `GET /api/flags` — list all flags with current values
  - `GET /api/flags/:key` — get single flag evaluation with optional context query params
  - `PUT /api/flags/:key` — update flag definition (admin only)
- [ac] `isEnabled` returns `false` for unknown flags (fail-closed for safety)
- [ac] `getVariant` returns `'control'` for unknown flags (default variant)
- [ac] Tests for boolean flag evaluation
- [ac] Tests for rule-based variant targeting (context matching)
- [ac] Tests for unknown flag fail-closed behavior
- [ac] Tests for hot reload on config change
- [ac] Tests for provider interface contract (verifies LaunchDarkly adapter can be swapped)

**Files**:
- Create: `apps/web/src/lib/feature-flags/feature-flag-service.ts`
- Create: `apps/web/src/lib/feature-flags/feature-flag-types.ts`
- Create: `apps/web/src/lib/feature-flags/local-flag-provider.ts`
- Create: `apps/web/src/lib/feature-flags/index.ts`
- Create: `apps/web/src/app/api/flags/route.ts` (GET list)
- Create: `apps/web/src/app/api/flags/[key]/route.ts` (GET + PUT)
- Modify: `apps/web/src/lib/services.ts` (add `getFeatureFlagService`)
- Create: `apps/web/tests/s13-feat-03-feature-flags.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `isEnabled('enable-new-dashboard', {})` returns `true` when flag is `{ enabled: true }`
2. Green: implement `createFeatureFlagService` and `createLocalFlagProvider`, return `flag.enabled`
3. Red: `isEnabled('unknown-flag', {})` returns `false` (fail-closed)
4. Green: return `false` when provider returns `null` for unknown key
5. Red: `getVariant('experiment-a', { userId: 'u1' })` returns `'treatment'` when rule matches
6. Green: implement rule evaluation — iterate rules, match context attribute against operator, return rule variant
7. Red: `getVariant('experiment-a', { userId: 'u2' })` returns `'control'` when no rule matches
8. Green: return default variant `'control'` when no rules match
9. Red: rule with operator `'in'` matches when context value is in the array
10. Green: implement `'in'` operator with `Array.isArray(rule.value) && rule.value.includes(contextValue)`
11. Red: `getAllFlags()` returns all registered flag definitions
12. Green: delegate to provider `getAllFlags()`, return as array
13. Red: `setFlag('my-flag', { key: 'my-flag', enabled: true })` updates runtime state
14. Green: implement `setFlag` on local provider, update in-memory map
15. Red: local provider reloads when config file changes
16. Green: implement `fs.watch` with 500ms debounce, re-read and merge on change

---

#### FEAT-04: Self-Service Consent Withdrawal API (2 SP)

**Description**: Build a consent withdrawal API endpoint that satisfies DPA Article 7 (right to withdraw consent). The API accepts a `userId` and `consentType`, records the withdrawal in the audit trail, and emits a `platform/consent.withdrawn` Inngest event for downstream processors (e.g., data deletion, notification opt-out). This is the MVP scope — no UI component (that is Sprint 14).

**Acceptance Criteria**:
- [ac] API route: `POST /api/consent/withdraw` with body `{ userId: string, consentType: string, reason?: string }`
- [ac] Request validation via Zod schema: `userId` required UUID, `consentType` required string (e.g., `'marketing'`, `'analytics'`, `'data-processing'`)
- [ac] Consent withdrawal recorded in audit trail: action `consent.withdrawn`, resource `{ type: 'consent', id: consentType }`, metadata `{ userId, reason }`
- [ac] Emits `platform/consent.withdrawn` Inngest event with `{ userId, consentType, withdrawnAt, reason }`
- [ac] `platform/consent.withdrawn` event type added to Inngest event union
- [ac] Response: `201 Created` with `{ withdrawnAt: string, auditId: string }`
- [ac] RBAC: user can only withdraw their own consent (userId must match session user, or admin override)
- [ac] Idempotent: repeated withdrawals for the same `(userId, consentType)` emit new audit events but return success
- [ac] Rate limited: max 10 withdrawal requests per user per hour (abuse prevention)
- [ac] Tests for successful withdrawal flow
- [ac] Tests for validation errors (missing userId, invalid consentType)
- [ac] Tests for RBAC enforcement (user cannot withdraw for another user)
- [ac] Tests for idempotent behavior
- [ac] Tests for Inngest event emission

**Files**:
- Create: `apps/web/src/app/api/consent/withdraw/route.ts`
- Create: `apps/web/src/lib/consent/consent-types.ts`
- Modify: `apps/web/src/lib/inngest.ts` (add `platform/consent.withdrawn` event type)
- Modify: `apps/web/src/lib/services.ts` (no new service needed — uses existing auditService + inngest)
- Create: `apps/web/tests/s13-feat-04-consent-withdrawal.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `POST /api/consent/withdraw` with valid body returns `201` with `{ withdrawnAt, auditId }`
2. Green: implement route handler with Zod validation, audit emit, Inngest event send
3. Red: `POST /api/consent/withdraw` with missing `userId` returns `400` with validation error
4. Green: Zod schema rejects missing required fields, return ProblemDetails
5. Red: audit service receives `consent.withdrawn` action with correct resource and metadata
6. Green: call `auditService.emit()` with consent details
7. Red: Inngest event `platform/consent.withdrawn` emitted with `{ userId, consentType, withdrawnAt }`
8. Green: call `inngest.send()` with event payload after audit success
9. Red: non-admin user cannot withdraw consent for a different userId (returns 403)
10. Green: extract session user, compare with request userId, reject mismatch unless admin role

---

### Phase 3: Deferred Items + Observability (Days 5-8)

#### NOTIF2-04: Per-Approver Webhook Notifications (2 SP)

**Description**: Extend the webhook action point system (FEAT-02) to fire per-approver webhook notifications when a multi-approver HITL request is created. Each approver in the request receives an individual webhook call with their specific approval URL and token. This bridges the HITL v2 multi-approver flow (Sprint 11) with the webhook dispatch system (FEAT-02), enabling external integrations (Slack bots, custom dashboards) to receive real-time approval requests.

**Acceptance Criteria**:
- [ac] New webhook event type: `'hitl.approval.requested'` added to `webhook_action_points` event enum
- [ac] `fireApproverWebhooks(requestId, approverIds, workflowDefinitionId)` helper function
- [ac] Per-approver payload: `{ event: 'hitl.approval.requested', requestId, approverId, approveUrl, rejectUrl, summary, expiresAt }`
- [ac] Webhook URL for each approver includes their unique approval token (from HITL v2 token model)
- [ac] Dispatched via `WebhookDispatcher` (reuses FEAT-02 infrastructure)
- [ac] Webhook delivery failures are logged but do not block the HITL request (fire-and-forget pattern)
- [ac] Integration with `getHitlMultiApproverService()` — webhook fire happens after token generation
- [ac] Tests for per-approver webhook payload generation
- [ac] Tests for fire-and-forget behavior (webhook failure does not reject HITL request)
- [ac] Tests for correct approveUrl/rejectUrl per approver

**Files**:
- Create: `apps/web/src/lib/webhooks/hitl-webhook-bridge.ts`
- Modify: `packages/database/src/schema/webhook-action-points.ts` (add `hitl.approval.requested` to event enum)
- Modify: `apps/web/src/lib/services.ts` (add `getHitlWebhookBridge`)
- Create: `apps/web/tests/s13-notif2-04-per-approver-webhooks.test.ts`

**Dependencies**: FEAT-02

**TDD Micro-Tasks**:
1. Red: `fireApproverWebhooks(requestId, ['approver-1', 'approver-2'], workflowDefId)` dispatches 2 webhooks
2. Green: query action points for `hitl.approval.requested` event, dispatch per approver
3. Red: each webhook payload contains approver-specific `approveUrl` with unique token
4. Green: resolve approval URL from HITL config + approver token, include in payload
5. Red: webhook failure for approver-1 does not prevent webhook dispatch for approver-2
6. Green: wrap each dispatch in try/catch, log error, continue to next approver
7. Red: no registered action points for `hitl.approval.requested` results in no dispatches (no error)
8. Green: guard with empty array check on `findByEvent` result

---

#### OBS-05: Anomaly Detection for Bulk Data Access (3 SP)

**Description**: Build a rule-based anomaly detection engine that analyzes the PII read audit trail (OBS-04, Sprint 12) for abnormal access patterns. The detector establishes a 7-day rolling baseline of per-actor PII read volume, then flags reads that exceed the baseline by 3 standard deviations. Additional rules detect off-hours access (reads outside business hours), new actor patterns (first-time reader of a resource type), and high-volume bursts (more than N reads in a 5-minute window). Alerts are emitted via the SLO alerting framework. This satisfies RR-6 (bulk data access monitoring).

**Acceptance Criteria**:
- [ac] `AnomalyDetector` interface: `evaluate(actorId: string, resourceType: string)` returns `AnomalyResult`
- [ac] `AnomalyResult` type: `{ anomalies: AnomalyFinding[], riskScore: number, action: 'allow' | 'alert' | 'block' }`
- [ac] `AnomalyFinding` type: `{ rule: string, description: string, severity: 'low' | 'medium' | 'high', evidence: Record<string, unknown> }`
- [ac] Rule: `volume_spike` — PII reads exceed 3 standard deviations above 7-day rolling average
- [ac] Rule: `off_hours_access` — PII reads occurring outside 08:00-18:00 business hours (configurable)
- [ac] Rule: `new_actor` — first-time reader of a resource type (no prior reads in baseline window)
- [ac] Rule: `burst_access` — more than 50 PII reads in a 5-minute window (configurable threshold)
- [ac] `createAnomalyDetector(deps)` factory with `AuditQueryService` dependency (from OBS-02)
- [ac] `AnomalyDetectorConfig` type: `{ baselineWindowDays: number, stdDevMultiplier: number, offHoursStart: number, offHoursEnd: number, burstThreshold: number, burstWindowMs: number }`
- [ac] Default config: `{ baselineWindowDays: 7, stdDevMultiplier: 3, offHoursStart: 18, offHoursEnd: 8, burstThreshold: 50, burstWindowMs: 300_000 }`
- [ac] Risk score: 0-100, computed as weighted sum of matched rules (volume_spike: 40, off_hours: 20, new_actor: 30, burst: 40, capped at 100)
- [ac] Action thresholds: `allow` (score < 30), `alert` (30-70), `block` (> 70)
- [ac] Alert emits `platform/anomaly.detected` Inngest event with findings and risk score
- [ac] Inngest cron function: `anomaly/pii-access-check` runs every 15 minutes
- [ac] Tests for each anomaly rule with mock audit data
- [ac] Tests for risk score calculation and action thresholds
- [ac] Tests for baseline computation (mean + standard deviation)
- [ac] Tests for combined rules producing correct aggregate risk score

**Files**:
- Create: `apps/web/src/lib/observability/anomaly-detector.ts`
- Create: `apps/web/src/lib/observability/anomaly-types.ts`
- Create: `apps/web/src/lib/observability/anomaly-rules.ts`
- Modify: `apps/web/src/lib/inngest.ts` (add `platform/anomaly.detected` event type)
- Modify: `apps/web/src/lib/services.ts` (add `getAnomalyDetector`)
- Create: `apps/web/tests/s13-obs-05-anomaly-detection.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `evaluate('actor-1', 'candidate')` returns `{ anomalies: [], riskScore: 0, action: 'allow' }` when reads are within normal range
2. Green: implement `createAnomalyDetector`, compute baseline, compare current count against mean + 3*stddev
3. Red: `evaluate('actor-1', 'candidate')` returns `volume_spike` anomaly when reads exceed baseline by 3 stddev
4. Green: compute standard deviation, flag when `currentCount > mean + stdDevMultiplier * stddev`
5. Red: `evaluate('actor-1', 'candidate')` returns `off_hours_access` finding when read occurs at 23:00
6. Green: check current hour against `offHoursStart`/`offHoursEnd` range
7. Red: `evaluate('new-actor', 'candidate')` returns `new_actor` finding when no prior reads exist
8. Green: query baseline window for actor, flag when count is 0 (first access)
9. Red: `evaluate('actor-1', 'candidate')` returns `burst_access` when 60 reads in last 5 minutes
10. Green: count reads in `burstWindowMs`, flag when exceeding `burstThreshold`
11. Red: combined `volume_spike` (40) + `off_hours` (20) produces `riskScore: 60`, `action: 'alert'`
12. Green: sum rule weights, cap at 100, resolve action from thresholds

---

### Phase 4: Integration & Closure (Days 8-10)

#### FEAT-06: Integration Tests (2 SP)

**Description**: Cross-cutting integration tests verifying the full Sprint 13 lifecycle: notification failover pipeline (Novu failure → SMTP fallback → delivery), priority routing with quiet-hours enforcement, workflow definition CRUD with versioning, webhook dispatch with HMAC verification, feature flag evaluation with rule targeting, consent withdrawal with audit trail, per-approver webhook notifications, and anomaly detection on PII access patterns. Tests cover the composition root wiring to ensure all new services are accessible via the lazy getters.

**Acceptance Criteria**:
- [ac] E2E: Novu delivery failure → SMTP fallback → successful delivery logged
- [ac] E2E: Delivery rate monitor detects silent drop below 85% threshold → alert fires
- [ac] E2E: Critical notification bypasses quiet hours, normal notification deferred
- [ac] E2E: Workflow definition create → update (new version) → archive lifecycle
- [ac] E2E: Webhook registration → workflow event → HMAC-signed dispatch → retry on 5xx
- [ac] E2E: Feature flag evaluation with context-based rule targeting
- [ac] E2E: Feature flag unknown key returns `false` (fail-closed)
- [ac] E2E: Consent withdrawal → audit trail + Inngest event emission
- [ac] E2E: Per-approver webhook fires for each approver with unique tokens
- [ac] E2E: Anomaly detector flags volume spike on PII reads
- [ac] E2E: All Sprint 13 services accessible via composition root lazy getters

**Files**:
- Create: `apps/web/tests/s13-feat-06-integration.test.ts`

**Dependencies**: NOTIF2-01, NOTIF2-02, NOTIF2-03, FEAT-01, FEAT-02, FEAT-03, FEAT-04, NOTIF2-04, OBS-05

**TDD Micro-Tasks**:
1. Red: full notification failover pipeline — novu fails, smtp succeeds, delivery logged with correct adapter
2. Green: wire failover adapter, simulate novu error, verify smtp called and delivery log shows success
3. Red: priority routing routes critical notification immediately during quiet hours
4. Green: set up quiet-hours config, send critical notification, verify immediate delivery
5. Red: workflow definition lifecycle — create v1, update → v2 created, v1 archived
6. Green: call store create twice with same name, verify version increment and archival
7. Red: webhook dispatch includes valid HMAC signature
8. Green: dispatch webhook, extract signature header, verify against re-computed HMAC
9. Red: feature flag with rule `{ attribute: 'domain', operator: 'eq', value: 'hr' }` returns `'treatment'` for hr context
10. Green: evaluate flag with context `{ domain: 'hr' }`, verify rule match returns correct variant
11. Red: consent withdrawal emits both audit event and Inngest event
12. Green: call withdrawal endpoint, verify audit store and inngest mock both received events

---

## 2. Dependency Graph

```
Phase 1 (Days 1-4) — Notification Resilience:
  NOTIF2-01 (SMTP Fallback, 3SP) ─── no deps ─────────────────┐
  NOTIF2-02 (Monitoring, 2SP) ← NOTIF2-01                      │
  NOTIF2-03 (Priority Routing, 3SP) ─── no deps ──────────────┤
                                                                 │
Phase 2 (Days 3-7) — Platform Features:                        │
  FEAT-01 (Workflow CRUD, 5SP) ─── no deps ───────────────────┤
  FEAT-02 (Webhooks, 3SP) ← FEAT-01                            │
  FEAT-03 (Feature Flags, 4SP) ─── no deps ───────────────────┤
  FEAT-04 (Consent, 2SP) ─── no deps ─────────────────────────┤
                                                                 │
Phase 3 (Days 5-8) — Deferred + Observability:                 │
  NOTIF2-04 (Per-Approver, 2SP) ← FEAT-02                      │
  OBS-05 (Anomaly Detection, 3SP) ─── no deps ────────────────┤
                                                                 ▼
Phase 4 (Days 8-10):
  FEAT-06 (Integration Tests, 2SP) ← all above
```

**Critical path**: FEAT-01 → FEAT-02 → NOTIF2-04 → FEAT-06

**Parallel tracks**:
- Track A (Senior): FEAT-01 → FEAT-02 → OBS-05 (workflow CRUD → webhooks → anomaly detection)
- Track B (Web Dev 1): NOTIF2-01 → NOTIF2-02 → FEAT-04 (SMTP fallback → monitoring → consent)
- Track C (Web Dev 2): NOTIF2-03 → FEAT-03 → NOTIF2-04 (priority routing → feature flags → per-approver webhooks)

---

## 3. Architectural Decisions

### Q1: SMTP Fallback — Adapter Composition, Not Inheritance

**Decision**: The failover mechanism is implemented as a `FailoverAdapter` that composes two `NotificationAdapter` instances rather than subclassing `NovuNotificationAdapter`. This follows the project's functional core pattern: `createFailoverAdapter(primary, secondary, policy)` returns a new `NotificationAdapter` that transparently delegates. Failover only triggers on `DeliveryFailed` errors — permanent errors like `RecipientOptedOut` and `InvalidParams` are not retried on the secondary adapter. The policy enum (`novu_primary`, `smtp_primary`, `single`) enables flexible configuration without changing the adapter wiring. The `SmtpAdapter` uses `nodemailer` — the most widely-used Node.js SMTP library — and does not attempt subscriber management (SMTP has no concept of subscribers).

### Q2: Silent-Drop Detection — Acknowledgement vs Delivery

**Decision**: The delivery rate monitor compares Novu acknowledgement counts against confirmed delivery counts in the delivery log. A "silent drop" is defined as an acknowledged notification that never reaches `delivered` status within the evaluation window. The monitor uses a configurable `minSamples` threshold (default 5) to suppress false alerts during low-traffic periods. The 85% delivery rate threshold is deliberately conservative — even delayed receipts should arrive within the 1-hour window. The monitor runs as an Inngest cron (every 15 minutes) rather than a real-time check to avoid per-request overhead.

### Q3: Priority Routing — Four-Tier Model

**Decision**: Notifications use four priority levels rather than a numeric scale. The categorical model (`critical`, `high`, `normal`, `low`) maps cleanly to business rules: critical always sends, high respects role-based exceptions, normal respects quiet hours, low batches into digests. The `isInQuietHours` function is a pure function that accepts a `QuietHoursConfig` and a timestamp — no side effects, no timezone ambiguity. Timezone conversion uses `Intl.DateTimeFormat` (available in all modern runtimes) rather than a library dependency. Deferred notifications are stored in a `notification_queue` table and processed by an Inngest cron every 5 minutes. Low-priority digest batching runs daily at 09:00 UTC.

### Q4: Workflow Definition CRUD — Immutable Versioning

**Decision**: Workflow definitions use immutable versioning rather than in-place updates. Each `PUT` creates a new version and archives the previous active version. This preserves audit history and enables rollback — an archived version can be inspected to understand what the workflow looked like at any point. The `status` field follows a strict state machine: `draft → active`, `active → archived`, `draft → archived`. Reactivation of archived versions is not supported in Sprint 13 (it requires a "clone from version N" operation, deferred to Sprint 14). Step definitions are stored as JSONB validated against a `WorkflowStep` Zod schema, keeping the schema flexible while ensuring structural correctness.

### Q5: Webhook Action Points — HMAC Signature for Verification

**Decision**: Webhook payloads are signed with HMAC-SHA256 using a per-action-point secret. The signature is sent in the `X-Aptivo-Signature` header as `sha256=<hex>`, following the GitHub webhook signature convention. This allows receivers to verify both the integrity and authenticity of webhook payloads without requiring mutual TLS. The retry policy is per-action-point (not global) so that time-sensitive webhook consumers can configure fewer retries with shorter backoff. Backpressure (max 10 concurrent dispatches) prevents webhook storms from overwhelming receivers or exhausting Inngest step concurrency.

### Q6: Feature Flags — Provider Interface for Future Extensibility

**Decision**: The feature flag service uses a `FlagProvider` interface that decouples the evaluation logic from the storage mechanism. The local JSON provider is the MVP implementation — it reads from a config file and supports hot reload. The interface is designed so that a `LaunchDarklyProvider` or `UnleashProvider` can be swapped in without changing any consuming code. Flags fail closed: `isEnabled` returns `false` for unknown flags, `getVariant` returns `'control'`. This prevents accidental feature exposure when a flag name is misspelled or a provider is misconfigured.

### Q7: Anomaly Detection — Rule-Based First, ML Later

**Decision**: Anomaly detection uses rule-based pattern matching (statistical thresholds) rather than ML classification. This is consistent with the injection classifier approach (LLM2-01): rule-based covers common patterns deterministically, ML-based refinement is deferred to Phase 3. The 7-day rolling baseline provides enough history to establish normal patterns without requiring long historical data. The weighted risk score (0-100) with three action tiers (`allow`, `alert`, `block`) maps cleanly to the existing SLO alerting framework. The `block` action is available but not wired to actual access control in Sprint 13 — it only emits an alert. Active blocking is Sprint 14 scope.

---

## 4. Scope Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| SMTP fallback for HITL notifications | 3 | **Commit** | Delivery reliability for approvals |
| Novu delivery rate monitoring | 2 | **Commit** | Silent-drop detection |
| Priority routing + quiet hours | 3 | **Commit** | FR-CORE-NOTIF-003 |
| Workflow definition CRUD API | 5 | **Commit** | FR-CORE-INT-001, Sprint 14 builder prerequisite |
| Extensible webhook action points | 3 | **Commit** | FR-CORE-INT-002 |
| Runtime feature flag service | 4 | **Commit** | Gradual rollout infrastructure |
| Self-service consent withdrawal | 2 | **Commit** | DPA Article 7 compliance |
| Per-approver webhook notifications | 2 | **Commit** | Sprint 12 deferred, bridges HITL v2 + webhooks |
| Anomaly detection for bulk data access | 3 | **Commit** | Sprint 12 deferred, RR-6 |
| Integration tests | 2 | **Commit** | Sprint completion |
| WebSocket lifecycle docs (RC-1, RC-2) | 2 | **Defer → Sprint 14** | Lowest value doc task |
| Approval SLA metrics | 3 | **Defer → Sprint 14** | Needs per-approver timing model |
| LLM streaming content filter | 3 | **Defer → Sprint 14** | Needs streaming pipeline hooks |
| Crypto live-trading workflow | 5 | **Defer → Sprint 14** | Needs stronger safety + notification |
| HR onboarding workflow | 4 | **Defer → Sprint 14** | Needs SLA metrics + notification |
| ML injection classifier | 5 | **Defer → Phase 3** | Needs model hosting infrastructure |

**Committed**: 29 SP | **Deferred**: ~22 SP

---

## 5. Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | FEAT-01 (5), FEAT-02 (3), OBS-05 (3) | 11 |
| **Web Dev 1** | NOTIF2-01 (3), NOTIF2-02 (2), FEAT-04 (2) | 7 |
| **Web Dev 2** | NOTIF2-03 (3), FEAT-03 (4), NOTIF2-04 (2) | 9 |
| **All** | FEAT-06 (2) | 2 |
| **Total** | | **29 SP** |

Senior carries the heaviest complexity (11 SP) because the workflow definition CRUD (FEAT-01) and webhook action points (FEAT-02) form a tightly coupled feature pair that requires deep understanding of the Inngest workflow model, Drizzle schema design, and the RBAC middleware. The anomaly detection engine (OBS-05) requires statistical computation and integration with the audit query service from Sprint 12. Web Dev 1 handles the notification resilience track: SMTP adapter implementation, delivery monitoring (both build on the existing `NotificationAdapter` and `DeliveryLogStore` interfaces), and the consent withdrawal API (straightforward route with audit/event emission). Web Dev 2 handles priority routing (requires timezone logic and new database tables), feature flags (standalone service with provider interface), and per-approver webhooks (bridges HITL v2 tokens with FEAT-02 webhook dispatcher).

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SMTP deliverability (SPF/DKIM/DMARC configuration required) | High | Medium | Document SPF/DKIM setup in deployment runbook; SMTP is fallback-only, not primary path |
| Novu silent-drop false positives from delayed receipts | Medium | Low | Conservative 85% threshold + 1-hour evaluation window; minSamples guard (5) suppresses noise |
| Quiet hours timezone edge cases (DST transitions) | Medium | Low | Pure function with `Intl.DateTimeFormat` handles DST; test with known DST transition dates |
| Webhook retry storms without backpressure | Medium | High | Per-workflow concurrency cap (10); per-action-point retry policy; exponential backoff |
| Feature flag provider lock-in | Low | Medium | `FlagProvider` interface decouples evaluation from storage; LaunchDarkly swap is Sprint 14 |
| Consent withdrawal cascading to data deletion | Low | High | Sprint 13 scope is audit-only; data deletion pipeline (existing `DATA_DELETION_EVENT`) is not triggered automatically |
| Workflow definition step schema too rigid | Medium | Low | JSONB storage + `config: Record<string, unknown>` provides flexibility; schema is additive-only |
| Anomaly detection baseline insufficient for new tenants | Medium | Low | New actors trigger `new_actor` rule (alert, not block); baseline builds over 7 days |

---

## 7. Definition of Done

- [ ] SMTP adapter implements `NotificationAdapter` with `nodemailer` transport *(NOTIF2-01)*
- [ ] Failover adapter composes primary + secondary with configurable policy *(NOTIF2-01)*
- [ ] Composition root wires failover when `SMTP_HOST` env var is set *(NOTIF2-01)*
- [ ] Delivery rate monitor detects silent drops below 85% threshold *(NOTIF2-02)*
- [ ] Monitor suppresses alerts below `minSamples` *(NOTIF2-02)*
- [ ] Priority routing with 4 tiers: critical, high, normal, low *(NOTIF2-03)*
- [ ] Quiet hours: per-user timezone-aware window with midnight wrap-around *(NOTIF2-03)*
- [ ] Critical notifications always bypass quiet hours *(NOTIF2-03)*
- [ ] Low-priority notifications queued for daily digest *(NOTIF2-03)*
- [ ] `workflow_definitions` table with versioning and status lifecycle *(FEAT-01)*
- [ ] 5 REST endpoints (POST, GET list, GET by id, PUT, DELETE) with RBAC *(FEAT-01)*
- [ ] Version auto-increment and previous-version archival on update *(FEAT-01)*
- [ ] Zod step schema validation for workflow steps *(FEAT-01)*
- [ ] `webhook_action_points` table with 5 event types *(FEAT-02)*
- [ ] HMAC-SHA256 signature in `X-Aptivo-Signature` header *(FEAT-02)*
- [ ] Retry on 5xx, no retry on 4xx, backpressure enforced *(FEAT-02)*
- [ ] Feature flag service with `isEnabled`, `getVariant`, `getAllFlags` *(FEAT-03)*
- [ ] Local JSON provider with hot reload *(FEAT-03)*
- [ ] Fail-closed: unknown flags return `false` / `'control'` *(FEAT-03)*
- [ ] Rule-based variant targeting with context matching *(FEAT-03)*
- [ ] Consent withdrawal API: `POST /api/consent/withdraw` *(FEAT-04)*
- [ ] Audit trail + `platform/consent.withdrawn` Inngest event emitted *(FEAT-04)*
- [ ] RBAC: user can only withdraw own consent *(FEAT-04)*
- [ ] Per-approver webhook fires with unique approval tokens *(NOTIF2-04)*
- [ ] Webhook failure does not block HITL request (fire-and-forget) *(NOTIF2-04)*
- [ ] Anomaly detection: 4 rules (volume_spike, off_hours, new_actor, burst) *(OBS-05)*
- [ ] Risk score 0-100 with allow/alert/block thresholds *(OBS-05)*
- [ ] 7-day rolling baseline with standard deviation computation *(OBS-05)*
- [ ] Integration tests pass for all Sprint 13 features *(FEAT-06)*
- [ ] 80%+ test coverage on new Sprint 13 code
- [ ] CI pipeline green with all tests passing

---

## 8. Doc-Gate Requirement

| Document | Section | Task |
|----------|---------|------|
| `docs/04-specs/platform-core/notifications.md` | §7 SMTP fallback adapter, §8 Failover policy, §9 Delivery rate monitoring, §10 Priority routing + quiet hours | NOTIF2-01, NOTIF2-02, NOTIF2-03 |
| `docs/04-specs/platform-core/workflow-engine.md` | §3 Workflow definitions (CRUD, versioning, lifecycle), §4 Webhook action points (dispatch, HMAC, retry) | FEAT-01, FEAT-02 |
| `docs/03-architecture/platform-core-add.md` | §17.1 Feature flag architecture (provider interface, evaluation), §17.2 Consent management model | FEAT-03, FEAT-04 |
| `docs/04-specs/platform-core/observability.md` | §8 Anomaly detection (rules, baseline, risk scoring) | OBS-05 |
| `docs/04-specs/platform-core/hitl-gateway.md` | §8 Per-approver webhook notifications | NOTIF2-04 |

---

## 9. Sprint 14 Preview

Sprint 14 (Integration + Phase 2 Delivery) builds on Sprint 13's platform features and notification infrastructure:

| Item | SP (est.) | Why it needs Sprint 13 |
|------|-----------|----------------------|
| Visual workflow builder foundation | 5 | Needs workflow definition CRUD (FEAT-01) + webhook action points (FEAT-02) |
| LaunchDarkly feature flag provider | 2 | Needs `FlagProvider` interface from FEAT-03 for drop-in swap |
| Consent withdrawal UI component | 3 | Needs consent API from FEAT-04 |
| Approval SLA metrics + dashboard | 3 | Needs per-approver webhooks (NOTIF2-04) for timing data |
| WebSocket lifecycle docs (RC-1, RC-2) | 2 | Tier 2 deferred doc task |
| LLM streaming content filter | 3 | Needs content filter patterns from LLM2-02 adapted for async chunks |
| Active anomaly blocking | 2 | Needs anomaly detector (OBS-05) wired to access control middleware |
| Crypto live-trading workflow | 5 | Needs SMTP fallback (NOTIF2-01) for reliable trade alerts |
| HR onboarding workflow | 4 | Needs priority routing (NOTIF2-03) for onboarding notifications |
