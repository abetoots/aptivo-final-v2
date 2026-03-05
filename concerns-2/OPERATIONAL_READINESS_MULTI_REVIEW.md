# Session 6: Operational Readiness — Multi-Model Review

**Date**: 2026-03-03
**Concerns**: regional-failure-containment (ERROR), dependency-runbook (WARN), rollback-documentation (WARN), container-orchestration-readiness (WARN)
**Models**: Gemini (PAL Clink), Codex MCP, Claude Lead Expert
**Documents Reviewed**: BRD, FRD, ADD, Runbook, Common Patterns TSD, Configuration TSD

---

## Executive Summary

Session 6 evaluates operational readiness: whether failure containment, dependency runbooks, rollback procedures, and container orchestration are documented to the level needed for safe production operations. **Consensus: 2 ERRORs, 20 WARNINGs.** The ERRORs relate to Phase 2+ multi-region DR claims that have zero operational documentation — per the concern schema, undocumented multi-region claims are blocking gaps. The 20 WARNINGs expose a systemic pattern: the ADD's architectural documentation is thorough but the Runbook's operational bridge is incomplete — missing vendor contacts, vague rollback procedures, undocumented graceful shutdown, and health check configuration that only uses liveness probes.

---

## Model Comparison

| Model | ERRORs | WARNINGs | NOTEs | Unique Findings |
|-------|--------|----------|-------|-----------------|
| **Gemini** | 0 | 5 | 0 | — (undercounting continues) |
| **Codex** | 2 | 9 | 4 | Health probe readiness/startup gap |
| **Claude** | 2 | 23 | 0 | Secret rotation rollback, Inngest rollback interaction, ClamAV health check, dependency fallback testing |

**Pattern**: Gemini undercounting (0E vs 2E from both Codex and Claude). Claude and Codex align on ERRORs. Claude most thorough across all concerns, particularly on rollback edge cases (Inngest in-flight workflows, multi-component ordering, secret rotation).

---

## Debated Items

### Debate 1: Phase 2+ Multi-Region DR Claims — ERROR or WARN?

**Codex + Claude**: ERROR — Phase 2+ multi-region DR is documented (ADD §2.3.2, Runbook §8.6) but has zero operational detail: no failover trigger conditions, no data consistency mode, no failback procedure.

**Gemini**: Only found failback gap (WARN). Did not flag the broader zero-operational-documentation issue.

**Schema check**: Failure condition #3: "All three documented fields are FALSE — the multi-region claim is completely undocumented operationally" = ERROR. Failure condition #1: "failover_trigger_documented is FALSE" = ERROR.

**Verification**: RUNBOOK §8.6 Phase 2+ section has only a prerequisites checklist ("not yet met"). ADD §2.3.2 mentions "Phase 2+: multi-region DR with DNS failover" as fallback behavior. Both make multi-region claims. Neither documents operational procedures.

**Verdict**: **ACCEPTED as ERROR**. The concern schema specifically targets "aspirational architecture rather than operational reality." The Phase 2+ sections match this pattern. Fix: add Phase 2+ DR design parameters to the ADD clarifying these are design requirements, not operational procedures.

---

## Consensus Findings

### Concern 1: Regional Failure Containment (2E, 3W)

| ID | Finding | Severity | Confidence | Models |
|----|---------|----------|------------|--------|
| E1 | **Phase 2+ multi-region DR has no operational contract**: ADD §2.3.2 and Runbook §8.6 claim multi-region DR with DNS failover but document no failover trigger conditions, no data consistency mode (sync/async/eventual), and no failback procedure. The Runbook Phase 2+ section is exclusively a prerequisites checklist. | ERROR | high | Codex, Claude |
| E2 | **Phase 2+ PostgreSQL HA failover has no operational contract**: ADD §2.3.2 states "Phase 2+: Automatic failover to standby via connection pooler" but documents no trigger conditions (health check failures? manual? automatic?), no replication mode/RPO during failover, and no failback. Critical for financial transaction data (aptivo_trading schema). | ERROR | high | Codex, Claude |
| W1 | **Phase 1 DR missing failback procedure**: Runbook §8.6 Phase 1 documents restore-to-alternate-region but no procedure for returning to original region (data reconciliation, DNS cutover back). | WARN | high | All 3 |
| W2 | **Phase 1 DR missing decision criteria**: Runbook §8.6 says "if transient — wait; if extended — restore" but no threshold for when transient becomes extended (30 min? 1 hour? 2 hours?). | WARN | high | Claude |
| W3 | **Regional isolation boundaries incomplete**: ADD §2.3.2 documents "Total platform outage" on regional failure but doesn't map which SaaS dependencies (Inngest, Novu, Supabase) continue operating during a DO regional outage. | WARN | medium | Claude |

### Concern 2: Dependency Runbook Coverage (0E, 5W)

| ID | Finding | Severity | Confidence | Models |
|----|---------|----------|------------|--------|
| W4 | **LLM providers lack runbook playbook**: ADD §7.1-7.2 documents fallback patterns but Runbook has no LLM Provider Outage entry (detection, impact, recovery, contacts). | WARN | high | Claude, Codex |
| W5 | **File Storage lacks runbook playbook**: ADD §2.3.2 documents failure domain but no Runbook playbook for S3/Spaces outage. | WARN | high | Claude, Codex |
| W6 | **ClamAV lacks runbook entry**: ADD §2.3.3 documents circuit breaker but no Runbook entry for ClamAV failure (scan backlog drain, container restart). | WARN | high | Claude |
| W7 | **Vendor contact directory missing**: Zero vendor contact info (support URLs, account IDs, escalation criteria, SLA references) for any dependency — DO, Novu, Supabase, LLM providers. | WARN | high | All 3 |
| W8 | **Dependency fallback strategies untested**: ADD documents fallback patterns for all dependencies but no testing/validation referenced. Quarterly chaos engineering mentioned (Runbook §7.4) but not linked to specific dependency fallbacks. | WARN | medium | Claude |

### Concern 3: Rollback Documentation (0E, 7W)

| ID | Finding | Severity | Confidence | Models |
|----|---------|----------|------------|--------|
| W9 | **Application rollback procedure vague**: Runbook §8.4 says "Trigger rollback via GitHub Actions" but doesn't specify workflow name, how to identify previous stable version, or manual fallback if GH Actions unavailable. | WARN | high | Claude, Codex |
| W10 | **Database migration rollback underspecified**: Runbook §2.1 claims "forward-only with rollback scripts" but no script location, naming convention, execution command, or CI validation documented. | WARN | high | All 3 |
| W11 | **Feature flag rollback contradicts Phase 1 reality**: Runbook §2.4 documents `aptivo-cli feature disable` which doesn't exist in Phase 1. Actual procedure is env var change + container restart (minutes, not "Immediate"). | WARN | high | Claude |
| W12 | **Secret rotation has no rollback procedure**: Runbook §4.3 documents rotation schedules but no procedure for reverting a failed rotation. | WARN | high | Claude |
| W13 | **Infrastructure changes have no rollback procedure**: Runbook §9.1-9.3 documents app spec changes via GitOps but no rollback procedure (revert .do/app.yaml, doctl update). | WARN | high | Claude, Codex |
| W14 | **Inngest workflow rollback interaction undocumented**: What happens to in-flight workflows when application code is rolled back? Memoized steps may execute with old definitions. | WARN | medium | Claude |
| W15 | **Multi-component rollback ordering not documented**: No guidance on service-first vs migration-first rollback when both changed in a deployment. | WARN | high | Claude |

### Concern 4: Container Orchestration Readiness (0E, 5W)

| ID | Finding | Severity | Confidence | Models |
|----|---------|----------|------------|--------|
| W16 | **Resource limits use provider slugs**: Runbook §3.3 specifies `basic-xxs` without documenting actual CPU/memory (currently ~0.25 vCPU, 256MB). Cannot reason about Node.js heap requirements. | WARN | high | All 3 |
| W17 | **Health check only configures liveness**: App.yaml configures only `/health/live`. Three endpoints exist (live, ready, startup) but readiness/startup not in app spec. Traffic may route to containers that haven't established DB/Redis connections. | WARN | high | Claude, Codex |
| W18 | **Graceful shutdown not documented**: No SIGTERM handling, drain period, or in-flight request behavior documented for production containers. Only a one-liner in Observability guide for OTel SDK shutdown. | WARN | high | All 3 |
| W19 | **Workflow worker health check undocumented**: docker-compose defines workflow-worker container but production deployment (separate or same container?) unclear. No worker-specific health check. | WARN | medium | Claude |
| W20 | **ClamAV health check not configured**: Memory limit documented (2560m) but no health check endpoint configured for the container. Circuit breaker is application-level only. | WARN | high | Claude |

---

## Summary

| Concern | ERRORs | WARNINGs | NOTEs |
|---------|--------|----------|-------|
| regional-failure-containment | 2 | 3 | 0 |
| dependency-runbook | 0 | 5 | 0 |
| rollback-documentation | 0 | 7 | 0 |
| container-orchestration-readiness | 0 | 5 | 0 |
| **Total** | **2** | **20** | **0** |

---

## Cross-Cutting Themes

1. **Aspirational vs. Operational**: Phase 2+ capabilities (multi-region DR, HA databases, runtime feature flags, aptivo-cli) documented as if partially ready but lacking operational substance. Creates false confidence.
2. **Vendor Contact Void**: Zero vendor contact info for any external dependency. During incidents, engineers must search externally for support portals.
3. **Graceful Shutdown Gap**: No platform documentation covers SIGTERM handling or drain periods, affecting deployment, scaling, and rollback safety.
4. **Rollback Specificity Gap**: Rollback strategies exist at strategy-table level but lack command-level specificity needed for incident response under pressure.

---

## ERROR Resolutions

### E1: Phase 2+ Multi-Region DR — RESOLVED

**Fix applied** to Runbook §8.6:
1. Added **Phase 1 Failback Procedure** — 8-step sequence for returning to primary region after DR (confirm recovery, provision infra, migrate data, verify integrity, DNS cutover, smoke test, decommission, post-review)
2. Added **Decision Criteria table** — when to wait for DO recovery vs. begin DR procedure (ETA-based thresholds)
3. Renamed Phase 2+ section to **"Design Target (NOT YET OPERATIONAL)"** with 5 design parameters that must be documented before Phase 2 go-live (failover trigger, data consistency mode, failback procedure, regional isolation mapping, quarterly DR test)

### E2: Phase 2+ PostgreSQL HA Failover — RESOLVED

**Fix applied** to ADD §2.3.2 (PostgreSQL):
Added **"Phase 2+ PostgreSQL HA — Design Target (NOT YET OPERATIONAL)"** block with 4 design parameters: failover trigger (automatic promotion, health check interval/threshold), replication mode (async streaming, per-schema RPO impact), failback procedure (old primary becomes standby, verification steps), connection pool behavior (per-schema isolation, failover handling).

---

## Sign-Off

| Model | Verdict | Notes |
|-------|---------|-------|
| **Gemini** | PASS | Both E1 and E2 verified — failback procedures, decision criteria, and design target parameters resolve the gaps |
| **Codex** | PASS | Both E1 and E2 verified — current-state vs target-state clarified, required contract fields defined |
| **Claude (Lead Expert)** | PASS | 2 ERRORs resolved, 20 WARNINGs documented (advisory) |

**Final Verdict**: **PASS — 2 ERRORs resolved, 20 WARNINGs (advisory)**
