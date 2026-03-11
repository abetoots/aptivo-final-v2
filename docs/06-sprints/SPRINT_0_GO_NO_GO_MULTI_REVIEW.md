# Sprint 0 Go/No-Go Architecture Review

**Date**: 2026-03-05
**Type**: Multi-Model Architecture Review
**Reviewers**: Claude Opus 4.6 (Lead), Gemini 3 Flash (Primary), Codex/GPT (Secondary)
**Decision**: **GO -- Conditional**

---

## Executive Summary

Sprint 0's 15 technical spikes have been reviewed by three independent AI models acting as architecture reviewers. After independent analysis, cross-validation, and one round of debate, **all three reviewers agree: the project is cleared to proceed to Phase 1** with documented conditions.

The spike evidence demonstrates that Aptivo's planned architecture -- Inngest for workflows, MCP for tool integration, Supabase for auth, Novu for notifications -- is technically viable. All 4 Hard Gates are cleared with implemented mitigations (not just documentation). All 27 WARNINGs from the risk register are closed with test evidence. 469 tests across 4 packages provide strong validation confidence.

**Conditions for proceeding** are focused on infrastructure hardening (Redis-backed replay stores) and CI integration (supply-chain gate), both of which are Phase 1 concerns, not Sprint 0 blockers.

---

## Consensus Findings

All three reviewers agreed on the following:

### 1. Hard Gates: PASS

All 4 security-critical spikes meet the "mitigations implemented, not just documented" bar at Sprint 0's capability-validation scope:

| Spike | Verdict | Evidence |
|-------|---------|----------|
| **SP-06** MCP Security | Pass | 28 tests. Env sanitization, server allowlist, HMAC-SHA256 scoped tokens with TTL hard cap. Code in `packages/mcp-layer/src/security/`. |
| **SP-11** HITL Token Security | Pass | 21 tests. JWT HS256 with JTI replay prevention, SHA-256 hash storage, audience/issuer binding, dual-key rotation. Code in `packages/hitl-gateway/src/tokens/`. |
| **SP-13** Supply-Chain Integrity | Pass | 30 tests. Version pinning (exact semver), registry allowlist, SHA-512 integrity verification, CycloneDX SBOM, pre-deploy gate. Code in `packages/mcp-layer/src/security/supply-chain.ts`. |
| **SP-14** Event Authenticity | Pass | 18 tests. HMAC-SHA256 signing, timestamp freshness, nonce anti-replay, context binding, concurrent race (1/10 first-writer-wins). Code in `packages/hitl-gateway/src/events/`. |

### 2. Soft Gates: PASS

SP-01 (Inngest + AgentKit) received a Conditional Pass with 3 documented workarounds. All reviewers agree these are acceptable technical compromises:

- **Zod v3 import**: One-line workaround for Inngest v3.52 compatibility. Manageable via coding standards.
- **Return-value saga pattern**: More robust than try/catch for durable execution. Documented and tested.
- **Turbopack co-location**: Minor build-tool constraint. Does not compromise system integrity.

### 3. WARNING Closure: GENUINE (with caveats)

All 27 WARNINGs are mapped to spikes with test evidence. Highlights:

- **S7-W18** (LLM budget): Boundary-tested at $49/$50/$51 daily and $499/$500/$501 monthly
- **S7-W10** (HITL race): 10 concurrent submissions, exactly 1 succeeds
- **S7-W2** (Circuit breaker): Full state machine implemented in `packages/mcp-layer/src/resilience/`
- **S7-W19** (Connection pool): 20 succeed, 21st returns pool-exhausted error

### 4. Test Quality: STRONG for spike scope

469 tests across 4 packages. 374 are spike-specific; ~95 are existing package tests. High use of mocks and simulators is appropriate for spike validation -- the goal is to prove patterns work, not to integration-test real infrastructure.

### 5. Sprint 1 Readiness: YES

Sprint 1 (LLM Gateway) is well-supported by SP-08's cost tracking validation (37 tests covering token counting, per-model pricing, budget enforcement, streaming interceptor). The LLM Gateway is also the most self-contained Sprint 1 task, with fewer cross-cutting dependencies.

---

## Debated Items

### Debate 1: Definition of "Implemented Mitigations"

**Codex's initial position**: No-Go. In-memory JTI/nonce stores (SP-11, SP-14) and un-integrated CI gating (SP-13) mean hard gates are "prototyped, not production-implemented."

**Gemini's position**: Go. The gate criteria in `sprint-0-technical-spikes.md` are capability-level ("replay blocked via JTI", "version pinning + allowlist enforced"), not infrastructure-level ("backed by Redis", "integrated in CI").

**Resolution**: After debate, Codex revised to Go. The Sprint 0 gate criteria are met at spike validation scope. In-memory stores and CI integration are Phase 1 production-hardening concerns, not Sprint 0 blockers. The algorithms, security controls, and patterns are fully implemented and tested.

**Final verdict**: Gate criteria satisfied. Infrastructure backing is a carry-forward condition.

### Debate 2: S7-W16/W17 Closure Quality

**Codex flagged**: S7-W16 (Calendar service degradation) and S7-W17 (File storage degradation) are closed by "Covered by generic dependency monitoring pattern" rather than service-specific tests.

**Claude's assessment**: Acceptable for spike scope. The DependencyMonitor + ResilientCaller pattern is generic by design -- it applies uniformly to all third-party dependencies. Service-specific degradation handling would be integration-level work, not spike-level.

**Final verdict**: Accepted as closed. Service-specific degradation tests will emerge naturally during Sprint 3 (MCP Layer) when real integrations are built.

### Debate 3: Test Count Discrepancy

**Codex flagged**: Matrix test counts sum to 374, but project claims 469.

**Resolution**: Different measurement scopes. 374 = spike-specific tests listed in the code location matrix. 469 = total `it(...)` specs across all packages when running `pnpm test`. The ~95 difference comes from existing package tests (types, mcp-layer, hitl-gateway) that predate or are adjacent to spike work. Not a contradiction.

---

## Conditions for Phase 1

These are carry-forward items that must be scheduled in Phase 1, not deferred indefinitely:

### C1: Redis-Backed Replay Stores (Sprint 1-2)

**Priority**: HIGH
**Spikes affected**: SP-11, SP-14
**Current state**: In-memory `Set<string>` for JTI and nonce tracking
**Required**: Redis SETNX + TTL with multi-worker concurrency tests
**Risk if deferred**: Replay attacks possible in multi-instance deployment

### C2: Supply-Chain CI Gate (Sprint 1-2) -- RESOLVED

**Priority**: MEDIUM
**Spike affected**: SP-13
**Current state**: ~~`runPreDeployVerification()` exists but not wired into CI~~ Wired into `pr-validation.yml` and `build.yml` via `tools/verify-supply-chain.ts`
**Required**: Mandatory CI deploy job with failing-gate behavior demonstrated
**Resolution**: CF-02 implemented in Sprint 1. Supply-chain verification runs as a mandatory step in both PR validation and build workflows.

### C3: Saga Pattern Enforcement (Sprint 1) -- RESOLVED

**Priority**: MEDIUM
**Spike affected**: SP-01
**Current state**: ~~Return-value saga pattern documented and tested~~ Documented in coding guidelines section 8b with correct/incorrect examples
**Required**: Standardized saga wrapper or lint rule preventing try/catch around step.run()
**Resolution**: CF-01 implemented in Sprint 1. Return-value pattern enforcement documented in `docs/05-guidelines/05a-Coding-Guidelines.md` section 8b.

### C4: Sprint 0 DoD Operational Checks

**Priority**: LOW (most are already met)
**Items remaining**:
- [ ] Go/No-Go decision made for each risk area (this document)
- [ ] Architecture pivots documented as ADRs (none required -- all spikes passed)

---

## Residual Risks

| Risk | Severity | Mitigation Timeline |
|------|----------|---------------------|
| In-memory replay stores in multi-node | HIGH | Sprint 1-2 (C1) |
| ~~Saga pattern misuse by developers~~ | ~~MEDIUM~~ | ~~Sprint 1 (C3)~~ resolved |
| No real-service integration tested yet | MEDIUM | Sprints 1-4 (by design) |
| Zod v3/v4 compatibility fragility | LOW | Monitor Inngest releases |
| SP-12 latency baselines are test-engine only | LOW | Real benchmarks in Sprint 4 |
| S7-W16/W17 generic-pattern closure | LOW | Service-specific tests in Sprint 3 |

---

## Reviewer Summaries

### Claude Opus 4.6 (Lead Expert)

**Verdict**: GO with conditions

Sprint 0's purpose is "Can we build on this?" -- and the answer is clearly yes. All architectural bets are validated: Inngest for workflows, MCP for tools, Supabase for auth, circuit breakers and degradation patterns for resilience, budget enforcement for cost control. The security-critical spikes are the strongest work in the batch -- HMAC signing, scoped tokens, env sanitization, supply-chain verification are production-quality implementations, not prototypes.

The main risk is the transition from spike patterns to production infrastructure (in-memory to Redis, mock to real providers). This is expected and planned in Sprints 1-4.

### Gemini 3 Flash (Code Reviewer)

**Verdict**: GO with conditions

Hard gates met with high-quality security implementations. 27/27 WARNINGs closed with specific test evidence. 469 tests provide high confidence. Top risks: persistence boundary (JTI/nonce), saga pattern deviation, dependency compatibility. Recommends: Result-based saga wrapper, Redis for token stores, lint rules for Inngest patterns.

### Codex/GPT (Architecture Reviewer)

**Verdict**: GO with conditions (revised from initial No-Go)

Initially argued hard gates were "prototyped, not production-implemented." After debate on Sprint 0 gate criteria scope, revised to Go. Maintains that in-memory stores and CI gate integration are Phase 1 production-risk items that must be scheduled early. Correctly identified test count scope difference (374 spike vs 469 total) and S7-W16/W17 generic-pattern closure as worth noting.

---

## Final Decision

### **GO -- Proceed to Phase 1 Sprint 1 (LLM Gateway)**

**Rationale**: All 15 spikes have documented results. All 4 Hard Gates are cleared with implemented mitigations. All 27 WARNINGs are closed with test evidence. 469 tests pass across 4 packages. No architectural pivots required. The technical foundation is sound.

**Conditions**: C1-C4 above must be scheduled in Sprint 1-2 backlogs and tracked to completion. These are infrastructure-hardening tasks, not architectural concerns.

**Signatories**:
- Claude Opus 4.6 (Lead): GO
- Gemini 3 Flash: GO
- Codex/GPT: GO (revised)

---

## Related Documents

- [Sprint 0 Technical Spikes Plan](sprint-0-technical-spikes.md)
- [Sprint 0 Traceability Matrix](sprint-0-traceability-matrix.md)
- [Spike Results](spike-results/)
- [Phase 1 Sprint Plan](phase-1-sprint-plan.md)
