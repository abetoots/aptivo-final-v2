# Sprint 0 Technical Spikes Plan - Multi-Model Consensus

**Version**: 1.2
**Last Updated**: 2026-02-03
**Status**: Approved

### Review Sign-off

| Model | Assessment | Date |
|-------|------------|------|
| **Gemini 3 Pro Preview** | APPROVE | 2026-02-03 |
| **Codex (OpenAI)** | APPROVE | 2026-02-03 |
| **Claude (Lead)** | APPROVE | 2026-02-03 |

*v1.2 incorporates final review findings including SP-14, SP-15, and tightened SP-06.*

## Executive Summary

Three AI models (Claude, Gemini, Codex) independently analyzed Aptivo's documentation to identify high-risk technical assumptions requiring validation before committing to implementation. This plan defines an enhanced Sprint 0 focused on de-risking through targeted technical spikes.

**Key Finding**: The existing Sprint 0 has 4 spikes, but multi-model consensus identified **15 critical risks** that should be validated (including SP-13, SP-14, SP-15 added during review).

---

## Phase 1: Multi-Model Analysis Summary

### Models Consulted

| Model | Role | Focus Areas |
|-------|------|-------------|
| **Claude (Lead)** | Synthesizer | Architecture coherence, requirement gaps |
| **Gemini 3 Pro** | Technical Risk Analyst | Performance, scalability, integration |
| **Codex (OpenAI)** | Security & Reliability Analyst | Security, durability, third-party risks |

### Consensus Risk Categories

| Category | Critical | High | Medium | Total |
|----------|----------|------|--------|-------|
| Integration (Inngest+AgentKit+MCP) | 2 | 3 | - | 5 |
| Performance & Latency | 1 | 2 | - | 3 |
| Security & Trust | 1 | 3 | 1 | 5 |
| Scalability & Durability | 1 | 2 | - | 3 |
| Third-Party Dependencies | - | 3 | 1 | 4 |
| **Total** | **5** | **13** | **2** | **20** |

---

## Phase 2: Recommended Sprint 0 Structure

### Duration: 2 weeks (expanded scope)

### Team: 3 developers + architecture review

### Existing Spikes (Retain with Enhancements)

| Spike ID | Original Scope | Enhanced Scope |
|----------|----------------|----------------|
| **SP-01** | Inngest + AgentKit basic call | Add: error handling, complex schemas, timeout behavior |
| **SP-02** | `step.waitForEvent()` basic | Add: measure P95 latency, test 24h+ sleep, restart resilience |
| **SP-03** | Supabase Auth magic link | Add: MFA for admin, validate OIDC/SAML feasibility |
| **SP-04** | Novu email + in-app | Add: Telegram channel, measure delivery latency |

### New Critical Spikes (Multi-Model Consensus)

| Spike ID | Risk Level | Assumption to Validate | Evidence |
|----------|------------|------------------------|----------|
| **SP-05** | CRITICAL | MCP `stdio` transport via `npx` is production-viable | mcp-layer.md §2.1 |
| **SP-06** | CRITICAL | MCP server trust model is secure (secrets exposure) | mcp-layer.md §6.1, ADD §5.1 |
| **SP-07** | CRITICAL | 10,000+ sleeping workflows sustainable on Inngest | FRD performance targets |
| **SP-08** | HIGH | LLM streaming cost enforcement (token bucket) | llm-gateway.md §4.3 |
| **SP-09** | HIGH | PostgreSQL schema isolation prevents data leakage | ADD §2.2, §9.1 |
| **SP-10** | HIGH | Circuit breaker + Inngest retry interaction | ADD §5.2, mcp-layer.md §3.1 |
| **SP-11** | HIGH | HITL JWT token security (replay, key mgmt) | hitl-gateway.md §4, §5 |
| **SP-12** | HIGH | E2E demo latency targets achievable | Sprint plan success metrics |
| **SP-13** | CRITICAL | MCP supply-chain integrity | mcp-layer.md §2.1, §6.1 |
| **SP-14** | CRITICAL | Event authenticity & anti-replay | hitl-gateway.md §2, §5 |
| **SP-15** | HIGH | Third-party degradation & fallback | All integration spikes |

---

## Phase 3: Detailed Spike Specifications

### SP-01: Inngest + AgentKit Integration (Enhanced)

**Original Assumption**: Basic MCP server call from Inngest step works.

**Enhanced Scope**:
- Error handling patterns (retries, dead letter)
- Complex JSON schema handling
- Timeout behavior under load

**Validation Steps**:
1. Create Inngest function calling AgentKit MCP tool
2. Test with valid/invalid inputs
3. Test with timeout scenarios (slow MCP server)
4. Measure cold start vs warm execution
5. Verify error propagation to Inngest dashboard

**Success Criteria**:
- MCP tool call completes successfully
- Errors propagate correctly to Inngest
- Timeout handling works as expected
- Compensation states correctly roll back partial progress

#### WARNINGs Validated

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S7-W9 | Saga compensation path untested | Compensation states verified: partial-progress rollback succeeds; crash-during-compensation recovers cleanly without duplicate side-effects |

**Additional validation step**: 6. Trigger crash during compensation step; verify recovery completes rollback without re-executing memoized steps

---

### SP-02: Inngest HITL Wait Pattern (Enhanced)

**Original Assumption**: `step.waitForEvent()` pauses/resumes workflow.

**Enhanced Scope**:
- P95 latency measurement
- 24h+ sleep duration testing
- Worker restart resilience

**Validation Steps**:
1. Create workflow with `step.waitForEvent()`
2. Test immediate event (latency measurement)
3. Test delayed event (1hr, 24hr simulated)
4. Restart Inngest worker mid-wait
5. Measure event delivery accuracy

**Success Criteria**:
- Event resume latency < 500ms P95
- 24h+ waits survive worker restarts
- No lost events during restarts
- Memoized steps not re-executed after crash recovery
- TTL boundary behavior confirmed (pending at TTL-1s, auto-expire at TTL)

#### WARNINGs Validated

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S7-W8 | Inngest checkpoint recovery untested | Crash worker mid-step; verify memoized steps are NOT re-executed on recovery |
| S7-W20 | HITL TTL expiry boundary untested | Test: TTL-1s → request stays pending; at TTL → auto-expires; TTL+1s → already expired |

**Additional validation steps**: 6. Kill Inngest worker during `step.run()` execution; restart and verify step resumes from checkpoint (not re-run) 7. Create HITL request with short TTL; verify state transitions at TTL-1s, TTL, and TTL+1s boundaries

---

### SP-03: Supabase Auth (Enhanced)

**Original Assumption**: Magic link login works in Next.js App Router.

**Enhanced Scope**:
- MFA for admin roles
- OIDC/SAML feasibility for enterprise

**Validation Steps**:
1. Implement magic link flow in Next.js 14
2. Test session handling with App Router
3. Configure MFA for admin role
4. Evaluate OIDC provider setup complexity
5. Document any limitations found

**Success Criteria**:
- Magic link login functional
- MFA configurable for admin users
- Clear understanding of enterprise auth path
- Expired/revoked tokens return 401; JWKS stale-if-error handles Supabase outage
- Cached JWKS serves valid tokens for ≤24h; rejects at 24h boundary

#### WARNINGs Validated

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S7-W3 | Auth failure paths untested | Expired token → 401; revoked session → 401; Supabase Auth unreachable → JWKS stale-if-error serves cached keys |
| S7-W21 | JWKS stale-if-error 24h boundary untested | Cached JWKS valid for ≤24h during Supabase outage; at 24h+1s boundary, tokens rejected (fail-closed) |

**Additional validation steps**: 6. Present expired JWT → verify 401 response 7. Simulate Supabase Auth outage; verify JWKS stale-if-error serves cached keys for ≤24h 8. Test 24h boundary: at 24h cached JWKS still valid; at 24h+1s cached JWKS rejected

---

### SP-04: Novu Notifications (Enhanced)

**Original Assumption**: Email + in-app notification from API works.

**Enhanced Scope**:
- Telegram channel integration
- Delivery latency measurement

**Validation Steps**:
1. Send email via Novu API
2. Send in-app notification
3. Configure Telegram provider
4. Measure delivery latency (target < 2s)
5. Test rate limiting behavior

**Success Criteria**:
- All three channels functional
- Delivery latency < 2s for 95th percentile
- Rate limiting understood
- Novu transactionId dedup window measured and documented

#### WARNINGs Validated

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| T1-W24 | Novu transactionId dedup window unknown | Measured dedup window documented with evidence; behavior at window boundary confirmed (duplicate within window → deduplicated; outside window → delivered) |
| S3-W7 | Novu dedup window unknown (same finding) | Same measurement closes both WARNINGs |

**Additional validation step**: 6. Send duplicate transactionId at T=0, T=window/2, T=window-1s, T=window+1s; measure exact dedup window

---

### SP-05: MCP stdio Transport Performance (CRITICAL)

**Assumption**: Production MCP integration via `stdio` transport and `npx` execution is performant and scalable.

**Risk**:
- Severe latency from spinning up Node processes per tool call
- `npx` dependency on npm registry availability (production anti-pattern)
- Monolithic worker bloat (image must include ALL MCP server dependencies)
- May exceed serverless/container size limits

**Validation Steps**:
1. Create benchmark comparing three execution modes:
   - `npx @package/mcp-server` (current spec)
   - Bundled local execution (`node ./mcp-servers/server/index.js`)
   - HTTP (SSE) transport to separate MCP service
2. Measure cold-start latency for each mode inside Inngest worker
3. Measure warm-start latency with connection pooling
4. Test with 3+ concurrent MCP calls
5. Monitor memory usage over 100+ sequential calls
6. Test behavior when npm registry is unreachable (npx mode only)

**Success Criteria**:
- Bundled local: cold start < 500ms, warm start < 100ms
- `npx` mode: cold start < 2s, warm start < 200ms (fallback only)
- HTTP transport: cold start < 100ms, warm start < 50ms
- Memory stable (no leaks over 100 calls)
- Clear decision matrix for which mode to use per MCP server

**Failure Impact**: Core MCP layer architecture requires redesign (sidecar/separate service)

**Result Template**: [spike-results/SP-05-result.md](./spike-results/SP-05-result.md)

---

### SP-06: MCP Server Security & Sandboxing (CRITICAL)

**Assumption**: Third-party MCP servers invoked via `npx` with environment secrets can be secured.

**Risk**:
- Supply-chain compromise (malicious npm packages)
- Secret exfiltration via stdio MCP servers
- Process isolation insufficient
- Over-privileged secrets (full API keys vs scoped tokens)

**Validation Steps**:
1. Threat model stdio MCP server execution
2. Audit secret exposure paths (env vars accessible to child processes)
3. Implement env sanitization - only pass explicit allowlist to child process
4. Test sandboxing options (Docker, VM, none)
5. Implement allow-list for approved MCP servers
6. Prototype scoped/short-lived tokens instead of long-lived API keys
7. Test read-only filesystem for MCP server processes

**Success Criteria**:
- Documented threat model with **concrete mitigations implemented**
- Env sanitization: child processes receive ONLY required secrets (not `process.env`)
- Least-privilege: scoped tokens with <1hr TTL where provider supports
- Allow-list mechanism functional and enforced
- **Isolation boundary chosen and enforced** (container, VM, or equivalent) with documented rationale
- **Network egress controls defined and applied** for MCP processes (allowlist or deny-by-default)

**Failure Impact**: Security incident risk; may require complete MCP architecture change

**Result Template**: [spike-results/SP-06-result.md](./spike-results/SP-06-result.md)

---

### SP-07: Durable Execution at Scale (CRITICAL)

**Assumption**: Inngest can handle 10,000+ sleeping workflows with reliable wake-up.

**Risk**:
- Scheduling accuracy degrades at scale
- Memory/resource exhaustion
- Wake-up failures or delays
- Test harness may hit API rate limits before testing actual durability

**Validation Steps**:
1. Create stress test with 10,000 sleeping workflows
2. Use Inngest `concurrency` controls to avoid DDOSing during wake-up phase
3. Stagger workflow creation to avoid Inngest Cloud API rate limits
4. Sleep durations: 1min, 1hr, 24hr, 7 days (simulated)
5. Measure wake-up reliability (% successful)
6. Measure scheduling accuracy (drift from expected)
7. Monitor Inngest infra resource consumption
8. Test concurrent wake-up handling (1000 workflows waking simultaneously)

**Success Criteria**:
- 99.9%+ wake-up reliability
- Scheduling drift < 1s
- No resource exhaustion
- Concurrent wake-up (1000 simultaneous) completes without cascading failures

**Failure Impact**: Core workflow engine fails NFRs; architecture revision required

**Result Template**: [spike-results/SP-07-result.md](./spike-results/SP-07-result.md)

#### WARNINGs Validated

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S5-W6 | Inngest free tier limits unknown | Free tier limits documented with evidence (event volume, function count, step count); behavior at limit boundary confirmed |
| S5-W8 | 10K sleeping workflows unvalidated | 10,000 sleeping workflows sustained without resource exhaustion or scheduling degradation; wake-up reliability ≥99.9% |
| S5-W12 | Inngest throughput limits unknown | Throughput ceiling measured (events/sec, concurrent functions); documented with evidence from load test |

**Additional validation steps**: 9. Query Inngest dashboard/API for free tier consumption at 1K, 5K, 10K sleeping workflows 10. Document exact free tier limits (events/month, concurrent steps, sleeping workflow cap) with sources

---

### SP-08: LLM Streaming Cost Enforcement (HIGH)

**Assumption**: Pre-request budget checks are sufficient for cost control.

**Risk**:
- Streaming responses accumulate significant cost AFTER initial check
- Runaway model drains budget before detection
- Post-completion cost calculation too late
- Missing/delayed usage data from provider APIs

**Validation Steps**:
1. Prototype token bucket pattern for streaming
2. Implement stream interceptor that terminates on budget exceed
3. Test with long reasoning traces (Claude, o3)
4. Compare calculated vs actual provider billing
5. Test fail-closed behavior when usage data is missing/delayed
6. Validate partial stream termination semantics (does provider still bill full?)

**Success Criteria**:
- Streaming terminated within 10% of budget limit
- Calculated costs within 5% of actual billing
- Fail-closed: requests blocked when usage data unavailable
- Documented behavior for partial stream termination billing

**Failure Impact**: Budget enforcement unreliable; cost overruns

**Result Template**: [spike-results/SP-08-result.md](./spike-results/SP-08-result.md)

#### WARNINGs Validated

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S7-W18 | LLM budget cap boundary ($50 daily, $500 monthly) untested | Budget enforcement triggers within 10% of $50 daily limit; $500 monthly limit boundary test passes; requests blocked at cap, not after |

**Additional validation step**: 7. Simulate cumulative spend to $49, $50, $51 (daily) and $499, $500, $501 (monthly); verify enforcement triggers at correct boundary

---

### SP-09: PostgreSQL Schema Isolation (HIGH)

**Assumption**: Separate schemas (aptivo_hr, aptivo_trading) provide sufficient tenant isolation.

**Risk**:
- Cross-schema data leakage via misconfigured roles
- RBAC bypass possibilities
- Credentials leak between domains
- Connection pool role leakage (connection reuse with wrong role)
- Migration drift creating unintended access paths

**Validation Steps**:
1. Create domain-specific DB roles with schema isolation
2. Test cross-schema query attempts (should fail)
3. Test connection pool role isolation (verify `SET ROLE` resets between requests)
4. Test row-level security policies if implemented
5. Audit connection string handling
6. Test migration safety (migration role cannot leave residual access)
7. Test `search_path` injection attacks

**Success Criteria**:
- Zero cross-schema access possible via app roles
- Connection pool correctly isolates role context
- RLS policies enforced when enabled
- Documented role permission matrix
- Migration role has no residual access post-migration

**Failure Impact**: Cross-domain data exposure; regulatory/security risk

**Result Template**: [spike-results/SP-09-result.md](./spike-results/SP-09-result.md)

#### WARNINGs Validated

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S7-W7 | DB connection pool exhaustion untested | 20th connection succeeds; 21st connection handled gracefully (queued with timeout or rejected with clear error, not hung) |
| S7-W19 | DB connection pool boundary (max 20) untested | Load test at 20 concurrent connections → all succeed; at 21 → documented behavior (queue, reject, or timeout) |

**Additional validation steps**: 8. Open 20 concurrent connections; verify all complete successfully 9. Open 21st connection; verify graceful handling (connection queued with timeout, or rejected with `POOL_EXHAUSTED` error)

---

### SP-10: Circuit Breaker + Inngest Retry Interaction (HIGH)

**Assumption**: Cockatiel circuit breaker + retry + timeout works correctly with MCP clients and Inngest's retry mechanism.

**Risk**:
- Silent data corruption from masked failures
- Cascading retries under partial outage
- Incorrect breaker state transitions
- **Retry storm**: Inngest retries "circuit open" errors, burning retry budget
- Idempotency violations on MCP side-effects during retries

**Validation Steps**:
1. Fault inject MCP server errors (timeouts, 5xx, malformed responses)
2. Verify breaker trips at correct threshold
3. Verify proper error propagation to workflow
4. Test half-open state recovery
5. Validate logging captures all failure modes
6. **Test Inngest + Cockatiel interaction**:
   - When circuit opens, throw `NonRetriableError` (or equivalent)
   - Alternatively, use `step.sleep()` until circuit reset time
7. Test idempotency for MCP calls with side-effects (use idempotency keys)
8. Verify BullMQ queue replay doesn't duplicate side-effects

**Success Criteria**:
- Breaker trips correctly on 5 consecutive failures
- Errors propagate to Inngest (no silent failures)
- Recovery works when MCP server returns
- **Circuit-open errors do NOT trigger Inngest retry storm**
- Side-effects are idempotent or deduplicated

**Failure Impact**: Unreliable workflows under partial outage; wasted compute on retry storms

**Result Template**: [spike-results/SP-10-result.md](./spike-results/SP-10-result.md)

#### WARNINGs Validated

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S7-W2 | Circuit breaker fallback untested | MCP CB trips after 5 failures → open state returns fallback error; half-open recovery tested |
| S7-W13 | Dead letter queue routing untested | Failed events route to `system.event.dlq` with original payload + failure metadata; DLQ consumer processes events |
| S7-W23 | MCP retry budget vs Inngest step timeout untested | Validated: MCP retry budget (~37s total) < Inngest step timeout (120s); no timing coherence drift under load |

**Additional validation steps**: 9. Verify DLQ routing: fail an event intentionally; confirm it appears in `system.event.dlq` with correct metadata 10. Measure total MCP retry duration under load; confirm stays under Inngest step timeout with ≥2x safety margin

---

### SP-11: HITL Token Security (HIGH)

**Assumption**: JWT HS256 tokens for approval are secure across channels.

**Risk**:
- Token replay attacks
- Token leakage via email/Telegram
- No revocation mechanism
- Raw token storage in DB increases blast radius if DB leaks
- Missing key rotation capability
- No audience/issuer binding

**Validation Steps**:
1. Implement token creation + verification with:
   - JTI (JWT ID) for unique token identification
   - Audience claim (`aud`) bound to request type
   - Issuer claim (`iss`) for validation
2. Test replay prevention via JTI tracking in DB (one-time use)
3. Test expiration handling (15min default)
4. Test token-request mismatch detection
5. Implement token hash storage (not raw token) in DB
6. Prototype key rotation mechanism (dual-key validation period)
7. Test channel binding (token valid only for intended delivery channel)

**Success Criteria**:
- Tokens single-use (JTI-based replay blocked)
- Expired tokens rejected
- Mismatched tokens rejected
- DB stores token hash, not raw token
- Key rotation possible without invalidating in-flight tokens
- Audience/issuer validation enforced

**Failure Impact**: Unauthorized approvals; security incident

**Result Template**: [spike-results/SP-11-result.md](./spike-results/SP-11-result.md)

---

### SP-12: E2E Latency Validation (HIGH)

**Assumption**: Demo workflow latency targets are achievable (excluding HITL wait).

**Risk**:
- Combined latencies exceed target
- Performance bottlenecks unidentified
- Demo fails to impress stakeholders
- LLM reasoning time alone may exceed 5s for complex tasks

**Validation Steps**:
1. Build minimal E2E flow: trigger → LLM → HITL request → MCP tool
2. Instrument with OpenTelemetry tracing
3. Measure each segment latency separately:
   - Inngest trigger to function start
   - LLM time to first token (TTFT)
   - LLM total completion time
   - HITL request creation
   - MCP tool call
4. Identify bottlenecks
5. Test with different model tiers (fast vs reasoning)

**Success Criteria**:
- **Time to First Token (TTFT)**: < 2s (user-perceived responsiveness)
- **Platform overhead** (non-LLM): < 1s total
- **Total workflow duration**: < 15s for reasoning models, < 5s for fast models
- Each component latency documented
- Model selection guidance based on latency requirements

**Failure Impact**: Sprint 4 demo target missed; may need to adjust expectations or optimize

**Result Template**: [spike-results/SP-12-result.md](./spike-results/SP-12-result.md)

---

### SP-13: MCP Supply-Chain Integrity (CRITICAL) - *Added from Review*

**Assumption**: Third-party MCP servers from npm can be safely consumed.

**Risk**:
- Package yanked or compromised between deploys
- No version pinning allows silent upgrades
- No integrity verification (checksums, SBOM)
- Registry allowlist not enforced

**Validation Steps**:
1. Implement version pinning for all MCP server packages
2. Create registry allowlist (only approved npm packages)
3. Generate and store SBOM for MCP dependencies
4. Test detection of:
   - Package version mismatch (unexpected upgrade)
   - Package checksum mismatch
   - Package yanked from registry
5. Implement pre-deploy verification step
6. Test behavior when package unavailable (graceful degradation vs hard fail)

**Success Criteria**:
- All MCP packages pinned to exact versions
- Registry allowlist enforced at deploy time
- SBOM generated and stored for audit
- Checksum verification on package install
- Clear alerting when package integrity issues detected

**Failure Impact**: Supply-chain attack vector; production compromise risk

**Result Template**: [spike-results/SP-13-result.md](./spike-results/SP-13-result.md)

---

### SP-14: Event Authenticity & Anti-Replay (CRITICAL) - *Added from Review*

**Assumption**: Workflow resume events and HITL decisions cannot be spoofed or replayed across channels.

**Risk**:
- Forged `hitl/decision` or workflow resume events
- Replay of old approvals leading to unauthorized actions
- Channel spoofing (email/Telegram/web) bypassing approval intent
- Missing request binding allows cross-workflow approval injection

**Validation Steps**:
1. Implement signed event ingress for all external events (HITL decisions, MCP results)
2. Enforce signature verification (HMAC or public key), with timestamp + nonce
3. Bind events to request/workflow context (requestId, workflowId, channel, approverId)
4. Test replay attempts (same signature/nonce, expired timestamp)
5. Test forged events with invalid signature and mismatched context
6. Validate audit logging for all rejected events

**Success Criteria**:
- All external events require valid signature and fresh timestamp
- Replay attempts are blocked (nonce/JTI tracked)
- Events must match the expected request/workflow/channel/approver context
- Rejected events are logged with reason (signature invalid, replay, mismatch)

**Failure Impact**: Approval bypass risk; unauthorized actions possible

**Result Template**: [spike-results/SP-14-result.md](./spike-results/SP-14-result.md)

#### WARNINGs Validated

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S7-W10 | HITL decision race condition untested | Concurrent approval attempts on same request: first succeeds, second gets `409 Conflict` via INSERT ON CONFLICT; no duplicate approvals |
| S7-W11 | Webhook signature verification failure untested | Invalid HMAC signature → 401 with audit log entry; expired timestamp → 401; valid signature → 200 |

**Additional validation steps**: 7. Send 10 concurrent approve requests for same HITL requestId; verify exactly 1 succeeds (INSERT ON CONFLICT) 8. Send webhook with invalid HMAC → verify 401 + audit log; send with valid HMAC + expired timestamp → verify 401

---

### SP-15: Third-Party Degradation & Fallback (HIGH) - *Added from Review*

**Assumption**: The system behaves safely under third-party outages, rate limits, and partial failures.

**Risk**:
- Vendor outages causing stuck workflows or silent failures
- Rate-limit storms that exhaust retries and budgets
- Hidden vendor lock-in without viable fallback plan
- Unbounded latency during provider degradation

**Validation Steps**:
1. Simulate outages and rate limits for each dependency: Inngest, Supabase, Novu/Telegram, LLM providers, MCP servers
2. Validate retry/backoff behavior and circuit breaker interaction
3. Verify user-visible error states and safe workflow halting
4. Test fallback paths (alternate provider or degraded mode) where applicable
5. Measure recovery behavior and time-to-restore after provider resumes
6. Document vendor exit path and operational runbook

**Success Criteria**:
- No silent failures; workflows fail fast or enter safe-halt state with visibility
- Rate limits do not trigger retry storms
- Fallback or degraded modes are defined and tested (where applicable)
- Recovery is automatic and observable when providers resume

**Failure Impact**: Production instability; blocked workflows; vendor lock-in risk

**Result Template**: [spike-results/SP-15-result.md](./spike-results/SP-15-result.md)

#### WARNINGs Validated

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S6-W8 | Dependency fallback strategies untested | Each dependency's fallback/degraded-mode tested under simulated outage; behavior documented |
| S7-W4 | Redis per-consumer degradation untested | 4 distinct fail policies validated: MCP cache (closed/reject), rate limiter (open/allow), dedup (open/allow), sessions (open/allow) |
| S7-W5 | Retry exhaustion final behavior untested | After all retries exhausted for each of 8 dependencies: workflow enters safe-halt state with visibility (not stuck/silent) |
| S7-W6 | Audit service blocking untested | Sync audit write timeout tested; blocking impact on HITL/file access measured; validates need for T1-W21 (async audit) |
| S7-W12 | LLM provider fallback untested | Primary provider 429/5xx → secondary provider activated; fallback latency measured |
| S7-W15 | API rate limit boundary (100 req/min, burst 20) untested | 100th request → 200 OK; 101st request → 429 with `Retry-After` header |
| S7-W16 | File upload 50MB boundary untested | 52428800 bytes → accepted; 52428801 bytes → 413 Payload Too Large |
| S7-W17 | Pagination max=200 boundary untested | `limit=200` → 200 results; `limit=201` → 400 Bad Request or clamped to 200 |
| S7-W22 | Permission cache 5-min revocation window untested | Revoke permission; verify cached permission still allows access for ≤5 min; verify rejection after cache expiry |

**Additional validation steps**: 7. Build per-dependency degradation matrix: simulate outage for each dependency → document observed behavior vs expected 8. Test boundary conditions: rate limit at 100/101, file upload at 50MB/50MB+1, pagination at 200/201 9. Revoke a permission; test access at T=0, T=2.5min, T=5min, T=5min+1s to confirm 5-min cache window

---

## Phase 4: Enhanced Sprint 0 Schedule

### Week 1: Critical Path Validation

| Day | Senior Dev | Web Dev 1 | Web Dev 2 |
|-----|------------|-----------|-----------|
| 1-2 | SP-01 (enhanced) | FW-01 Monorepo | FW-04 Shared Types |
| 3-4 | SP-05 stdio benchmark | SP-03 Supabase | SP-04 Novu |
| 5 | SP-06 security audit | FW-03 Next.js shell | FW-02 Database |

### Week 2: Scale & Integration Validation

| Day | Senior Dev | Web Dev 1 | Web Dev 2 |
|-----|------------|-----------|-----------|
| 1-2 | SP-07 durability test | SP-09 schema isolation | SP-11 token security |
| 3-4 | SP-02 (enhanced), SP-14 event auth | SP-10 circuit breaker | SP-08 streaming cost |
| 5 | SP-12 E2E latency, SP-13 supply-chain | SP-15 degradation/fallback | Documentation |

---

## Phase 5: Go/No-Go Decision Framework

### Spike Results Classification

| Result | Action |
|--------|--------|
| **Pass** | Proceed with planned architecture |
| **Conditional Pass** | Proceed with documented workaround |
| **Fail with Alternative** | Pivot to alternative approach |
| **Critical Fail** | Stop; re-architecture required |

### Decision Matrix

| Spike | Pass Threshold | Fail Consequence |
|-------|----------------|------------------|
| SP-01 | MCP call succeeds with error handling | Evaluate alternative MCP integration |
| SP-02 | Events resume reliably after 24h+ | Evaluate Temporal alternative |
| SP-03 | Magic link + MFA works | Pivot to Clerk |
| SP-04 | 3 channels, <2s latency | Accept limitations or add providers |
| SP-05 | Bundled: <500ms cold; decision matrix documented | Pivot to HTTP transport or sidecar |
| SP-06 | **Mitigations implemented** (env sanitization, scoped tokens, allowlist) | **No-Go** until security controls in place |
| SP-07 | 99.9% wake-up, concurrent wake-up stable | Evaluate Temporal |
| SP-08 | <10% budget overshoot, fail-closed on missing data | Accept risk or add stream limits |
| SP-09 | Zero cross-schema access, pool isolation verified | Separate databases |
| SP-10 | Errors propagate, **no retry storm on circuit-open** | Implement NonRetriableError pattern |
| SP-11 | Replay blocked via JTI, **token hash stored** | **No-Go** until token security hardened |
| SP-12 | TTFT <2s, platform overhead <1s | Optimize or adjust demo expectations |
| SP-13 | Version pinning + allowlist enforced | **No-Go** until supply-chain controls in place |
| SP-14 | Valid signature + replay blocked + context binding enforced | **No-Go** until event authenticity controls in place |
| SP-15 | No silent failures + safe-halt/fallback verified | Proceed with documented degraded-mode runbook |

**Note**: Spikes marked **No-Go** on failure require mitigations before proceeding to Sprint 1. Documentation-only passes are not sufficient for security-critical spikes (SP-06, SP-11, SP-13, SP-14).

---

## Phase 6: Foundational Work (Unchanged)

These tasks run in parallel with spikes:

| Task | Owner | Deliverable |
|------|-------|-------------|
| **FW-01: Monorepo Setup** | Senior | Turborepo + pnpm workspaces configured |
| **FW-02: Database Package** | Senior | `@aptivo/database` with Drizzle ORM, migrations |
| **FW-03: Next.js App Shell** | Web Dev 1 | Basic Next.js 14 app with Tailwind, auth placeholder |
| **FW-04: Shared Types** | Web Dev 2 | `@aptivo/types` with Result, Error types, Zod schemas |

---

## Deliverables

### Sprint 0 Outputs

1. **Spike Results Document** - Pass/fail for each spike with evidence
2. **Architecture Decision Records** - Any pivots documented
3. **Risk Register Update** - Remaining risks post-validation
4. **Monorepo** - Turborepo + pnpm configured
5. **Database Package** - Drizzle ORM with migrations
6. **Shared Types** - Result, Error types, Zod schemas
7. **CI Pipeline** - Lint, typecheck, test passing

### Definition of Done

- [ ] All 15 spikes have documented results
- [ ] Go/No-Go decision made for each risk area
- [ ] Security-critical spikes (SP-06, SP-11, SP-13, SP-14) have **mitigations implemented**, not just documented
- [ ] Architecture pivots documented as ADRs
- [ ] Monorepo builds with `pnpm build`
- [ ] Database migrations run successfully
- [ ] CI pipeline green

---

## Spike Result Template

Each spike result should be documented in `spike-results/SP-XX-result.md` using this template:

```markdown
# SP-XX: [Spike Name] Result

**Date**: YYYY-MM-DD
**Owner**: [Name]
**Status**: Pass | Conditional Pass | Fail with Alternative | Critical Fail

## Summary

[1-2 sentence summary of findings]

## Validation Steps Completed

- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

## Measurements

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| [Metric 1] | [Target] | [Actual] | [P/F] |

## Evidence

[Links to code, logs, screenshots]

## Findings

[Detailed findings]

## Decision

[Pass/Fail decision and rationale]

## Follow-up Actions

- [ ] Action 1
- [ ] Action 2
```

---

## Verification Plan

After Sprint 0 completion:

1. Review all spike result documents
2. Conduct architecture review meeting
3. Update risk register with validated/invalidated risks
4. Make Go/No-Go decision for Phase 1 continuation
5. Adjust Sprint 1-5 plans based on findings

---

## Related Documents

- [Phase 1 Sprint Plan](./phase-1-sprint-plan.md)
- [Platform Core ADD](../03-architecture/platform-core-add.md)
- [MCP Layer Specification](../04-specs/platform-core/mcp-layer.md)
- [HITL Gateway Specification](../04-specs/platform-core/hitl-gateway.md)
- [LLM Gateway Specification](../04-specs/platform-core/llm-gateway.md)
