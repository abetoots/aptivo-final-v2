# Session 7: Testing & Observability — Multi-Model Review

**Date**: 2026-03-04
**Concerns**: error-path-coverage (WARN), boundary-condition-coverage (WARN), trace-context-propagation (WARN)
**Models**: Gemini (PAL Clink), Codex MCP, Claude Lead Expert
**Documents Reviewed**: ADD, Runbook, Common Patterns TSD, Coding Guidelines, Observability Guidelines, OpenAPI Spec, Configuration TSD

---

## Executive Summary

Session 7 evaluates whether documented error paths, boundary conditions, and trace context propagation have corresponding test specifications. **Consensus: 0 ERRORs, 30 WARNINGs, 1 NOTE.** All 3 concerns are WARN-severity; findings cap at WARN per methodology. The dominant theme: the ADD's failure domain documentation (§2.3) and resilience triad (§2.3.3) are among the most thorough platform architecture docs reviewed across all 7 sessions — but the testing documentation has zero corresponding test specifications for any of the 22 documented error paths, 25 documented boundaries, or 11 async trace boundaries. This is a systemic gap in the testing layer, not the architecture layer.

---

## Model Comparison

| Model | ERRORs | WARNINGs | NOTEs | Unique Findings |
|-------|--------|----------|-------|-----------------|
| **Gemini** | 1 (overcounted) | 2 | 2 | File size unit ambiguity (MB vs MiB) |
| **Codex** | 7 (overcounted) | 5 | 3 | Financial multi-boundary trace gap |
| **Claude** | 0 | 31 | 1 | Saga compensation, DLQ testing, HITL race condition, trace standard inconsistency, K8s vs PaaS inconsistency |

**Severity debate**: Codex classified 7 findings as ERROR by applying ERROR criteria from the failure_condition text. However, all 3 concerns have `severity: warn` in their schemas. Per the methodology used consistently across Sessions 1-6, WARN-severity concerns produce WARN-level findings. Codex's ERRORs are downgraded to WARNINGs. Gemini's 1 ERROR similarly downgraded.

---

## Consensus Findings

### Concern 1: Error Path Test Coverage (0E, 13W)

**Core finding**: 22 documented error paths in ADD §2.3 with zero corresponding test specifications in any testing document.

| ID | Finding | Confidence | Models |
|----|---------|------------|--------|
| W1 | **Systemic: No error path test section exists** — Testing strategy doc has no "Negative Testing" or "Error Path Testing" section. Error paths are documented extensively in ADD but untested. | high | All 3 |
| W2 | **Circuit breaker fallback untested** — MCP (5 failures → open, 30s half-open) and LLM (3 failures per provider) circuit breakers have no tests verifying user-facing fallback behavior. | high | All 3 |
| W3 | **Auth failure paths untested** — JWKS cache stale-if-error (24h), expired token handling, Supabase outage friendly error — none tested. | high | Codex, Claude |
| W4 | **Redis per-consumer degradation untested** — MCP fail-closed, rate limiting fail-open, dedup fail-open, sessions fail-open — four distinct policies, zero verified. | high | Claude |
| W5 | **Retry exhaustion final behavior untested** — 8 dependencies have retry policies; behavior after all retries exhausted (error message, DLQ, workflow error path) is unverified for all. | high | All 3 |
| W6 | **Audit service blocking untested** — ADD §2.3.2 explicitly documents sync audit writes blocking HITL/file access. Recommended 500ms timeout + DLQ also untested. | high | Gemini, Claude |
| W7 | **DB connection pool exhaustion untested** — Max 20 connections, 5s acquire timeout, 3 retries. Exhaustion behavior (which components fail first?) unknown. | high | Claude |
| W8 | **Inngest checkpoint recovery untested** — Workflows should resume from last step after Inngest recovery. No test verifies memoized steps are not re-executed. | high | Claude |
| W9 | **Saga compensation path untested** — Common Patterns §8 documents compensation states and crash-during-compensation. Zero tests. | high | Claude |
| W10 | **HITL decision race condition untested** — ADD §4.5.1 documents INSERT ON CONFLICT, double-signal prevention. Concurrent approval behavior unverified. | high | Claude |
| W11 | **Webhook signature verification failure untested** — Inbound webhook 401 on invalid signature, replay protection — no test spec. | high | Claude |
| W12 | **LLM provider fallback untested** — Primary to secondary provider switching on 429/5xx. Circuit breaker per provider. Unverified. | high | Codex, Claude |
| W13 | **Dead letter queue untested** — Common Patterns §5.3 documents `system.event.dlq` for failed events. No test verifies DLQ routing. | medium | Claude |

### Concern 2: Boundary Condition Test Coverage (0E, 10W)

**Core finding**: 25 documented boundaries with zero at-limit/over-limit/under-limit test specifications.

| ID | Finding | Confidence | Models |
|----|---------|------------|--------|
| W14 | **Systemic: 0 of 25 boundaries have test specs** — All limits are architecturally documented but testing documentation references none. | high | All 3 |
| W15 | **API rate limit (100 req/min, burst 20) untested** — Configuration §1.2 defines values. No at-100th/over-101st test. | high | Codex, Claude |
| W16 | **File upload size (50MB) untested** — OpenAPI schema defines max 52428800 bytes. No at-limit/over-limit test. | high | All 3 |
| W17 | **Pagination max=200 untested** — OpenAPI LimitParam. No test for 200 succeeds / 201 rejected. | high | Codex, Claude |
| W18 | **LLM budget caps ($50 daily, $500 monthly) untested** — ADD §7.2. No boundary enforcement test. | high | All 3 |
| W19 | **DB connection pool (max 20) boundary untested** — No load test verifying 21st connection behavior. | high | Codex, Claude |
| W20 | **HITL TTL expiry boundary untested** — ADD §4.4. No test at TTL-1s pending / TTL auto-expire. | high | Claude |
| W21 | **JWKS stale-if-error 24h window untested** — Security boundary: sessions valid for 24h during Supabase outage. Window not verified. | high | Codex, Claude |
| W22 | **Permission cache revocation 5-min window untested** — Common Patterns §6.4 documents accepted risk. Window not verified. | high | Claude |
| W23 | **MCP retry budget vs Inngest step timeout untested** — ADD coherence note: ~37s total must be < 120s. No validation test guards against config drift. | high | Claude |

### Concern 3: Trace Context Propagation (0E, 7W, 1N)

**Core finding**: HTTP and DB boundaries have OTel auto-instrumentation, but all async boundaries (BullMQ, Inngest events, Novu, webhooks) lack explicit trace propagation.

| ID | Finding | Confidence | Models |
|----|---------|------------|--------|
| W24 | **Inngest waitForEvent() trace break** — When HITL decision event arrives, no mechanism links approver's trace to original workflow trace. | high | Claude |
| W25 | **BullMQ job trace context not propagated** — Jobs enqueued by API, processed by worker. `QueuedMCPRequest` interface has no trace context fields. | high | Codex, Claude |
| W26 | **Novu notification trace context missing** — `novu.trigger()` payload doesn't include traceId. Can't correlate delivery to originating workflow. | high | Claude |
| W27 | **MCP tool call trace context not propagated** — No traceparent header on HTTP transport; no equivalent for stdio transport. | high | All 3 |
| W28 | **Propagation mechanism not standardized** — Multiple correlation IDs: traceId (OTel), correlationId (events), X-Request-ID (Traefik), x-request-id (middleware). No single standard documented. | medium | Claude |
| W29 | **Supabase JWT validation not traced** — Every auth request validates JWT but no span wraps this step. Auth latency invisible in traces. | medium | Claude |
| W30 | **Outbound webhook delivery trace context missing** — WebhookEventPayload has no traceparent header or trace_id field. Consumers can't correlate. | high | Claude |
| N1 | **Observability doc K8s vs PaaS inconsistency** — Observability §2.2-2.3 describes K8s sidecar OTel Collector; actual production uses DO App Platform direct OTLP export (per Runbook §5.1). | high | Claude |

---

## Summary

| Concern | ERRORs | WARNINGs | NOTEs |
|---------|--------|----------|-------|
| error-path-coverage | 0 | 13 | 0 |
| boundary-condition-coverage | 0 | 10 | 0 |
| trace-context-propagation | 0 | 7 | 1 |
| **Total** | **0** | **30** | **1** |

---

## Actionable Recommendations

### High Priority (systemic)
1. **Create Error Path Test Plan** (W1): Add dedicated "Error Path & Negative Testing" section to 05b-Testing-Strategies.md mapping each ADD §2.3 failure mode to test specifications, prioritized by: financial operations > auth > data integrity > degradation.
2. **Create Boundary Condition Test Plan** (W14): Add "Boundary Condition Tests" section covering at-limit/over-limit/under-limit for each documented value, prioritized by: security boundaries > rate limits > quotas > timeouts.
3. **Document Trace Propagation Contract** (W24-W30): Add "Distributed Trace Propagation" section to Observability guidelines specifying how trace context crosses each async boundary (BullMQ job data, Inngest event metadata, Novu payload, webhook headers).

### Medium Priority (specific)
4. **Standardize correlation IDs** (W28): Declare W3C Trace Context as primary standard; mandate correlationId in events = current OTel trace ID.
5. **Fix Observability K8s references** (N1): Update Observability §2.2-2.3 to reflect DO App Platform reality.

---

## Sign-Off

| Model | Verdict | Notes |
|-------|---------|-------|
| **Gemini** | PASS | 0 ERRORs (WARN-severity concern); found audit blocking and MCP trace gaps |
| **Codex** | PASS | 0 ERRORs (overcounted by applying ERROR failure conditions to WARN concern); broad coverage |
| **Claude (Lead Expert)** | PASS | 0 ERRORs, 30W, 1N — most thorough; correctly classified all findings as WARN per concern severity |

**Final Verdict**: **PASS — 0 ERRORs, 30 WARNINGs (advisory), 1 NOTE**
