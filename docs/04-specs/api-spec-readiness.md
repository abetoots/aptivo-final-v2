---
id: TSD-API-SPEC-READINESS
title: API Specification Readiness Assessment
status: Phase 1 Complete
version: 1.2.0
owner: '@owner'
last_updated: '2026-03-12'
parent: ../03-architecture/platform-core-add.md
---

# API Specification Readiness Assessment

**Date**: March 12, 2026 (updated from February 5, 2026)
**Purpose**: Determine readiness to draft formal API specifications based on BRD, FRD, and ADD

---

## Executive Summary

**Can we draft an API spec now?** ✅ Yes, fully ready (100% — all clarification questions resolved).

**Which specification?** Both OpenAPI 3.1 AND AsyncAPI 3.0 are required.

| Spec Format | Purpose | Aptivo Coverage |
|-------------|---------|-----------------|
| **OpenAPI 3.1** | REST/HTTP synchronous APIs | HITL, Workflow, Audit, Files, Auth, **Admin Dashboard** |
| **AsyncAPI 3.0** | Events, webhooks, messaging | Workflow events, HITL signals, Webhooks, NATS |

The platform has both synchronous REST endpoints AND asynchronous event-driven interfaces (Inngest workflows, webhooks, NATS messaging).

> **v1.2.0 Update (Phase 1 Complete)**: The OpenAPI 3.1 spec (`openapi/aptivo-core-v1.yaml`) is drafted and covers platform-core endpoints including Sprint 7 admin dashboard routes. Domain-specific API specs (crypto, HR) are Phase 2 scope.
>
> **v1.2.0 coverage of admin endpoints**: 5 of 7 documented — `overview`, `audit`, `hitl`, `llm-usage`, `llm-usage/budget`. Two routes added in code are pending OpenAPI schema additions: `/api/admin/approval-sla` (OPS-01) and `/api/admin/feature-flags` (PR-07). See ADD §15.2 for the canonical admin endpoint table; OpenAPI update is queued as a pre-Phase-2 mechanical task.

---

## 1. REST Endpoints Ready to Specify (OpenAPI)

### 1.1 HITL Gateway (95% Ready)

**Source**: ADD §4.5, FRD §4

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/hitl/{requestId}/approve` | POST | Approve HITL request |
| `/api/v1/hitl/{requestId}/reject` | POST | Reject HITL request |
| `/api/v1/hitl/{requestId}/request-changes` | POST | Request additional info |
| `/api/v1/hitl/{requestId}` | GET | Get request details |
| `/api/v1/hitl` | GET | List pending approvals (cursor-paginated) |

**Status**: ADD §4.5 provides detailed endpoint design including idempotency handling, request/response formats, and error cases. **Can be drafted immediately.**

### 1.2 Workflow Management (85% Ready)

**Source**: ADD §12.1, FRD §3

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/workflows` | GET | List workflows (cursor-paginated) |
| `/api/v1/workflows/{id}` | GET | Get workflow definition |
| `/api/v1/workflows` | POST | Create workflow |
| `/api/v1/workflows/{id}` | PUT | Update workflow |
| `/api/v1/workflows/{id}/export` | GET | Export as JSON (FR-CORE-INT-001) |
| `/api/v1/workflows/{id}/instances` | GET | List workflow instances (cursor-paginated) |
| `/api/v1/workflows/{id}/instances/{instanceId}` | GET | Get instance details |
| `/api/v1/workflows/{id}/instances/{instanceId}/history` | GET | Get execution history (cursor-paginated) |
| `/api/v1/workflows/validate` | POST | Validate workflow definition |

**Status**: ADD §12.1 provides detailed API design. FRD-CORE-WFE-001 through WFE-007 provide functional details. **Can be drafted with confidence.**

### 1.3 Audit Service (80% Ready)

**Source**: ADD §9.5, FRD §8

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/audit/logs` | GET | Query audit logs with filters (cursor-paginated) |
| `/api/v1/audit/exports` | POST | Request audit export (format: json/csv/pdf) |
| `/api/v1/audit/exports/{exportId}` | GET | Get export status/download URL |

**Query Parameters**: `cursor`, `limit`, `timeRange`, `actor`, `entityType`, `domain`

**Status**: FRD §8 defines capabilities. ADD §9.5 provides implementation detail. **Query parameter schema needs minor clarification.**

### 1.4 File Storage (80% Ready)

**Source**: ADD §9.6-9.8, FRD §8.5

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/files/upload-url` | POST | Generate presigned upload URL |
| `/api/v1/files/{fileId}/download-url` | POST | Generate presigned download URL |
| `/api/v1/files/{fileId}` | GET | Get file metadata |
| `/api/v1/files/{fileId}/link` | POST | Link file to entity |
| `/api/v1/files/{fileId}` | DELETE | Delete file |

**Status**: FRD §8.5 defines interface. ADD §9.6-9.8 provide implementation. **Can be drafted.**

### 1.5 Identity/Authentication (75% Ready)

**Source**: ADD §8, FRD §9

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/magic-link` | POST | Send magic link |
| `/api/v1/auth/callback` | POST | Handle OAuth/magic link callback |
| `/api/v1/auth/user` | GET | Get current user |
| `/api/v1/auth/logout` | POST | Logout session |
| `/api/v1/users` | GET | List users (admin, cursor-paginated) |
| `/api/v1/users/{id}/roles` | GET | Get user roles |
| `/api/v1/users/{id}/roles` | POST | Assign roles |
| `/api/v1/domains/{domain}/roles` | GET | List domain roles |
| `/api/v1/domains/{domain}/roles` | POST | Create domain role |
| `/api/v1/domains/{domain}/roles/{roleId}` | PUT | Update domain role |
| `/api/v1/domains/{domain}/roles/{roleId}` | DELETE | Delete domain role |

**Status**: ✅ All decisions resolved. Auth uses Supabase JWT for identity, DB lookup for roles.

---

## 2. Async/Event Interfaces Ready to Specify (AsyncAPI)

### 2.1 Workflow Events (95% Ready)

**Source**: ADD §3, FRD §3

| Event | Description |
|-------|-------------|
| `workflow.started` | Workflow execution begins |
| `workflow.completed` | Workflow execution completed |
| `workflow.failed` | Workflow execution failed |
| `workflow.state-changed` | Workflow transitioned state |
| `workflow.step-completed` | Individual step completed |
| `workflow.step-failed` | Individual step failed |
| `workflow.suspended` | Awaiting HITL decision |

**Status**: Implied throughout FRD §3. ADD §3 provides Inngest pattern. **Event schema needs formalization.**

### 2.2 HITL Events (95% Ready)

**Source**: ADD §4, FRD §4

| Event | Description |
|-------|-------------|
| `hitl.approval-requested` | HITL request created |
| `hitl.approved` | Request approved |
| `hitl.rejected` | Request rejected |
| `hitl.request-changes` | Approver requested info |
| `hitl.expired` | Request expired |

**Status**: FRD §4 defines events. ADD §4 provides signal-based implementation. **Can be formalized.**

### 2.3 Webhook Events (80% Ready)

**Source**: ADD §12.2-12.3

**Outbound Webhook Headers**:
- `X-Webhook-ID` - Event ID for deduplication
- `X-Webhook-Signature` - HMAC signature
- `X-Webhook-Timestamp` - Event timestamp

**Inbound Webhook Headers**:
- `X-Webhook-ID` / `X-Request-ID` - For deduplication
- `X-Webhook-Signature` - Signature verification

**Status**: ADD §12.2-12.3 provide detailed design. ✅ Webhook configuration CRUD decided (Admin API).

### 2.4 Audit Events (90% Ready)

**Source**: ADD §9.3-9.4, FRD §8

| Event | Description |
|-------|-------------|
| `audit.log-appended` | New audit record created |
| `audit.retention-enforced` | Retention policy executed |

**Status**: FRD §8 and ADD §9.3 define behavior. **Can be formally specified.**

---

## 3. Resolved API Decisions

> **Status**: All 15 clarification questions resolved via multi-expert consensus (Claude, Gemini, Codex) on 2026-02-05.

### 3.1 Critical Decisions (Resolved)

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | **API Versioning** | URL path: `/api/v1/resource` | Industry standard, explicit in logs, cacheable at edge |
| 2 | **Error Format** | RFC 7807 + `code` enum + `errors[]` | Base standard with practical extensions for field validation |
| 3 | **Auth Token Format** | Supabase JWT (identity) + DB lookup (roles) | ADD §8.3 explicit; role changes propagate immediately |
| 4 | **Pagination** | Cursor-based: `cursor`, `limit` (default 50, max 200) | Scales for multi-tenant, no drift issues, future-proof |
| 5 | **HITL Token** | Body `{ "token": "..." }` + Bearer header for identity | ADD §4.5 pattern; HITL token is one-time action capability |

**Error Response Schema**:
```typescript
interface ProblemDetails {
  type: string;        // URI reference (e.g., "/errors/validation")
  title: string;       // Human-readable summary
  status: number;      // HTTP status code
  detail?: string;     // Explanation specific to this occurrence
  instance?: string;   // URI of the specific occurrence
  code: string;        // Machine-readable code (e.g., "REQUEST_EXPIRED")
  errors?: Array<{     // Field-level validation errors
    field: string;
    message: string;
    code: string;
  }>;
}
```

**Pagination Response Schema**:
```typescript
interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}
```

### 3.2 High-Priority Decisions (Resolved)

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 6 | **MCP Tool API** | SDK-only inside workflows (no public REST) | Preserves durable execution, rate limiting, retries |
| 7 | **LLM Gateway API** | SDK-only inside workflows | Cost tracking, budget enforcement tied to workflow context |
| 8 | **Webhook Config API** | Admin CRUD: `POST/GET/PUT/DELETE /api/v1/webhooks` | ADD §12.2-12.3 reference DB lookups; multi-tenant needs governance |

### 3.3 Medium-Priority Decisions (Resolved)

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 9 | **Health Check** | `/health/live` (liveness) + `/health/ready` (readiness) | Standard for containerized deployments. **Paths intentionally unversioned** — health probes are an explicit exception to the `/api/v1/` mandate (ADD §13.8). Earlier drafts used `/api/health` and `/api/ready`; OpenAPI v1.2.0 (SSOT) ships `/health/live` and `/health/ready`. |
| 10 | **Rate Limit Headers** | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | ADD §5.4 rate limiting; enterprise-ready |
| 11 | **Idempotency Header** | Required for critical POSTs (HITL, trades, money) | ADD §13 idempotency strategy |
| 12 | **Domain Role Management** | `POST/GET/PUT/DELETE /api/v1/domains/{domain}/roles` | FRD domain role requirements |
| 13 | **Workflow Validation** | `POST /api/v1/workflows/validate` | FR-CORE-WFE-001; improves DX |
| 14 | **Content Negotiation** | JSON default; async exports with `format` param (json/csv/pdf) | ADD §9.5 export formats |
| 15 | **Health Check Format** | Structured liveness/readiness with dependency checks | Ops visibility |

**Health Check Schemas**:
```typescript
// GET /health/live (liveness)
interface HealthResponse {
  status: "ok";
  version: string;
  timestamp: string;
  uptime: number;
}

// GET /health/ready (readiness)
interface ReadinessResponse {
  status: "ok" | "degraded" | "down";
  checks: Array<{
    name: string;        // e.g., "postgres", "redis", "nats"
    status: "up" | "down";
    latencyMs: number;
    message?: string;
  }>;
  timestamp: string;
}
```

---

## 4. Confidence Assessment (Updated)

| Component | Type | Confidence | Status | Notes |
|-----------|------|------------|--------|-------|
| HITL Gateway | REST | 100% | ✅ Specified | OpenAPI paths defined |
| Workflow Management | REST | 100% | ✅ Specified | OpenAPI paths defined |
| Audit Service | REST | 100% | ✅ Specified | OpenAPI paths defined |
| File Storage | REST | 100% | ✅ Specified | OpenAPI paths defined |
| Identity/Auth | REST | 100% | ✅ Specified | OpenAPI paths defined |
| Admin Dashboard | REST | 100% | ✅ Specified | 5 endpoints in OpenAPI (Sprint 7) |
| MCP Tool API | REST | N/A | ⛔ SDK-ONLY | No public REST (by design) |
| LLM Gateway API | REST | N/A | ⛔ SDK-ONLY | No public REST (by design) |
| Webhook Config | REST | 100% | ✅ Specified | OpenAPI paths defined |
| Workflow Events | Async | 95% | ⚠️ Ready | AsyncAPI spec needed in Phase 2 |
| HITL Events | Async | 95% | ⚠️ Ready | AsyncAPI spec needed in Phase 2 |
| Audit Events | Async | 95% | ⚠️ Ready | AsyncAPI spec needed in Phase 2 |
| Webhook Events | Async | 95% | ⚠️ Ready | AsyncAPI spec needed in Phase 2 |
| Notification Events | Async | 80% | ⚠️ Partial | Novu schema integration |
| Crypto Domain APIs | REST | 80% | ⚠️ Phase 2 | FRD + TSD defined, OpenAPI pending |
| HR Domain APIs | REST | 80% | ⚠️ Phase 2 | FRD + TSD defined, OpenAPI pending |
| NATS Pub/Sub | Async | 40% | ⚠️ Partial | Topics to define in Phase 2 |

---

## 5. Recommended Approach

### Phase 1: Ready to Draft Now

```
OpenAPI 3.1:
├── HITL Gateway endpoints (/api/v1/hitl/*)
├── Workflow Management endpoints (/api/v1/workflows/*)
├── Audit Service endpoints (/api/v1/audit/*)
├── File Storage endpoints (/api/v1/files/*)
├── Webhook Configuration CRUD (/api/v1/webhooks/*)
├── Domain Role Management (/api/v1/domains/{domain}/roles/*)
├── Health Check endpoints (/health/live, /health/ready)
└── Identity endpoints (/api/v1/auth/*, /api/v1/users/*)

AsyncAPI 3.0:
├── Workflow events (workflow.*)
├── HITL events (hitl.*)
├── Audit events (audit.*)
└── Webhook event schemas
```

### Phase 2: Domain-Specific Extensions

```
OpenAPI 3.1:
├── HR Domain endpoints
├── Crypto Domain endpoints
└── Notification Preferences

AsyncAPI 3.0:
├── NATS pub/sub topics (internal)
├── Notification events (Novu integration)
└── Domain-specific events
```

**Note**: MCP Tool API and LLM Gateway API are intentionally SDK-only (no public REST endpoints) to preserve durable execution guarantees.

---

## 6. Pre-Spec Clarification Checklist (All Resolved)

> ✅ All questions resolved via multi-expert consensus on 2026-02-05.

### Critical (All Resolved)

- [x] **Versioning**: URL path `/api/v1/`
- [x] **Errors**: RFC 7807 + `code` enum + `errors[]` for field validation
- [x] **Auth**: Supabase JWT for identity; DB lookup for roles (Phase 1)
- [x] **Pagination**: Cursor-based, default limit 50, max 200
- [x] **HITL Token**: Body `{ "token": "..." }` with Bearer header for user identity

### High Priority (All Resolved)

- [x] **MCP Access**: SDK-only inside workflows (no public REST)
- [x] **LLM Access**: SDK-only inside workflows (no public REST)
- [x] **Webhooks**: Admin-configurable CRUD API

### Medium Priority (All Resolved)

- [x] **Health Check**: `/health/live` (liveness) + `/health/ready` (readiness)
- [x] **Rate Limits**: `X-RateLimit-*` headers on rate-limited endpoints
- [x] **Idempotency**: Required for critical POSTs only (HITL, trades, money movement)

---

## 7. Source Document References

| Document | Sections Used |
|----------|---------------|
| BRD | §3.1 (Platform Core Scope) |
| FRD | §3 (Workflow), §4 (HITL), §5 (MCP), §6 (LLM), §7 (Notifications), §8 (Audit), §8.5 (Files), §9 (Identity), §11 (Interoperability) |
| ADD | §3 (Workflow), §4 (HITL), §5 (MCP), §6 (Notifications), §7 (LLM), §8 (Identity), §9 (Data/Audit/Files), §12 (Interoperability), §13 (Idempotency) |

---

## 8. Next Steps

1. ~~**Schedule clarification session** to resolve Critical gaps~~ ✅ Done (2026-02-05)
2. ~~**Draft Phase 1 OpenAPI spec** for HITL, Workflow, Audit, Files, Webhooks~~ ✅ Done — `openapi/aptivo-core-v1.yaml`
3. ~~**Add admin endpoints to OpenAPI**~~ ✅ Done — 5 admin routes + schemas (v1.2.0)
4. **Draft Phase 1 AsyncAPI spec** for Workflow/HITL/Audit events — Phase 2 scope
5. **Add domain-specific endpoints** — Crypto + HR REST APIs in Phase 2 sprints
6. **Review with team** before Phase 2 implementation

---

## 9. Decision Audit Trail

### Multi-Expert Consensus Session

**Date**: 2026-02-05
**Participants**: Claude (Lead), Gemini 3 Pro, Codex (GPT-4.1)
**Method**: Independent analysis → comparison → debate → consensus

#### Debated Items

| Topic | Initial Positions | Resolution |
|-------|-------------------|------------|
| **Pagination** | Gemini: Offset (per ADD §12.1) / Codex+Claude: Cursor | Cursor-based. Gemini conceded: audit logs are high-volume append-only; offset causes drift. |
| **Auth Token** | Codex: JWT claims for roles / Gemini+Claude: DB lookup | DB lookup. Codex conceded: ADD §8.3 explicit; simpler for Phase 1; immediate role propagation. |

#### Key Technical Drivers

1. **Cursor pagination**: Audit Service integrity — offset pagination on live log streams guarantees skipped/duplicate records
2. **DB role lookup**: Avoids JWT re-issuance on role changes; can optimize to claims in Phase 2 if latency is issue
3. **SDK-only for MCP/LLM**: Preserves durable execution guarantees, rate limiting, and cost tracking managed by Inngest

---

**Document Status**: ✅ Ready for spec drafting. All critical decisions resolved with unanimous expert consensus.
