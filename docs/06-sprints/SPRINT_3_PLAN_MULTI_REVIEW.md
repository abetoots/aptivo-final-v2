# Sprint 3 Plan — Multi-Model Review

**Date**: 2026-03-10
**Models**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (Primary), Codex/GPT (Secondary)
**Deliverable**: [sprint-3-plan.md](./sprint-3-plan.md)

---

## Executive Summary

Three AI models independently produced Sprint 3 implementation plans for the MCP Layer + File Storage sprint (38 SP, 13 tasks, 2 weeks). All three converged on the same structure, phasing, and critical path. Five differences were identified and resolved by the lead.

---

## Consensus Findings

All three models agreed on:

| Topic | Consensus |
|-------|-----------|
| Total SP | 38 (10 MCP + 3 FS) |
| Execution phases | 3 phases: Foundation → Integration → Testing |
| Critical path | MCP-01 → MCP-02 → MCP-06 → MCP-08 |
| FS independence | FS-01/02/03 fully parallel with MCP tasks |
| MCP-06 as integration hub | Wrapper composes security + rate limit + circuit breaker + cache + transport |
| Pipeline order | Validate → Allowlist → Token → Cache check → Rate limit → Circuit → Execute → Size check → Cache save |
| S1-W14 closure | Response size enforcement in MCP-06 wrapper |
| S3-W11 closure | Publish-time Zod validation wrapper around `inngest.send()` |
| S4-W9 closure | Multi-step Inngest deletion workflow with per-step checkpoints |
| FileScanner adapter | PassthroughScanner (tests) + ClamAvScanner (production) |
| CacheStore pattern | Per-package interface, fail-open on store errors |
| Rate limit approach | Inngest concurrency + token bucket fallback for non-Inngest paths |

---

## Debated Items

### D1: MCP-01 Location (DB vs Package)

| Model | Position | Rationale |
|-------|----------|-----------|
| Gemini | DB tables in `@aptivo/database` | Consistent with HITL-01/02 pattern |
| Codex | Zod schema in `@aptivo/mcp-layer` | Runtime validation focus |
| Claude (Lead) | **DB tables in `@aptivo/database`** | Sprint 2 precedent: all Drizzle schemas in database package |

**Resolution**: DB tables in `@aptivo/database`. Runtime Zod validation types live in `@aptivo/mcp-layer` and are derived from the DB schema (same pattern as HITL request/decision types).

---

### D2: MCP-02 Transport Library

| Model | Position | Rationale |
|-------|----------|-----------|
| Gemini | `@modelcontextprotocol/sdk` directly | Standard SDK |
| Codex | `@modelcontextprotocol/sdk` directly | Standard SDK |
| Claude (Lead) | **AgentKit MCPClient** | Arch review Q4 explicitly decided this |

**Resolution**: AgentKit MCPClient wraps the MCP SDK with production-hardened process lifecycle management (SP-01/SP-05 validated). Both models missed the architecture review decision. Overridden by lead.

---

### D3: MCP-04 Reuse Percentage

| Model | Position | Rationale |
|-------|----------|-----------|
| Gemini | 80% | Needs Transient/Permanent error types |
| Codex | 95% | Minimal changes needed |
| Claude (Lead) | **85%** | Error classifier + per-server registry are meaningful additions |

**Resolution**: 85% — the core circuit breaker is production-ready, but adding error classification and per-server registry is non-trivial work that justifies the 3 SP allocation.

---

### D4: FS-02 Schema Location

| Model | Position | Rationale |
|-------|----------|-----------|
| Gemini | `packages/database/src/schema/file-storage.ts` | DB convention |
| Codex | `packages/file-storage/src/access/entity-link-schema.ts` | Package co-location |
| Claude (Lead) | **Database package** | All Drizzle table definitions in `@aptivo/database` (Sprint 2 precedent) |

**Resolution**: Drizzle schemas go in `@aptivo/database/src/schema/file-storage.ts`. Service logic goes in `@aptivo/file-storage`. This is the same pattern used for HITL schemas (in database) vs HITL services (in hitl-gateway).

---

### D5: Sprint Sequencing Granularity

| Model | Position | Rationale |
|-------|----------|-----------|
| Gemini | Day-pairs (1-2, 3-4, etc.) | Simpler overview |
| Codex | Day-by-day | Better tracking |
| Claude (Lead) | **Day-by-day** | 10-day sprint needs granular tracking |

**Resolution**: Day-by-day sequencing provides better visibility into task handoffs and dependency unblocking.

---

## Actionable Recommendations

1. **Start with**: MCP-01 (Senior), MCP-04 (Web Dev 1), FS-01 (Web Dev 2) — all independent, unblock everything else
2. **Front-load MCP-06**: Senior should start wrapper skeleton on day 4 as MCP-03/04/05 complete
3. **FS tasks are buffer**: If MCP falls behind, FS tasks can absorb schedule pressure since they're independent
4. **Watch Inngest concurrency**: MCP-03 burst tests are critical — misconfigured limits cause cost spikes
5. **Mock server quality**: MCP-07 failure injection tools directly determine MCP-08 test coverage quality
