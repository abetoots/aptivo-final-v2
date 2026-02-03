---
id: TSD-PLATFORM-CORE-INDEX
title: Platform Core Technical Specifications
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-03'
parent: ../../03-architecture/platform-core-add.md
domain: core
---

# Platform Core Technical Specifications

**Aptivo Agentic Platform – Shared Infrastructure Services**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0.0 | 2026-02-03 | Multi-Model Consensus | Initial creation per stress test recommendations |

---

## 1. Overview

This directory contains technical specifications for the **Platform Core** shared services. These are the unique differentiators that cannot be bought as SaaS.

### 1.1 Build vs Buy Summary

| Component | Decision | Rationale |
|-----------|----------|-----------|
| **MCP Integration Layer** | Build | Unique differentiator, AgentKit integration |
| **HITL Gateway** | Build | Unique differentiator, domain-specific approval flows |
| **LLM Gateway** | Build | BRD-mandated cost tracking (BO-CORE-003) |
| Workflow Engine | Buy (Inngest) | Commodity, saves months |
| Identity | Buy (Supabase Auth) | Commodity, saves 2+ months |
| Notifications | Buy (Novu) | Commodity, saves 3 weeks |

---

## 2. Specification Documents

| Document | Content |
|----------|---------|
| [mcp-layer.md](mcp-layer.md) | MCP server registry, AgentKit integration, resilience patterns |
| [hitl-gateway.md](hitl-gateway.md) | Approval tokens, single-approver (Phase 1), workflow integration |
| [llm-gateway.md](llm-gateway.md) | Provider abstraction, cost tracking, budget enforcement |

---

## 3. Inherited from Root TSD

These platform-core services use specifications defined at the TSD root level:

| Spec | Usage |
|------|-------|
| [../database.md](../database.md) | Shared tables (users, audit_logs, llm_usage_logs) |
| [../api.md](../api.md) | REST standards, RFC 7807 errors |
| [../common-patterns.md](../common-patterns.md) | Result types, error handling |
| [../observability.md](../observability.md) | Logging, metrics, tracing |

---

## 4. Phase 1 Scope

### 4.1 MCP Integration Layer
- Hardcoded MCP server configs (no dynamic discovery)
- AgentKit integration for tool consumption
- Circuit breaker + retry (cockatiel)
- Rate limit queueing

### 4.2 HITL Gateway
- Single approver only (multi-approver deferred to Phase 2)
- JWT-signed approval tokens
- Inngest `step.waitForEvent()` integration
- 24-hour default timeout

### 4.3 LLM Gateway
- Per-workflow usage logging
- Daily/monthly budget caps
- Provider abstraction (OpenAI, Anthropic)
- Defer: multi-provider routing, fallback strategies
