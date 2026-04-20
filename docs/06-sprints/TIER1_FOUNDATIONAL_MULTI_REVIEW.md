# Concern Re-Evaluation — Batch 1 (Tier 1: Foundational)

**Date**: 2026-03-13
**Models**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (via PAL clink), OpenAI Codex (via Codex MCP)
**Concerns**: `contradiction-scanner`, `threat-model-coverage`
**Docs evaluated**: All BRDs, FRDs, ADDs, TSD, OpenAPI spec (post-Phase 2 doc design)

---

## Executive Summary

Tier 1 evaluation reveals **no new blockers** introduced by the Phase 2 doc updates. The contradiction-scanner finds 4 ERRORs, but all are pre-existing Phase 1 design decisions already tracked in the warnings register. The threat-model-coverage concern finds 2 ERRORs for new doc sections (§15 Admin Dashboard, Workflow Management APIs) that lack STRIDE analysis — these are gaps to fill, not contradictions that invalidate Tier 2 evaluation.

**Gate decision: PROCEED to Tier 2.**

---

## Concern 1: Contradiction Scanner

### Findings (3-model consensus)

| ID | Severity | Type | Contradiction | Gemini | Codex | Claude |
|----|----------|------|---------------|--------|-------|--------|
| C-1 | **ERROR** | scope | BRD mandates "separate deployments, secrets, schemas" for context bleed mitigation vs ADD Phase 1 shared monolith | Found | Found | Confirmed — pre-existing design decision |
| C-2 | **ERROR** | behavioral | FRD says audit trail is "tamper-evident" vs ADD defers hash-chaining to Phase 3+ | Found | — | Confirmed — known deferral |
| C-3 | **ERROR** | behavioral | Crypto BRD requires real-time alerting vs Novu free-tier silently drops notifications | Found | — | Confirmed — known operational risk |
| C-4 | **ERROR** | behavioral | FRD requires service-to-service auth (internal API keys) vs ADD defers to Phase 2 (monolith) | — | Found | Confirmed — phase scope issue |
| C-5 | **WARN** | quantitative | HR BRD LLM budget $1,000-2,000 vs ADD §7.2.1 hardcodes $500; P1.5 §7.2.2 sets $1,000/domain | Found | — | Partially resolved — $1,000 at low end of range |
| C-6 | **WARN** | scope | FRD promises Google (Gemini) LLM provider; P1.5 only wires OpenAI + Anthropic | Found | — | Confirmed — Phase 2 scope |
| C-7 | **NOTE** | quantitative | ADD §10.4.5 internal: max connections (35) > DO plan capacity (22); mitigation = 20 | Found | — | Documented constraint with mitigation, not cross-doc contradiction |

### Assessment

- **4 ERRORs are pre-existing** — all stem from Phase 1 design decisions (monolith, deferred tamper-proofing, Novu limitations, monolith auth). None are new contradictions introduced by Phase 2 doc updates.
- **Gemini was more thorough** (6 findings vs Codex's 2), likely due to better multi-document cross-referencing.
- **No new contradictions** from the Phase 2 additions (§14.10, §15, §16) — these sections are internally consistent with existing architecture.

### Delta from Previous Evaluation

Comparing with `concerns/CONTRADICTION_SCANNER_MULTI_REVIEW.md`:
- C-1 (monolith isolation): Previously found — still unresolved (by design)
- C-2 (tamper-evident): Previously found — still deferred
- C-3 (Novu silent-drop): **New finding** — Novu as-built notes (§6.4.1) make the silent-drop behavior more explicit
- C-4 (service-to-service auth): Previously found — still deferred
- C-5 (LLM budget): **Partially new** — P1.5 §7.2.2 updated the value to $1,000 but ADD §7.2.1 code still shows $500
- C-6 (Google provider): **New finding** — P1.5 as-built makes the gap explicit
- C-7 (DB connections): Previously found — documented constraint

---

## Concern 2: Threat Model Coverage

### Findings (3-model consensus)

| Surface | Threat Model | Gemini | Codex | Claude |
|---------|-------------|--------|-------|--------|
| Authentication & Auth (§14.1) | Complete STRIDE | high | high | Confirmed |
| HITL Gateway (§14.2) | Complete STRIDE | high | high | Confirmed |
| PII Data Stores (§14.3) | Complete STRIDE | high | high | Confirmed |
| MCP Tool Execution (§14.4) | Complete STRIDE + RR-1 resolved | high | high | Confirmed |
| LLM Gateway (§14.5) | Complete STRIDE | high | high | Confirmed |
| File Upload (§14.6) | Complete STRIDE | high | high | Confirmed |
| Webhooks (§14.7) | Complete STRIDE + RR-7 partial | high | high | Confirmed |
| Inngest (§14.8) | Complete STRIDE | high | high | Confirmed |
| **Admin Dashboard (§15)** | **MISSING** — controls exist, no STRIDE | **ERROR** | **ERROR** | **ERROR** |
| **Workflow Mgmt APIs** | **MISSING** — RBAC exists, no STRIDE | **ERROR** | **ERROR** | **ERROR** |
| SLO Cron (§16) | Missing | WARN | — | NOTE (internal surface) |

### Gaps

| ID | Severity | Confidence | Gap | Recommendation |
|----|----------|------------|-----|----------------|
| G-1 | **ERROR** | high | Admin Dashboard APIs (`/api/admin/*`) lack STRIDE threat enumeration despite being high-privilege surface with access to audit logs, HITL state, and financial metrics | Add §14.X STRIDE subsection covering IDOR, privilege abuse, query exfiltration, DoS via pagination |
| G-2 | **ERROR** | high | Workflow Management APIs (`/api/v1/workflows*`) lack dedicated threat model | Add §14.Y STRIDE subsection covering mass assignment, state machine tampering, unauthorized export |
| G-3 | **WARN** | high | Outbound webhook SSRF (RR-7) only partially wired — `safeFetch()` created but not enforced on all paths | Document completion criteria for full enforcement |
| G-4 | **WARN** | medium | SLO Cron / Metric Service background queries lack DoS analysis | Low priority — internal Inngest surface, not externally accessible |
| G-5 | **NOTE** | low | Payment processing flow referenced (PCI DSS 4.0 in TSD) but no payment flow documented | Not applicable for Phase 1 — crypto trades are not payment processing |

### Delta from Previous Evaluation

Comparing with `concerns/THREAT_MODEL_COVERAGE_MULTI_REVIEW.md`:
- Core 8 surfaces (§14.1-14.8): **Improved** — RR-1 now resolved, security middleware documented
- G-1 (Admin Dashboard): **New gap** — directly caused by Phase 2 doc addition of §15 without accompanying §14 STRIDE section
- G-2 (Workflow Management): **Pre-existing gap** — was flagged before, still unaddressed
- G-3 (SSRF partial): **Improved from ERROR to WARN** — `safeFetch()` created in P1.5-06
- G-4 (SLO Cron): **New gap** — new §16 content

---

## Tier 1 Gate Decision

| Factor | Status |
|--------|--------|
| New cross-doc contradictions from Phase 2 updates | **None found** |
| Pre-existing contradictions | 4 ERRORs — all known, tracked |
| Missing threat models for new surfaces | 2 ERRORs (Admin + Workflow) — gaps to fill, not blockers for Tier 2 |
| Threat model quality for existing surfaces | Strong — 8/8 core surfaces have complete STRIDE |

**Decision: PROCEED to Tier 2.** The Tier 1 findings are actionable but do not invalidate the documentation foundation that Tier 2 concerns build upon.

### Recommended Actions (before or during Phase 2 implementation)

1. ~~**Add ADD §14.X**: STRIDE threat model for Admin Dashboard APIs~~ — **RESOLVED**: Added as §14.11 (2026-03-13)
2. ~~**Add ADD §14.Y**: STRIDE threat model for Workflow Management APIs~~ — **RESOLVED**: Added as §14.12 (2026-03-13)
3. ~~**Reconcile LLM budget**: Update ADD §7.2.1 code example to match P1.5 `$1,000/domain` reality~~ — **RESOLVED**: Updated §7.2.1 code, §7.4, §9.14 cost table, §14.5.1 to $1,000 (2026-03-13)
4. ~~**Track Novu silent-drop**: Add to Phase 2 roadmap — delivery rate monitoring or fallback path~~ — **RESOLVED**: Added to Phase 2 Roadmap Epic 5 (2026-03-13)

---

## Debated Items

| Finding | Divergence | Resolution |
|---------|-----------|------------|
| C-1 severity (monolith isolation) | Gemini+Codex: ERROR | Claude: downgraded rationale but kept ERROR — BRD text is unqualified |
| C-7 (DB connections) | Gemini: WARN | Claude: NOTE — documented constraint with mitigation in same section |
| SLO Cron threat model | Gemini: WARN | Claude: NOTE — internal Inngest surface, not externally accessible |
| Stale §14.4 text (Codex finding) | Codex: WARN | Claude: NEEDS VERIFICATION — diff shows §14.4 was updated; may be concern file generation timing issue |
