# Concern Re-Evaluation — Tier 2 (Behavioral)

**Date**: 2026-03-13
**Models**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (via PAL clink), OpenAI Codex (via Codex MCP)
**Concerns evaluated**: 16 (15 Tier 2 + 1 untiered)
**Batches**: 5 thematic clusters

---

## Executive Summary

Tier 2 evaluation across 16 concerns reveals **7 ERRORs** and **~18 WARNs**. Three ERRORs are high-impact findings that require action before Phase 2 implementation: a webhook body limit contradiction between ADD and OpenAPI, an MCP alert threshold misaligned with the business SLA, and an unsupportable RTO target. The remaining 4 ERRORs relate to documentation gaps for WebSocket lifecycle and test coverage. Most WARNs are Phase 2 scoping issues or known residual risks with documented mitigations.

---

## Batch 2: Auth & Access Control

**Evaluator**: Gemini 3 Flash Preview | **Lead validation**: Claude Opus 4.6

### auth-boundary-consistency

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| AB-1 | **WARN** | Async auth propagation through Inngest `step.run()` activities not documented — user identity/roles may not be available in background workflow steps | ADD §3, §11.2 |
| AB-2 | NOTE | Role hierarchy (flat vs nested) not documented in ADD §8.3 despite FRD §9.2 defining roles | ADD §8.3, FRD §9.2 |

### auth-scheme-compliance

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| AS-1 | **WARN** | 15-minute JWT revocation window — revoked sessions remain valid until token expiry; Redis blacklist deferred to Phase 2 | ADD §5.6.2 |
| AS-2 | NOTE | PKCE for OAuth not explicitly documented (Supabase supports by default but docs should be explicit) | ADD §8.2 |

### secrets-management

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| SM-1 | **WARN** | Dual-secret rotation mechanism not documented — Runbook §9.3 mentions "dual-key window" but ADD doesn't describe how app supports simultaneous valid secrets (HITL_SECRET, webhook HMAC) | ADD §8.8, Runbook §9.3 |
| SM-2 | NOTE | Cloud-managed encryption key rotation (DO at-rest) not documented for verification | ADD §14.3 |

---

## Batch 3: Input & Compliance

**Evaluator**: OpenAI Codex | **Lead validation**: Claude Opus 4.6

### input-validation

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| IV-1 | **WARN** | Inbound webhook payload schema validation not documented — HMAC/timestamp verified but request body fields not schema-validated before persistence | ADD §12.3.1, §14.10 |
| IV-2 | **WARN** | Outbound SSRF validation only partially wired — `safeFetch()` exists but RR-7 still partially resolved | ADD §14.9, §14.10 |
| IV-3 | **WARN** | File upload content-type: server-side MIME verification (magic bytes) recommended but not enforced (RR-8 accepted) | ADD §14.6, §14.9 |

### logging-pii-compliance

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| LP-1 | **WARN** | Infrastructure access logs (DO load balancer) contain IP addresses — outside application-level redaction control | ADD §14.3.1 |
| LP-2 | **WARN** | Unstructured free-text PII can bypass field-based Pino redaction — acknowledged residual risk with no detection pipeline | ADD §14.3.1 |

### llm-safety-envelope

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| LS-1 | **WARN** | Per-user/session LLM rate limits deferred to Phase 2 — only global domain budgets enforced ($50/day, $1000/month) | ADD §14.5.1, §15.4 |

---

## Batch 4: API Surface

**Evaluator**: Gemini 3 Flash Preview | **Lead validation**: Claude Opus 4.6

### api-contract-consistency

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| AC-1 | **ERROR** | **Webhook body limit contradiction**: ADD §14.10 specifies 256KB for webhook bodies, but OpenAPI spec defines 1MB (`1048576`). Security design vs implementation spec mismatch. | ADD §14.10, OpenAPI |
| AC-2 | **WARN** | Pagination limit enforcement: max 200 documented but no explicit validation in `withBodyLimits` middleware for `limit` query param | ADD §12.1.1, §15.6 |

### api-versioning-compliance

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| AV-1 | **WARN** | **Admin endpoints unversioned**: `/api/admin/` prefix lacks version indicator while ADD §13.8 commits to "all endpoints under `/api/v1/`" | ADD §13.8, §15.2 |
| AV-2 | NOTE | Deprecation headers (`Sunset`, `Deprecation`) committed in ADD §13.8 but not in OpenAPI response headers | ADD §13.8, OpenAPI |

### boundary-condition-coverage

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| BC-1 | **WARN** | Webhook body limit test gap: test asserts 1MB default, doesn't verify 256KB webhook-specific limit from ADD §14.10 | tests/s7-cf-02 |
| BC-2 | **WARN** | Inngest event payloads bypass `withBodyLimits` middleware — JSON nesting depth (10 levels) enforcement not documented for this path | ADD §14.10, §3.1 |

---

## Batch 5: Observability & SLA

**Evaluator**: Gemini 3 Flash Preview | **Lead validation**: Claude Opus 4.6

### alerting-slo-alignment

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| AL-1 | **ERROR** | **MCP alert threshold misaligned**: BRD §5.1 promises >99% MCP success rate, but ADD §16.3 alert fires at <95%. A 4% breach window goes undetected. | BRD §5.1, ADD §10.4.8, §16.3 |
| AL-2 | **WARN** | Missing LLM budget evaluators: ADD §10.4.8 commits to `llm_daily_spend > $45` alert, but §16.3 evaluator list omits it | ADD §10.4.8, §16.3 |

### sla-architecture-alignment

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| SA-1 | **ERROR** | **RTO <4h unsupportable**: Manual DR steps (provision infra, DB restore, DNS update) for a 3-developer team cannot reliably hit <4h without automated failover | Runbook §8.6 |
| SA-2 | **WARN** | HITL <10s P95 delivery SLO depends on two external SaaS (Inngest + Novu) with no fallback — Novu is acknowledged single point of failure | ADD §10.4.4, BRD §5.1 |

### trace-context-propagation

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| TC-1 | **WARN** | AI reasoning trace gap: LangGraph.js runs inside Inngest `step.run()` but trace context propagation into graph execution not documented | ADD §3.1, §11.2 |
| TC-2 | **WARN** | External MCP server telemetry: trace context injected into calls but no docs on how stdio-spawned MCP servers report spans back to OTLP collector | ADD §14.4 |

---

## Batch 6: Reliability & Cost

**Evaluator**: OpenAI Codex | **Lead validation**: Claude Opus 4.6

### cost-budget-enforcement

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| CB-1 | **WARN** | Conflicting monthly LLM budget values: §7.2.2 says $1,000/domain, §7.4 says $500, §9.14 says $500/mo per domain. One authoritative value needed. | ADD §7.2.2, §7.4, §9.14 |

### durable-persistence

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| DP-1 | **WARN** | No operational recovery procedure for failed/crashed audit exports — relies on ad-hoc user re-request | ADD §9.5.1 |

### error-path-coverage

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| EP-1 | **ERROR** | Circuit-breaker lifecycle has no test specs: open threshold, fail-fast, half-open probe, recovery not covered | ADD §2.3.3, Guidelines §7.3 |
| EP-2 | **ERROR** | Auth-failure test coverage gap: invalid/expired token, JWKS fetch failure, stale-if-error paths not specified | ADD §2.3.2, FRD §9 |
| EP-3 | **WARN** | No dedicated negative/error-path test matrix mapping documented failure paths to test IDs | ADD §2.3 |

### realtime-connection-lifecycle

| ID | Severity | Finding | Source |
|----|----------|---------|--------|
| RC-1 | **ERROR** | MCP WebSocket transport lifecycle not documented: auth, heartbeat/timeout, reconnect/backoff, backpressure policy | ADD §5.1, FR-CORE-MCP-001 |
| RC-2 | **ERROR** | Domain WebSocket events (crypto/api.md) referenced but no lifecycle docs: handshake, ping/pong, reconnect, replay/resync | TSD index |

---

## Summary by Severity

### ERRORs (7 total)

| ID | Concern | Finding | Priority |
|----|---------|---------|----------|
| AC-1 | api-contract-consistency | Webhook body limit 256KB vs 1MB contradiction | **P1** — fix before Phase 2 |
| AL-1 | alerting-slo-alignment | MCP alert at 95% vs BRD SLA 99% | **P1** — fix before Phase 2 |
| SA-1 | sla-architecture-alignment | RTO <4h unsupportable for 3-person team | **P1** — update to realistic target |
| EP-1 | error-path-coverage | Circuit-breaker lifecycle test specs missing | **P2** — Phase 2 test plan |
| EP-2 | error-path-coverage | Auth-failure test coverage gap | **P2** — Phase 2 test plan |
| RC-1 | realtime-connection-lifecycle | WebSocket MCP transport lifecycle undocumented | **P2** — Phase 2 when implemented |
| RC-2 | realtime-connection-lifecycle | Domain WebSocket events lifecycle undocumented | **P2** — Phase 2 when implemented |

### WARNs (18 total)

| Cluster | Count | Key themes |
|---------|-------|------------|
| Auth & Access | 3 | Async auth propagation, token revocation window, dual-secret rotation |
| Input & Compliance | 6 | Webhook schema validation, SSRF partial, file MIME, LB access logs, free-text PII, per-user LLM limits |
| API Surface | 4 | Pagination enforcement, admin endpoints unversioned, webhook limit test gap, Inngest nesting depth |
| Observability | 4 | Missing LLM budget evaluator, HITL SaaS dependency, AI reasoning traces, MCP server telemetry |
| Reliability | 3 | Budget value conflicts, export recovery, negative test matrix |

---

## Delta from Previous Evaluations

| Finding | Status |
|---------|--------|
| SSRF (RR-7) | **Improved**: ERROR → WARN (safeFetch created, partial wiring) |
| MCP env secrets (RR-1) | **Resolved**: sanitizeEnvForMcp() enforced |
| Webhook body limits | **NEW ERROR**: contradiction introduced by Phase 2 doc additions |
| MCP alert threshold | **NEW ERROR**: §16.3 evaluator threshold doesn't match BRD SLA |
| RTO feasibility | **Pre-existing**: already flagged, now elevated to ERROR with evidence |
| Admin endpoints versioning | **NEW WARN**: /api/admin/ prefix doesn't match /api/v1/ commitment |
| WebSocket lifecycle | **NEW ERROR**: new concern from `websocket` signal — no prior baseline |
| LLM budget values | **Pre-existing**: conflicting numbers now documented across 3 sections |

---

## Recommended Actions

### Before Phase 2 Implementation (P1)
1. ~~**Fix AC-1**: Standardize webhook body limit to 256KB across ADD, OpenAPI spec, and test assertions~~ — **RESOLVED**: OpenAPI webhook endpoint updated from 1MB to 256KB (262,144 bytes) to match ADD §14.10 (2026-03-13)
2. ~~**Fix AL-1**: Align `mcpSuccessAlert` threshold from 95% to 99% to match BRD SLA~~ — **RESOLVED**: ADD §10.4.8 updated from >95%/SEV-3 to >99.5%/SEV-2 to align with as-built §16.3 evaluators (2026-03-13)
3. ~~**Fix SA-1**: Update Runbook §8.6 RTO to realistic target (8-12h) or document automated failover plan~~ — **RESOLVED**: RTO updated to <8h across Runbook §8.6, ADD §2.3.2, §10.4.3, and change-risk-management.md. Phase 2 Epic 6 restores <4h via automated failover (2026-03-13)
4. ~~**Fix CB-1**: Normalize LLM monthly budget to one authoritative value ($1,000/domain per P1.5)~~ — **RESOLVED**: Fixed in Tier 1 — all ADD references updated from $500 to $1,000 (2026-03-13)

### Phase 2 Test Plan (P2)
5. Add circuit-breaker lifecycle test specs (EP-1)
6. Add auth-failure path test cases (EP-2)
7. Document WebSocket lifecycle when implementing MCP WebSocket transport (RC-1, RC-2)

### Phase 2 Documentation (P2)
8. Document async auth propagation through Inngest steps (AB-1)
9. Document dual-secret rotation mechanism (SM-1)
10. ~~Add STRIDE threat models for Admin Dashboard + Workflow APIs (from Tier 1 G-1, G-2)~~ — **RESOLVED**: Added as §14.11 and §14.12 in Tier 1 fixes (2026-03-13)

---

## Gate Decision: PROCEED to Tier 3

The 3 P1 ERRORs (webhook limit, MCP alert, RTO) are doc-fix items that can be resolved in parallel with Tier 3 evaluation. No Tier 2 finding invalidates the structural integrity needed for Tier 3 concerns.
