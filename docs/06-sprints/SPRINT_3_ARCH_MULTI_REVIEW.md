# Sprint 3 Architectural Decisions — Multi-Model Review

**Date**: 2026-03-09
**Models**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (Primary), Codex/GPT (Secondary)
**Sprint**: 3 — MCP Layer + File Storage ("Tools for agents, storage for humans")

---

## Executive Summary

Four architectural questions were evaluated independently by three AI models. **Unanimous consensus on Q1-Q3**, resolved disagreement on Q4. All decisions prioritize simplicity (YAGNI/KISS), consistency with existing codebase patterns (functional core / imperative shell, injectable dependencies, Result types), and the 2-week sprint timeline.

---

## Consensus Findings

### Q1: BullMQ vs Inngest for MCP Rate Limiting (MCP-03)

**Decision: Use Inngest's native rate limiting + concurrency controls**

| Model | Recommendation | Consistency |
|-------|---------------|-------------|
| Gemini | Inngest | 5/5 |
| Codex | Inngest | 5/5 |
| Claude | Inngest | 5/5 |

**Rationale:**
- Inngest provides `concurrency` keys and `rateLimit` function-level controls (e.g., `concurrency: { limit: 3, key: "event.data.serverId" }`)
- BullMQ adds a new dependency, worker management, and monitoring surface — violates YAGNI
- For any direct-call path outside Inngest workflows, reuse the token bucket pattern from LLM-10
- Keeps all orchestration logic in one platform with unified observability

**Risk:** High-frequency tool calls may hit Inngest function invocation costs if concurrency limits are misconfigured. Mitigate with integration tests for backpressure behavior.

---

### Q2: Redis Dependency Strategy

**Decision: Shared minimal `RedisClient` interface (adapter pattern)**

| Model | Recommendation | Consistency |
|-------|---------------|-------------|
| Gemini | Shared interface | 5/5 |
| Codex | Shared interface | 5/5 |
| Claude | Shared interface | 5/5 |

**Rationale:**
- Follows the established pattern: CF-03 `RedisClient` interface, LLM-10 `RateLimitStore`, HITL `DecisionStore`
- Each package defines its own store interface (CacheStore, QueueStore, etc.)
- App layer injects concrete Redis-backed implementations (imperative shell)
- No shared `@aptivo/redis` package — premature abstraction for Sprint 3
- In-memory implementations for tests, Redis for production

**Implementation pattern:**
```typescript
// each package defines its own interface
interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

// app layer injects concrete Redis adapter
const cache = new RedisCacheStore(redisClient);
const service = createMcpWrapper({ cache, ... });
```

---

### Q3: ClamAV Deployment Model (FS-03)

**Decision: ClamAV sidecar container in production + injectable `FileScanner` adapter**

| Model | Recommendation | Consistency |
|-------|---------------|-------------|
| Gemini | ClamAV sidecar | 4/5 |
| Codex | ClamAV sidecar | 4/5 |
| Claude | ClamAV sidecar + adapter | 5/5 |

**Rationale:**
- Sprint 3 DoD explicitly requires "ClamAV scans uploads before storage confirmation"
- ClamAV sidecar keeps scanning within infrastructure boundary (no SaaS data privacy risk)
- `FileScanner` adapter interface makes ClamAV injectable:
  - Tests: `PassthroughScanner` (always passes)
  - Local dev: `PassthroughScanner` or optional ClamAV container
  - Production: `ClamAvScanner` (connects to sidecar via TCP/socket)

**Risk:** ClamAV is resource-intensive (~200MB+ container, CPU-heavy scans). Mitigate with:
- Health checks on the sidecar
- Scan timeout with quarantine fallback
- Circuit breaker on scanner failures (reuse existing pattern)

---

## Debated Items

### Q4: AgentKit Integration Depth (MCP-02)

| Model | Initial Position | After Debate | Consistency |
|-------|-----------------|--------------|-------------|
| Gemini | C: AgentKit routing + custom pipeline | Refined: AgentKit for lifecycle, not reasoning | 5/5 |
| Codex | B: Thin MCP SDK wrapper | B: Thin wrapper | 5/5 |
| Claude | B: Thin wrapper | Refined B: AgentKit MCPClient as transport | 5/5 |

**Decision: Use AgentKit's `MCPClient` for transport/lifecycle; our layers for security/resilience; no agent reasoning**

**Resolution process:**
1. Codex and Claude initially recommended Option B (thin MCP SDK wrapper)
2. Gemini recommended Option C (AgentKit routing + custom pipeline)
3. Counter-argument presented: routing/reasoning are YAGNI for Sprint 3
4. Gemini accepted YAGNI for reasoning/routing but argued AgentKit's `MCPClient` provides production-hardened stdio process lifecycle management
5. All three converged: use AgentKit for transport management, wrap with our security/resilience, defer agent abstractions

**Final architecture:**
```
Inngest workflow
  → step.run('call-mcp-tool')
    → security layer (env sanitizer, allowlist, scoped tokens)
      → rate limiter (Inngest concurrency OR token bucket)
        → circuit breaker
          → AgentKit MCPClient (handles stdio/HTTP transport lifecycle)
            → MCP server
```

**Why this works:**
- Sprint plan task is "MCP-02: AgentKit Setup" — this satisfies it
- SP-01 validated AgentKit; we leverage that validation
- AgentKit handles process spawning/monitoring for stdio transports (SP-05 validated)
- Our circuit breaker wraps AgentKit for failure isolation
- Our security layers sanitize before tool execution
- Agent reasoning/routing deferred to Phase 2+ (YAGNI)

---

## Actionable Recommendations

### Sprint 3 Architecture Summary

| Component | Technology | Pattern |
|-----------|-----------|---------|
| Workflow orchestration | Inngest | Existing |
| MCP rate limiting | Inngest `concurrency` + `rateLimit` | Inngest-native |
| MCP transport | AgentKit `MCPClient` | New (validated in SP-01) |
| MCP security | Existing env sanitizer + allowlist + scoped tokens | Existing (SP-06) |
| MCP resilience | Existing circuit breaker | Existing (SP-10) |
| Response caching | Redis via `CacheStore` adapter | New interface, existing pattern |
| File storage | S3/DO Spaces via `StorageAdapter` | New interface |
| Malware scanning | ClamAV sidecar via `FileScanner` adapter | New interface |
| Redis connectivity | `RedisClient` interface (per-package adapters) | Existing pattern (CF-03) |

### Key Technical Decisions for Sprint 3 Plan

1. **No BullMQ** — Inngest handles all queuing/rate-limiting needs
2. **No `@aptivo/redis` package** — each package defines its own store interface
3. **AgentKit for MCPClient only** — no agent reasoning, routing, or tool networks in Sprint 3
4. **`FileScanner` adapter** — ClamAV is injectable, not hardcoded
5. **Token bucket fallback** — for non-Inngest MCP call paths (reuse LLM-10 pattern)

### Tech Debt Accepted

| Item | Rationale | Target Sprint |
|------|-----------|---------------|
| AgentKit agent reasoning | YAGNI for Sprint 3 | Phase 2+ |
| AgentKit tool networks/routing | YAGNI for Sprint 3 | Phase 2+ |
| Shared Redis connection pooling | Each package manages own connection | Sprint 5 (if needed) |
| ClamAV signature auto-update | Operational concern, not Sprint 3 scope | Sprint 5 (hardening) |
