# Tier 2 SLA/Observability Cluster — Multi-Model Review

**Date**: 2026-04-20
**Concerns**: 5 — alerting-slo-alignment, sla-architecture-alignment, trace-context-propagation, cost-budget-enforcement, durable-persistence

---

## Executive Summary

- **Total findings**: 17 (6 ERROR, 10 WARN, 1 NOTE)
- **Critical pattern**: LLM monthly budget inconsistency ($500 vs $1,000) appears across 3 concerns — this is the most urgent fix
- **Critical pattern**: Audit DLQ + hash-chain have fundamental ADD vs TSD contradictions — durable-persistence escalates to human review
- **MCP success rate SLO has triple contradiction** (99% BRD, 95% §10.4.8, 99.5% §16.3) — confirms Tier 1 C5/C7

---

## 1. alerting-slo-alignment (Gemini): 4 gaps

| Severity | Finding |
|----------|---------|
| **ERROR** | **MCP success rate triple contradiction**: BRD 99% vs ADD §10.4.8 95% vs ADD §16.3 99.5% — operational alerts at 95% would let 4% breaches go undetected |
| **ERROR** | **Audit Integrity DLQ > 100 contradicts zero-loss mandate** — 100 audit events can be lost before alerting, violating regulatory compliance |
| WARN | **Data freshness SLO (5-min cache age)** has no corresponding alert evaluator in §16 |
| NOTE | Workflow success rate window mismatch: §10.4.8 uses 1h, §16.3 uses 5-min — could cause flap on low-volume workflows |

## 2. sla-architecture-alignment (Codex): 4 gaps, all WARN

Core BRD §5 SLOs now architecturally supported by §16 MetricService. Remaining gaps are domain-specific:

| Finding |
|---------|
| Crypto whale alert <2min not guaranteed — 5-min polling interval documented, no event-driven path specified |
| Crypto security scan <30s budget unachievable — ADD MCP retry budget is ~37s per call, two calls required |
| HR performance targets (app ack <5min, resume parse <30s, dashboard <2s, search <1s) have no architectural support |
| HR 99.9% uptime promise conflicts with Phase 1 single-region + 4h RTO — maintenance window exclusion unclear |

## 3. trace-context-propagation (Gemini): 4 gaps

| Severity | Finding |
|----------|---------|
| **ERROR** | **Financial traceability gap** — crypto trade workflows lack documented trace propagation across Inngest and DB boundaries |
| WARN | Admin overview API and MetricService drop trace context before Drizzle queries |
| WARN | SLO cron (5-min job) and Audit DLQ replay lose trace context across async boundaries |
| WARN | Propagation mechanism inconsistent — §16.5 says W3C traceparent, §11.2 says OTel SDK, HR §4.4 says custom `x-trace-id` |

## 4. cost-budget-enforcement (Gemini): 4 gaps

| Severity | Finding |
|----------|---------|
| **ERROR** | **LLM monthly budget inconsistency** — $500 (§7.2/§7.4/§14.5.1) vs $1,000 (§7.2.2/§15.4). Monitoring at $1000 fires after app-level blocking at $500. |
| **ERROR** | **Compute auto-scaling has no documented dollar budget cap** — only capacity cap (3 containers) |
| WARN | DigitalOcean Spaces overage ($0.02/GiB) uncapped — unbounded storage costs possible |
| WARN | MCP third-party APIs (Calendar, Crypto Scanner) have no budget/free-tier documentation |

### Metered resources evaluated (7):
LLM, PostgreSQL ($30/mo), Redis ($15/mo), DO Spaces, Compute (1-3 containers), Novu (10k/mo free), Inngest (50k steps/mo free)

## 5. durable-persistence (Codex): 1 ERROR (human review required)

### Items evaluated (12 workflows/processes): all document checkpoint semantics via Inngest durable execution

| Process | Resume behavior |
|---------|-----------------|
| Workflow Engine | resume-at-last-step (Inngest memoization) |
| HITL Approval Suspension | resume-at-last-step |
| Crypto Paper Trading, Security Scan | resume-at-last-step |
| HR Candidate Flow, Interview Scheduling (48h), Contract Approval (72h) | resume-at-last-step |
| Audit Export with Integrity | resume-at-last-step (regenerable) |
| Malware Scan | resume-at-last-step (upsert-based) |
| Data Deletion Cascade / DSAR | resume-at-last-step (30-day SLA) |
| Retention Enforcement Job | resume-at-last-step (idempotent rerun) |
| **Audit Write DLQ Retry Process** | **UNKNOWN — fundamental doc contradiction** |

| Severity | Finding |
|----------|---------|
| **ERROR (human review)** | **Audit DLQ retry process undocumented and contradictory**: ADD §2.3.2 says "DLQ only recommended"; Runbook §8.10 calls it "interim mitigation"; TSD §2 lists new audit.md with hash-chained + DLQ + PII masking; MetricService §16.1 queries `audit_write_dlq` as implemented. No checkpoint map, schema, retry worker state, or recovery procedure. Compliance-critical audits could be stranded or duplicated. |

---

## Cross-Cluster Pattern: LLM $500 vs $1,000 Budget

Appears in **3 concerns** (cost-budget-enforcement, llm-safety-envelope, boundary-condition-coverage) + Tier 1 C1:

| Source | Value |
|--------|-------|
| ADD §7.2 | $500/mo |
| ADD §7.2.1 | $500/mo (MONTHLY_BUDGET_USD const) |
| ADD §7.2.2 (Phase 1.5 as-built) | **$1,000/mo** |
| ADD §7.4 (Retry Cost Management) | $500/mo |
| ADD §14.5.1 | $500/mo |
| ADD §15.4 (Admin Budget Endpoint) | **$1,000/mo** |
| BRD Crypto §8.2 | $500/mo |

**Resolution**: Phase 1.5 intended to double budget to $1,000 but only updated §7.2.2 and §15.4. Remaining 5 references need update.

---

## Cross-Cluster Pattern: Audit Durability Saga

Appears in Tier 1 (C7, C8), Tier 2 API (api-contract-consistency gap-3), durable-persistence ERROR:

| Source | Claim |
|--------|-------|
| ADD §2.3.2 | Audit writes synchronous; DLQ is "recommended" (not implemented) |
| ADD §9.3 | Hash-chaining deferred to Phase 3+ |
| ADD §9.5 | Audit exports have checksum but no chain |
| ADD §16.1 | MetricService queries `audit_write_dlq` as if implemented |
| Runbook §8.10 | DLQ is "interim mitigation" |
| **TSD audit.md (new v1.0.0)** | **Hash-chained audit + DLQ + PII masking** |

**Resolution needed**: Codex flagged this needs human decision on whether hash-chain + DLQ is Phase 1 or Phase 3+.

---

## Delta Against Previous Evaluations

| Prior finding | Status |
|---------------|--------|
| ALERTING_SLO prior eval | Audit integrity alert was always DLQ>100 — still flagged |
| RESILIENCE_FAILURE_MODES | No DLQ concern raised — new issue from §16.1 wiring |
| S5-W17 burn-rate alerting deferred | Still deferred; now flagged on freshness alert too |
| SLA_PROMISE_VALIDATION | HR/Crypto domain SLO gaps persist |

---

## Priority Actions

### ERROR (6) — critical fixes

1. **Decide LLM monthly budget**: Canonical value (update 5 sections)
2. **MCP success rate SLO**: Reconcile 99%/95%/99.5% — pick one, update 3 sources
3. **Audit DLQ/hash-chain status**: Is it Phase 1 or Phase 3+? (Human review)
4. **Audit integrity alert threshold**: Align DLQ>100 with zero-loss mandate
5. **Financial traceability**: Document trace propagation for crypto workflows
6. **Compute budget cap**: Add dollar value, configure DO billing alerts

### WARN (10) — Phase 2 planning

- HR performance architecture (4 SLOs)
- Crypto workflow latency budgets
- Data freshness alert evaluator
- Object storage cost cap
- MCP API budget inventory
- Trace context in async boundaries
- Propagation mechanism standardization
- HR uptime math clarification

### NOTE (1) — tracker

- Workflow success rate measurement window (1h vs 5min)
