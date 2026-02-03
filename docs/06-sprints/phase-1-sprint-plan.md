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

### Sprint 1 Definition of Done
- [ ] LLM Gateway tracks cost per request
- [ ] Budget limits block requests when exceeded
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

### Sprint 2 Definition of Done
- [ ] Workflow can pause for human approval
- [ ] Approval via web UI resumes workflow
- [ ] Email notification sent with approve/reject links
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

### Sprint 3 Definition of Done
- [ ] Can call MCP tool from Inngest workflow
- [ ] Rate limiting queues requests correctly
- [ ] Circuit breaker trips on failures
- [ ] Responses cached appropriately

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

### Sprint 4 Definition of Done
- [ ] Demo workflow: trigger → LLM analysis → HITL approval → MCP action
- [ ] Basic admin UI to view LLM costs and pending approvals
- [ ] Structured logging with correlation IDs
- [ ] No critical security issues

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
