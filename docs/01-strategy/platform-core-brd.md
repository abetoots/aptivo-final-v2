---
id: BRD-PLATFORM-CORE
title: Aptivo Platform Core - Business Requirements Document
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-02'
parent: null
children:
  - crypto-domain-addendum.md
  - hr-domain-addendum.md
---

# Aptivo Platform Core - Business Requirements Document

**Version**: 1.0.0
**Date**: February 2, 2026
**Status**: Draft (Multi-Model Consensus Review)

---

## Document Hierarchy

This document defines the **shared platform infrastructure** that serves multiple domain applications. Domain-specific requirements are defined in separate addendums:

```
Platform Core BRD (this document)
├── Crypto Domain Addendum (trading-specific requirements)
└── HR Domain Addendum (agency operations requirements)
```

---

## 1. Executive Summary

### 1.1 Project Overview

The Aptivo Agentic Core is a **domain-agnostic workflow automation platform** designed to support AI-augmented business operations. The platform provides shared infrastructure for:

- **State machine orchestration** for complex, multi-step workflows
- **Human-in-the-Loop (HITL) approval gates** for critical decisions
- **Universal integration layer** via Model Context Protocol (MCP)
- **LLM provider abstraction** for AI-powered automation
- **Compliance-ready audit logging** for regulated industries

### 1.2 Strategic Context

**Origin**: This platform architecture emerged from a multi-model consensus review (Gemini 3 Pro, OpenAI Codex, Claude Opus 4.5) that identified ~70% infrastructure overlap between two planned projects:
1. A crypto trading AI agent ecosystem
2. An HR/recruitment automation system

**Decision**: Rather than building two separate systems with duplicate infrastructure, the team will build a shared core platform with domain-specific applications on top.

**Review Reference**: See `APTIVO_STRATEGY_MULTI_REVIEW.md` for full analysis and consensus findings.

### 1.3 Business Value Proposition

| Stakeholder | Value |
|-------------|-------|
| Development Team (3 devs) | Build once, deploy twice. 70% less duplicate code. |
| Agency Operations | Automated workflows reduce manual overhead by 60%. |
| Compliance/Audit | Single, consistent audit trail across all operations. |
| Future Clients | Service-first offering with proven, battle-tested platform. |

---

## 2. Business Objectives

### 2.1 Primary Objectives

#### BO-CORE-001: Enable Rapid Domain Application Development
**Target**: New domain applications can be built on the platform in <50% of the time required for standalone development.
**Success Metric**: HR domain app deployed within 3 months of core platform completion.
**Rationale**: The core platform should accelerate, not constrain, domain-specific development.

#### BO-CORE-002: Provide Enterprise-Grade Compliance Infrastructure
**Target**: All domain applications inherit compliance capabilities without domain-specific implementation.
**Success Metric**: Single audit service supports both financial regulations (crypto) and data privacy regulations (HR/DPA).
**Rationale**: Compliance is a cross-cutting concern that should be solved once at the platform level.

#### BO-CORE-003: Support AI-Augmented Operations
**Target**: All workflows can leverage LLM capabilities with provider flexibility and cost control.
**Success Metric**: LLM costs tracked per workflow; provider switching achievable without code changes.
**Rationale**: AI augmentation is a core capability, not an afterthought.

#### BO-CORE-004: Maintain Human Oversight for Critical Decisions
**Target**: All high-stakes actions require explicit human approval with full audit trail.
**Success Metric**: Zero unauthorized automated actions in production; 100% HITL compliance for critical workflows.
**Rationale**: Semi-autonomous operation balances efficiency with control and regulatory compliance.

### 2.2 Constraints

#### Resource Constraints
- **Development Team**: 3 developers (1 senior, 2 web devs)
- **Timeline**: Core platform in 3 months; domain apps in subsequent 3 months
- **Budget**: Self-funded; cost-effective solutions required

#### Technical Constraints
- **Technology Stack**: Defined in Application Design Document (ADD). Team has committed to TypeScript-based stack with relational database.
- **Architecture Pattern**: Defined in ADD. Must support functional purity for business logic.
- **Deployment**: Cloud-based. Specific vendors defined in ADD.

#### Compliance Constraints
- Must support: Philippine DPA (RA 10173), DOLE, BIR (HR domain)
- Must support: Financial transaction logging, regulatory audit trails (crypto domain)
- **Data retention framework**: Platform provides configurable retention with domain-specific policies:
  - Default minimum: 7 years for compliance-critical records
  - Domain override: Shorter retention permitted where regulations allow (e.g., consent withdrawal)
  - Domain override: Longer/indefinite retention for analytics data

---

## 3. Platform Core Scope

### 3.1 In-Scope Components

These components are **shared infrastructure** that all domain applications will use:

#### 3.1.1 Workflow Engine
**Purpose**: State machine orchestration for complex, multi-step business processes.

**Business Capabilities**:
- Define workflows as explicit states with allowed transitions
- Trigger workflows from events (user actions, scheduled, external)
- Support conditional branching and parallel execution
- Handle failures with configurable retry logic
- Track workflow state with full history

**Domain Examples**:
- Crypto: Trade signal → Security check → HITL approval → Execution → Monitoring
- HR: Application → Screening → Interview → Offer → Contract → Onboarding

#### 3.1.2 Human-in-the-Loop (HITL) Gateway
**Purpose**: Secure approval mechanism for critical automated decisions.

**Business Capabilities**:
- Pause workflow execution pending human review
- Present context and reasoning to approver
- Capture approval/rejection with optional comments
- Enforce expiration (auto-reject stale requests)
- Support multi-channel delivery (web, Telegram, email, mobile)
- Maintain tamper-proof audit trail

**Domain Examples**:
- Crypto: "Approve trade: Buy 0.5 ETH at $3,000?" with AI reasoning
- HR: "Approve offer: Hire Alex at ₱75,000/month?" with interview summary

#### 3.1.3 MCP Integration Layer
**Purpose**: Universal connector for external services and data sources.

**Business Capabilities**:
- Registry of available MCP servers and their capabilities
- Request queuing with rate limit handling
- Response caching with configurable TTLs
- Circuit breaker for failing services
- Unified error handling and logging

**Domain Examples**:
- Crypto: Exchange APIs, blockchain explorers, market data providers
- HR: Gmail, Google Calendar, LinkedIn, PDF parsers

#### 3.1.4 LLM Gateway
**Purpose**: Provider-agnostic access to large language models.

**Business Capabilities**:
- Support multiple providers (OpenAI, Anthropic, Google)
- Per-workflow model assignment
- Cost tracking and budget alerts
- Automatic fallback on provider failure
- Prompt caching for cost optimization

**Domain Examples**:
- Crypto: Sentiment analysis, narrative extraction, trade reasoning
- HR: Resume parsing, interview question generation, candidate matching

#### 3.1.5 Notification Bus
**Purpose**: Unified delivery system for all user communications.

**Business Capabilities**:
- Multi-channel support (Telegram, email, Slack, mobile push)
- Template system with domain-specific content
- Delivery status tracking
- Quiet hours and preference management
- Priority-based routing (urgent vs digest)

#### 3.1.6 Audit Service
**Purpose**: Immutable logging for compliance and security.

**Business Capabilities**:
- Append-only event log for all critical actions
- Structured data with queryable fields
- Configurable retention (default: 7 years)
- Export capabilities for regulatory requests
- Privacy-aware logging (PII handling)

#### 3.1.7 Identity Service
**Purpose**: Authentication and authorization for all platform users.

**Business Capabilities**:
- Secure passwordless authentication (phishing-resistant, no password database)
- Role-based access control (RBAC)
- Session management with configurable timeouts
- Multi-factor authentication support
- Domain-specific role definitions

> **Implementation Note**: Specific authentication mechanisms (WebAuthn, OAuth providers, etc.) are defined in ADD/FRD.

### 3.2 Out-of-Scope (Domain-Specific)

The following are **NOT** part of the platform core and must be defined in domain addendums:

| Category | Platform Core Provides | Domain Addendum Defines |
|----------|------------------------|-------------------------|
| Data Models | Database connection, migration framework | Specific schemas (candidates, trades) |
| Business Rules | Rule execution engine | Specific rules (risk limits, hiring criteria) |
| UI/Dashboards | Authentication guards, shared utilities | Domain-specific screens and layouts |
| Compliance Logic | Audit infrastructure | Domain-specific regulations |
| External Integrations | MCP framework | Domain-specific MCP tools |

---

## 4. Stakeholder Analysis

### 4.1 Platform Stakeholders

| Stakeholder | Role | Needs |
|-------------|------|-------|
| Senior Developer | Platform architect, core owner | Clean abstractions, testable code, documentation |
| Web Developers | Domain app builders | Stable APIs, clear interfaces, reusable components |
| Business Owner | Strategic direction | Cost control, measurable ROI, time-to-market |

### 4.2 Domain Stakeholders

Defined in respective domain addendums:
- **Crypto Domain**: Traders, regulatory bodies, exchanges
- **HR Domain**: HR team, candidates, clients, compliance officers

---

## 5. Success Metrics

### 5.1 Platform Health Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Workflow execution success rate | >99% | Failed workflows / Total workflows |
| HITL response latency | <10s P95 | Time from request creation to delivery |
| MCP request success rate | >99% | Successful requests / Total requests (with retries) |
| LLM cost per workflow | Tracked | Aggregated by workflow type |
| Audit log integrity | 100% | Zero tampering incidents |

### 5.2 Development Velocity Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Core platform delivery | 3 months | From project start to production-ready core |
| Domain app delivery | 3 months each | From core completion to domain production |
| Code reuse rate | >70% | Shared code / Total code (excluding UI) |

---

## 6. Implementation Strategy

### 6.1 Phased Approach

**Phase 1: Core Platform (Months 1-3)**
- Workflow Engine with state machine
- HITL Gateway with approval flow
- Identity Service (passwordless auth)
- Audit Service (event logging)
- Notification Bus (Telegram + email)
- MCP Integration Layer (basic)
- Minimal admin dashboard

**Phase 2: Domain Validation (Months 3-6)**
- **HR domain (Production Priority)**: Production deployment for agency operations; delivers business value
- **Crypto domain (Stress Test)**: Paper trading validation; tests platform under high-frequency conditions
- HR production deployment takes precedence in resource conflicts
- Crypto validation runs in parallel as constrained scope (no live capital)

**Phase 3: Production Hardening (Month 6+)**
- Security hardening
- Performance optimization
- Observability improvements
- Documentation completion

### 6.2 Build vs Buy

> **Note**: "Build" does not mean "from scratch." FRD/ADD will specify use of established libraries and frameworks to accelerate delivery. The decision here is whether the component is custom-integrated vs off-the-shelf SaaS.

| Component | Decision | Rationale |
|-----------|----------|-----------|
| Workflow Engine | Build* | Core differentiator; domain-agnostic state machine |
| HITL Gateway | Build* | Critical for compliance; must be integrated |
| MCP Layer | Build* | Abstracts all external integrations |
| LLM Gateway | Build* | Provider flexibility is strategic |
| Notification Bus | Build* | Unified across domains |
| Audit Service | Build* | Compliance requirements are specific |
| Identity Service | Integrate | Passwordless auth via industry standards |
| Database | Buy | Managed relational database service |
| Cache | Buy | Managed in-memory cache service |
| Message Queue | Buy (Phase 2+) | Deferred — Phase 1 uses Inngest event system for async communication |

*Build using established libraries/frameworks (specified in ADD/TSD), not from scratch.

---

## 7. Risk Analysis

### 7.1 Platform Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Over-abstraction | High | Medium | Keep core simple; domain-specific features stay in domains |
| Performance bottleneck | High | Low | Design for async; test under load early |
| Single point of failure | High | Low | Stateless services; managed database with automated backups (Phase 1); HA-tier database with replication (Phase 2+) |
| Scope creep | Medium | High | Strict Core vs Domain boundary; reject domain features in core |

### 7.2 Cross-Domain Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Security context bleed | Critical | Separate deployments, separate secrets, separate schemas |
| Priority conflict | Medium | Clear ownership; core stays "boringly stable" |
| Latency conflict | Medium | Separate queues for time-sensitive vs batch operations |

---

## 8. Compliance & Security

### 8.1 Platform-Level Compliance

The platform core provides these compliance capabilities to all domain applications:

- **Audit Logging**: Immutable, queryable, exportable
- **Data Encryption**: At rest (database) and in transit (TLS 1.3)
- **Access Control**: RBAC with domain-specific role definitions
- **Session Security**: Passwordless auth, configurable timeouts
- **Secrets Management**: Centralized via Vault or equivalent

### 8.2 Domain-Specific Compliance

Defined in domain addendums:
- **Crypto**: Financial transaction logging, regulatory reporting
- **HR**: DPA consent management, PII handling, DOLE/BIR compliance

---

## 9. Glossary

| Term | Definition |
|------|------------|
| **Agentic Core** | The shared platform infrastructure serving all domain applications |
| **Domain Application** | A business-specific application built on the platform (e.g., Crypto, HR) |
| **HITL** | Human-in-the-Loop; manual approval gate for automated decisions |
| **MCP** | Model Context Protocol; standard for AI tool/data integration |
| **Workflow** | A defined sequence of states and transitions representing a business process |
| **State Machine** | Computational model with explicit states, transitions, and actions |

---

## 10. Document References

| Document | Purpose | Location |
|----------|---------|----------|
| Crypto Domain Addendum | Trading-specific business requirements | `crypto-domain-addendum.md` |
| HR Domain Addendum | Agency operations requirements | `hr-domain-addendum.md` |
| Platform Core FRD | Functional requirements for core | `../02-requirements/platform-core-frd.md` |
| Multi-Model Review | Strategic analysis and consensus | `APTIVO_STRATEGY_MULTI_REVIEW.md` |
| Coding Guidelines | Development standards | `../05-guidelines/05a-Coding-Guidelines.md` |

---

## 11. Approval & Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Project Owner | | | |
| Senior Developer | | | |
| Business Stakeholder | | | |

---

**END OF PLATFORM CORE BRD**
