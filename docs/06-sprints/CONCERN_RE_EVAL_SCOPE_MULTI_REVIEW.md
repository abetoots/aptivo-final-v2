# Concern Re-Evaluation Scope — Multi-Model Review

**Date**: 2026-04-13
**Models**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (via PAL clink), OpenAI Codex (via Codex MCP)
**Task**: Determine which concern schemas need re-evaluation after Phase 1/1.5 doc design updates
**Input**: 35 concern schemas in `new/concerns-1/`, previous evaluations in `concerns-2/` + `concerns-3/`

---

## Executive Summary

Three models independently analyzed whether documentation changes (platform-core-add.md +180 lines, specs +500 lines, 2 new TSD files) justify re-evaluating all 35 concern schemas or a subset.

**Consensus**: 21 concerns need re-evaluation (saving 40% of tokens). 10 can be safely skipped. 4 are borderline (skipped per user preference).

| Model | MUST | BORDERLINE | SKIP |
|-------|------|------------|------|
| Claude (Lead) | 15 | 4 | 16 |
| Gemini | 26 | 4 | 5 |
| Codex | 22 | 8 | 5 |
| **After debate** | **21** | **4** | **10** |

---

## Consensus Findings

### Doc Changes That Drive Re-Evaluation

| Change | Lines | Affected Concerns |
|--------|-------|-------------------|
| ADD §14.10 Security Middleware Stack | ~40 | auth-boundary, auth-scheme, input-validation, logging-pii, secrets, threat-model |
| ADD §15 Admin Dashboard Architecture | ~80 | api-contract, api-versioning, auth-boundary, cost-budget, input-validation |
| ADD §16 Observability/SLO Architecture | ~60 | alerting-slo, sla-architecture, trace-context |
| ADD §7.2.2 LLM Production Store | ~10 | cost-budget, durable-persistence, llm-safety |
| ADD §14.4/14.7 RR-1/RR-7 resolved | ~15 | threat-model, secrets |
| OpenAPI admin endpoints | +344 | api-contract, api-versioning, boundary-condition |
| LLM gateway spec | +111 | llm-safety, cost-budget |
| admin-ops-api.md (NEW) | full | api-contract, error-path |
| audit.md (NEW) | full | durable-persistence, error-path |

### Concerns SKIPPED (10) — All 3 Models Agree or 2/3 Agree

| Concern | Tier | Rationale |
|---------|------|-----------|
| `cache-consistency-contract` | T2 | Caching strategy unchanged |
| `container-orchestration-readiness` | T2 | Deployment architecture unchanged |
| `dependency-runbook` | T2 | Novu wiring is minor implementation detail |
| `failure-domain-isolation` | T1 | Security middleware != failure domain boundary change |
| `feasibility-check` | T1 | Already proven by completed Phase 1 |
| `regional-failure-containment` | T2 | Multi-region strategy unchanged |
| `resilience-triad` | T2 | Timeout/circuit-breaker/retry patterns unchanged |
| `rollback-documentation` | T2 | Rollback procedures unchanged |
| `scalability-claim-validation` | T2 | No new scale claims |
| `state-ownership-clarity` | T1 | Ownership model unchanged |

### Concerns BORDERLINE (4) — Skipped per Option B

| Concern | Tier | Rationale |
|---------|------|-----------|
| `data-retention-compliance` | T2 | Audit spec touches retention but core model unchanged |
| `event-schema-compatibility` | T2 | Audit events documented but schemas unchanged |
| `failure-mode-coverage` | T2 | SLO cron adds failure modes but core model stable |
| `idempotency-boundaries` | T2 | Admin endpoints are GET-only; low impact |

---

## Debated Items

### 1. `contradiction-scanner` — Claude SKIP vs Gemini+Codex MUST
**Claude**: Meta-concern that always produces noise; doc changes are consistent.
**Gemini+Codex**: 3 new ADD sections + 2 new specs significantly raise cross-document contradiction risk.
**Verdict**: MUST. Upgraded — large multi-doc additions genuinely warrant cross-reference checking.

### 2. `boundary-condition-coverage` — Claude SKIP vs Gemini+Codex MUST
**Claude**: No fundamental boundary condition changes.
**Gemini+Codex**: New SLO cutoffs, pagination clamps (max 200), budget thresholds ($5/day) are real boundary conditions.
**Verdict**: MUST. Conceded — these are concrete new boundary values needing coverage verification.

### 3. `llm-safety-envelope` — Claude SKIP vs Gemini+Codex MUST
**Claude**: LLM safety architecture unchanged.
**Gemini+Codex**: +111 lines in LLM gateway spec + production store limits materially expand the safety evidence.
**Verdict**: MUST. Conceded — the spec expansion is substantive.

### 4. `failure-domain-isolation` — Gemini MUST vs Claude+Codex SKIP
**Gemini**: MCP sanitization and safeFetch introduce critical new isolation layers.
**Claude+Codex**: These are security features, not failure domain boundaries.
**Verdict**: SKIP. Security middleware operates within existing failure domains.

### 5. `feasibility-check` — Gemini MUST vs Claude+Codex SKIP
**Gemini**: Major new features require re-validating technical feasibility.
**Claude+Codex**: Feasibility already proven by completed implementation.
**Verdict**: SKIP. The code works — re-evaluating feasibility of built features is circular.

### 6. `state-ownership-clarity` — Gemini MUST vs Claude+Codex SKIP
**Gemini**: LLM store and audit persistence expand state ownership responsibilities.
**Claude+Codex**: Ownership model unchanged — docs describe what was already built.
**Verdict**: SKIP. Documentation of existing stores doesn't change who owns what.

---

## Actionable Recommendations

1. **Execute 21 concern evaluations** in tier order: T1(2) → T2(15) → T3(3) → untiered(1)
2. **Compare with `concerns-2/WARNINGS_REGISTER.md`** to identify resolved vs new findings
3. **Skip 14 concerns** (10 SKIP + 4 BORDERLINE) — saving ~40% of evaluation tokens
4. **Produce per-concern delta reports** showing what changed from previous evaluation
