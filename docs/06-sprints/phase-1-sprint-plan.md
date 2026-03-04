# Phase 1 Sprint Plan

**Timeline**: Months 1-3 (6 x 2-week sprints)
**Team**: 3 developers (1 Senior, 2 Web Devs)
**Goal**: Core platform infrastructure enabling both Crypto and HR domains

---

## Sprint 0: Foundation & Validation (Week 1-2)

**Theme**: "Can we build on this?" - Validate assumptions before committing

**SOT**: [Sprint 0 Technical Spikes Plan](./sprint-0-technical-spikes.md) — contains all spike specifications, schedules, and Go/No-Go criteria.

### Summary

- **15 technical spikes** (4 original + 11 from multi-model risk analysis)
- **4 foundational tasks** (monorepo, database, app shell, shared types)
- **4 CRITICAL spikes** must pass for Phase 1 to proceed
- **4 security-critical spikes** (SP-06, SP-11, SP-13, SP-14) require implemented mitigations, not just documentation

### Sprint 0 Definition of Done

See [spike-results/](./spike-results/) for individual spike outcomes.

- [ ] All spikes have documented results
- [ ] Go/No-Go decision made for each risk area
- [ ] Architecture pivots documented as ADRs
- [ ] Monorepo builds with `pnpm build`
- [ ] Database migrations run successfully
- [ ] CI pipeline green (lint, typecheck, test)

---

## Sprint 1: Platform Core - LLM Gateway (Week 3-4)

**Theme**: "Track every token" - BRD-mandated cost tracking first

### Why LLM Gateway First?
1. Required by BRD (BO-CORE-003: "LLM costs tracked per workflow")
2. Needed by all AI features in both domains
3. Relatively self-contained (fewer dependencies)

### Tasks

| Task | Owner | Story Points | Dependencies |
|------|-------|--------------|--------------|
| **LLM-01: Usage Logs Schema** | Senior | 2 | FW-02 |
| **LLM-02: Budget Config Schema** | Senior | 2 | FW-02 |
| **LLM-03: Provider Abstraction** | Senior | 5 | FW-04 |
| **LLM-04: OpenAI Provider** | Web Dev 1 | 3 | LLM-03 |
| **LLM-05: Anthropic Provider** | Web Dev 2 | 3 | LLM-03 |
| **LLM-06: Cost Calculation** | Web Dev 1 | 2 | LLM-03 |
| **LLM-07: Budget Enforcement** | Senior | 3 | LLM-01, LLM-02 |
| **LLM-08: Gateway Service** | Senior | 5 | All above |
| **LLM-09: Unit Tests** | All | 3 | LLM-08 |
| **LLM-10: Per-User Rate Limiting** *(S2-W1)* | Senior | 3 | LLM-08 |

**WARNING-linked scope extensions**:
- **LLM-06** extended: Add non-LLM cost attribution instrumentation *(S2-W11)* — track infrastructure and SaaS cost alongside LLM usage
- **LLM-08** includes: LLM output validation *(S1-W13)* — validate/sanitize untrusted LLM responses before downstream use
- **LLM-10**: Implement per-user/session token bucket rate limiting *(S2-W1)* — prevent single user from exhausting domain LLM budget

### Sprint 1 Definition of Done
- [ ] LLM Gateway tracks cost per request
- [ ] Budget limits block requests when exceeded
- [ ] Per-user rate limiting prevents single-user budget exhaustion *(S2-W1)*
- [ ] Cost attribution covers LLM + infrastructure resources *(S2-W11)*
- [ ] 80%+ test coverage on gateway service
- [ ] Documented in `packages/llm-gateway/README.md`

---

## Sprint 2: Platform Core - HITL Gateway (Week 5-6)

**Theme**: "Humans approve, machines execute"

### Tasks

| Task | Owner | Story Points | Dependencies |
|------|-------|--------------|--------------|
| **HITL-01: Request Schema** | Senior | 2 | Database |
| **HITL-02: Decision Schema** | Senior | 2 | Database |
| **HITL-03: Token Generation** | Senior | 3 | - |
| **HITL-04: Token Verification** | Web Dev 1 | 2 | HITL-03 |
| **HITL-05: Create Request API** | Senior | 3 | HITL-01, HITL-03 |
| **HITL-06: Approve/Reject APIs** | Web Dev 1 | 3 | HITL-02, HITL-04 |
| **HITL-07: Inngest Integration** | Senior | 5 | HITL-05, HITL-06 |
| **HITL-08: Novu Notifications** | Web Dev 2 | 3 | SP-04 |
| **HITL-09: Approval UI Page** | Web Dev 2 | 3 | HITL-06 |
| **HITL-10: Integration Tests** | All | 3 | All above |
| **HITL-11: Session Revocation API** *(S1-W5)* | Web Dev 1 | 2 | HITL-03 |

**WARNING-linked scope extensions**:
- **HITL-11**: Application-level session revocation endpoint *(S1-W5)* — enables immediate session invalidation beyond Supabase defaults

### Sprint 2 Definition of Done
- [ ] Workflow can pause for human approval
- [ ] Approval via web UI resumes workflow
- [ ] Email notification sent with approve/reject links
- [ ] Session revocation endpoint functional *(S1-W5)*
- [ ] 80%+ test coverage

---

## Sprint 3: Platform Core - MCP Layer (Week 7-8)

**Theme**: "Tools for agents"

### Tasks

| Task | Owner | Story Points | Dependencies |
|------|-------|--------------|--------------|
| **MCP-01: Tool Registry Schema** | Senior | 2 | Database |
| **MCP-02: AgentKit Setup** | Senior | 3 | SP-01 |
| **MCP-03: Rate Limit Queue** | Senior | 3 | - |
| **MCP-04: Circuit Breaker** | Web Dev 1 | 3 | - |
| **MCP-05: Response Caching** | Web Dev 2 | 3 | Redis |
| **MCP-06: Wrapper Service** | Senior | 5 | MCP-02 to MCP-05 |
| **MCP-07: Mock MCP Server** | Web Dev 1 | 2 | Testing |
| **MCP-08: Integration Tests** | All | 3 | MCP-06, MCP-07 |
| **MCP-09: Event Schema Validation** *(S3-W11)* | Web Dev 2 | 3 | MCP-06 |
| **MCP-10: Data Deletion Workflow** *(S4-W9)* | Senior | 3 | MCP-06 |
| **MCP-11: ClamAV Health Check** *(S6-W20)* | Web Dev 1 | 1 | - |

**WARNING-linked scope extensions**:
- **MCP-06** includes: MCP response size enforcement *(S1-W14)* — enforce max response size and memory limits on tool call responses
- **MCP-09**: Enforce Zod schema validation on Inngest event publish *(S3-W11)* — reject malformed events at publish-time, route failures to DLQ
- **MCP-10**: Implement data deletion as multi-step Inngest workflow with per-storage checkpoints *(S4-W9)* — PostgreSQL, Redis, Spaces, Novu
- **MCP-11**: Configure ClamAV container-level health check *(S6-W20)* — liveness probe on clamd socket

### Sprint 3 Definition of Done
- [ ] Can call MCP tool from Inngest workflow
- [ ] Rate limiting queues requests correctly
- [ ] Circuit breaker trips on failures
- [ ] Responses cached appropriately
- [ ] Inngest events validated against Zod schemas at publish-time *(S3-W11)*
- [ ] Data deletion workflow checkpoints per storage system *(S4-W9)*
- [ ] ClamAV health check configured and monitored *(S6-W20)*

---

## Sprint 4: Integration & Polish (Week 9-10)

**Theme**: "Wire it all together"

### Tasks

| Task | Owner | Story Points |
|------|-------|--------------|
| **INT-01: End-to-End Workflow** | Senior | 5 |
| **INT-02: Admin Dashboard (Basic)** | Web Dev 1 | 5 |
| **INT-03: LLM Usage Dashboard** | Web Dev 2 | 3 |
| **INT-04: Observability Setup** | Senior | 3 |
| **INT-05: Error Handling Audit** | Web Dev 1 | 2 |
| **INT-06: Security Hardening** | Senior | 3 |
| **INT-07: Documentation** | All | 2 |
| **INT-08: Trace Context Propagation** | Senior | 5 |

#### INT-04 Extended: Alerting & Monitoring (7 WARNINGs)

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S5-W13 | Workflow success rate SLO alert | Alert fires when workflow success rate drops below 99% over 5-min window |
| S5-W14 | HITL delivery latency SLO alert | Alert fires when HITL P95 latency exceeds 10s |
| S5-W15 | MCP success rate SLO alert | Alert fires when MCP success rate drops below 99.5% |
| S5-W16 | Audit integrity SLO alert | Alert fires on audit completeness gap (missing audit records for completed workflows) |
| S2-W12 | LLM spend dashboard | Grafana dashboard: per-domain, per-provider, per-model spend with daily/monthly trends |
| S4-W10 | Retention failed run detection | Alert fires when data retention workflow fails or skips records |
| T1-W23 | Notification delivery monitoring | Alert fires when Novu delivery rate drops below threshold or latency exceeds 2s P95 |

#### INT-05 Extended: Error Handling (3 WARNINGs)

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| T1-W21 | Audit sync → async with timeout + DLQ | Audit writes are async with 5s timeout; failures route to DLQ; no blocking on HITL/file access paths |
| S6-W17 | Readiness/startup probes | DO App Spec updated with readiness and startup probe configuration for all services |
| S6-W18 | Graceful shutdown implementation | SIGTERM handler drains in-flight requests; configurable drain period; clean BullMQ/Inngest shutdown |

#### INT-06 Extended: Security Hardening (8 WARNINGs)

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| T1-W27 | Outbound webhook SSRF validation | Webhook URLs validated against SSRF blocklist (private IPs, localhost, metadata endpoints) |
| T1-W28 | Inbound webhook body limits + HMAC | Body size limit enforced (256KB); HMAC signature required on all inbound webhooks |
| T1-W29 | Health check info disclosure | Health endpoints return only status (no version, dependency details, or internal state) |
| S2-W2 | PII-safe logging (`sanitizeForLogging`) | `sanitizeForLogging` redacts email, name, phone, address in addition to auth fields |
| S2-W3 | Access log PII implementation | Platform-level access logs redact or hash PII (IPs, user agents, URL query params with PII) |
| S1-W8 | Zero-downtime rotation implementation | Dual-key validation period implemented for secret rotation; zero-downtime procedure verified |
| S1-W11 | Webhook body size enforcement | Inbound webhook body size limit (256KB per OpenAPI spec) enforced at gateway level |
| S1-W12 | Global API body size/depth enforcement | JSON body size (1MB) and nesting depth (10 levels) enforced at gateway middleware |

#### INT-08: Trace Context Propagation (6 WARNINGs) — *New*

Implement W3C Trace Context propagation across all async boundaries.

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S7-W24 | Inngest `waitForEvent()` trace propagation | `traceparent` propagated through HITL decision events; parent-child span relationship preserved |
| S7-W25 | BullMQ job trace context | `traceparent` added to `QueuedMCPRequest` payload; worker extracts and continues trace |
| S7-W26 | Novu notification trace context | `traceId` included in `novu.trigger()` payload; notification delivery spans linked to workflow trace |
| S7-W27 | MCP tool call trace context | `traceparent` header sent on HTTP transport; `traceparent` field in stdio JSON-RPC metadata |
| S7-W29 | Supabase JWT validation span | Explicit span wrapping JWT validation step; latency visible in traces |
| S7-W30 | Outbound webhook trace context | `traceparent` header added to `WebhookEventPayload`; downstream can continue trace |

### Sprint 4 Definition of Done
- [ ] Demo workflow: trigger → LLM analysis → HITL approval → MCP action
- [ ] Basic admin UI to view LLM costs and pending approvals
- [ ] Structured logging with correlation IDs
- [ ] No critical security issues
- [ ] SLO alerts configured for workflow success, HITL latency, MCP success, audit integrity *(S5-W13–W16)*
- [ ] LLM spend dashboard operational *(S2-W12)*
- [ ] Notification delivery monitored *(T1-W23)*
- [ ] Audit writes async with DLQ fallback *(T1-W21)*
- [ ] Readiness/startup probes configured *(S6-W17)*
- [ ] Graceful shutdown with drain period *(S6-W18)*
- [ ] SSRF validation on outbound webhooks *(T1-W27)*
- [ ] Inbound webhook HMAC + body limits enforced *(T1-W28)*
- [ ] Health check info disclosure mitigated *(T1-W29)*
- [ ] PII-safe logging across application and access logs *(S2-W2, S2-W3)*
- [ ] API body size/depth limits enforced at gateway *(S1-W11, S1-W12)*
- [ ] Zero-downtime secret rotation verified *(S1-W8)*
- [ ] Trace context propagated across all async boundaries *(S7-W24–W27, S7-W29, S7-W30)*

---

## Sprint 5-6: Domain Kickoff (Week 11-14)

Per the architecture plan, Sprint 5-6 begins parallel domain work:

**Track A (Senior Dev focus)**: Crypto domain stress test
- Trading state definitions
- Exchange MCP integrations
- Paper trading workflow

**Track B (Web Devs focus)**: HR domain production
- Candidate management schemas
- HR tool integrations (Gmail, Calendar)
- Interview workflow

---

## Package Structure

```
packages/
├── database/           # @aptivo/database - Drizzle schemas, migrations
├── types/              # @aptivo/types - Result, errors, shared types
├── llm-gateway/        # @aptivo/llm-gateway - Provider abstraction, cost tracking
├── hitl-gateway/       # @aptivo/hitl-gateway - Approval tokens, workflow integration
├── mcp-layer/          # @aptivo/mcp-layer - Tool registry, AgentKit wrapper
├── config/             # @aptivo/config - Environment, feature flags
└── ui/                 # @aptivo/ui - Shared React components

apps/
├── web/                # Next.js 14 main application
└── inngest/            # Inngest function definitions
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Inngest AgentKit doesn't meet needs | Low | High | SP-01 validates early |
| Supabase Auth limitations | Low | Medium | SP-03 validates, fallback to Clerk |
| LLM costs exceed budget | Medium | Medium | Budget enforcement in Sprint 1 |
| Team velocity lower than expected | Medium | Medium | Scope reduction to core features |

---

## Success Metrics

| Metric | Target | Measured At |
|--------|--------|-------------|
| Sprint 0 spike pass rate | 4/4 | End of Sprint 0 |
| Test coverage (platform-core) | 80%+ | End of Sprint 4 |
| Demo workflow latency | <5s (excluding HITL wait) | End of Sprint 4 |
| Critical bugs | 0 | End of Sprint 4 |
