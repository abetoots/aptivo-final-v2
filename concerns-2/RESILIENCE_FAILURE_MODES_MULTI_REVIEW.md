# Session 4: Resilience & Failure Modes — Multi-Model Review

**Date**: 2026-03-01
**Models**: Gemini (PAL clink), Codex MCP, Claude Opus 4.6 (Lead Expert)
**Concerns**: resilience-triad, cache-consistency-contract, durable-persistence, failure-mode-coverage
**Methodology**: Independent parallel evaluation → comparison → debate → consensus

---

## Executive Summary

Session 4 evaluated 4 concerns across the resilience and failure handling domain. The documentation is **strongest in durable persistence** (Inngest's memoization provides inherent checkpoint/resume) and **weakest in resilience triads** (only 1 of 8 external dependencies has a complete timeout/retry/circuit breaker composition). The operational runbook covers infrastructure failures well but lacks playbooks for 16 of 23 application-level failure modes documented in the ADD.

| Concern | Errors | Warnings | Notes |
|---------|--------|----------|-------|
| resilience-triad | 7 | 3 | 0 |
| cache-consistency-contract | 3 | 4 | 0 |
| durable-persistence | 2 | 4 | 0 |
| failure-mode-coverage | 3 | 6 | 0 |
| **Total** | **15** | **17** | **0** |

---

## Model Comparison

| Model | Total Errors | Total Warnings | Total Notes | Key Strength |
|-------|-------------|----------------|-------------|-------------|
| **Gemini** | 4 | 3 | 0 | Found MCP coherence concern |
| **Codex** | 13 | 6 | 1 | Thorough cache + dependency inventory |
| **Claude** | 14 | 19 | 0 | Most comprehensive; cross-document analysis |

Gemini's undercounting pattern continues (4E vs 13-14E). Gemini missed all missing-triad ERRORs except Audit Service, missed most cache gaps, and missed HITL/DB-pool runbook gaps.

---

## Debated Items

### Debate 1: Gemini gap-rt-1 — MCP Timeout/Retry Budget Incoherence

**Gemini claim**: "TSD §7.2 specifies a 10s total timeout, but the retry policy (3 attempts with 1s/2s/4s backoff) requires 37s to complete safely."

**Verification**: Cockatiel `wrap(retry, circuitBreaker, timeout(10_000))` — timeout is the innermost policy. Each attempt gets 10s. Retry wraps timeout, so total budget ≈ 3×10s + backoff ≈ 37s. The 10s is **per-attempt**, not total.

**Verdict**: REJECTED as ERROR. The composition is coherent. Promoted to W3 (warn) — the coherence should be explicitly documented but is not broken.

### Debate 2: Gemini gap-dp-1 — Audit Sync Writes as Durable Persistence ERROR

**Gemini claim**: Synchronous audit writes blocking workflows is a durable-persistence gap.

**Verification**: The durable-persistence concern evaluates checkpoints, state storage, and crash recovery for long-running processes. Synchronous blocking is a resilience/availability concern, not a durability concern. Already covered under failure-mode-coverage E14.

**Verdict**: REJECTED for durable-persistence. Correctly captured as failure-mode-coverage E14.

### Debate 3: Codex cache-gap-1 — Session Cache Severity (ERROR vs WARN)

**Codex claim**: Session cache layer missing invalidation = ERROR.
**Claude claim**: Session cache is JWT-based; `sess:*` is performance cache = WARN.

**Verification**: ADD 2.3.2 Redis says "Session cache: fail-open — fall back to database session lookup." Sessions are JWT-based per ADD §8. The `sess:*` keys cache session metadata for performance, not auth state. JWT validation uses JWKS cache (separately documented).

**Verdict**: DOWNGRADED to W5 (warn) with `requires_human_review: true`. JWT-based auth reduces the impact, but session metadata invalidation should be documented.

### Debate 4: File Storage/ClamAV Severity

**Codex**: ERROR for missing timeout/CB.
**Claude**: WARN for File Storage (split across TSD/ADD), WARN for ClamAV.

**Verification**: Per schema failure_condition 1, "Any leg of the triad is undocumented" = ERROR. File Storage has no CB anywhere. ClamAV has only timeout.

**Verdict**: ACCEPTED as ERROR (E7). Schema criteria are clear — missing leg = ERROR regardless of criticality.

### Debate 5: Audit Service — Resilience Triad Classification

**Gemini**: Audit Service as external dependency with missing triad (gap-rt-2).
**Claude/Codex**: Did not flag Audit Service under resilience-triad.

**Verification**: Audit Service is an internal component writing to PostgreSQL. It's not an "external dependency" per the resilience-triad schema. Its issue (synchronous blocking) is covered under failure-mode-coverage.

**Verdict**: REJECTED for resilience-triad. Audit Service is internal. Captured under failure-mode-coverage E14.

---

## Consensus Findings

### Concern 1: Resilience Triad (7E / 3W)

#### E1: LLM Gateway — Missing Circuit Breaker + Vague Timeout/Retry
- **Severity**: ERROR | **Confidence**: high
- **Description**: ADD §7 documents provider fallback and "30s default" timeout, but: (a) no circuit breaker configuration, (b) no specific connection/read/total timeout split, (c) retry max attempts and backoff not specified in ADD. TSD 7.2 lacks LLM entry.
- **Source**: ADD §7.1.1, ADD §2.3.2 LLM Gateway
- **Failure condition**: Missing CB (condition 1), vague timeout (condition 2), incomplete retry (condition 3)
- **Risk**: Failing LLM provider consumes full timeout+retry on every request before fallback; no fail-fast mechanism.
- **Status**: [x] **RESOLVED**

#### E2: Inngest Cloud — All Three Triad Legs Missing
- **Severity**: ERROR | **Confidence**: high
- **Description**: No timeout, retry, or CB documented for the application's outbound calls to Inngest Cloud (event send, step scheduling). ADD §2.3.2 documents what happens when Inngest is down (resume from last step) but not how the app handles connectivity issues.
- **Source**: ADD §3, ADD §2.3.2 Workflow Engine
- **Failure condition**: All three legs undocumented (condition 1); Critical component (condition 6)
- **Risk**: Inngest Cloud is Critical. Transient network issues could cause hangs or uncontrolled retry storms on workflow trigger/event paths.
- **Status**: [x] **RESOLVED**

#### E3: Novu Cloud — All Three Triad Legs Missing
- **Severity**: ERROR | **Confidence**: high
- **Description**: No timeout, retry, or CB for app-to-Novu API calls. "Novu internal retry logic" covers Novu's delivery retries, not the application-to-Novu API call path.
- **Source**: ADD §6, ADD §2.3.2 Notification Bus
- **Failure condition**: All three legs undocumented (condition 1); on HITL notification path (condition 6)
- **Risk**: Slow Novu API blocks notification sends from workflow steps; HITL approval notifications on critical path.
- **Status**: [x] **RESOLVED**

#### E4: Supabase Auth — Incomplete Triad
- **Severity**: ERROR | **Confidence**: high
- **Description**: TSD §7.2 has "IdP Token Validation: 2s, 1x after 100ms" but ADD §8 does not reference these values. No CB documented for any Supabase operation. JWKS caching is a fallback strategy, not a circuit breaker.
- **Source**: ADD §8, ADD §2.3.2 Identity Service, TSD §7.2
- **Failure condition**: Missing CB (condition 1); Critical auth dependency (condition 6); TSD values not in ADD
- **Risk**: Supabase on every authenticated request path. Slow response degrades all API endpoints.
- **Status**: [x] **RESOLVED**

#### E5: PostgreSQL — All Three Triad Legs Missing
- **Severity**: ERROR | **Confidence**: high
- **Description**: No statement timeout, connection timeout, connection pool config, retry policy, or CB documented. ADD §2.3.2 notes "Phase 2+: statement timeouts per domain" but Phase 1 has nothing.
- **Source**: ADD §2.3.2 PostgreSQL, ADD §9
- **Failure condition**: All three legs undocumented (condition 1); Critical shared infrastructure (condition 6)
- **Risk**: Single most critical dependency. Long-running query holds connections indefinitely. Brief hiccup cascades to all components.
- **Status**: [x] **RESOLVED**

#### E6: Redis — All Three Triad Legs Missing
- **Severity**: ERROR | **Confidence**: high
- **Description**: Per-consumer fallback policies well-documented (fail-closed for idempotency, fail-open for rate limiting), but no timeout, retry, or CB for Redis operations.
- **Source**: ADD §2.3.2 Redis Cache
- **Failure condition**: All three legs undocumented (condition 1); Critical shared infrastructure (condition 6)
- **Risk**: Slow Redis blocks callers synchronously. No CB means retry storms across all consumers.
- **Status**: [x] **RESOLVED**

#### E7: File Storage/ClamAV — Incomplete Triad
- **Severity**: ERROR | **Confidence**: medium
- **Description**: TSD §7.2 has "File Storage: 15s timeout, 3x linear backoff" but ADD §9.6/§2.3.2 doesn't reference these. No CB anywhere. ClamAV has only scan timeout (30s), no retry or CB.
- **Source**: TSD §7.2, ADD §2.3.2 File Storage, ADD §9.8.2
- **Failure condition**: Missing CB leg (condition 1); values split across TSD/ADD
- **Risk**: File-dependent workflows stall without fail-fast. ClamAV failures accumulate scan_pending files.
- **Status**: [x] **RESOLVED**

#### W1: MCP Triad Coherence Not Explicitly Documented
- **Severity**: WARN | **Confidence**: medium
- **Description**: MCP cockatiel composition (ADD §5.2) is correct but does not include explicit coherence calculation. No documented Inngest step-level timeout constraining the total MCP retry budget.
- **Source**: ADD §5.2
- **Status**: Accepted (composition is correct; coherence documentation is advisory)

#### W2: LLM Retry Idempotency/Cost Impact
- **Severity**: WARN | **Confidence**: medium
- **Description**: ADD §7.1.1 notes "Retry on timeout may result in duplicate cost" but no cost-limiting mechanism for retried requests beyond budget enforcement.
- **Source**: ADD §7.1.1
- **Status**: Accepted (Inngest memoization prevents workflow-level duplicates; cost impact is acknowledged)

#### W3: TSD-ADD Documentation Split
- **Severity**: WARN | **Confidence**: high
- **Description**: TSD §7.2 contains timeout/retry values for Payment Gateway, Email, Calendar, File Storage, and IdP that are not cross-referenced in the ADD's architectural sections for those same services.
- **Source**: TSD §7.2 vs ADD §§5-9
- **Status**: Accepted (documentation consolidation deferred; TSD values are authoritative)

### Concern 2: Cache Consistency Contract (3E / 4W)

#### E8: Entity Cache — Missing Stale-Read Behavior
- **Severity**: ERROR | **Confidence**: high
- **Description**: Entity cache (common-patterns.md §6) has TTL and event-driven invalidation documented but no stale-read behavior. What happens when Redis is slow? Is stale data returned? Is there stale-while-revalidate?
- **Source**: common-patterns.md §6, TSD §7.3
- **Failure condition**: stale_read_behavior NULL for user-facing data (condition 3)
- **Risk**: Inconsistent developer behavior — each developer handles staleness differently.
- **Status**: [x] **RESOLVED**

#### E9: MCP Response Cache — Missing Stale-Read Behavior + Key Strategy
- **Severity**: ERROR | **Confidence**: high
- **Description**: ADD §5.6 documents per-data-type TTLs (price=60s, transactions=5min) but no stale-read behavior. Price data is used for trading decisions. No cache key strategy documented.
- **Source**: ADD §5.6
- **Failure condition**: stale_read_behavior NULL (condition 3); freshness_slo NULL for business-critical pricing (condition 2)
- **Risk**: Stale crypto price data served during MCP server outage could lead to bad trading decisions.
- **Status**: [x] **RESOLVED**

#### E10: Permission Cache — Missing Freshness SLO
- **Severity**: ERROR | **Confidence**: high
- **Description**: Permission data cached in-memory for 5min (Coding Guidelines §4.6). Security-sensitive data used for authorization. No explicit freshness SLO. No event-driven invalidation on role change.
- **Source**: Coding Guidelines §4.6
- **Failure condition**: freshness_slo NULL for permissions (condition 2)
- **Risk**: Revoked user retains access for up to 5 minutes. HITL approver removed could still approve within cache window.
- **Status**: [x] **RESOLVED**

#### W4: Entity Cache Freshness SLO Not Explicit
- **Severity**: WARN | **Confidence**: high
- **Description**: TTL values documented (10min entity, 5min list) but no explicit freshness SLO statement.
- **Source**: common-patterns.md §6.3
- **Status**: Accepted (TTLs serve as implicit SLOs)

#### W5: Session Cache Invalidation
- **Severity**: WARN | **Confidence**: medium | **requires_human_review**: true
- **Description**: `sess:*` cache mentioned in ADD §2.3.2 Redis but invalidation not documented.
- **Source**: ADD §2.3.2 Redis
- **Status**: Accepted (JWT-based auth; session cache is performance optimization)

#### W6: Cache Warming / Cold Start
- **Severity**: WARN | **Confidence**: medium
- **Description**: No documentation on cache behavior after deployment or Redis restart.
- **Source**: All documents searched
- **Status**: Accepted (cache-aside is standard; cold-start latency is acceptable Phase 1 risk)

#### W7: TTL-Only Invalidation Risk
- **Severity**: WARN | **Confidence**: high
- **Description**: Some data patterns use TTL-only invalidation without event-driven purge.
- **Source**: common-patterns.md §6
- **Status**: Accepted (event-driven invalidation exists for entity updates; TTL-only acceptable for stats)

### Concern 3: Durable Persistence (2E / 4W)

#### E11: Saga Pattern — Incomplete Checkpoint/Recovery Documentation
- **Severity**: ERROR | **Confidence**: medium
- **Description**: common-patterns.md §8 documents saga steps and compensation but not: (a) Inngest step boundaries per saga step, (b) crash recovery during compensation, (c) stuck saga detection, (d) data-at-risk between steps. The saga YAML doesn't specify that each step is an Inngest `step.run()`.
- **Source**: common-patterns.md §8
- **Failure condition**: No checkpoints (condition 1), side-effecting steps without recovery (condition 4), no recovery trigger (condition 5)
- **Risk**: Crash between contract creation and offer email leaves ambiguous state. Compensation may need manual trigger.
- **Status**: [x] **RESOLVED**

#### E12: Audit Export — Missing Checkpoint/Recovery Documentation
- **Severity**: ERROR | **Confidence**: medium
- **Description**: ADD §9.5.1 documents the audit export process with idempotent keying but no explicit checkpoint map (request → generation → upload → status), crash recovery behavior, or auto-recovery trigger.
- **Source**: ADD §9.5.1
- **Failure condition**: No checkpoints (condition 1), recovery_trigger missing (condition 5)
- **Risk**: Partial export generation leaves ambiguous state requiring manual triage.
- **Status**: [x] **RESOLVED**

#### W8: Inngest Durability Guarantees Not Documented
- **Severity**: WARN | **Confidence**: high
- **Description**: Platform relies entirely on Inngest for durable execution but does not document Inngest's own RPO, data replication, or consistency model.
- **Source**: ADD §3
- **Status**: Accepted (Inngest is a managed service; their SLA is the guarantee. Reference to Inngest docs should be added.)

#### W9: Data Deletion No Checkpoint Strategy
- **Severity**: WARN | **Confidence**: medium
- **Description**: Data deletion cascades across 7 storage locations without documented checkpoints.
- **Source**: ADD §9.4.2
- **Status**: Accepted (Phase 1 risk; deletion should be Inngest workflow with per-storage steps)

#### W10: Retention Enforcement No Recovery Trigger
- **Severity**: WARN | **Confidence**: medium
- **Description**: Retention enforcement is idempotent but has no mechanism for detecting failed runs.
- **Source**: ADD §9.4.1
- **Status**: Accepted (idempotent design minimizes risk; monitoring should catch missed runs)

#### W11: PostgreSQL Projection Divergence
- **Severity**: WARN | **Confidence**: medium
- **Description**: ADD §3.5 says "Inngest state wins" on divergence but no detection or reconciliation mechanism.
- **Source**: ADD §3.5
- **Status**: Accepted (Phase 1 monolith reduces divergence risk; reconciliation deferred)

### Concern 4: Failure Mode Coverage (3E / 6W)

#### E13: HITL Gateway — No Runbook Entry (Critical)
- **Severity**: ERROR | **Confidence**: high
- **Description**: HITL Gateway is Critical per ADD §2.3.2. Failure blocks all approval-gated workflows including trade execution and hiring. No runbook playbook exists.
- **Source**: Runbook §8 (all playbooks searched)
- **Failure condition**: Critical-path failure mode without runbook (condition 1)
- **Risk**: No operational procedure for HITL failures; approval workflows stall without guidance.
- **Status**: [x] **RESOLVED**

#### E14: Audit Service Blocking — No Runbook Entry (Critical)
- **Severity**: ERROR | **Confidence**: high
- **Description**: Audit Service is Critical. ADD itself documents a gap: "No timeout or async decoupling on audit writes." No runbook playbook for audit degradation.
- **Source**: ADD §2.3.2 Audit Service, Runbook §8
- **Failure condition**: Critical-path failure mode without runbook (condition 1)
- **Risk**: Slow audit writes block HITL decisions, file access, and workflow events with no operational response.
- **Status**: [x] **RESOLVED**

#### E15: Database Connection Pool Exhaustion — No Runbook Entry (Critical)
- **Severity**: ERROR | **Confidence**: high
- **Description**: Runbook §5.2 has an alert for >80% connections but no corresponding playbook. Connection pool exhaustion is a common PostgreSQL failure mode affecting all components.
- **Source**: Runbook §5.2 (alert), Runbook §8 (no playbook)
- **Failure condition**: Critical-path failure mode without runbook (condition 1)
- **Risk**: Pool exhaustion = total platform outage. Engineers have the alert but no procedure.
- **Status**: [x] **RESOLVED**

#### W12: MCP Circuit Breaker Sustained Open — No Runbook Entry
- **Severity**: WARN | **Confidence**: high
- **Description**: ADD §5.2 documents CB behavior but no runbook for persistent open state.
- **Source**: Runbook §8
- **Status**: Accepted (Standard criticality; generic incident process covers it)

#### W13: LLM Provider Failure / Budget Exhaustion — No Runbook Entry
- **Severity**: WARN | **Confidence**: high
- **Description**: No runbook for LLM provider down, budget exhaustion, or all providers unavailable.
- **Source**: Runbook §8
- **Status**: Accepted (Standard criticality; auto-fallback provides resilience)

#### W14: File Storage / ClamAV — No Runbook Entry
- **Severity**: WARN | **Confidence**: medium
- **Description**: No runbook for S3 unavailability or ClamAV failure accumulating scan_pending files.
- **Source**: Runbook §8
- **Status**: Accepted (Standard criticality)

#### W15: BullMQ Job Queue Stall — No Runbook Entry
- **Severity**: WARN | **Confidence**: high
- **Description**: BullMQ worker stall or stuck jobs have no runbook entry.
- **Source**: Runbook §8
- **Status**: Accepted (inherits Redis runbook partially)

#### W16: HITL TTL Cascade During Novu Outage
- **Severity**: WARN | **Confidence**: medium
- **Description**: Novu outage + HITL TTL expiry can cause burst of timeout-path processing.
- **Source**: ADD §2.3.2 Notification Bus
- **Status**: Accepted (TTL design provides bounded degradation)

#### W17: Runbook Playbooks Lack Failure-Specific Escalation Contacts
- **Severity**: WARN | **Confidence**: high
- **Description**: All playbooks use generic on-call escalation (Runbook §8.2) without failure-specific vendor contacts (Inngest support, Supabase support, etc.).
- **Source**: Runbook §8.4-8.8
- **Status**: Accepted (generic escalation path exists; vendor-specific contacts should be added)

---

## ERROR Resolution Tracker

| ID | Finding | Concern | Status |
|----|---------|---------|--------|
| E1 | LLM Gateway missing CB + vague timeout/retry | resilience-triad | [x] **RESOLVED** — Added ADD §2.3.3 Resilience Triad Reference |
| E2 | Inngest Cloud missing triad | resilience-triad | [x] **RESOLVED** — Added ADD §2.3.3 |
| E3 | Novu Cloud missing triad | resilience-triad | [x] **RESOLVED** — Added ADD §2.3.3 |
| E4 | Supabase Auth incomplete triad | resilience-triad | [x] **RESOLVED** — Added ADD §2.3.3 |
| E5 | PostgreSQL missing triad | resilience-triad | [x] **RESOLVED** — Added ADD §2.3.3 |
| E6 | Redis missing triad | resilience-triad | [x] **RESOLVED** — Added ADD §2.3.3 |
| E7 | File Storage/ClamAV incomplete triad | resilience-triad | [x] **RESOLVED** — Added ADD §2.3.3 |
| E8 | Entity cache missing stale-read behavior | cache-consistency | [x] **RESOLVED** — Added common-patterns.md §6.4 |
| E9 | MCP response cache missing stale-read + key strategy | cache-consistency | [x] **RESOLVED** — Added ADD §5.6 stale-read table + key strategy |
| E10 | Permission cache missing freshness SLO | cache-consistency | [x] **RESOLVED** — Added common-patterns.md §6.4 security note |
| E11 | Saga pattern incomplete checkpoints | durable-persistence | [x] **RESOLVED** — Added common-patterns.md §8.3 |
| E12 | Audit export missing checkpoints | durable-persistence | [x] **RESOLVED** — Added ADD §9.5.1 checkpoint table |
| E13 | HITL Gateway no runbook | failure-mode-coverage | [x] **RESOLVED** — Added Runbook §8.9 Playbook 6 |
| E14 | Audit Service no runbook | failure-mode-coverage | [x] **RESOLVED** — Added Runbook §8.10 Playbook 7 |
| E15 | DB Connection Pool no runbook | failure-mode-coverage | [x] **RESOLVED** — Added Runbook §8.11 Playbook 8 |

---

## Sign-off

| Model | Verdict | Date |
|-------|---------|------|
| Gemini | **PASS** (15/15 verified) | 2026-03-01 |
| Codex | **PASS** (15/15 verified) | 2026-03-01 |
| Claude | **PASS** (lead expert, authored fixes) | 2026-03-01 |
