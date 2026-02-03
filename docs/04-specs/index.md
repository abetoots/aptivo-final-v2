---
id: TSD-PLATFORM-CORE
title: Technical Specifications Document (TSD)
status: Draft
version: 4.1.0
owner: '@owner'
last_updated: '2026-02-02'
parent: ../03-architecture/platform-core-add.md
---
# Technical Specifications Document (TSD)

**Aptivo Agentic Platform – Shared Infrastructure & Domain Applications**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v4.1.0 | 2026-02-02 | Document Review | Added Crypto Domain specs: database, api, mcp-servers, workflow-engine |
| v4.0.0 | 2026-02-02 | Multi-Model Review | Platform Core ADD alignment: added HITL Gateway, LLM Gateway, Notification Bus specs |
| v3.0.0 | 2025-01-15 | Document Review Panel | Major restructure: modular split, Phase 1 alignment, migration queue incorporation |
| v2.0.0 | 2025-06-04 | Abe Caymo | Functional implementation details |
| v1.0.0 | 2025-02-18 | Abe Caymo | Initial draft |

---

## 1. Introduction

### 1.1 Purpose

This document provides the detailed technical specifications required to implement Aptivo. It serves as the **index and root document** for a modular specification suite organized by domain.

### 1.2 Audience

- **Engineers** implementing specific features
- **Architects** reviewing technical decisions
- **QA Engineers** designing test strategies

### 1.3 Scope

Implementation specifications for **Phase 1 MVP** modules as defined in BRD v2.0.0:

| Category | Modules | Specification Status |
|----------|---------|---------------------|
| **Core Domain** | Candidate Management, Workflow Automation | ✅ Full specifications |
| **Foundational Integrations** | Identity & Access Management, File Storage | ✅ Full specifications |
| **Cross-Cutting Concerns** | API Standards, Database, Observability, Security | ✅ Full specifications |
| **Deferred (Phase 1+)** | Financial, Ticketing, PM, CRM | 📋 Interface contracts only |

### 1.4 Related Documents

| Document | Purpose |
|----------|---------|
| **Platform Core (Shared Infrastructure)** | |
| [Platform Core BRD](../01-strategy/platform-core-brd.md) | Core business requirements |
| [Platform Core FRD](../02-requirements/platform-core-frd.md) | Core functional requirements |
| [Platform Core ADD](../03-architecture/platform-core-add.md) | Core architecture (parent of this TSD) |
| **Domain Addendums** | |
| [Crypto Domain BRD](../01-strategy/crypto-domain-addendum.md) | Trading domain business requirements |
| [HR Domain BRD](../01-strategy/hr-domain-addendum.md) | HR domain business requirements |
| [Crypto Domain FRD](../02-requirements/crypto-domain-frd.md) | Trading domain functional requirements |
| [HR Domain FRD](../02-requirements/hr-domain-frd.md) | HR domain functional requirements |
| **Development Guidelines** | |
| [Coding Guidelines](../05-guidelines/05a-Coding-Guidelines.md) | Code style, naming conventions |

---

## 2. Modular Specification Index

The TSD is organized into focused specification documents:

```
docs/04-specs/
├── index.md                           ← You are here (root index)
│
├── # Platform Core Services (Build - Unique Differentiators)
├── platform-core/
│   ├── index.md                       ← Platform core services index
│   ├── mcp-layer.md                   ← MCP tool consumption, AgentKit, resilience
│   ├── hitl-gateway.md                ← HITL approval tokens, Inngest integration
│   └── llm-gateway.md                 ← Provider abstraction, cost tracking, budgets
│
├── # Notification Service (Buy - Novu SaaS)
├── notification-bus.md                ← Novu integration spec
│
├── # Foundational Infrastructure
├── project-structure.md               ← Monorepo structure, Turborepo config, package boundaries
├── common-patterns.md                 ← Error types, event bus, caching
├── database.md                        ← Schema conventions, entity definitions (updated)
├── api.md                             ← REST standards, OpenAPI, error responses
├── authentication.md                  ← IdP integration, JWT, RBAC, Zero Trust
├── file-storage.md                    ← S3-compatible storage, retention, malware scanning
├── configuration.md                   ← Environment, secrets, health checks
├── observability.md                   ← Logging, metrics, tracing
│
├── # HR Domain Modules
├── hr/
│   ├── index.md                       ← HR domain index
│   ├── candidate-management.md        ← CM module specifications
│   └── workflow-automation.md         ← WA module specifications (HR-specific)
│
├── # Crypto Domain Modules
├── crypto/
│   ├── index.md                       ← Crypto domain index
│   ├── database.md                    ← 8 trading tables, DuckDB analytics (Phase 2+)
│   ├── api.md                         ← 21 REST endpoints, WebSocket events
│   ├── mcp-servers.md                 ← 13 MCP integrations (blockchain, market data)
│   └── workflow-engine.md             ← 6 LangGraph.js trading workflows
│
└── # Future Domains
    └── deferred-contracts.md          ← Interface contracts for Phase 1+ modules
```

---

## 3. Technology Stack

### 3.1 Core Stack

| Category | Technology | Version | Notes |
|----------|------------|---------|-------|
| **Package Manager** | pnpm | 9.x | Workspace protocol, strict peer deps |
| **Build Orchestration** | Turborepo | 2.x | Task caching, parallel execution |
| **Frontend** | Next.js | 16.x | App Router, Server Components, Turbopack |
| **Frontend** | React | 19.x | Concurrent features, use() hook |
| **Frontend** | TailwindCSS | 4.x | CSS-first configuration |
| **Backend Runtime** | Node.js | 24.x LTS | ES2024+ features |
| **Language** | TypeScript | 5.9.x | Strict mode, isolatedDeclarations |
| **Database** | PostgreSQL | 18.x | Primary data store |
| **ORM** | Drizzle ORM | Latest | Type-safe queries |
| **Validation** | Zod | 4.x | Runtime schema validation |
| **Testing** | Vitest | 4.x | Unit/integration tests |
| **E2E Testing** | Playwright | Latest | End-to-end tests |

> **Note:** See [specs/project-structure.md](project-structure.md) for monorepo configuration and build pipeline details.

### 3.2 Infrastructure

| Capability | Reference Implementation | Version | Notes |
|------------|-------------------------|---------|-------|
| **Caching** | Redis | 7.x | Session, query cache |
| **Object Storage** | MinIO (S3-compatible) | Latest | Document/media storage |
| **API Gateway** | Traefik | 3.x | Edge routing, TLS termination |
| **Messaging** | NATS JetStream | 2.x | Async event bus |
| **Containerization** | Podman/Docker | Latest | OCI-compliant |
| **CI/CD** | GitHub Actions | - | Automated pipelines |

### 3.3 Observability

| Capability | Technology | Notes |
|------------|------------|-------|
| **Tracing** | OpenTelemetry | Distributed tracing |
| **Metrics** | Prometheus | Time-series metrics |
| **Dashboards** | Grafana | Visualization |
| **Error Tracking** | Sentry | Exception monitoring |
| **Log Aggregation** | Loki | Centralized logging |

### 3.4 Identity & Access

| Capability | Reference Implementation | Notes |
|------------|-------------------------|-------|
| **Identity Provider** | Supabase Auth | Managed, 50K MAU free, magic links |
| **Session Management** | Supabase Auth SDK | Automatic token refresh |
| **MFA** | TOTP (Phase 1), WebAuthn (Phase 2) | Second factor authentication |

> **Note:** Per ADD v2.0.0 (Multi-Model Consensus 2026-02-02), Supabase Auth is selected for Phase 1. It provides passwordless authentication (magic links) per BRD requirement with standard OIDC/JWT tokens for future migration flexibility. See [specs/authentication.md](authentication.md) for integration details.

---

## 4. Architecture Principles

### 4.1 Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Type Safety** | TypeScript strict mode, Zod runtime validation |
| **Explicit Dependencies** | Dependency injection via interfaces |
| **Functional Core** | Pure business logic, effects at boundaries |
| **Result Types** | Explicit error handling, no thrown exceptions in domain |
| **Event-Driven** | Async communication via NATS JetStream |

### 4.2 Error Handling Philosophy

All services use discriminated union error types:

```typescript
// base error contract - see specs/common-patterns.md for full definitions
type ServiceError =
  | { _tag: 'ValidationError'; field: string; message: string }
  | { _tag: 'NotFoundError'; entity: string; id: string }
  | { _tag: 'PersistenceError'; operation: string; cause: unknown }
  | { _tag: 'NetworkError'; service: string; cause: unknown };

// result type for all service operations
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

### 4.3 API Error Responses (RFC 7807)

All API endpoints return errors following RFC 7807 Problem Details format.

**Canonical Reference:** See [common-patterns.md](common-patterns.md#4-api-error-mapping-rfc-7807) for the complete `ProblemDetails` interface definition, error type URIs, and error-to-HTTP status mapping.

See [api.md](api.md) for additional API standards.

---

## 5. Security Posture

### 5.1 Zero Trust Principles

Per ADD v2.0.0 Section 6:

- **Never Trust, Always Verify:** Every request authenticated and authorized
- **Least Privilege:** Minimum necessary permissions
- **Assume Breach:** Defense in depth, audit everything

### 5.2 Data Classification

| Classification | Examples | Controls |
|---------------|----------|----------|
| **PII** | Name, email, phone, address | Encryption at rest, audit logging, retention limits |
| **Sensitive** | Salary, performance reviews | Role-based access, column-level encryption |
| **Internal** | Workflow configs, templates | Standard access controls |
| **Public** | Job postings | No special controls |

### 5.3 Compliance Requirements

| Regulation | Scope | Key Controls |
|------------|-------|--------------|
| **RA 10173 (PH DPA)** | Philippine candidate data | Consent, access rights, breach notification |
| **GDPR** | EU candidate data | Data minimization, right to erasure, DPO |
| **PCI DSS 4.0** | Payment processing (Phase 1+) | Network segmentation, encryption, audit trails |
| **SOC 2 Type II** | All systems | Trust criteria mapping, continuous monitoring |

---

## 6. Data Retention Policy

### 6.1 Retention Tiers

| Tier | Duration | Trigger | Action |
|------|----------|---------|--------|
| **Active** | Indefinite | Record in use | Full access |
| **Dormant** | 90 days inactivity | Last modification | Soft-delete, restricted access |
| **Archived** | 24 months from dormancy | Dormancy period end | Anonymize PII, retain for legal defense |
| **Purged** | After archive period | Archive expiry | Permanent deletion |

### 6.2 Data Subject Requests

- **Access Request:** 30-day response SLA
- **Erasure Request:** 30-day response SLA, verify legal holds
- **Portability Request:** JSON export within 30 days

---

## 7. Quick Reference

### 7.1 Specification Documents

| Document | Primary Content |
|----------|----------------|
| **Platform Core Services (Build)** | |
| [platform-core/index.md](platform-core/index.md) | Platform core services overview |
| [platform-core/mcp-layer.md](platform-core/mcp-layer.md) | MCP tool consumption via AgentKit |
| [platform-core/hitl-gateway.md](platform-core/hitl-gateway.md) | HITL approval tokens, Inngest integration, policy engine |
| [platform-core/llm-gateway.md](platform-core/llm-gateway.md) | Provider abstraction, cost tracking, budgets, observability |
| **Notification Service (Buy)** | |
| [notification-bus.md](notification-bus.md) | Novu SaaS integration |
| **Foundational Infrastructure** | |
| [project-structure.md](project-structure.md) | Monorepo structure, Turborepo config, package boundaries |
| [common-patterns.md](common-patterns.md) | Error types, Result wrapper, event bus patterns |
| [database.md](database.md) | Schema conventions, entity definitions, indexes |
| [api.md](api.md) | REST standards, OpenAPI generation, rate limiting |
| [authentication.md](authentication.md) | IdP integration, JWT structure, RBAC mapping |
| [file-storage.md](file-storage.md) | S3 integration, upload flows, retention |
| [configuration.md](configuration.md) | Environment variables, secrets, health checks |
| [observability.md](observability.md) | Logging standards, metrics, tracing |
| **HR Domain Modules** | |
| [hr/index.md](hr/index.md) | HR domain index and overview |
| [hr/candidate-management.md](hr/candidate-management.md) | CM module: entities, APIs, workflows |
| [hr/workflow-automation.md](hr/workflow-automation.md) | WA module: triggers, actions, saga patterns |
| **Crypto Domain Modules** | |
| [crypto/index.md](crypto/index.md) | Crypto domain index and overview |
| [crypto/database.md](crypto/database.md) | 8 trading tables, DuckDB analytics (Phase 2+) |
| [crypto/api.md](crypto/api.md) | 21 REST endpoints, WebSocket events |
| [crypto/mcp-servers.md](crypto/mcp-servers.md) | 13 MCP integrations (blockchain, market data) |
| [crypto/workflow-engine.md](crypto/workflow-engine.md) | 6 LangGraph.js trading workflows |
| **Future Domains** | |
| [deferred-contracts.md](deferred-contracts.md) | Interface contracts for Financial, Ticketing, PM, CRM |

### 7.2 External Service Timeouts

| Service | Timeout | Retry Strategy |
|---------|---------|----------------|
| Payment Gateway | 10s | 3x exponential backoff (1s base) |
| Email Service | 5s | 2x with 500ms delay |
| Calendar Service | 3s | No retry (user-initiated) |
| File Storage | 15s | 3x linear backoff (2s intervals) |
| IdP Token Validation | 2s | 1x after 100ms |

### 7.3 Cache TTL Reference

| Pattern | Example | TTL |
|---------|---------|-----|
| Entity by ID | `candidate:123` | 10 min |
| List queries | `candidates:list:abc123` | 5 min |
| Aggregations | `stats:candidates:2025-01` | 1 hour |
| User permissions | `user:permissions:456` | 15 min |
| IdP JWKS | `idp:jwks` | 1 hour |

---

## 8. Migration Strategy

### 8.1 Guiding Principle

All new, standalone features must use the functional patterns demonstrated in the Candidate Management module (CM as reference implementation for Phase 1).

### 8.2 Refactoring Triggers

Existing modules should be refactored to functional patterns when:

1. A bug is being fixed within that module
2. A new feature requires significant changes to that module
3. Technical debt score exceeds threshold (see 05d-Change-Risk-Management.md)

### 8.3 Boundary Management

When new functional code interfaces with legacy code, use adapter functions to translate between paradigms, preventing pattern mixing.

---

## Appendix A: Changelog

### v3.0.0 (2025-01-15)

**Major restructure based on document review panel consensus:**

- **Structure:** Split monolithic TSD into modular specification documents
- **Alignment:** Re-scoped to Phase 1 MVP per BRD v2.0.0
- **Tech Stack:** Updated to stable versions (Next.js 14.x, React 18.x)
- **Added:** Zod for runtime validation, RFC 7807 error responses
- **Added:** Zero Trust security posture, data retention policy
- **Added:** Missing Phase 1 modules (Workflow Automation, IAM, File Storage)
- **Moved:** Financial module implementation → interface contracts only
- **Fixed:** Database schema conventions (UUID/ULID PKs, normalized relations)
- **Fixed:** NATS configuration (removed deprecated STAN cluster ID)
- **Incorporated:** Migration queue items (JSON schemas, saga patterns)
