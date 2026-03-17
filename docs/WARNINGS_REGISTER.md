# Warnings Register

**Created**: 2026-03-04
**SSOT for**: WARNING-level findings and their dispositions (what was found, how it was resolved)
**NOT SSOT for**: Sprint allocation — see [Phase 1 Sprint Plan](06-sprints/phase-1-sprint-plan.md)
**Source data**: Per-concern/session `*_MULTI_REVIEW.md` files in `concerns/`, `concerns-2/`, and `concerns-3/`
**Disposition key**: `resolved` = fixed | `accepted` = acknowledged, not blocking | `addressed` = documented, implementation pending | `deferred` = Phase 2+ | `duplicate` = same finding in another session

### SSOT Boundaries

| Question | Where to look |
|----------|---------------|
| What was found? What's the disposition? | **This register** |
| What sprint is it mapped to? | [Phase 1 Sprint Plan](06-sprints/phase-1-sprint-plan.md) — sprint tasks trace to FRD requirements; WARNING items are folded in as hardening scope |
| What's the task status / who owns it? | [Phase 1 Sprint Plan](06-sprints/phase-1-sprint-plan.md) |
| What are the acceptance criteria? | [Sprint Plan](06-sprints/phase-1-sprint-plan.md) (tasks) or [Spike Specs](06-sprints/sprint-0-technical-spikes.md) (spikes) |

---

## Summary

### Tier 1: Foundational Correctness (5 concerns, 29 WARNINGs)

| Concern | Severity | ERRORs | WARNINGs | NOTEs | Resolved | Accepted | Open |
|---------|----------|--------|----------|-------|----------|----------|------|
| feasibility-check | mixed | 2 resolved | 6 | 3 | 6 | 0 | 0 |
| contradiction-scanner | mixed | 4 resolved | 8 | 4 | 8 | 0 | 0 |
| failure-domain-isolation | ERROR | 7 resolved | 5 | 0 | 5 | 0 | 0 |
| state-ownership-clarity | ERROR | 3 resolved | 5 | 0 | 4 | 1 | 0 |
| threat-model-coverage | ERROR | 8 resolved | 5 | 0 | 5 | 0 | 0 |
| **Total** | | **24 resolved** | **29** | **7** | **28** | **1** | **0** |

### Tier 2: Behavior Integrity (7 sessions, 126 findings)

| Session | Topic | WARNINGs | Duplicates | Unique | Resolved | Accepted | Deferred |
|---------|-------|----------|------------|--------|----------|----------|----------|
| 1 | Security | 14 | 0 | 14 | 13 | 1 | 0 |
| 2 | LLM/PII/Data | 12 | 0 | 12 | 8 | 3 | 1 |
| 3 | API/Schema | 14 | 0 | 14 | 11 | 2 | 1 |
| 4 | Resilience/Failure | 17 | 0 | 17 | 15 | 2 | 0 |
| 5 | SLA/Promise | 18 | 0 | 18 | 13 | 4 | 1 |
| 6 | Operational | 20 | 5 | 15 | 12 (+2 E1) | 2 | 0 |
| 7 | Testing/Observability | 31 | 0 | 31 | 24 (+1 N1) | 6 | 0 |
| **Total** | | **126** | **5** | **121** | **99** | **20** | **3** |

### Tier 3: Structural Validation (3 concerns, 3 ERRORs + 6 WARNINGs + 2 NOTEs)

| Concern | ERRORs | WARNINGs | NOTEs | Resolved |
|---------|--------|----------|-------|----------|
| horizontal-traceability | 0 | 3 (W1–W3) | 1 | 3 resolved |
| requirement-test-mapping | 1 (E1) | 3 (W4–W6) | 0 | 4 resolved |
| contradiction-scanner | 2 (E2, E3) | 0 | 1 | 2 resolved |
| **Total** | **3 resolved** | **6 resolved** | **2** | **9 resolved** |

### Combined Totals

| Category | Count | Notes |
|----------|-------|-------|
| Total WARNING findings | 160 | 29 Tier 1 + 125 Tier 2 + 6 Tier 3 |
| Total ERROR findings | 27 | 24 Tier 1 + 3 Tier 3 (all resolved) |
| Total NOTEs | 10 | 7 Tier 1 + 1 Tier 2 + 2 Tier 3 |
| Duplicates / overlaps | 6 | 5 within Tier 2 + 1 cross-tier (T1-W24 = S3-W7) |
| **Unique WARNINGs** | **154** | 148 Tier 1+2 + 6 Tier 3 |
| Resolved (no further action) | 122 | 23 T1 + 91 T2 + 9 T3 (excludes 8 T2 items with impl follow-ups) |
| Resolved (doc done, impl pending) | 0 | All implementation follow-ups completed across Sprints 1–7 |
| Resolved → Sprint 0 | 25 | Bucket B — empirically validated ✓ |
| Resolved → Sprints 1–7 | 32 | Bucket C — all implemented ✓ |
| Bucket D | 5 | 2 accepted + 3 deferred (Phase 2+) |
| **Total outstanding (needing action)** | **0** | All 37 Sprint-mapped items resolved in Phase 1 |

*All 32 Sprint 1–7 items fully implemented and verified.*
*All 9 Tier 3 findings (3 ERRORs + 6 WARNINGs) were resolved via documentation fixes.*
*Bucket D items (2 accepted, 3 deferred) are Phase 2+ scope — not blocking.*

---

## Implementation Work ✅ ALL COMPLETE

Consolidated view of all WARNINGs that required code, configuration, or empirical validation. All items resolved across Sprints 0–7. For task ownership, story points, and completion status, see the [Sprint Plan](06-sprints/phase-1-sprint-plan.md).

### Sprint 0: Empirical Validation (25 findings) ✅ ALL RESOLVED

All 25 findings empirically validated during spike week. 469 tests across 15 spikes (4 packages). See individual spike results for evidence.

| Spike | WARNING IDs | Theme |
|-------|-------------|-------|
| SP-01 | S7-W9 | Saga compensation path |
| SP-02 | S7-W8, S7-W20 | Inngest checkpoint recovery, HITL TTL expiry |
| SP-03 | S7-W3, S7-W21 | Auth failure paths, JWKS stale-if-error 24h |
| SP-04 | T1-W24 / S3-W7 | Novu dedup window |
| SP-07 | S5-W6, S5-W8, S5-W12 | Inngest free tier limits, throughput |
| SP-08 | S7-W18 | LLM budget cap boundary |
| SP-09 | S7-W7, S7-W19 | DB connection pool exhaustion |
| SP-10 | S7-W2, S7-W13, S7-W23 | Circuit breaker fallback, DLQ routing, retry/timeout coherence |
| SP-14 | S7-W10, S7-W11 | HITL race condition, webhook signature verification |
| SP-15 | S6-W8, S7-W4, S7-W5, S7-W6, S7-W12, S7-W15, S7-W16, S7-W17, S7-W22 | Third-party degradation, boundary tests |

### Sprint 1: LLM Gateway (3 items) ✅ ALL RESOLVED

| WARNING | Finding | Task |
|---------|---------|------|
| S2-W1 | Per-user/session LLM rate limits | LLM-10 *(implemented — `TokenBucket` in `@aptivo/llm-gateway`)* |
| S2-W11 | Non-LLM cost attribution instrumentation | LLM-06 *(implemented — `CostBreakdown` with infra overhead)* |
| S1-W13 | LLM output validation | LLM-08 *(implemented — `validateOutput()` Zod validation)* |

### Sprint 2: HITL Gateway + RBAC (1 item) ✅ RESOLVED

| WARNING | Finding | Task |
|---------|---------|------|
| S1-W5 | Session revocation endpoint | HITL-11 *(implemented — `revokeSession()` in `@aptivo/hitl-gateway`)* |

### Sprint 3: MCP Layer + File Storage (4 items) ✅ ALL RESOLVED

| WARNING | Finding | Task |
|---------|---------|------|
| S3-W11 | Inngest event schema validation at publish-time | MCP-09 *(implemented — `createValidatedSender()` in `@aptivo/mcp-layer/events`)* |
| S4-W9 | Data deletion checkpoint workflow | MCP-10 *(resolved — `executeDataDeletion()` core + Inngest function wrapper wired in Sprint 5 composition root)* |
| S1-W14 | MCP response size enforcement | MCP-06 *(implemented — `Buffer.byteLength` check in `mcp-wrapper.ts`)* |
| S6-W20 | ClamAV health check | FS-03 *(implemented — `ClamAvScanner.healthCheck()` in `@aptivo/file-storage/scanner`)* |

### Sprint 4: Audit Service + Notification Bus (1 item) ✅ RESOLVED

| WARNING | Finding | Task |
|---------|---------|------|
| T1-W21 | Audit sync → async with timeout + DLQ | AUD-04 *(implemented — `createAsyncAuditWriter()` + DLQ + exponential backoff replay in `@aptivo/audit/async`)* |

### Sprint 5: Integration & Hardening (23 items) ✅ 22 RESOLVED, 1 N/A

#### INT-04: Alerting & Monitoring (7) ✅ ALL RESOLVED

| WARNING | Finding | Status |
|---------|---------|--------|
| S5-W13 | Workflow success rate SLO alert | **resolved** (implemented) — `workflowSuccessAlert` in `apps/web/src/lib/observability/slo-alerts.ts` |
| S5-W14 | HITL delivery latency SLO alert | **resolved** (implemented) — `hitlLatencyAlert` in `slo-alerts.ts` |
| S5-W15 | MCP success rate SLO alert | **resolved** (implemented) — `mcpSuccessAlert` in `slo-alerts.ts` |
| S5-W16 | Audit integrity SLO alert | **resolved** (implemented) — `auditIntegrityAlert` in `slo-alerts.ts` |
| S2-W12 | LLM spend dashboard | **resolved** (implemented) — LLM Usage Dashboard API (`/api/admin/llm-usage` + `/api/admin/llm-usage/budget`) with cost-by-domain, cost-by-provider, daily totals, $5/day alert threshold, budget status. Minimal admin page at `/admin/llm-usage`. (S7-INT-03) |
| S4-W10 | Retention failed run detection | **resolved** (implemented) — `retentionFailureAlert` evaluator in `slo-alerts.ts`, wired via SLO cron (S6-CF-01) |
| T1-W23 | Notification delivery monitoring | **resolved** (implemented) — `notificationDeliveryAlert` evaluator in `slo-alerts.ts`, wired via SLO cron (S6-CF-01) |

#### INT-05: Runtime Hardening (2) — 2 RESOLVED

| WARNING | Finding | Status |
|---------|---------|--------|
| S6-W17 | Readiness/startup probes | **resolved** (implemented) — `/health/live` + `/health/ready` with DB check in `apps/web/src/app/health/` |
| S6-W18 | Graceful shutdown implementation | **resolved** (implemented) — `registerShutdownHandlers()` with 30s grace in `apps/web/src/lib/shutdown.ts` |

#### INT-06: Security Hardening (8) — 8 RESOLVED

| WARNING | Finding | Status |
|---------|---------|--------|
| T1-W27 | Outbound webhook SSRF validation | **resolved** (implemented) — `validateWebhookUrl()` in `apps/web/src/lib/security/ssrf-validator.ts` |
| T1-W28 | Inbound webhook body limits + HMAC | **resolved** (implemented) — `verifyHmacSignature()` + body limits in `security/body-limits.ts` |
| T1-W29 | Health check info disclosure | **resolved** (implemented) — health routes stripped to `{ status: 'ok' }` only |
| S2-W2 | PII-safe logging (`sanitizeForLogging`) | **resolved** (implemented) — `sanitizeForLogging()` in `security/sanitize-logging.ts` |
| S2-W3 | Access log PII implementation | **resolved** (implemented) — `hashQueryParam()` in `security/sanitize-logging.ts` |
| S1-W8 | Zero-downtime rotation implementation | **resolved** (implemented) — dual-key JWT rotation pattern documented + security headers |
| S1-W11 | Webhook body size enforcement | **resolved** (implemented) — `WEBHOOK_MAX_BODY_BYTES` (256KB) in `security/body-limits.ts` |
| S1-W12 | Global API body size/depth enforcement | **resolved** (implemented) — `API_MAX_BODY_BYTES` (1MB) + `MAX_JSON_DEPTH` (10) in `security/body-limits.ts` |

#### INT-08: Trace Context Propagation (6) — 5 RESOLVED, 1 N/A

| WARNING | Finding | Status |
|---------|---------|--------|
| S7-W24 | Inngest `waitForEvent()` trace propagation | **resolved** (implemented) — `traceparent` field in HITL event schemas (`hitl-step.ts`) |
| S7-W25 | BullMQ job trace context | N/A — BullMQ not used in Phase 1; context-propagation helpers available for future use |
| S7-W26 | Novu notification trace context | **resolved** (implemented) — `traceId` in Novu trigger payload (`novu-adapter.ts`) |
| S7-W27 | MCP tool call trace context | **resolved** (implemented) — `traceparent` in tool call `_metadata` (`agentkit-adapter.ts`) |
| S7-W29 | Supabase JWT validation span | **resolved** (implemented) — span helpers in `apps/web/src/lib/tracing/context-propagation.ts` |
| S7-W30 | Outbound webhook trace context | **resolved** (implemented) — `injectTraceparent()` helper in `context-propagation.ts` |

### Bucket D: Not Mapped (5 items)

| WARNING | Finding | Disposition |
|---------|---------|-------------|
| T1-W22 | PostgreSQL shared DB SPOF | accepted — Phase 1 risk (ADD §2.3.2) |
| S3-W9 | MCP Redis recovery edge case | accepted — human review required |
| S2-W5 | PII read audit trail | **resolved** (implemented) — `createPiiReadAuditMiddleware()` in `@aptivo/audit/middleware` (Sprint 12, OBS-04) |
| S3-W10 | Event schema rollout order | **resolved** (documentation) — Event Schema Rollout Policy in ADD §12.5 |
| S5-W17 | Burn-rate alerting | **resolved** (implemented) — multi-window burn-rate alerting in `slo-alerts.ts` (Sprint 12, OBS-01) |

---

## Tier 1 Findings

### Concern 1: Feasibility Check

**Date**: 2026-02-26 | **All WARNINGs resolved**

| ID | Finding | Recommendation | Models | Disposition |
|----|---------|----------------|--------|-------------|
| T1-W1 | NATS JetStream redundant — zero Phase 1 runtime responsibilities | Remove from Phase 1 across all docs | All 3 | **resolved** (removed from ADD, Runbook, TSD, config, guidelines, observability) |
| T1-W2 | Novu Telegram integration assumed — not cleanly documented | Verify via web search | All 3 | **resolved** (web-verified, citations added to ADD §6.4) |
| T1-W3 | LLM provider rate limits undocumented — vendor claims without evidence | Add rate limit reference table | All 3 | **resolved** (ADD §7.1.2 rate limit table added) |
| T1-W4 | Supabase SSO/OIDC requires Pro tier — FRD assumes free tier | Defer SSO to Phase 2+ | All 3 | **resolved** (FRD FR-CORE-ID-001 updated, SSO deferred) |
| T1-W5 | LangGraph.js + Inngest compatibility unvalidated | Spike required | All 3 | **resolved** (covered by Sprint 0 spikes SP-01/SP-08/SP-12) |
| T1-W6 | ClamAV deployment unspecified — ADD lacks container details | Specify container deployment | All 3 | **resolved** (ADD §9.8.2 deployment spec added) |
| T1-N1 | DO pricing underestimated ($50-100 → realistic $80-150/mo) | — | All 3 | note |
| T1-N2 | Documentation circularity partially addressed — verification blocks added | — | All 3 | note |
| T1-N3 | Idempotency design is strong (positive finding) | — | All 3 | note |

### Concern 2: Contradiction Scanner

**Date**: 2026-02-26 | **All WARNINGs resolved**

| ID | Finding | Recommendation | Models | Disposition |
|----|---------|----------------|--------|-------------|
| T1-W7 | PostgreSQL 18 vs 16 — PG 18 unreleased, configs use 16 | Standardize on PG 16 | Codex, Claude | **resolved** (ADD, TSD, project-structure.md updated to 16) |
| T1-W8 | BRD "Message Queue: Buy" ghost reference after NATS removal | Update BRD row | Gemini, Claude | **resolved** (BRD row updated to "Buy (Phase 2+)") |
| T1-W9 | File size max 50MB (FRD) vs 100MB (API Spec) | Align to FRD default | Codex, Claude | **resolved** (API Spec aligned to 50MB) |
| T1-W10 | Traefik vs DO managed load balancer | Scope Traefik to local dev | Codex, Claude | **resolved** (TSD scoped Traefik to local dev) |
| T1-W11 | File scan status enums differ (ADD vs API Spec) | Unify lifecycle model | Codex | **resolved** (API Spec aligned with ADD scanStatus) |
| T1-W12 | Kubernetes Probes section in configuration.md | Update for DO App Platform | Claude | **resolved** (resolved with E1 health check fix) |
| T1-W13 | OTel health path filters differ across docs | Align to /health/live, /health/ready | Claude | **resolved** (resolved with E1 health check fix) |
| T1-W14 | DR playbook stale references (RDS, Route53, secondary region) | Update for DO reality | Codex, Claude | **resolved** (Runbook DR section updated) |
| T1-N4 | NATS in project-structure.md Phase 2 evaluation — consistent with deferral | — | Gemini, Claude | note |
| T1-N5 | Novu dedup window internal note — ADD correctly acknowledges "not publicly documented" | — | Gemini, Claude | note |
| T1-N6 | Worker fleet claim vs docker-compose worker — "no worker fleet" refers to Temporal-style, not zero containers | — | Gemini | note |
| T1-N7 | RTO <1min vs <4hr — different failure modes (process restart vs regional DR), not contradictory | — | Claude | note |

### Concern 3: Failure Domain Isolation

**Date**: 2026-02-28 | **All WARNINGs resolved**

| ID | Finding | Recommendation | Models | Disposition |
|----|---------|----------------|--------|-------------|
| T1-W15 | No explicit criticality classification for any component | Add criticality tiers to each component | Codex, Claude | **resolved** (ADD §2.3 failure domain map assigns criticality to all 12 components) |
| T1-W16 | Schema isolation conflated with failure isolation — PostgreSQL cross-schema contention risk | Document distinction between data isolation and failure isolation | Claude, Codex | **resolved** (documentation) |
| T1-W17 | MCP circuit breaker config not per-tool — hardcoded parameters | Document per-tool tuning or accept global config | Claude | **resolved** (documentation) |
| T1-W18 | Notification Bus — no fallback for Novu outage, HITL workflows timeout silently | Document fallback channel or accept risk | Claude | **resolved** (documentation) |
| T1-W19 | HITL blast radius vague — dependent workflows and business impact not mapped | Map which workflows use HITL and their business impact | Claude | **resolved** (documentation) |

### Concern 4: State Ownership Clarity

**Date**: 2026-02-28 | **All WARNINGs resolved** (1 accepted: T1-W22)

| ID | Finding | Recommendation | Models | Disposition |
|----|---------|----------------|--------|-------------|
| T1-W20 | Redis cache invalidation strategy missing — ADD doesn't reference TSD CacheInvalidation interface | Reference TSD common-patterns.md §6.2 from ADD; document per-consumer invalidation protocol | Claude | **resolved** (documentation) |
| T1-W21 | Audit Service synchronous writes — `await auditService.log()` blocks critical paths | Implement timeout + DLQ (ADD §2.3.2 already recommends this) | Gemini, Claude | **resolved** (implemented) — `createAsyncAuditWriter()` with 5s timeout + DB-backed DLQ + exponential backoff replay in `@aptivo/audit/async` (AUD-04) |
| T1-W22 | PostgreSQL shared database — all components share single instance with schema isolation | Accepted Phase 1 risk; documented in ADD §2.3.2 with Phase 2 upgrade path | Gemini, Claude | accepted |
| T1-W23 | Notification delivery monitoring — Novu failures are silent from platform perspective | Add monitoring for failed HITL notifications | Claude | **resolved** (implemented) — `notificationDeliveryAlert` evaluator in SLO cron (S6-CF-01) |
| T1-W24 | Novu transactionId deduplication window unknown — should be validated during integration testing | Validate during integration testing | Claude | **resolved** (empirically validated — SP-04) |

### Concern 5: Threat Model Coverage

**Date**: 2026-02-28 | **All WARNINGs resolved**

| ID | Finding | Recommendation | Models | Disposition |
|----|---------|----------------|--------|-------------|
| T1-W25 | Security controls scattered without threat-to-mitigation mapping | Reorganize into STRIDE threat models | All 3 | **resolved** (ADD §14 maps all controls to specific threats) |
| T1-W26 | No security residual risk acknowledged anywhere | Add residual risk register | Claude | **resolved** (ADD §14.9 Residual Risk Register with 9 risks) |
| T1-W27 | Outbound webhook SSRF risk — no URL validation for user-supplied webhook URLs | Add private IP / metadata endpoint blocking | Codex, Claude | **resolved** (implemented) — `validateWebhookUrl()` in `apps/web/src/lib/security/ssrf-validator.ts` (INT-06) |
| T1-W28 | Inbound webhook incomplete threat coverage — additionalProperties:true, no body size limit | Document body size limit, HMAC algorithm, secret rotation | Codex, Claude | **resolved** (implemented) — `verifyHmacSignature()` + body limits in `security/body-limits.ts` (INT-06) |
| T1-W29 | Health check information disclosure — unauthenticated endpoints return dependency status | Reduce health check detail on public endpoints | Claude | **resolved** (implemented) — health routes stripped to `{ status: 'ok' }` only (INT-06) |

---

## Tier 2 Findings

**Duplicates identified** (Session 6 re-discovered findings from Sessions 4–5):
- S6-W4 (LLM runbook) = S4-W13
- S6-W5 (File Storage runbook) = S4-W14
- S6-W7 (Vendor contacts) = S4-W17
- S6-W11 (Feature flag contradiction) = S5-W4
- S6-W3 (Regional SaaS isolation) overlaps S5-W6/W7

**Cross-tier duplicate**: S3-W7 (Novu dedup window) = T1-W24

### Session 1: Security Deep-Dive

| ID | Concern | Finding | Recommendation | Models | Disposition |
|----|---------|---------|----------------|--------|-------------|
| S1-W1 | auth-boundary | Access control matrix missing — no role-to-endpoint mapping | Add matrix to ADD §8.3 | All 3 | **resolved** (documentation) |
| S1-W2 | auth-scheme | MFA enforcement not designed — FRD requires it, ADD has no flow | Document MFA step-up operations and Supabase MFA integration | All 3 | **resolved** (documentation) |
| S1-W3 | auth-boundary | Session controls deferred to Supabase defaults | Document Supabase session control configuration | Codex, Claude | **resolved** (documentation) |
| S1-W4 | auth-scheme | JWT token lifetimes / refresh / storage undocumented | Document JWT lifetimes, refresh rotation, storage location | Claude | **resolved** (documentation) |
| S1-W5 | auth-scheme | Session revocation lacks app-level API | Add application-level session revocation endpoint | Claude | accepted — mapped to Sprint 2 (HITL-11) |
| S1-W6 | secrets-mgmt | Rotation cadence conflicts: Config spec vs Runbook values differ | Reconcile rotation cadences across docs | All 3 | **resolved** (documentation) |
| S1-W7 | secrets-mgmt | BRD says "Vault or equivalent" but ADD uses DO env vars | Reconcile BRD Vault reference with Phase 1 reality | Gemini | **resolved** (documentation) |
| S1-W8 | secrets-mgmt | Zero-downtime rotation procedures absent | Add dual-key support and step-by-step rotation procedures | All 3 | **resolved** (implemented) — dual-key JWT rotation pattern + security headers (INT-06) |
| S1-W9 | secrets-mgmt | 6 secrets have no rotation cadence (webhook HMAC, Inngest, etc.) | Add rotation cadences for all 6 | Codex, Claude | **resolved** (documentation) |
| S1-W10 | secrets-mgmt | Per-secret access control undocumented | Document who/what can access each secret | Codex, Claude | **resolved** (documentation) |
| S1-W11 | input-validation | Inbound webhook payload size — no body size limit | Document webhook body size limit | Codex, Claude | **resolved** (implemented) — `WEBHOOK_MAX_BODY_BYTES` (256KB) in `security/body-limits.ts` (INT-06) |
| S1-W12 | input-validation | Global API body size/depth limit undocumented | Document gateway-level JSON body limits | Codex, Claude | **resolved** (implemented) — `API_MAX_BODY_BYTES` (1MB) + `MAX_JSON_DEPTH` (10) in `security/body-limits.ts` (INT-06) |
| S1-W13 | input-validation | LLM output validation — untrusted external input, no validation | Document LLM output validation strategy | Claude | **resolved** (implemented) — `validateOutput()` in `@aptivo/llm-gateway` (LLM-08) |
| S1-W14 | input-validation | MCP tool response size limits — no max response size or memory cap | Document MCP response size and memory limits | Claude | **resolved** (implemented) — `Buffer.byteLength` check vs `tool.maxResponseBytes` in `mcp-wrapper.ts` (MCP-06) |

### Session 2: LLM + PII + Data Compliance

| ID | Concern | Finding | Recommendation | Models | Disposition |
|----|---------|---------|----------------|--------|-------------|
| S2-W1 | llm-safety | Per-user/session token limits missing — one user can exhaust domain budget | Add per-user or per-session LLM rate limits | Codex, Claude | **resolved** (implemented) — `TokenBucket` in `@aptivo/llm-gateway` (LLM-10) |
| S2-W2 | logging-pii | `sanitizeForLogging` only redacts auth fields, not PII | Extend to redact email, name, phone, address | Claude | **resolved** (implemented) — `sanitizeForLogging()` in `apps/web/src/lib/security/sanitize-logging.ts` (INT-06) |
| S2-W3 | logging-pii | Access log PII not addressed (LB IPs, URLs, user agents) | Address PII in platform-level access logs | Claude | **resolved** (implemented) — `hashQueryParam()` in `security/sanitize-logging.ts` (INT-06) |
| S2-W4 | logging-pii | App log retention not aligned with PII retention | Align log retention with PII requirements | Claude | **resolved** (documentation) |
| S2-W5 | logging-pii | No audit trail for general PII data access (read operations) | Add audit for PII read operations | Claude | **resolved** (implemented) — `createPiiReadAuditMiddleware()` + `withPiiReadAudit` HOF in `@aptivo/audit/middleware` (Sprint 12, OBS-04) |
| S2-W6 | data-retention | Legal basis not documented per data type | Map legal basis to each PII data type | All 3 | **resolved** (documentation) |
| S2-W7 | data-retention | Consent collection/withdrawal mechanism undocumented | Document consent management mechanism | Claude, Gemini | **resolved** (documentation) |
| S2-W8 | data-retention | Deletion cascade across systems undocumented | Document deletion cascade across all storage systems | Claude | **resolved** (documentation) |
| S2-W9 | cost-budget | No budget caps for infrastructure resources (DB, Redis, Spaces) | Document budget caps and exceed behavior | All 3 | **resolved** (documentation) |
| S2-W10 | cost-budget | No free-tier-exceed behavior for SaaS (Novu, Inngest, Supabase) | Document SaaS free tier limits and exceed behavior | Claude | **resolved** (documentation) |
| S2-W11 | cost-budget | No cost attribution for non-LLM resources | Add cost attribution to infrastructure/SaaS | Codex, Claude | **resolved** (implemented) — `CostBreakdown` with infra overhead in `@aptivo/llm-gateway` (LLM-06) |
| S2-W12 | cost-budget | LLM spend observability — no dashboard or alerting workflow | Document LLM spend monitoring dashboard | Codex | **resolved** (implemented) — S7-INT-03: LLM Usage Dashboard API + budget endpoint |

### Session 3: API Contracts & Schema

| ID | Concern | Finding | Recommendation | Models | Disposition |
|----|---------|---------|----------------|--------|-------------|
| S3-W1 | api-contract | 429 TooManyRequests missing on HITL endpoints | Add 429 to HITL endpoints in OpenAPI | Codex, Claude | **resolved** (documentation) |
| S3-W2 | api-contract | Workflow instances missing filter parameters (owner, time range) | Add filters per FRD FR-CORE-WFE-002 | Claude | **resolved** (documentation) |
| S3-W3 | api-contract | ProblemDetails missing traceId field | Add traceId to ProblemDetails schema | Claude | **resolved** (documentation) |
| S3-W4 | api-contract | No stable ordering on paginated endpoints | Document default sort ordering | Codex, Claude | **resolved** (documentation) |
| S3-W5 | api-contract | Rate limiting incomplete — values undocumented, only on magic-link | Document rate limit values across endpoints | Claude | **resolved** (documentation) |
| S3-W6 | idempotency | Workflow CRUD no explicit idempotency for POST | Document idempotency strategy for workflow creation | Codex, Claude | **resolved** (documentation) |
| S3-W7 | idempotency | Novu transactionId dedup window undocumented | Validate via integration testing | Codex, Claude | **resolved** (empirically validated — SP-04) *(= T1-W24)* |
| S3-W8 | idempotency | Role assignment implicitly idempotent — not explicit | Explicitly document role assignment idempotency | Codex | **resolved** (documentation) |
| S3-W9 | idempotency | MCP Redis recovery edge case — financial operation duplicate risk | Requires human review for risk acceptance | Claude | accepted |
| S3-W10 | event-schema | No rollout order for event schema changes | Document consumers-first rollout policy | Gemini, Claude | **resolved** (documentation) — Event Schema Rollout Policy in ADD §12.5 |
| S3-W11 | event-schema | No schema registry/validation for Inngest events | Add enforced schema validation at publish time | Codex, Claude | **resolved** (implemented) — `createValidatedSender()` with Zod `safeParse` gate in `@aptivo/mcp-layer/events` (MCP-09) |
| S3-W12 | event-schema | No dead-letter strategy for event schema failures | Document DLQ strategy for failed deserialization | Claude | **resolved** (documentation) |
| S3-W13 | api-versioning | API deprecation policy lacks v1-specific timeline | Add v1 support window commitment | All 3 | **resolved** (documentation) |
| S3-W14 | api-versioning | No backward compatibility guarantee documented | Document breaking vs non-breaking change definitions | Codex, Claude | **resolved** (documentation) |

### Session 4: Resilience & Failure Modes

| ID | Concern | Finding | Recommendation | Models | Disposition |
|----|---------|---------|----------------|--------|-------------|
| S4-W1 | resilience-triad | MCP triad coherence not explicitly documented | Document coherence calculation and Inngest step timeout | Gemini | **resolved** (documentation) |
| S4-W2 | resilience-triad | LLM retry idempotency/cost impact | Document cost-limiting mechanism or accept risk | Claude | **resolved** (documentation) |
| S4-W3 | resilience-triad | TSD-ADD documentation split for timeout/retry values | Cross-reference TSD §7.2 in ADD sections | Claude, Codex | **resolved** (documentation) |
| S4-W4 | cache-consistency | Entity cache freshness SLO not explicit | Add explicit freshness SLO statement | Claude, Codex | **resolved** (documentation) |
| S4-W5 | cache-consistency | Session cache invalidation undocumented | Document or accept JWT-based auth as sufficient | Codex | **resolved** (documentation) |
| S4-W6 | cache-consistency | Cache warming / cold start behavior undocumented | Document cold-start latency expectations | Claude | **resolved** (documentation) |
| S4-W7 | cache-consistency | TTL-only invalidation risk for some data patterns | Document rationale for TTL-only vs event-driven | Claude | **resolved** (documentation) |
| S4-W8 | durable-persistence | Inngest durability guarantees not documented | Reference Inngest's SLA documentation | Claude, Codex | **resolved** (documentation) |
| S4-W9 | durable-persistence | Data deletion has no checkpoint strategy | Implement as Inngest workflow with per-storage steps | Claude | **resolved** (implemented) — `executeDataDeletion()` with `DeletionCheckpoint` types in `@aptivo/mcp-layer/workflows` (MCP-10); Inngest function wrapper wired in Sprint 5 composition root |
| S4-W10 | durable-persistence | Retention enforcement — no failed run detection | Add monitoring for failed retention runs | Claude | accepted — mapped to Sprint 4 (INT-04) |
| S4-W11 | durable-persistence | PostgreSQL projection divergence — no reconciliation | Document divergence detection mechanism | Claude | **resolved** (documentation) |
| S4-W12 | failure-mode | MCP circuit breaker sustained open — no runbook | Add runbook entry | Claude, Codex | **resolved** (documentation) |
| S4-W13 | failure-mode | LLM provider failure / budget exhaustion — no runbook | Add runbook playbook | Claude, Codex | **resolved** (documentation) |
| S4-W14 | failure-mode | File Storage / ClamAV — no runbook | Add runbook playbook | Claude | **resolved** (documentation) |
| S4-W15 | failure-mode | BullMQ job queue stall — no runbook | Add runbook entry | Claude | **resolved** (documentation) |
| S4-W16 | failure-mode | HITL TTL cascade during Novu outage | Document behavior and mitigation | Claude | **resolved** (documentation) |
| S4-W17 | failure-mode | Runbook playbooks lack vendor-specific escalation contacts | Add vendor contacts to each playbook | Claude, Codex | **resolved** (documentation) |

### Session 5: SLA & Promise Validation

| ID | Concern | Finding | Recommendation | Models | Disposition |
|----|---------|---------|----------------|--------|-------------|
| S5-W1 | sla-architecture | HITL latency ambiguity — unclear what "<10s P95" measures | Define measurement point in BRD §5 | All 3 | **resolved** (documentation) |
| S5-W2 | sla-architecture | Audit integrity gap — SQL-only, no tamper detection | Clarify Phase 1 = completeness, not tamper-proof | Claude, Codex | **resolved** (documentation) |
| S5-W3 | sla-architecture | DR RTO untested — no test procedure or validation evidence | Add DR test procedure to Runbook | Claude, Gemini | **resolved** (documentation) |
| S5-W4 | sla-architecture | Feature flag rollout contradiction — Runbook vs ADD | Clarify Runbook §2.4 for Phase 1 reality | Claude | **resolved** (documentation) |
| S5-W5 | sla-architecture | PostgreSQL SPOF vs >99% success rate — accepted risk | Document SPOF allowance within error budget | Claude, Codex | **resolved** (documentation) |
| S5-W6 | sla-architecture | Inngest dependency for workflow SLA — single point, limits unknown | Document Inngest free tier limits | All 3 | **resolved** (empirically validated — SP-07) |
| S5-W7 | sla-architecture | Novu single notification path — no fallback provider | Document single-path acceptance | Claude | **resolved** (documentation) |
| S5-W8 | scalability | 10K sleeping workflows unvalidated — no load test or capacity model | Create load test plan; research Inngest limits | All 3 | **resolved** (empirically validated — SP-07) |
| S5-W9 | scalability | DB connection pool bottleneck (max 20) | Document connection-per-container calculation | Claude, Codex | **resolved** (documentation) |
| S5-W10 | scalability | Redis OOM risk — no per-consumer memory budget | Document memory budget per consumer | Claude, Codex | **resolved** (documentation) |
| S5-W11 | scalability | Auto-scaling triggers unspecified (1–3 containers) | Document trigger thresholds and cooldown | Gemini, Codex | **resolved** (documentation) |
| S5-W12 | scalability | Inngest throughput limits unknown | Research and document | Claude, Gemini | **resolved** (empirically validated — SP-07) |
| S5-W13 | alerting-slo | Workflow success rate SLO — no alert | Add workflow-specific alert | All 3 | **resolved** (implemented) — `workflowSuccessAlert` in `apps/web/src/lib/observability/slo-alerts.ts` (INT-04) |
| S5-W14 | alerting-slo | HITL delivery latency SLO — no specific alert | Add HITL-specific latency alert | All 3 | **resolved** (implemented) — `hitlLatencyAlert` in `slo-alerts.ts` (INT-04) |
| S5-W15 | alerting-slo | MCP success rate SLO — no alert | Add MCP success rate alert | Claude, Codex | **resolved** (implemented) — `mcpSuccessAlert` in `slo-alerts.ts` (INT-04) |
| S5-W16 | alerting-slo | Audit integrity SLO — no alert | Add audit completeness alert | Claude | **resolved** (implemented) — `auditIntegrityAlert` in `slo-alerts.ts` (INT-04) |
| S5-W17 | alerting-slo | No burn-rate alerting for any SLO | Document burn-rate alert plan | All 3 | **resolved** (implemented) — `workflowBurnRateAlert` + `mcpBurnRateAlert` in `slo-alerts.ts` (Sprint 12, OBS-01) |
| S5-W18 | alerting-slo | No SLO-alert cross-reference document | Create SLO-to-alert mapping table | All 3 | **resolved** (documentation) |

### Session 6: Operational Readiness

| ID | Concern | Finding | Recommendation | Models | Disposition |
|----|---------|---------|----------------|--------|-------------|
| S6-W1 | regional-failure | Phase 1 DR missing failback procedure | ~~Add failback procedure~~ | All 3 | **resolved** (E1 fix) |
| S6-W2 | regional-failure | Phase 1 DR missing decision criteria | ~~Add time-based thresholds~~ | Claude | **resolved** (E1 fix) |
| S6-W3 | regional-failure | Regional isolation boundaries — SaaS dep availability unmapped | Map SaaS deps during DO outage | Claude | **resolved** (documentation) |
| S6-W4 | dependency-runbook | LLM providers lack runbook playbook | Add LLM outage playbook | Claude, Codex | **duplicate** of S4-W13 |
| S6-W5 | dependency-runbook | File Storage lacks runbook playbook | Add file storage outage playbook | Claude, Codex | **duplicate** of S4-W14 |
| S6-W6 | dependency-runbook | ClamAV lacks runbook entry | Add ClamAV failure runbook | Claude | **resolved** (documentation) |
| S6-W7 | dependency-runbook | Vendor contact directory missing | Create vendor contact directory | All 3 | **duplicate** of S4-W17 |
| S6-W8 | dependency-runbook | Dependency fallback strategies untested | Link chaos testing to specific fallbacks | Claude | **resolved** (empirically validated — SP-15) |
| S6-W9 | rollback | Application rollback procedure vague | Add specific commands, version ID, manual fallback | Claude, Codex | **resolved** (documentation) |
| S6-W10 | rollback | Database migration rollback underspecified | Document script location, commands, CI validation | All 3 | **resolved** (documentation) |
| S6-W11 | rollback | Feature flag rollback contradicts Phase 1 reality | Fix Runbook §2.4 for Phase 1 | Claude | **duplicate** of S5-W4 |
| S6-W12 | rollback | Secret rotation has no rollback procedure | Add rollback procedure to Runbook §4.3 | Claude | **resolved** (documentation) |
| S6-W13 | rollback | Infrastructure changes have no rollback procedure | Document app spec rollback via doctl | Claude, Codex | **resolved** (documentation) |
| S6-W14 | rollback | Inngest workflow rollback interaction undocumented | Document in-flight workflow behavior during rollback | Claude | **resolved** (documentation) |
| S6-W15 | rollback | Multi-component rollback ordering not documented | Document service vs migration rollback priority | Claude | **resolved** (documentation) |
| S6-W16 | container-orch | Resource limits use provider slugs, not absolute units | Document actual CPU/memory behind slugs | All 3 | **resolved** (documentation) |
| S6-W17 | container-orch | Health check only configures liveness in app spec | Configure readiness/startup probes | Claude, Codex | **resolved** (implemented) — `/health/live` + `/health/ready` with DB check (INT-05) |
| S6-W18 | container-orch | Graceful shutdown (SIGTERM) not documented | Document drain period and in-flight request handling | All 3 | **resolved** (implemented) — `registerShutdownHandlers()` with 30s grace (INT-05) |
| S6-W19 | container-orch | Workflow worker health check undocumented | Clarify production deployment model | Claude | **resolved** (documentation) |
| S6-W20 | container-orch | ClamAV health check not configured | Add container-level health check | Claude | **resolved** (implemented) — `ClamAvScanner.healthCheck()` with clamd `PING` in `@aptivo/file-storage/scanner` (FS-03) |

### Session 7: Testing & Observability

| ID | Concern | Finding | Recommendation | Models | Disposition |
|----|---------|---------|----------------|--------|-------------|
| S7-W1 | error-path | Systemic: no error path test section exists | Create "Error Path & Negative Testing" section in testing docs | All 3 | **resolved** (documentation) |
| S7-W2 | error-path | Circuit breaker fallback untested | Test MCP (5 failures → open) and LLM (3 failures per provider) fallback | All 3 | **resolved** (empirically validated — SP-10) |
| S7-W3 | error-path | Auth failure paths untested | Test JWKS stale-if-error 24h, expired token, Supabase outage | Codex, Claude | **resolved** (empirically validated — SP-03) |
| S7-W4 | error-path | Redis per-consumer degradation untested | Test 4 distinct fail policies (MCP closed, rate/dedup/sessions open) | Claude | **resolved** (empirically validated — SP-15) |
| S7-W5 | error-path | Retry exhaustion final behavior untested | Test behavior after all retries exhausted for 8 dependencies | All 3 | **resolved** (empirically validated — SP-15) |
| S7-W6 | error-path | Audit service blocking untested | Test sync audit write blocking HITL/file access | Gemini, Claude | **resolved** (empirically validated — SP-15) |
| S7-W7 | error-path | DB connection pool exhaustion untested | Test 21st connection behavior | Claude | **resolved** (empirically validated — SP-09) |
| S7-W8 | error-path | Inngest checkpoint recovery untested | Test memoized steps not re-executed after recovery | Claude | **resolved** (empirically validated — SP-02) |
| S7-W9 | error-path | Saga compensation path untested | Test compensation states and crash-during-compensation | Claude | **resolved** (empirically validated — SP-01) |
| S7-W10 | error-path | HITL decision race condition untested | Test concurrent INSERT ON CONFLICT approval behavior | Claude | **resolved** (empirically validated — SP-14) |
| S7-W11 | error-path | Webhook signature verification failure untested | Test 401 on invalid signature, replay protection | Claude | **resolved** (empirically validated — SP-14) |
| S7-W12 | error-path | LLM provider fallback untested | Test primary→secondary switching on 429/5xx | Codex, Claude | **resolved** (empirically validated — SP-15) |
| S7-W13 | error-path | Dead letter queue untested | Test DLQ routing for system.event.dlq | Claude | **resolved** (empirically validated — SP-10) |
| S7-W14 | boundary | Systemic: 0 of 25 boundaries have test specs | Create "Boundary Condition Tests" section | All 3 | **resolved** (documentation) |
| S7-W15 | boundary | API rate limit (100 req/min, burst 20) untested | Test at-100th/over-101st request | Codex, Claude | **resolved** (empirically validated — SP-15) |
| S7-W16 | boundary | File upload size (50MB) untested | Test at-limit/over-limit for 52428800 bytes | All 3 | **resolved** (empirically validated — SP-15) |
| S7-W17 | boundary | Pagination max=200 untested | Test 200 succeeds / 201 rejected | Codex, Claude | **resolved** (empirically validated — SP-15) |
| S7-W18 | boundary | LLM budget caps ($50 daily, $500 monthly) untested | Test boundary enforcement | All 3 | **resolved** (empirically validated — SP-08) |
| S7-W19 | boundary | DB connection pool (max 20) boundary untested | Test at-20/over-21 load test | Codex, Claude | **resolved** (empirically validated — SP-09) |
| S7-W20 | boundary | HITL TTL expiry boundary untested | Test TTL-1s pending / TTL auto-expire | Claude | **resolved** (empirically validated — SP-02) |
| S7-W21 | boundary | JWKS stale-if-error 24h window untested | Test 24h security boundary | Codex, Claude | **resolved** (empirically validated — SP-03) |
| S7-W22 | boundary | Permission cache revocation 5-min window untested | Test 5-min accepted risk window | Claude | **resolved** (empirically validated — SP-15) |
| S7-W23 | boundary | MCP retry budget vs Inngest step timeout untested | Test ~37s < 120s config drift | Claude | **resolved** (empirically validated — SP-10) |
| S7-W24 | trace-context | Inngest waitForEvent() trace break | Document trace propagation for HITL decision events | Claude | **resolved** (implemented) — `traceparent` in HITL event schemas (INT-08) |
| S7-W25 | trace-context | BullMQ job trace context not propagated | Add trace context fields to QueuedMCPRequest | Codex, Claude | N/A — BullMQ not used in Phase 1 |
| S7-W26 | trace-context | Novu notification trace context missing | Include traceId in novu.trigger() payload | Claude | **resolved** (implemented) — `traceId` in Novu trigger payload (INT-08) |
| S7-W27 | trace-context | MCP tool call trace context not propagated | Add traceparent header on HTTP transport | All 3 | **resolved** (implemented) — `traceparent` in tool call `_metadata` (INT-08) |
| S7-W28 | trace-context | Propagation mechanism not standardized | Declare W3C Trace Context as primary standard | Claude | **resolved** (documentation) |
| S7-W29 | trace-context | Supabase JWT validation not traced | Add span around JWT validation step | Claude | **resolved** (implemented) — span helpers in `context-propagation.ts` (INT-08) |
| S7-W30 | trace-context | Outbound webhook delivery trace context missing | Add traceparent to WebhookEventPayload | Claude | **resolved** (implemented) — `injectTraceparent()` in `context-propagation.ts` (INT-08) |
| S7-N1 | trace-context | Observability doc K8s vs PaaS inconsistency | Update §2.2-2.3 for DO App Platform reality | Claude | **resolved** (documentation) |

---

## Tier 3 Findings

### Concern 6: Horizontal Traceability

**Date**: 2026-03-04 | **All findings resolved**

| ID | Finding | Recommendation | Models | Disposition |
|----|---------|----------------|--------|-------------|
| T3-W1 | File Storage not in BRD §3.1 — backward orphan | Add File Storage as 8th in-scope component + build-vs-buy row | Gemini, Codex, Claude | **resolved** (BRD §3.1.8 added, build-vs-buy row added) |
| T3-W2 | MCP tool registry queryable requirement outpaces Phase 1 | Add Phase 1 scoping note to FRD FR-CORE-MCP-001 | Gemini, Claude | **resolved** (FRD FR-CORE-MCP-001 scoping note added) |
| T3-W3 | Prompt caching in BRD §3.1.4 not traceable to FRD/ADD | Add prompt caching note to FRD FR-CORE-LLM-003 | Codex, Claude | **resolved** (FRD FR-CORE-LLM-003 acceptance criteria updated) |
| T3-N1 | Core traceability strong (positive finding) | No action needed | All 3 | note |

### Concern 7: Requirement-Test Mapping

**Date**: 2026-03-04 | **All findings resolved**

| ID | Finding | Recommendation | Models | Disposition |
|----|---------|----------------|--------|-------------|
| T3-E1 | No FR-CORE→test traceability — >50% requirements unmapped | Create Requirements Traceability Matrix (RTM) | All 3 | **resolved** (Testing doc §13 RTM added, 31 FR-CORE requirements mapped) |
| T3-W4 | Stale FRD v2.0.0 refs in test doc — sections point to wrong content | Update to FRD v1.0.0 section numbers | Codex, Claude | **resolved** (header + traceability table updated) |
| T3-W5 | MFA test spec missing — FRD requires MFA but no test cases exist | Write MFA step-up test specs after resolving E2 | Gemini, Codex, Claude | **resolved** (§11.1 MFA step-up test cases added) |
| T3-W6 | HITL P95 latency test missing — BRD §5.1 success metric untested | Add HITL delivery latency test specification | Gemini, Claude | **resolved** (§3.5 performance scope updated) |

### Concern 8: Contradiction Scanner (Tier 3 regression)

**Date**: 2026-03-04 | **All findings resolved**

| ID | Finding | Recommendation | Models | Disposition |
|----|---------|----------------|--------|-------------|
| T3-E2 | MFA: FRD "enforced" vs ADD "optional" — one-sided Tier 2 fix | Update FRD FR-CORE-ID-001 with Phase 1 scope | All 3 | **resolved** (FRD updated: Phase 1 optional enrollment + step-up; Phase 2 mandatory) |
| T3-E3 | Audit: BRD "100% tamper-proof" vs ADD ">99.9% completeness" — one-sided fix | Update BRD §5.1 audit row | Codex, Claude | **resolved** (BRD updated: >99.9% completeness, tamper-proofness deferred Phase 3+) |
| T3-N2 | Audit sync test = Phase 1 current behavior (not contradiction) | No action — update test after INT-05 async migration | Claude | note — tracked as T1-W21 → Sprint 4 |

---

## Cross-Concern Themes

Recurring patterns across multiple concerns and sessions:

### Tier 1 Themes

| Theme | Concerns | Warning IDs | Core Issue |
|-------|----------|-------------|------------|
| **Novu single point of failure** | 3, 4 | T1-W18, T1-W23 | No fallback for Novu outage; notifications fail silently; HITL workflows timeout |
| **PostgreSQL shared infrastructure** | 3, 4 | T1-W16, T1-W22 | Single instance, schema isolation ≠ failure isolation, Phase 1 accepted risk |
| **Audit sync coupling** | 3, 4 | T1-W21 | Sync `await auditService.log()` blocks critical paths; resolved via `createAsyncAuditWriter()` + DLQ (AUD-04) ✓ |
| **Stale K8s artifacts** | 2 | T1-W12, T1-W13, T1-W14 | Multiple docs had stale K8s/cloud references from pre-DO migration (all resolved) |
| **Implementation pending from §14** | 5 | T1-W27, T1-W28, T1-W29 | Threat models documented; mitigations implemented in Sprint 5 (INT-06) ✓ |

### Tier 2 Themes

| Theme | Sessions | Warning IDs | Core Issue |
|-------|----------|-------------|------------|
| **Vendor contacts / escalation** | 4, 6 | S4-W17, S6-W7 | Zero vendor contact info for any third-party dependency |
| **Missing runbook playbooks** | 4, 6 | S4-W13/W14/W15, S6-W4/W5/W6 | LLM, File Storage, ClamAV, BullMQ lack runbook entries |
| **Feature flag Phase 1 contradiction** | 5, 6 | S5-W4, S6-W11 | Runbook §2.4 describes capabilities that don't exist in Phase 1 |
| **Inngest limits unknown** | 5, 6 | S5-W6/W8/W12 | Free tier limits, throughput ceiling, 10K sleeping workflow claim — all unvalidated |
| **SLO-alert gap** | 5 | S5-W13 through S5-W18 | Most BRD SLOs have no corresponding alert |
| **Graceful shutdown** | 6 | S6-W18 | No SIGTERM/drain documentation anywhere in platform docs |
| **Zero test specs for documented behaviors** | 7 | S7-W1, S7-W14 | 22 error paths + 25 boundaries documented in ADD, zero test specifications anywhere |
| **Async trace context gaps** | 7 | S7-W24 through S7-W30 | All async boundaries (BullMQ, Inngest, Novu, webhooks) lack explicit trace propagation |
| **DB connection pool** | 5, 7 | S5-W9, S7-W7, S7-W19 | Max 20 pool appears in scalability and both error/boundary test gaps |

---

## Statistics

| Category | Tier 1 | Tier 2 | Tier 3 | Combined |
|----------|--------|--------|--------|----------|
| Total WARNINGs | 29 | 125 | 6 | 160 |
| Total ERRORs | 24 | 0 | 3 | 27 |
| Total NOTEs | 7 | 1 | 2 | 10 |
| Duplicates / overlaps | 0 | 5 | 0 | 6 (incl. T1-W24 = S3-W7) |
| Resolved (implemented or doc-only) | 28 | 99 | 9 | 136 |
| Accepted (acknowledged, not blocking) | 1 | 21 | 0 | 22 |
| Deferred (Phase 2+) | 0 | 3 | 0 | 3 |
| N/A | 0 | 1 | 0 | 1 (S7-W25 BullMQ) |
| **Open WARNINGs** | **0** | **0** | **0** | **0** |
| Human review flagged | 0 | 2 | 0 | 2 (S3-W9, S6-W14) |

### WARNING Sprint Mapping (Reference Only)

> **Canonical sprint allocation is in [Phase 1 Sprint Plan](06-sprints/phase-1-sprint-plan.md)**, which derives tasks from FRD requirements. WARNING items below are folded into sprints as hardening scope, not as primary drivers.

| Destination | Count | Details |
|-------------|-------|---------|
| **Sprint 0 (spikes)** | 25 | Bucket B — empirically validated ✓ |
| **Sprint 1 (LLM Gateway)** | 3 | LLM-10, LLM-06 ext, LLM-08 scope ✓ |
| **Sprint 2 (HITL Gateway + RBAC)** | 1 | HITL-11 |
| **Sprint 3 (MCP Layer + File Storage)** | 4 | MCP-09, MCP-10, MCP-06 scope, FS-03 (was MCP-11) |
| **Sprint 4 (Audit + Notification)** | 1 | AUD-04 (was T1-W21) ✓ |
| **Sprint 5 (Integration & Hardening)** | 23 | 22 resolved ✓, 1 N/A (BullMQ) |
| **Bucket D (no sprint)** | 5 | 2 accepted + 3 deferred (Phase 2+) |
| **Total mapped** | **37** | **All resolved** ✓ |

*Sprint 0–7 total (32 mapped): All resolved. S4-W10 + T1-W23 resolved in Sprint 6 (SLO cron evaluators). S2-W12 resolved in Sprint 7 (LLM Usage Dashboard). 1 N/A (S7-W25, BullMQ not adopted). Bucket D: 2 accepted risks + 3 deferred to Phase 2+.*
