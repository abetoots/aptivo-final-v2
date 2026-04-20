# Tier 2 API Cluster — Multi-Model Review

**Date**: 2026-04-20
**Concerns**: 3 — api-contract-consistency, api-versioning-compliance, boundary-condition-coverage

---

## Executive Summary

- **Total findings**: 12 (3 ERROR, 11 WARN, 1 NOTE, 2 positives)
- **Cross-concern pattern**: The `/api/admin/*` path choice creates consistency issues across all 3 concerns — it's unversioned (violates §13.8), the runbook references a different path, and no documented exception exists.
- **Reinforces Tier 1**: Confirms C8 (hash-chain audit contradiction) and C11 (runbook path mismatch) as real issues.
- **Positive**: 5/5 admin endpoints structurally match between ADD §15.2 and OpenAPI; all use RFC 7807 error responses.

---

## 1. api-contract-consistency (Gemini): 5 gaps

| Severity | Finding |
|----------|---------|
| **ERROR** | **Admin endpoints violate `/api/v1/` versioning mandate** — 5 new endpoints at `/api/admin/*` instead of `/api/v1/admin/*` |
| **ERROR** | **Health check path mismatch** — `api-spec-readiness.md` says `/api/health`/`/api/ready`, OpenAPI says `/health/live`/`/health/ready` — deployment probes will fail |
| **ERROR** | **Hash-chain audit contradiction** — ADD §9.3 defers to Phase 3+, but audit.md TSD v1.0.0 includes `computeAuditHash` and chain-head locking (same as Tier 1 C8) |
| WARN | **Admin schemas missing `required` arrays** in OpenAPI — generated SDKs treat all fields as optional, breaks frontend assumptions |
| WARN | **RFC 8594 Sunset/Deprecation headers** mandated by §13.8 but absent from all OpenAPI responses |

## 2. api-versioning-compliance (Codex): 3 gaps

| Severity | Finding |
|----------|---------|
| WARN | Admin dashboard API (`/api/admin/*`) lacks documented versioning strategy or explicit exception from `/api/v1/` mandate |
| WARN | Runbook §8.14 references `GET /api/v1/admin/llm/budget` — a third path variant for the same capability (vs ADD §15.4's `/api/admin/llm-usage/budget`) |
| WARN | Health endpoints `/health/live`, `/health/ready` are unversioned without documented exclusion from versioning policy |

## 3. boundary-condition-coverage (Gemini): 4 gaps

| Severity | Finding |
|----------|---------|
| WARN | **Systemic at-limit test gap for core SLOs** — tests check ±1% from threshold but never exactly 99%, 10,000ms, 99.5%, or 100 DLQ |
| WARN | Missing at-limit pagination tests: `limit=1`, `limit=200`, `page=0`, `limit=0` |
| WARN | Missing at-limit body size tests: exactly 256KB webhook, exactly 1MB API body |
| WARN | **LLM monthly budget doc inconsistency** — BRD Crypto §8.2 ($500) vs ADD §7.2.2 ($1000) — same as Tier 1 C1 |

### Items evaluated (12, all with tests):

Workflow Success ≥99%, HITL Latency P95 <10s, MCP Success ≥99.5%, Audit DLQ ≤100, Pagination [1,200], Page ≥1, Range [1,365], Webhook 256KB, API 1MB, JSON 10 levels, LLM $50/day, LLM $1000/month — **all have over-limit tests but most lack at-limit coverage**.

---

## Cross-Tier Pattern: `/api/admin/*` Saga

This is the same issue surfacing in 3 concerns + Tier 1:

| Source | Path |
|--------|------|
| ADD §15.2 table | `/api/admin/overview`, `/api/admin/audit`, etc. |
| OpenAPI spec | `/api/admin/*` (matches ADD) |
| ADD §13.8 mandate | "All endpoints under `/api/v1/`" (violated) |
| Runbook §8.14 | `/api/v1/admin/llm/budget` (third variant — just wrong) |

**Resolution needed**: Decide canonical path, update all 3 sources.

---

## Delta Against Previous Evaluations

- **API_CONTRACTS_SCHEMA**: No prior eval covered admin endpoints. All findings are new surface.
- **Boundary testing** was not flagged in prior concerns — this is a new gap surfaced by the new threshold documentation.

---

## Priority Actions

### ERROR (3) — pre-merge
1. Decide `/api/admin/*` vs `/api/v1/admin/*` — update OpenAPI, ADD §15, runbook
2. Fix health check path inconsistency (align readiness doc with OpenAPI)
3. Reconcile hash-chain audit status — ADD §9.3 update or TSD downgrade

### WARN (9) — Phase 2 planning
- OpenAPI schema `required` arrays for admin responses
- Sunset/Deprecation header injection (global)
- At-limit test coverage (3 categories)
- LLM budget normalization ($500 vs $1000)
- Versioning exception documentation for health + admin
