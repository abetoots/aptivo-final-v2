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
- Single + multi-approver (quorum, sequential) — Sprint 11
- Per-approver JWT-signed tokens with join table
- Request changes decision type with bounded retries
- Inngest `step.waitForEvent()` integration + parent/child orchestration
- Configurable timeout with escalation policies

### 4.3 LLM Gateway
- Per-workflow usage logging + daily/monthly budget caps
- Provider abstraction (OpenAI, Anthropic)
- Prompt injection detection classifier (4 pattern categories, Unicode normalization) — Sprint 12
- Content filtering pipeline (pre-request + post-response, 3 domain tiers) — Sprint 12
- Per-user durable rate limits (Redis-backed token bucket) — Sprint 12
- Multi-provider routing (lowest_cost / latency_optimized / failover_only) — Sprint 12

### 4.4 Notification Bus
- Novu primary + SMTP fallback with configurable failover policy — Sprint 13
- Silent-drop monitoring with delivery health alerts — Sprint 13
- 4-tier priority routing (critical/high/normal/low) with quiet hours — Sprint 13
- Per-approver webhook notifications for multi-approver HITL — Sprint 13

### 4.5 Platform Features
- Workflow definition CRUD API with versioning (draft/active/archived) — Sprint 13
- Extensible webhook action points (HMAC-signed dispatch) — Sprint 13
- Runtime feature flag service (local JSON provider, LaunchDarkly-ready) — Sprint 13
- Consent withdrawal API (DPA Art 7) with audit trail — Sprint 13
- Anomaly detection for bulk PII access (z-score baseline) — Sprint 13

### 4.6 Visual Builder + MCP Resilience + Operational Metrics (Sprint 14)
- Visual workflow rule editor (FR-CORE-WFE-001) — step add/remove/reorder, draft/activate lifecycle
- Dynamic MCP server discovery API — health status from CircuitBreakerRegistry
- Per-tool MCP circuit breaker override — admin-configurable failure thresholds per tool
- Approval SLA metrics + dashboard — per-approver latency, breach rate, policy-type grouping
- Deferred modules buy/build analysis — 16 modules evaluated, Phase 3 sequence defined
