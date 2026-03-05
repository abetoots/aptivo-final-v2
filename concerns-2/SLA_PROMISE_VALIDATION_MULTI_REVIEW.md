# Session 5: SLA & Promise Validation — Multi-Model Review

**Date**: 2026-03-01
**Concerns**: sla-architecture-alignment (ERROR), scalability-claim-validation (WARN), alerting-slo-alignment (WARN)
**Models**: Gemini (PAL Clink), Codex MCP, Claude Lead Expert
**Documents Reviewed**: BRD, FRD, ADD, Runbook, TSD, API Spec, Coding Guidelines

---

## Executive Summary

Session 5 evaluates whether documented SLA promises (availability, latency, throughput, RTO/RPO) are architecturally supportable, whether scalability claims have evidence, and whether every SLO has a corresponding alert. **Consensus: 0 ERRORs, 18 WARNINGs, 1 NOTE.** No blocking gaps exist — the platform's Phase 1 scope is realistically constrained and the documentation generally acknowledges limitations. The WARNINGs represent areas where implicit promises exceed documented capabilities or observability gaps could delay incident response.

---

## Model Comparison

| Model | ERRORs | WARNINGs | NOTEs | Unique Findings |
|-------|--------|----------|-------|-----------------|
| **Gemini** | 0 | 6 | 1 | Burst wakeup capacity concern |
| **Codex** | 0 | 8 | 0 | Health check / RTO misalignment |
| **Claude** | 2 (downgraded) | 18 | 1 | Feature flag contradiction, PostgreSQL SPOF, Novu fallback contradiction |

**Pattern**: Gemini continues to undercount (consistent with Sessions 1-4). Claude's thoroughness identified 2 real contradictions, both downgraded to WARN after lead expert review because they are explicitly acknowledged in the documentation.

---

## Debated Items

### Debate 1: Feature Flag Rollout Contradiction (sla-gap-6)

**Claude's claim**: ERROR — Runbook §2.4 describes percentage-based rollout (1%/10%/50%/100% of traffic) but ADD §3.5 says feature flags are "compile-time constants with env var escape hatches." Architecture cannot deliver the documented rollout procedure.

**Verification**: CONFIRMED contradiction. Runbook §2.4 has a rollout phases table with "1% of traffic", "10% of traffic" etc. ADD §3.5 explicitly states: "Feature flags are compile-time constants with env var escape hatches... A dedicated feature flag service (LaunchDarkly, Unleash, etc.) is a Phase 2+ consideration if runtime percentage rollouts are needed without redeployment."

**Verdict**: **DOWNGRADED to WARN**. Rationale:
1. ADD §3.5 explicitly acknowledges the limitation — this is not an undiscovered gap
2. Runbook §2.1 also notes "DO App Platform does not support native percentage-based canary traffic splitting"
3. The rollout procedure is operational safety, not a customer-facing SLA
4. The contradiction is between two internal documents, both of which acknowledge the Phase 1 constraint
5. **Action needed**: Runbook §2.4 should clarify that percentage-based rollout requires Phase 2+ feature flag service; Phase 1 rollout is binary (flag on/off via env var)

### Debate 2: PostgreSQL SPOF vs Implicit Availability (sla-gap-7)

**Claude's claim**: ERROR — BRD promises >99% workflow/MCP success rate, but PostgreSQL is documented SPOF causing "Total platform outage." Architecture structurally cannot deliver >99% availability with a single unredundant database.

**Verification**: CONFIRMED. BRD §5 metrics: "Workflow execution success rate >99%", "MCP request success rate >99%". ADD §2.3.2 PostgreSQL: "Total platform outage" on failure. ADD: "Accepted Risk (Phase 1): PostgreSQL is a single point of failure."

**Verdict**: **DOWNGRADED to WARN**. Rationale:
1. ADD explicitly marks PostgreSQL SPOF as "Accepted Risk (Phase 1)" with documented mitigation path
2. >99% success rate ≠ >99% uptime — success rate measures completed operations, not availability
3. >99% allows 3.65 days/year downtime; with RTO <4h, a single incident is within budget
4. BRD metrics are internal SLOs, not contractual SLAs (no customer-facing availability commitment)
5. Phase 2 upgrade path documented: "HA-tier managed database with standby failover"

---

## Consensus Findings

### Concern 1: SLA-Architecture Alignment (0E, 7W, 1N)

| ID | Finding | Severity | Confidence | Models |
|----|---------|----------|------------|--------|
| W1 | **HITL latency ambiguity**: BRD says "<10s P95" for HITL response latency; FRD says "<10s delivery"; ADD describes multi-hop path (Inngest → webhook → Novu → email). Unclear what's measured — delivery to notification channel or end-to-end including email? | WARN | high | All 3 |
| W2 | **Audit integrity gap**: BRD promises "100% audit log integrity, zero tampering incidents." Phase 1 uses SQL-only (no hash-chain, no append-only enforcement, no tamper detection). ADD §9.3 defers hash-chaining to Phase 3+. SQL DELETE/UPDATE are possible with DB credentials. | WARN | high | Claude, Codex |
| W3 | **DR RTO untested**: RTO <4h documented (Runbook §8.6) but no test procedure or evidence of validation. Restoration from backup has never been tested. | WARN | medium | Claude, Gemini |
| W4 | **Feature flag rollout contradiction**: Runbook §2.4 describes percentage-based rollout impossible with Phase 1 compile-time flags. See Debate 1. | WARN | high | Claude |
| W5 | **PostgreSQL SPOF vs implicit availability**: >99% success rate with SPOF database. See Debate 2. | WARN | high | Claude, Codex |
| W6 | **Inngest dependency for workflow SLA**: Workflow execution success rate (>99%) depends entirely on Inngest Cloud availability. No fallback if Inngest is down. Free tier limits undocumented. | WARN | high | All 3 |
| W7 | **Novu single path**: Phase 1 notification delivery has no fallback provider. HITL approval delivery depends on Novu → email; if Novu fails, approvals are delayed until TTL timeout. ADD §6.5 mentions "email-only fallback" but this still routes through Novu. | WARN | medium | Claude |
| N1 | **P95 latency budget**: No end-to-end latency budget for multi-hop paths (API → Inngest → MCP → LLM → response). Individual component timeouts exist but no aggregated P95 target. | NOTE | medium | Claude |

### Concern 2: Scalability Claim Validation (0E, 5W)

| ID | Finding | Severity | Confidence | Models |
|----|---------|----------|------------|--------|
| W8 | **10K concurrent sleeping workflows unvalidated**: FRD §10 claims "10,000+ concurrent sleeping workflows." This depends on Inngest Cloud capacity (free tier limits unknown). No load test plan or capacity model documented. | WARN | high | All 3 |
| W9 | **DB connection pool bottleneck**: PostgreSQL max 20 connections (Phase 1). With auto-scaling 1-3 containers, concurrent user capacity is bounded. No documented connection-per-container calculation. | WARN | high | Claude, Codex |
| W10 | **Redis OOM risk**: Single Redis node with `allkeys-lru` serving multiple consumers (idempotency, rate limiting, dedup, sessions, BullMQ). No documented memory budget per consumer. Eviction under pressure could affect idempotency keys. | WARN | medium | Claude, Codex |
| W11 | **Auto-scaling triggers unspecified**: "1-3 containers" documented but scaling triggers (CPU%, memory%, request count?) and cooldown periods not specified. | WARN | medium | Gemini, Codex |
| W12 | **Inngest throughput unknown**: No documented rate limits or throughput ceiling for Inngest function invocations. Free tier may throttle under load. | WARN | medium | Claude, Gemini |

### Concern 3: Alerting-SLO Alignment (0E, 6W)

| ID | Finding | Severity | Confidence | Models |
|----|---------|----------|------------|--------|
| W13 | **Workflow success rate SLO has no alert**: BRD >99% success rate but Runbook §5.2 has no workflow-specific success rate alert. HTTP 5xx is a partial proxy but doesn't capture Inngest-internal failures. | WARN | high | All 3 |
| W14 | **HITL delivery latency SLO has no specific alert**: BRD <10s P95 delivery latency but no HITL-specific latency alert. HTTP P95 covers generic API latency, not HITL delivery chain. | WARN | high | All 3 |
| W15 | **MCP success rate SLO has no alert**: BRD >99% MCP success rate but no MCP-specific success metric or alert in Runbook §5.2. | WARN | high | Claude, Codex |
| W16 | **Audit integrity SLO has no alert**: BRD 100% audit integrity but no alert for integrity violations, missing audit entries, or tamper detection. | WARN | high | Claude |
| W17 | **No burn-rate alerting**: No error budget burn-rate alerts for any SLO. Slow degradation could exhaust error budgets without triggering threshold-based alerts. | WARN | high | All 3 |
| W18 | **No SLO-alert cross-reference**: No document maps SLOs to their corresponding alerts. Runbook §5.2 alerts are infrastructure-focused (CPU, memory, HTTP 5xx) rather than SLO-focused. | WARN | high | All 3 |

---

## Summary

| Concern | ERRORs | WARNINGs | NOTEs |
|---------|--------|----------|-------|
| sla-architecture-alignment | 0 | 7 | 1 |
| scalability-claim-validation | 0 | 5 | 0 |
| alerting-slo-alignment | 0 | 6 | 0 |
| **Total** | **0** | **18** | **1** |

---

## Actionable Recommendations (WARNINGs — Advisory)

1. **Clarify HITL latency measurement** (W1): Define what "HITL response latency <10s P95" measures — notification channel delivery, email inbox delivery, or API response? Add measurement point to BRD §5.
2. **Document Phase 1 audit integrity scope** (W2): Add note to BRD §5 that "100% integrity" in Phase 1 means "all operations produce audit records" (completeness), not "tamper-proof" (which requires Phase 3+ hash-chaining).
3. **Add DR test procedure** (W3): Add Runbook section for annual/quarterly backup restoration test with success criteria.
4. **Fix Runbook §2.4 rollout table** (W4): Clarify that percentage-based rollout phases require Phase 2+ feature flag service; Phase 1 uses binary on/off via env var.
5. **Document Inngest free tier limits** (W6, W8, W12): Research and document Inngest free tier limits (concurrent functions, invocations/month, sleep limits) with escalation triggers.
6. **Add SLO-specific alerts** (W13-W16): Add workflow success rate, HITL delivery latency, MCP success rate, and audit completeness alerts to Runbook §5.2.
7. **Add burn-rate alerting plan** (W17): Document plan for error budget burn-rate alerts, even if implementation is Phase 2+.
8. **Create SLO-alert cross-reference** (W18): Add table in Runbook mapping each BRD/FRD SLO to its corresponding alert, threshold, and escalation.

---

## Sign-Off

| Model | Verdict | Notes |
|-------|---------|-------|
| **Gemini** | PASS | 0 ERRORs found independently |
| **Codex** | PASS | 0 ERRORs found independently |
| **Claude (Lead Expert)** | PASS | 2 proposed ERRORs downgraded to WARN after verification — both contradictions are explicitly acknowledged in documentation |

**Final Verdict**: **PASS — 0 ERRORs, 18 WARNINGs (advisory), 1 NOTE**
