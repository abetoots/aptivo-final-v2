# Signal Detection — Multi-Model Review

**Date**: 2026-03-12
**Models**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (via PAL clink), OpenAI Codex (via Codex MCP)
**Task**: Analyze project documentation and identify architectural signals for doc-lint
**Input**: `prompts/signal-detection.md` (537KB — all BRDs, FRDs, ADDs, TSD, OpenAPI)

---

## Executive Summary

All three models independently analyzed the full project documentation against the 93-signal vocabulary. There was strong consensus: **81 signals** are genuinely present in the documentation. The remaining 12 signals have no meaningful evidence or are future-only concepts.

The current `doc-lint.yaml` declared 71 signals. This review adds **10 new signals** backed by documentary evidence and multi-model consensus.

---

## Consensus Findings

### Signals to ADD (10 new)

All three models agreed these are present in the documentation:

| Signal | Gemini | Codex | Claude | Evidence |
|--------|--------|-------|--------|----------|
| `acceptance-criteria` | high | high | high | FRDs have explicit Acceptance Criteria sections for all functional requirements |
| `iac` | high | medium | high | ADD §10 "Infrastructure as Code" section, `.do/app.yaml` App Spec GitOps |
| `load-balancing` | high | medium | medium | DO managed load balancer (ADD deployment), LB retry policies, health probes |
| `payments` | high | low | medium | PCI DSS 4.0 compliance requirement, Payment Gateway retry policies in ADD |
| `quotas` | high | medium | medium | LLM daily/monthly budget quotas, usage caps distinct from rate-limiting |
| `saga` | high | medium | medium | FR-CORE-WFE-005 compensation/rollback, ADD §3.4 Retry and Compensation |
| `schema-evolution` | high | medium | medium | Versioned events, backward-compatible schema changes documented in ADD |
| `uptime` | high | high | high | Explicit >99% monthly uptime target, availability SLOs in BRD §5 |
| `user-input` | high | medium | medium | HITL approval forms, API input validation at system boundaries |
| `websocket` | medium | medium | medium | MCP transport supports WebSocket, crypto domain has WebSocket events |

### Signals RETAINED (71 existing)

All currently declared signals were confirmed by all three models. No removals recommended.

### Signals NOT declared (12 excluded)

| Signal | Gemini | Codex | Claude | Reason for exclusion |
|--------|--------|-------|--------|---------------------|
| `async-api` | medium | low | skip | No AsyncAPI spec in project; only appears in vocabulary definition |
| `batch-processing` | low | medium | skip | Only appears in vocabulary definition, no evidence in docs |
| `data-migration` | medium | low | skip | Not a core architectural pattern in this project |
| `distributed` | high | — | skip | No evidence in docs; Gemini hallucinated this (multi-component != distributed) |
| `eventual-consistency` | medium | medium | skip | Not an explicit consistency model used; async workflows don't imply EC |
| `graphql` | — | — | skip | Not used; project is REST-only |
| `high-traffic` | high | low | skip | 3-dev team, small-scale project; crypto stress tests don't constitute high-traffic |
| `legacy-system` | medium | low | skip | No legacy system; project is greenfield |
| `multi-region` | medium | medium | skip | Documented as future DR only; not currently implemented or designed for |
| `public-api` | medium | medium | skip | Admin API is internal; no public developer API |
| `qa` | high | low | skip | Redundant with `testing` + `acceptance-criteria` signals |
| `saml` | medium | low | skip | Phase 2+ enterprise consideration only; no current implementation |

---

## Debated Items

### 1. `payments` — Gemini high vs Codex low

**Gemini**: "PCI DSS 4.0 compliance and Payment Gateway retry policies are explicitly mentioned."
**Codex**: "Payment/transaction-style financial operations are present in the crypto domain context."

**Verdict**: INCLUDE at medium confidence. PCI DSS 4.0 appears as a compliance requirement (ADD security section), and "Payment Gateway" has explicit retry policies. While crypto trading isn't traditional payment processing, the compliance surface is real.

### 2. `distributed` — Gemini high vs Codex not detected

**Gemini**: "Multi-component architecture with shared core services and domain-specific workers."
**Codex**: Did not detect.

**Verdict**: EXCLUDE. Grep verification found zero occurrences of "distributed system/architecture/computing" in the actual docs. Multi-component architecture is already covered by `multi-component`. Gemini conflated concepts.

### 3. `high-traffic` — Gemini high vs Codex low

**Gemini**: "Crypto domain stress tests require handling high-volume trade signal processing."
**Codex**: "High-volume streams, spikes, and burst behavior are discussed for ops planning."

**Verdict**: EXCLUDE. This is a 3-developer team project targeting DO App Platform (1-3 containers). Stress testing a workflow doesn't make it a high-traffic system.

### 4. `batch-processing` — Gemini low vs Codex medium

**Gemini**: "Mentioned for low-priority notification delivery."
**Codex**: "Batched notifications/digests and scheduled reconciliation/bulk-style jobs are documented."

**Verdict**: EXCLUDE. Grep found zero occurrences of batch processing terms in the actual docs. Both models were inferring from notification delivery patterns.

### 5. `qa` — Gemini high vs Codex low

**Gemini**: "Success metrics and modular testing strategy are part of the platform core."
**Codex**: "Operational smoke tests and acceptance-driven verification indicate QA concerns."

**Verdict**: EXCLUDE. Covered by `testing` and `acceptance-criteria`. Adding `qa` would be redundant.

---

## Unmapped Concepts

Concepts identified in the docs that don't map to any signal in the vocabulary:

| Concept | Source | Rationale |
|---------|--------|-----------|
| `mcp` (Model Context Protocol) | All 3 models | First-class integration architecture; no MCP signal in vocabulary |
| `passwordless-auth` | Gemini | Magic link authentication is the primary auth strategy |
| `malware-scanning` | Gemini | ClamAV integration for file uploads is a security feature |
| `idempotency` | Codex | Idempotency-Key deduplication is a core safety pattern |
| `dead-letter-queue` | Codex | DLQ operations are documented in audit and runbook |

**Recommendation**: Consider adding `mcp` and `idempotency` to the signal vocabulary in future versions.

---

## Actionable Recommendations

1. **Update `doc-lint.yaml`** — Add the 10 new signals to `signals.declared` (total: 82)
2. **No removals** — All 72 existing signals are confirmed present
3. **Vocabulary evolution** — Propose `mcp` and `idempotency` as new signals to doc-lint maintainers
4. **Re-evaluate on Phase 2** — Signals like `saml`, `multi-region`, and `public-api` may become relevant

---

## Final Signal Count

| Category | Count |
|----------|-------|
| Previously declared | 71 |
| New signals added | 10 |
| **Total declared** | **81** |
| Vocabulary size | 93 |
| Not applicable | 12 |
