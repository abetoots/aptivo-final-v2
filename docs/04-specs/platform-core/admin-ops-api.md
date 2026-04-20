---
id: TSD-ADMIN-OPS-API
title: Admin & Operations API Specification
status: Phase 1 Complete
version: 1.0.0
owner: '@owner'
last_updated: '2026-03-12'
parent: ../../03-architecture/platform-core-add.md
domain: core
---

# Admin & Operations API Specification

**Platform Core – Admin Dashboard Backend**
**ADD Reference**: [platform-core-add.md](../../03-architecture/platform-core-add.md) §15

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-03-12 | Initial TSD — Sprint 7 implementation (S7-INT-02, S7-INT-03) |

---

## 1. Overview

The Admin Operations API provides 5 read-only endpoints for platform monitoring. All endpoints require `platform/admin.view` RBAC permission. Built in Sprint 7 to close WARNING S2-W12 (LLM Usage Dashboard).

**Endpoints**:

| Route | Purpose |
|-------|---------|
| `GET /api/admin/overview` | Dashboard snapshot — SLO health, pending HITL, active workflows |
| `GET /api/admin/audit` | Paginated audit log browser |
| `GET /api/admin/hitl` | HITL request listing with status filter |
| `GET /api/admin/llm-usage` | LLM cost analytics by domain/provider/day |
| `GET /api/admin/llm-usage/budget` | Daily/monthly budget status and burn rate |

---

## 2. RBAC Enforcement

All 7 endpoints (5 documented here + `approval-sla`, `feature-flags` pending OpenAPI addition) use `checkPermissionWithBlacklist('platform/admin.view')` middleware:

```typescript
export async function GET(request: Request) {
  const denied = await checkPermissionWithBlacklist('platform/admin.view')(request);
  if (denied) return denied;
  // ... handler logic
}
```

- Production: Supabase JWT → permission resolution from DB
- Dev/test: `x-user-role` header, fallback to stub (any non-anonymous role accepted)
- Unauthorized: 401 (no JWT) or 403 (insufficient permission)

---

## 3. Endpoint Specifications

### 3.1 GET /api/admin/overview

**Purpose**: Dashboard snapshot for the admin landing page.

**Query Parameters**: None.

**Response** (200):

```typescript
interface OverviewResponse {
  pendingHitlCount: number;
  activeWorkflowCount: number;
  recentAuditEvents: AuditLogEntry[];
  sloHealth: {
    workflowSuccessRate: number;
    mcpSuccessRate: number;
    hitlLatencyP95Ms: number;
    auditDlqPending: number;
    status: 'healthy' | 'degraded';
  };
}
```

**SLO Health Logic**:
- Status is `healthy` when ALL of:
  - `workflowSuccessRate >= 99%`
  - `mcpSuccessRate >= 99.5%`
  - `auditDlqPending <= 100`
- Otherwise `degraded`

**Active Workflow Window**: 5 minutes (last 300,000ms).

**Store Methods**:
- `adminStore.getPendingHitlCount()`
- `adminStore.getActiveWorkflowCount(300_000)`
- `adminStore.getRecentAuditLogs(10)`
- `metricService.getWorkflowSuccessRate()`
- `metricService.getMcpSuccessRate()`
- `metricService.getHitlLatencyP95()`
- `metricService.getAuditDlqPendingCount()`

---

### 3.2 GET /api/admin/audit

**Purpose**: Paginated audit log browser with filtering.

**Query Parameters**:

| Parameter | Type | Default | Validation |
|-----------|------|---------|------------|
| `page` | integer | 1 | min: 1 |
| `limit` | integer | 50 | clamped to 1-200 |
| `resource` | string | — | optional, filter by `resourceType` |
| `actor` | string | — | optional, filter by `actorType` |

**Response** (200):

```typescript
interface AuditListResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

interface AuditLogEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  domain: string | null;
  actorType: string;
  userId: string | null;
  timestamp: Date;
  metadata: unknown;
}
```

**Store Method**: `adminStore.getAuditLogsPaginated({ page, limit, resource?, actor? })`

Runs parallel data + count queries for efficiency.

---

### 3.3 GET /api/admin/hitl

**Purpose**: HITL request listing with status filter.

**Query Parameters**:

| Parameter | Type | Default | Validation |
|-----------|------|---------|------------|
| `status` | string | — | optional: `pending` \| `approved` \| `rejected` \| `expired` \| `canceled` |
| `limit` | integer | 50 | clamped to 1-200 |

**Response** (200):

```typescript
interface HitlListResponse {
  data: HitlRequestEntry[];
  count: number;
}

interface HitlRequestEntry {
  id: string;
  workflowId: string;
  domain: string;
  actionType: string;
  summary: string;
  status: string;
  approverId: string;
  createdAt: Date;
  resolvedAt: Date | null;
}
```

**Store Method**: `adminStore.getHitlRequests({ status?, limit? })`

---

### 3.4 GET /api/admin/llm-usage

**Purpose**: LLM cost analytics across domains, providers, and daily totals.

**Query Parameters**:

| Parameter | Type | Default | Validation |
|-----------|------|---------|------------|
| `range` | string | `30d` | Parsed as integer days, clamped to 1-365 |

**Response** (200):

```typescript
interface LlmUsageResponse {
  range: string;
  totalCost: string;          // fixed 6 decimal places
  costByDomain: CostByDomain[];
  costByProvider: CostByProvider[];
  dailyTotals: DailyTotal[];
  alerts: AlertInfo;
}

interface CostByDomain {
  domain: string;
  totalCost: string;
  requestCount: number;
}

interface CostByProvider {
  provider: string;
  model: string;
  totalCost: string;
  requestCount: number;
}

interface DailyTotal {
  date: string;
  totalCost: string;
  requestCount: number;
}

interface AlertInfo {
  threshold: number;          // $5/day per domain
  domainsExceeding: string[];
  hasAlerts: boolean;
}
```

**Range Parsing**: `'30d'` → 30, `'7d'` → 7. Non-numeric defaults to 30, clamped to [1, 365].

**Alert Threshold**: $5/day per domain (S2-W12). Domains exceeding this threshold in the current day appear in `domainsExceeding`.

**Store Methods**:
- `llmUsageStore.getCostByDomain(windowMs)`
- `llmUsageStore.getCostByProvider(windowMs)`
- `llmUsageStore.getDailyTotals(days)`
- `llmUsageStore.getAlertDomains(5)`

---

### 3.5 GET /api/admin/llm-usage/budget

**Purpose**: Daily and monthly budget status with burn rate projection.

**Query Parameters**: None.

**Response** (200):

```typescript
interface BudgetResponse {
  daily: {
    spend: string;
    limit: number;            // $50
    pctUsed: string;          // e.g. "12.5"
  };
  monthly: {
    spend: string;
    limit: number;            // $1000
    pctUsed: string;          // e.g. "8.3"
  };
  burnRate: string;           // daily average for current month (2 decimals)
  alerts: AlertInfo;
}
```

**Budget Limits**:
- Daily: $50 USD
- Monthly: $1,000 USD

**Burn Rate Calculation**: `monthlySpend / dayOfMonth` — projects daily average cost.

**Store Methods**:
- `llmUsageStore.getDailySpend()`
- `llmUsageStore.getMonthlySpend()`
- `llmUsageStore.getAlertDomains(5)`

---

## 4. Store Interfaces

### 4.1 AdminStore

```typescript
interface AdminStore {
  getPendingHitlCount(): Promise<number>;
  getActiveWorkflowCount(windowMs: number): Promise<number>;
  getRecentAuditLogs(limit: number): Promise<AuditLogEntry[]>;
  getAuditLogsPaginated(opts: {
    page: number;
    limit: number;
    resource?: string;
    actor?: string;
  }): Promise<PaginatedResult<AuditLogEntry>>;
  getHitlRequests(opts: {
    status?: string;
    limit?: number;
  }): Promise<HitlRequestEntry[]>;
}
```

**Factory**: `createDrizzleAdminStore(db): AdminStore`

Implementation notes:
- `getPendingHitlCount`: counts `hitlRequests` where `status = 'pending'`
- `getActiveWorkflowCount`: counts distinct `resourceId` from `auditLogs` where `action LIKE 'workflow.%'` within window
- `getRecentAuditLogs`: fetches up to `limit` (max 200) ordered by `timestamp DESC`
- `getAuditLogsPaginated`: parallel data + count queries with optional `resourceType`/`actorType` filters
- `getHitlRequests`: optional status filter, ordered by `createdAt DESC`, capped at 200

### 4.2 LlmUsageStore

```typescript
interface LlmUsageStore {
  getCostByDomain(windowMs: number): Promise<CostByDomain[]>;
  getCostByProvider(windowMs: number): Promise<CostByProvider[]>;
  getDailyTotals(days: number): Promise<DailyTotal[]>;
  getDailySpend(): Promise<string>;
  getMonthlySpend(): Promise<string>;
  getDomainDailySpend(domain: string): Promise<string>;
  getAlertDomains(thresholdUsd: number): Promise<string[]>;
}
```

**Factory**: `createDrizzleLlmUsageStore(db): LlmUsageStore`

Implementation notes:
- All cost values returned as strings (null coalesced to `'0'`)
- `getAlertDomains`: `GROUP BY domain HAVING SUM(cost_usd) > threshold` for current day
- `getDailyTotals`: `GROUP BY date` using SQL date truncation, returns `days` rows ordered by date

---

## 5. Composition Root Wiring

```typescript
// apps/web/src/lib/services.ts
export const getAdminStore = lazy(() =>
  createDrizzleAdminStore(db()),
);
export const getLlmUsageStore = lazy(() =>
  createDrizzleLlmUsageStore(db()),
);
```

---

## 6. Input Validation

| Rule | Applied To |
|------|------------|
| Limit clamping (1-200) | `/audit`, `/hitl` |
| Range clamping (1d-365d) | `/llm-usage` |
| Page minimum (1) | `/audit` |
| Status enum validation | `/hitl` |

Invalid or missing parameters use defaults rather than returning 400. This ensures the dashboard always renders.

---

## 7. Error Responses

| Status | Condition |
|--------|-----------|
| 401 | Missing or invalid JWT (production) |
| 403 | User lacks `platform/admin.view` permission |
| 500 | Store query failure (returns `{ error: string }`) |

All endpoints catch errors and return 500 with a JSON error message rather than stack traces.

---

## 8. Phase 2 Pointers

| Item | Description |
|------|-------------|
| Write endpoints | POST/PATCH for budget config, HITL manual resolution |
| Export API | CSV/JSON export of audit logs and usage data |
| Real-time updates | WebSocket or SSE for live dashboard updates |
| Per-user rate limits | S5-W17 — rate limiting on admin API endpoints |

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| LLM Usage Dashboard | WARNINGS_REGISTER.md | S2-W12 (resolved) |
| Admin Dashboard Architecture | platform-core-add.md | §15 |
| RBAC Enforcement | platform-core-add.md | §14.10 |
| MetricService | platform-core-add.md | §16 |

### Downstream References

| Implementation | Target | Section |
|----------------|--------|---------|
| Route handlers | `apps/web/src/app/api/admin/` | 5 route files |
| Admin store | `packages/database/src/adapters/admin-store.ts` | Full file |
| LLM usage store | `packages/database/src/adapters/llm-usage-store.ts` | Full file |
| RBAC middleware | `apps/web/src/lib/security/rbac-middleware.ts` | `checkPermission()` |
