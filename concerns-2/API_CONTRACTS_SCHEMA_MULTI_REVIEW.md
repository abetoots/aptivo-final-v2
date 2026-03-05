# Session 3: API Contracts & Schema — Multi-Model Review

**Date**: 2026-03-01
**Concerns Evaluated**: api-contract-consistency, idempotency-boundaries, event-schema-compatibility, api-versioning-compliance
**Models**: Gemini (PAL Clink), Codex MCP, Claude Lead Expert
**Documents Reviewed**: BRD, FRD, ADD, Runbook, TSD, API Spec (OpenAPI), Coding Guidelines, api.md, common-patterns.md

---

## Executive Summary

Session 3 evaluates API contract alignment, idempotency guarantees, event schema evolution, and API versioning. The platform has **exceptionally strong idempotency documentation** (13/16 trust-boundary operations fully documented in the ADD), solid OpenAPI coverage for core endpoints, and consistent URL-path versioning. However, five ERROR-level gaps were found:

1. **Idempotency header name contradiction** between ADD/api.md (`X-Idempotency-Key`) and OpenAPI (`Idempotency-Key`)
2. **Missing DELETE /workflows endpoint** in OpenAPI despite FRD and ADD both requiring it
3. **Missing checksum field** in AuditExportStatus schema despite FRD compliance requirement
4. **Zero event schema compatibility rules** across all 7+ event types in the event-driven system
5. **Outbound webhook event payload schemas undocumented** — external consumers have no contract

| Concern | Severity | ERRORs | WARNINGs | NOTEs |
|---------|----------|--------|----------|-------|
| api-contract-consistency | error | 3 | 5 | 0 |
| idempotency-boundaries | error | 0 | 4 | 0 |
| event-schema-compatibility | error | 2 | 3 | 0 |
| api-versioning-compliance | warn | 0 | 2 | 1 |
| **Total** | — | **5** | **14** | **1** |

---

## Model Comparison

| Model | Total ERRORs | Total WARNINGs | Unique Findings | Pattern |
|-------|-------------|----------------|-----------------|---------|
| Gemini | 5E | 3W | Audit Service sync writes (rejected — resilience not idempotency) | Undercounted again; missed header contradiction and checksum gap |
| Codex | 5E | 9W | HITL reject reason/comment (rejected — hallucinated), role assignment idempotency | Good detail on idempotency gaps; one hallucinated finding |
| Claude | 6E | 16W | Header name mismatch, audit checksum, outbound webhook schemas, dead-letter strategy | Most thorough; one false positive (outbound webhook idempotency) |

---

## Consensus Findings

### ERRORs

#### E1: Idempotency Header Name Contradiction [api-contract-consistency]
- **Source**: ADD §5.1.1 (line 864), api.md (lines 69, 433) use `X-Idempotency-Key`
- **Spec**: OpenAPI (lines 1287, 1300) defines `Idempotency-Key` (no X- prefix)
- **Note**: Even the ADD is internally inconsistent — §14.2 STRIDE (line 2889) uses `Idempotency-Key`
- **Risk**: Clients following ADD documentation send the wrong header; idempotency protection silently fails
- **Found by**: Claude only | **Verified**: `rg "X-Idempotency-Key|Idempotency-Key" docs/`
- [x] **RESOLVED** — Standardized to `Idempotency-Key` in api.md and ADD §5.1.1

#### E2: Missing DELETE /api/v1/workflows/{workflowId} Endpoint [api-contract-consistency]
- **Source**: FRD FR-CORE-WFE-001 (line 57): "Can create, update, and delete workflow definitions"
- **Source**: ADD §8.3.1 ACL (line 1561): "Workflows: list, get, create, update, delete"
- **Spec**: OpenAPI only defines GET and PUT on `/api/v1/workflows/{workflowId}` (lines 369-412)
- **Risk**: Workflow lifecycle management blocked — no way to delete definitions via API
- **Found by**: Gemini + Claude | **Verified**: `rg "delete.*workflow" docs/04-specs/openapi/`
- [x] **RESOLVED** — Added DELETE method with 204/401/403/404/409 responses to OpenAPI spec

#### E3: AuditExportStatus Missing Checksum Field [api-contract-consistency]
- **Source**: FRD FR-CORE-AUD-002 (line 337): "Export includes a checksum to verify integrity"
- **Source**: ADD §9.5.1 (lines 2031-2048): code computes SHA-256 checksum
- **Source**: TSD database.md (line 324): `checksumSha256` column defined
- **Spec**: OpenAPI AuditExportStatus (lines 1966-1994): has downloadUrl but NO checksum field
- **Risk**: Compliance teams cannot verify exported audit log integrity
- **Found by**: Claude only | **Verified**: `rg "checksum" docs/04-specs/openapi/` — no hits
- [x] **RESOLVED** — Added `checksumSha256` to OpenAPI AuditExportStatus; aligned ADD code to use `checksumSha256`

#### E4: No Compatibility Rules for Any Event Contract [event-schema-compatibility]
- **Searched**: All docs for "schema evolution", "backward compatible", "forward compatible", "event version", "schema registry"
- **Found**: common-patterns.md §5.2 defines event envelope schema with Zod validation, but ZERO compatibility rules
- **Found**: project-structure.md (line 152): `events/` directory marked "[Phase 2+]"
- **Risk**: Inngest event schema changes break consumers silently; Phase 2 service split amplifies risk
- **Found by**: All 3 models agree | **Verified**: comprehensive grep across docs/
- [x] **RESOLVED** — Added common-patterns.md §5.3 with compatibility rules, breaking change process, rollout order, rollback safety, dead-letter strategy

#### E5: Outbound Webhook Event Payload Schemas Undocumented [event-schema-compatibility]
- **Source**: OpenAPI WebhookConfig.events is type: array of strings (event names only)
- **No schema**: No payload schema defined for any webhook event type
- **ADD §12.2**: Documents delivery mechanism (BullMQ, retry, X-Webhook-ID) but not payload structure
- **Risk**: External consumers build against undocumented schemas; any payload change breaks integrations
- **Found by**: Claude + Codex | **Verified**: OpenAPI search for webhook payload schemas
- [x] **RESOLVED** — Added ADD §12.2.3 (standard envelope + per-event-type table) and OpenAPI WebhookEventPayload schema

### WARNINGs

#### W1: 429 TooManyRequests Not on HITL Endpoints [api-contract-consistency]
- ADD §14.2 STRIDE claims "rate limiting (429)" for HITL endpoint flooding mitigation
- OpenAPI: 429 only on `/api/v1/auth/magic-link` (line 971)
- **Found by**: Codex + Claude | **Verified**

#### W2: Workflow Instances Missing Filter Parameters [api-contract-consistency]
- FRD FR-CORE-WFE-002: "queryable by status, owner, time range"
- OpenAPI: only `status` filter on instances list endpoint
- **Found by**: Claude | **Verified**

#### W3: ProblemDetails Missing traceId Field [api-contract-consistency]
- Coding Guidelines and Runbook describe `traceId` in error responses
- OpenAPI ProblemDetails: has `code` but no `traceId`
- **Found by**: Claude | **Verified**: `rg "traceId" docs/04-specs/openapi/` — no hits

#### W4: No Stable Ordering on Paginated Endpoints [api-contract-consistency]
- All list endpoints use cursor pagination (max 200, default 50)
- No `sort`/`order` parameters; no default ordering documented
- **Found by**: Codex + Claude | **Verified**: `rg "sort|order.*by" docs/04-specs/openapi/` — no hits

#### W5: Rate Limiting Incomplete in OpenAPI [api-contract-consistency]
- TooManyRequests response and X-RateLimit-* headers defined but only applied to magic-link
- Rate limit values (requests per window) not documented
- **Found by**: Claude | **Verified**

#### W6: Workflow CRUD No Explicit Idempotency [idempotency-boundaries]
- POST /api/v1/workflows: no documented idempotency mechanism
- Version column provides optimistic concurrency for updates but not duplicate create prevention
- **Found by**: Codex + Claude | **Verified**

#### W7: Novu transactionId Dedup Window Undocumented [idempotency-boundaries]
- ADD §6.4 acknowledges: "deduplication window duration not publicly documented by Novu"
- Requires integration testing validation
- **Found by**: Codex + Claude | **Verified**

#### W8: Role Assignment Implicitly Idempotent [idempotency-boundaries]
- PUT /api/v1/users/{userId}/roles is idempotent by HTTP spec
- Not explicitly documented as an idempotency strategy
- **Found by**: Codex | **Verified** (implicit via PUT semantics)

#### W9: MCP Redis Recovery Edge Case [idempotency-boundaries]
- MCP idempotency depends on Redis; fails-closed on Redis failure (good)
- Edge case: Redis fails during first execution, recovers before retry → no cached result
- For financial operations (executeTrade), could result in duplicate
- **Found by**: Claude | **Requires human review** for risk acceptance

#### W10: No Rollout Order for Event Schema Changes [event-schema-compatibility]
- Phase 1 monolith deploys atomically (mitigating factor)
- No documented policy for Phase 2+ when services may split
- **Found by**: Gemini + Claude | **Verified**

#### W11: No Schema Registry/Validation for Inngest Events [event-schema-compatibility]
- common-patterns.md §5.2 has Zod schemas for event envelope
- But no enforced validation at publish time; convention-driven only
- **Found by**: Codex + Claude | **Verified**

#### W12: No Dead-Letter Strategy for Event Schema Failures [event-schema-compatibility]
- No documented strategy for events that fail deserialization
- Inngest retry exhaustion behavior undocumented
- **Found by**: Claude | **Verified**

#### W13: API Deprecation Policy Lacks v1-Specific Timeline [api-versioning-compliance]
- api.md §8.2 HAS deprecation framework: 6-month notice, Sunset header, migration guide
- But no specific v1 support window commitment (e.g., "v1 guaranteed for 12 months after v2")
- **Found by**: All 3 models (with nuance) | **Verified**

#### W14: No Backward Compatibility Guarantee Documented [api-versioning-compliance]
- No document defines breaking vs non-breaking changes within v1
- Consumers cannot know if additive-only changes are guaranteed
- **Found by**: Codex + Claude | **Verified**

### NOTEs

#### N1: Health Check Endpoints Unversioned [api-versioning-compliance]
- /health/live and /health/ready have no /api/v1/ prefix
- Standard practice; infrastructure endpoints excluded from API versioning
- **Found by**: All 3 models agree acceptable
- **Action**: Document exclusion in API versioning scope definition

---

## Debated Items

### 1. Gemini: Audit Service Sync Writes as Idempotency ERROR
- **Claim**: Audit Service uses synchronous writes in critical paths, creating latency risk
- **Gemini**: ERROR under idempotency-boundaries
- **Claude verdict**: **REJECT** — Audit writes ARE idempotent (deterministic UUID + ON CONFLICT DO NOTHING, per ADD §9.3). The synchronous write concern is about performance/availability (resilience-triad concern, Session 4), not idempotency. Wrong concern classification.

### 2. Codex: HITL Reject "reason" vs "comment" Field Mismatch
- **Claim**: ADD uses `reason` field for reject, OpenAPI uses `comment`
- **Codex**: ERROR (contradiction)
- **Claude verdict**: **REJECT** — ADD line 308 uses `reason: 'low_confidence'` and line 319 uses `reason: 'not_approved'` as **workflow return values**, NOT as HITL request body fields. The OpenAPI `comment` field in HitlDecisionRequest is for human approver text. Different contexts entirely.

### 3. Claude Lead Expert: Outbound Webhook Delivery No Idempotency
- **Claim**: Outbound webhook delivery has no documented idempotency
- **Claude subagent**: ERROR
- **Claude lead verdict**: **REJECT** — ADD §12.2 explicitly documents:
  - BullMQ jobId dedup: `jobId: 'webhook:${eventId}'` (line 2597)
  - Same `X-Webhook-ID` sent on each retry (line 2520)
  - "Receiver must handle duplicate deliveries idempotently" (line 2521)
  - Retry 3x exponential backoff
  Well-documented. Subagent missed this section.

### 4. Gemini: LLM Fallback Duplicate Cost
- **Claim**: LLM provider fallback carries duplicate billing risk
- **Gemini**: WARN
- **Claude verdict**: **ACCEPT as NOTE** — ADD §7.1.1 explicitly documents LLM requests as intentionally non-idempotent with rationale. Cost controls exist (§7.2). Risk is known and accepted by design. Informational only.

### 5. Deprecation Policy Severity
- **Gemini**: Found api.md §8.2 has a framework; flagged as WARN for lacking specifics
- **Codex/Claude**: Said "no deprecation policy" (overcounted)
- **Claude lead verdict**: **WARN** — api.md §8.2 DOES define a deprecation framework (6 months, Sunset header, migration guide). The gap is specifically about v1-specific commitment, not the absence of a policy.

---

## Actionable Recommendations

### Must Fix (ERRORs)

1. **E1**: Standardize idempotency header name to `Idempotency-Key` (IETF standard) across ADD, api.md, and OpenAPI spec
2. **E2**: Add `DELETE /api/v1/workflows/{workflowId}` to OpenAPI spec
3. **E3**: Add `checksum` (SHA-256) field to AuditExportStatus schema in OpenAPI spec
4. **E4**: Add event schema compatibility rules to common-patterns.md §5 or ADD
5. **E5**: Document outbound webhook event payload schemas (OpenAPI or separate spec)

### Should Address (WARNINGs)

6. **W1**: Add 429 response to HITL endpoints in OpenAPI
7. **W2**: Add owner/time-range filters to workflow instances endpoint
8. **W3**: Add traceId to ProblemDetails schema
9. **W4**: Document default sort ordering for paginated endpoints
10. **W13**: Add v1-specific support window to api.md §8.2
11. **W14**: Document breaking vs non-breaking change definitions

---

## Sign-Off

| Model | Verdict | Notes |
|-------|---------|-------|
| Gemini | **PASS** | All 5 fixes verified: header standardization, DELETE endpoint, checksum, event compatibility, webhook schemas |
| Codex | **PASS** | E1 PASS, E2 PASS, E3 PASS (after checksumSha256 alignment fix), E4 PASS, E5 PASS |
| Claude | **PASS** | All fixes verified; Codex correctly caught E3 naming inconsistency which was resolved |
