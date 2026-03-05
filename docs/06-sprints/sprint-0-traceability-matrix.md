# Sprint 0 — Technical Spike Traceability Matrix

**Version**: 1.0.0
**Date**: 2026-03-04
**Status**: Active — updated as spikes complete

---

## Purpose

This matrix maps every Sprint 0 spike to its upstream requirements (BRD, FRD, ADD) and associated WARNINGs. It ensures full traceability from technical validation back to business and architectural decisions.

---

## Spike → Upstream Document Mapping

| Spike | Risk | BRD Reference | FRD Reference | ADD Reference | WARNINGs |
|-------|------|---------------|---------------|---------------|----------|
| **SP-01** Inngest + AgentKit | CRIT | BO-CORE-001, §6.2 Build:WFE | FR-CORE-WFE-001→007 | §3 Workflow Engine, §3.3 Idempotency | S7-W9 |
| **SP-02** HITL Wait Patterns | CRIT | BO-CORE-002, §6.2 Build:HITL | FR-CORE-HITL-001→006 | §4 HITL Gateway | S7-W8, S7-W20 |
| **SP-03** Supabase Auth | CRIT | §6.2 Integrate:Identity | FR-CORE-ID-001→003 | §6 Identity | S7-W3, S7-W21 |
| **SP-04** Novu Integration | CRIT | §6.2 Build:Notification | FR-CORE-NOTIF-001→003 | §8 Notification Bus | T1-W24, S3-W7 |
| **SP-05** MCP stdio Transport | CRIT | §6.2 Build:MCP | FR-CORE-MCP-001→003 | §5.1 MCP Transport | — |
| **SP-06** MCP Security | CRIT | §6.2 Build:MCP | FR-CORE-MCP-001 | §5.1 MCP Trust | — (security-critical) |
| **SP-07** Durability at Scale | CRIT | BO-CORE-001, §5.1 10K NFR | FR-CORE-WFE-002,003 | §3.2 Durable Execution | S5-W6, S5-W8, S5-W12 |
| **SP-08** LLM Streaming Cost | HIGH | BO-CORE-003 cost tracking | FR-CORE-LLM-002 | §7 LLM Gateway | S7-W18 |
| **SP-09** Schema Isolation | HIGH | §2.2 Domain isolation | — | §9.1 Database Strategy | S7-W7, S7-W19 |
| **SP-10** Circuit Breaker | HIGH | — | FR-CORE-MCP-002,003 | §5.2 MCP Resilience | S7-W2, S7-W13, S7-W23 |
| **SP-11** HITL Token Security | HIGH | — | FR-CORE-HITL-001 | §4.1 Token Security | — (security-critical) |
| **SP-12** E2E Latency | HIGH | §5.1 SLA targets | — | §10.4 SLO Measurement | — |
| **SP-13** Supply-Chain Integrity | CRIT | — | — | §5.1 MCP Trust | — (security-critical) |
| **SP-14** Event Authenticity | CRIT | — | FR-CORE-HITL-001,006 | §4.2 Event Security | S7-W10, S7-W11 |
| **SP-15** Third-Party Degradation | HIGH | All integrations | — | All failure domains | S6-W8, S7-W4→W6, S7-W12, S7-W15→W17, S7-W22 |

---

## WARNINGs → Spike Mapping

Shows which spike validates each WARNING from the WARNINGS_REGISTER.

| WARNING ID | Description | Validating Spike | Spike Result | Disposition |
|------------|-------------|------------------|--------------|-------------|
| S5-W6 | Inngest scale limits | SP-07 | Pending | Open |
| S5-W8 | Durability guarantees | SP-07 | Pending | Open |
| S5-W12 | Resource consumption at scale | SP-07 | Pending | Open |
| S6-W8 | Third-party dependency risk | SP-15 | Pending | Open |
| S7-W2 | Circuit breaker interaction | SP-10 | Pending | Open |
| S7-W3 | Supabase Auth capabilities | SP-03 | Pending | Open |
| S7-W4 | Inngest degradation | SP-15 | Pending | Open |
| S7-W5 | Supabase Auth degradation | SP-15 | Pending | Open |
| S7-W6 | Novu degradation | SP-15 | Pending | Open |
| S7-W7 | Schema isolation gaps | SP-09 | Pending | Open |
| S7-W8 | HITL wait/resume latency | SP-02 | Pending | Open |
| S7-W9 | Saga compensation path | SP-01 | Pending | Open |
| S7-W10 | Event authenticity | SP-14 | Pending | Open |
| S7-W11 | Anti-replay mechanism | SP-14 | Pending | Open |
| S7-W12 | LLM provider degradation | SP-15 | Pending | Open |
| S7-W13 | Retry storm risk | SP-10 | Pending | Open |
| S7-W15 | Redis degradation | SP-15 | Pending | Open |
| S7-W16 | Calendar service degradation | SP-15 | Pending | Open |
| S7-W17 | File storage degradation | SP-15 | Pending | Open |
| S7-W18 | LLM cost visibility | SP-08 | Pending | Open |
| S7-W19 | Connection pool boundaries | SP-09 | Pending | Open |
| S7-W20 | HITL concurrent decisions | SP-02 | Pending | Open |
| S7-W21 | IdP session management | SP-03 | Pending | Open |
| S7-W22 | Recovery time targets | SP-15 | Pending | Open |
| S7-W23 | Silent failure modes | SP-10 | Pending | Open |
| S3-W7 | Multi-channel latency | SP-04 | Pending | Open |
| T1-W24 | Notification delivery reliability | SP-04 | Pending | Open |

---

## Go/No-Go Gate Summary

### Hard Gates (Critical Fail = Phase 1 Blocked)

| Spike | Pass Threshold | Status | Evidence |
|-------|----------------|--------|----------|
| **SP-06** MCP Security | Env sanitization, scoped tokens, allowlist implemented | Pending | — |
| **SP-11** HITL Token Security | JTI replay blocked, hash stored, key rotation possible | Pending | — |
| **SP-13** Supply-Chain Integrity | Version pinning + registry allowlist enforced | Pending | — |
| **SP-14** Event Authenticity | Signed events + replay blocked + context binding | Pending | — |

### Soft Gates (Fail = Pivot, Not Stop)

| Spike | Fail Action | Status |
|-------|-------------|--------|
| **SP-01** Inngest + AgentKit | Evaluate alternative MCP integration | Pending |
| **SP-02** HITL Wait | Evaluate Temporal as workflow engine | Pending |
| **SP-03** Supabase Auth | Pivot to Clerk for identity | Pending |
| **SP-05** MCP Transport | Pivot to HTTP transport / sidecar | Pending |
| **SP-07** Durability | Evaluate Temporal for durability | Pending |

---

## Foundational Task → Spike Dependencies

| Task | Package | Depends On | Blocks |
|------|---------|------------|--------|
| **FW-01** Monorepo Polish | Root | — | All spikes (build must work) |
| **FW-02** Database | `@aptivo/database` | FW-01 | SP-09 |
| **FW-03** Next.js Shell | `@aptivo/web` | FW-01 | SP-03 |
| **FW-04** Shared Types | `@aptivo/types` | FW-01 | SP-01, SP-02, SP-05, SP-06, SP-10, SP-11, SP-14 |

---

## Code Location Matrix

Maps each spike to its implementation files.

| Spike | Source Files | Test Files | Result Doc |
|-------|-------------|------------|------------|
| SP-01 | `apps/spike-runner/src/sp-01-inngest-agentkit.ts` | `apps/spike-runner/tests/sp-01-inngest-agentkit.test.ts` | `spike-results/SP-01-result.md` |
| SP-02 | `apps/spike-runner/src/sp-02-hitl-wait.ts` | `apps/spike-runner/tests/sp-02-hitl-wait.test.ts` | `spike-results/SP-02-result.md` |
| SP-03 | `apps/spike-runner/src/sp-03-supabase-auth.ts` | `apps/spike-runner/tests/sp-03-supabase-auth.test.ts` | `spike-results/SP-03-result.md` |
| SP-04 | `apps/spike-runner/src/sp-04-novu-notifications.ts` | `apps/spike-runner/tests/sp-04-novu-notifications.test.ts` | `spike-results/SP-04-result.md` |
| SP-05 | `apps/spike-runner/src/sp-05-mcp-transport.ts` | `apps/spike-runner/tests/sp-05-mcp-transport.test.ts` | `spike-results/SP-05-result.md` |
| SP-06 | `packages/mcp-layer/src/security/` | `packages/mcp-layer/tests/sp-06-mcp-security.test.ts` | `spike-results/SP-06-result.md` |
| SP-07 | `apps/spike-runner/src/sp-07-durability-scale.ts` | `apps/spike-runner/tests/sp-07-durability-scale.test.ts` | `spike-results/SP-07-result.md` |
| SP-08 | `apps/spike-runner/src/sp-08-llm-cost.ts` | `apps/spike-runner/tests/sp-08-llm-cost.test.ts` | `spike-results/SP-08-result.md` |
| SP-09 | `apps/spike-runner/src/sp-09-schema-isolation.ts` | `apps/spike-runner/tests/sp-09-schema-isolation.test.ts` | `spike-results/SP-09-result.md` |
| SP-10 | `packages/mcp-layer/src/resilience/` | `packages/mcp-layer/tests/sp-10-circuit-breaker.test.ts` | `spike-results/SP-10-result.md` |
| SP-11 | `packages/hitl-gateway/src/tokens/` | `packages/hitl-gateway/tests/sp-11-token-security.test.ts` | `spike-results/SP-11-result.md` |
| SP-12 | `tools/benchmarks/sp-12-e2e-benchmark.ts` | — | `spike-results/SP-12-result.md` |
| SP-13 | `apps/spike-runner/src/sp-13-supply-chain.ts` | `apps/spike-runner/tests/sp-13-supply-chain.test.ts` | `spike-results/SP-13-result.md` |
| SP-14 | `packages/hitl-gateway/src/events/` | `packages/hitl-gateway/tests/sp-14-event-authenticity.test.ts` | `spike-results/SP-14-result.md` |
| SP-15 | `apps/spike-runner/src/sp-15-third-party-degradation.ts` | `apps/spike-runner/tests/sp-15-third-party-degradation.test.ts` | `spike-results/SP-15-result.md` |

---

## Related Documents

- [Sprint 0 Technical Spikes Plan](sprint-0-technical-spikes.md) — source of truth for spike details
- [Spike Results](spike-results/) — individual spike result documents
- [Common Patterns](../04-specs/common-patterns.md) — Result types, error types, event schemas
- [Database Specification](../04-specs/database.md) — schema requirements
- [Configuration Specification](../04-specs/configuration.md) — environment variables
- [Coding Guidelines](../05-guidelines/05a-Coding-Guidelines.md) — code conventions
- [Testing Strategies](../05-guidelines/05b-Testing-Strategies.md) — testing requirements
