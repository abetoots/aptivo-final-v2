# Tier 1 Concern Re-Evaluation — Multi-Model Review

**Date**: 2026-04-20
**Models**: Gemini 3 Flash Preview (PAL clink), OpenAI Codex, Claude Opus 4.7 (synthesis)
**Concerns evaluated**: `contradiction-scanner`, `threat-model-coverage`

---

## Executive Summary

Tier 1 evaluation surfaced **12 unique contradictions** (5 ERROR severity) and **3 threat-model gaps** (1 disputed). The bulk of contradictions stem from Phase 1.5 as-built updates diverging from original Phase 1 design docs — specifically around LLM budget caps, SLO thresholds, audit integrity semantics, and webhook security middleware. Threat model coverage is largely intact; MCP env exfiltration (RR-1) is confirmed resolved.

---

## 1. Contradiction Scanner

### Consensus Contradictions (both models found)

| # | Location | Conflict | Severity | Type |
|---|----------|----------|----------|------|
| C1 | ADD §7.2.1 vs §7.2.2 | Monthly LLM budget: $500 (BRD constraint) vs $1,000 (Phase 1.5 as-built) | **WARN** | quantitative |
| C2 | ADD §10.4.8 vs §16.3 | MCP success rate: 95% SLO-alert mapping vs 99.5% new alert evaluator | **WARN** | quantitative |

### Unique to Gemini (3)

| # | Location | Conflict | Severity |
|---|----------|----------|----------|
| C3 | ADD §14.10 (256KB) vs OpenAPI Webhooks (1 MiB) | Webhook body size limits disagree — middleware rejects payloads the API spec allows | **ERROR** |
| C4 | ADD §7.4 ("2 retries = 3 attempts") vs §7.1.1 impl (single fallback = 2 attempts) | Retry budget mismatch between policy text and reference code | WARN |
| C5 | BRD §5.1 (>99% MCP) vs ADD §16.3 (≥99.5% alert) | BRD SLO vs alert threshold mismatch | WARN |

### Unique to Codex (5)

| # | Location | Conflict | Severity |
|---|----------|----------|----------|
| C6 | ADD §14.10 "Safe Fetch... Wire on first outbound webhook path" vs "SSRF validation runs before outbound HTTP calls" | Security posture contradiction — is SSRF enforced or not? | **ERROR** |
| C7 | ADD §2.3 (no audit write decoupling) vs §16.1 (audit_write_dlq as implemented metric source) | Audit durability model contradicts between sections | **ERROR** |
| C8 | ADD §9.3 (hash-chain deferred Phase 3+) vs TSD §2 (audit.md "Hash-chained audit NEW v1.0.0") | Hash-chain implementation status contradiction | **ERROR** |
| C9 | ADD §10.4.8 (audit_missing_events > 0) vs §16.3 (DLQ count > 100) | Audit integrity alert semantics changed: zero-missing → backlog threshold | **ERROR** |
| C10 | ADD §10.4.5 (pool size 5 per container) vs Runbook §8.11 (Phase 1 pool size 20) | DB connection pool sizing contradiction — availability impact | **ERROR** |
| C11 | ADD §15.2 (/api/admin/llm-usage/budget) vs Runbook §8.14 (/api/v1/admin/llm/budget) | Admin endpoint path mismatch — runbook points operators to wrong URL | WARN |
| C12 | FRD §10.3 (internal API keys required) vs ADD §8.3 (service-to-service not applicable Phase 1) | Service-to-service auth scope contradiction | **ERROR** |

### Verdict

**Codex had significantly deeper coverage** (10 contradictions vs 5), particularly on operational/runbook consistency and Phase 1 vs Phase 2 scope handoffs. **Both models independently found C1 and C2** — these are the highest-confidence contradictions.

**Priority actions**:
1. **Resolve C1/C2 immediately** (consensus) — reconcile LLM budget cap and MCP SLO thresholds
2. **Investigate C6 and C8** — security/audit posture contradictions (Codex unique but highly plausible given Phase 1.5 changes)
3. **Update runbooks** — C10, C11 indicate ops docs lag behind architecture updates

---

## 2. Threat Model Coverage

### Items Evaluated (10 attack surfaces — consensus)

Both models evaluated the same 10 attack surfaces with near-identical mitigation inventories:
- Authentication & Authorization (Magic Link, OAuth, JWT, RBAC)
- HITL Approval Gateway
- PII Data Stores
- MCP Tool Execution
- LLM Gateway (Prompt Injection)
- File Upload & Storage
- Inbound Webhooks
- Outbound Webhooks
- Inngest Webhook Endpoint
- Admin & Operations Dashboard APIs

### Consensus findings

- **RR-1 (MCP env exfiltration) confirmed RESOLVED**: `sanitizeEnvForMcp()` enforced in AgentKit adapter with DB-backed env allowlists.
- **Admin Dashboard threat model NEW**: covered via shared RBAC/PII/middleware controls from §14.1, §14.3, §14.10.
- **S2-W12 (LLM Usage Dashboard) CONFIRMED RESOLVED**: admin endpoints documented with full RBAC.

### Disputed Gaps

| Gap | Gemini | Codex | Verdict |
|-----|--------|-------|---------|
| **Payment Processing Flow threat model** | ERROR | Declared exclusion | **Codex correct** — No payment gateway in Phase 1. PCI DSS mention is forward-looking scope only. Gemini hallucinated this gap from a compliance-table reference. |
| **Outbound SSRF (RR-7)** | WARN | Adequate coverage | **Split verdict** — Both agree threat is enumerated and mitigations exist. Real issue is rollout ambiguity (C6 above), not coverage. Merge with C6 resolution. |
| **Notification Bus injection** | NOTE | Not flagged | **Valid future concern** — Template substitution could be an injection vector for HITL-delivered notifications. Low severity for now. |

### Verdict

**Codex assessment is more accurate**: 10/10 items fully documented, 0 gaps. Gemini's "payment processing" gap is a false positive. However Gemini's "notification injection" NOTE is a legitimate future concern worth tracking.

---

## Delta Against Previous Evaluation (`concerns/THREAT_MODEL_COVERAGE_MULTI_REVIEW.md`)

| Finding in prior eval | Status now | Notes |
|-----------------------|-----------|-------|
| RR-1 MCP env exfiltration (pre-prod blocker) | **RESOLVED** | P1.5-06 delivered sanitizeEnvForMcp() |
| RR-7 outbound SSRF (pre-prod blocker) | **PARTIAL** | safeFetch created; wiring ambiguous (see C6) |
| S2-W12 LLM Usage Dashboard missing | **RESOLVED** | Admin endpoints delivered in Sprint 7 |
| Admin dashboard threat model (not yet designed) | **COVERED** | §15 + §14.10 middleware stack |

---

## Recommendations

### Immediate (before Tier 2 evaluation)

1. **Fix C1**: Decide canonical monthly LLM budget ($500 or $1,000). Update both §7.2 and §15.4.
2. **Fix C2/C5**: Align MCP success-rate SLO across BRD/ADD/§16.3.
3. **Fix C6**: Clarify whether SSRF is enforced globally or pending wiring; update RR-7 status accordingly.
4. **Fix C8**: Resolve hash-chain audit status — is it Phase 3+ deferred, or delivered in audit.md TSD?

### Defer to Phase 2

- C11 (runbook path): minor, safe to fix during runbook update
- C12 (service-to-service auth): scope question — align FRD with Phase 1 monolith reality
- Notification injection threat modeling

### Tier 2 kickoff criteria met

Tier 1 evaluation complete. Proceed to Tier 2 — security cluster next.
