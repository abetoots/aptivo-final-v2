---
id: ADD-MKJP625C
title: 3. Application Design Document
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
---
# 3. Application Design Document

Created by: Abe Caymo
Created time: February 18, 2025 2:09 PM
Category: Engineering
Last edited by: Abe Caymo
Last updated time: June 2, 2025 11:58 AM

# **Application Design Document (ADD)**

*Outsourcing Digital Agency – Integrated Internal Systems Ecosystem*

*v2.0.0 – 01/14/2026*

> **Revision History (v2.0.0):** Multi-model document review conducted (Gemini 3 Pro Preview, Gemini 2.5 Pro, Codex MCP). Consensus: 2.8/10 - document required major restructuring. Changes applied: Aligned architecture with BRD v2.0.0 phased approach, reorganized into Phase 1 Core Domain vs Integration Contexts, added Security Architecture (Zero Trust), added HA/DR Architecture, added Observability Architecture (OpenTelemetry), added Data Privacy Architecture, converted deferred modules to Integration Contexts, adopted "Capability (Reference Implementation)" naming convention, moved implementation details to TSD references.

---

## 1. Introduction

- **Purpose:** This document outlines the technical architecture for the Integrated Internal Systems Ecosystem, aligned with the phased approach defined in BRD v2.0.0. It translates the functional requirements from FRD v2.0.0 into a high-level technical design, serving as the blueprint for Phase 1 MVP development.

- **Scope:** This ADD covers:
  - **Phase 1 MVP:** Detailed architecture for Core Domain modules (Candidate Management, Workflow Automation) and Foundational Integrations (Identity & Access Management, File Storage)
  - **Integration Contexts:** Interface contracts for deferred modules pending Buy vs Build analysis
  - **Cross-Cutting Concerns:** Security, observability, data privacy, and disaster recovery architectures

- **Audience:** System architects, technical leads, and development teams who require a high-level understanding of the system's structure before proceeding to detailed implementation (TSD).

- **Document Boundaries:**
  - **ADD (This Document):** High-level architecture, component interactions, patterns, and design rationale
  - **TSD (Separate):** Implementation details, code examples, schemas, API specifications, database designs

---

## 2. Architectural Overview

The system is designed as a modular, service-oriented architecture aligned with the BRD's phased rollout strategy.

### 2.1 Architectural Principles

- **Phase-Aligned Development:** Architecture prioritizes Phase 1 MVP components; deferred modules are defined as integration interfaces only.

- **Build vs Buy Alignment:** Core Domain modules receive detailed architecture. Foundational integrations and deferred modules are designed as pluggable interfaces to accommodate purchased solutions.

- **API-First Approach:** All inter-service communication occurs through well-defined RESTful APIs, enabling interoperability and supporting future SaaS transition (Phase 2).

- **Event-Driven Decoupling:** Asynchronous messaging enables loose coupling between modules, improving resilience and enabling future AI-driven automation.

### 2.2 Technology Strategy

Technologies are selected based on capability requirements. Specific implementations may change during TSD phase based on detailed analysis.

| Capability | Required Characteristics | Reference Implementation |
|------------|-------------------------|-------------------------|
| Edge API Gateway | Dynamic routing, SSL termination, rate limiting, Let's Encrypt support | Traefik |
| Asynchronous Messaging | Pub/sub, at-least-once delivery, schema registry support | NATS |
| S3-Compatible Object Storage | High availability, versioning, access control | Minio (or cloud S3) |
| Relational Database | ACID compliance, JSON support, full-text search | PostgreSQL |
| Workflow Orchestration Platform | Visual builder, API triggers, retry logic, scheduling | See Section 3.2 |
| Identity Provider | OIDC/OAuth 2.0, RBAC, MFA, SSO | Keycloak or Authentik |
| Observability Stack | Metrics, logs, traces (OpenTelemetry compatible) | Prometheus, Grafana, Jaeger |
| Error Tracking | Exception capture, alerting, release tracking | Sentry |

---

## 3. Phase 1 MVP: Core Domain Architecture

These modules represent the agency's unique value proposition and require detailed architectural design for custom development.

### 3.1 Candidate Management Module

**FRD Reference:** CM1-CM5
**Success Metric:** Reduce time-to-hire by 25%

#### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Candidate Service                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Candidate  │  │  Workflow   │  │     Contract        │  │
│  │  Repository │  │   Engine    │  │     Subsystem       │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│  ┌──────┴────────────────┴─────────────────────┴──────────┐  │
│  │              Candidate Database (PostgreSQL)           │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐         ┌──────────┐
   │   IAM    │        │  Events  │         │   File   │
   │ Service  │        │  (NATS)  │         │  Storage │
   └──────────┘        └──────────┘         └──────────┘
```

#### Component Design

- **Candidate Repository:**
  - Stores candidate profiles with indexing for search (name, skills, status)
  - Duplicate detection via email/phone matching
  - All modifications emit events to NATS for downstream consumers

- **Workflow Engine (Internal):**
  - Manages candidate lifecycle stages per FRD CM2
  - Configurable stage definitions with SLA thresholds
  - Stage transitions trigger notifications via Workflow Automation Module

- **Contract Subsystem:**
  - Template engine for modular contract generation
  - Version tracking with immutable history
  - Compliance validation for Philippine labor law requirements

#### Integration Points

| Integration | Protocol | Purpose |
|-------------|----------|---------|
| IAM Service | OIDC | Authentication, role-based authorization |
| File Storage | REST (S3 API) | Resume, contract document storage |
| Workflow Automation | REST + Events | Trigger automations on stage changes |
| Event Bus | NATS | Publish candidate.status.changed events |

### 3.2 Workflow Automation Module

**FRD Reference:** WA1-WA3
**Success Metric:** Automate 60% of routine HR tasks

> **⚠️ Strategic Note:** BRD v2.0.0 classifies Workflow Automation as Core Domain (Custom Build). The architecture below proposes a **Custom Automation Service** that owns business logic while leveraging infrastructure for execution. This approach balances the BRD's mandate for custom capability with engineering pragmatism. **Stakeholder validation recommended** on build-depth decision.

#### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Custom Automation Service                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  Rule Builder   │  │  Execution      │  │  Scheduler  │  │
│  │  (Custom UI)    │  │  Coordinator    │  │  Service    │  │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘  │
│           │                    │                   │         │
│  ┌────────┴────────────────────┴───────────────────┴──────┐  │
│  │              Workflow Definition Store                  │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐         ┌──────────┐
   │ Execution│        │  Events  │         │  Target  │
   │ Platform │        │  (NATS)  │         │ Services │
   └──────────┘        └──────────┘         └──────────┘
```

#### Component Design

- **Rule Builder (Custom):**
  - Visual interface for non-technical users to define automation rules
  - Stores rule definitions in agency-owned database
  - Supports trigger conditions, actions, and conditional branching

- **Execution Coordinator (Custom):**
  - Interprets rule definitions and orchestrates execution
  - Manages retry logic and dead-letter handling
  - Logs all executions for audit trail

- **Execution Platform (Infrastructure):**
  - **Option A (Full Custom):** Custom worker pool executing rule actions
  - **Option B (Platform-Assisted):** Self-hosted workflow engine (e.g., Windmill.dev) providing execution infrastructure while agency owns rule definitions
  - **Decision:** To be finalized in TSD based on build capacity assessment

- **Scheduler Service:**
  - Manages recurring and scheduled automations
  - Cron-compatible scheduling with timezone support

#### Integration Points

| Integration | Protocol | Purpose |
|-------------|----------|---------|
| All Modules | REST | Execute actions (send email, update status, create task) |
| Event Bus | NATS | Subscribe to triggers (candidate.status.changed) |
| Webhook Endpoints | REST | Receive external triggers |

---

## 4. Phase 1 MVP: Foundational Integrations

These capabilities are commoditized domains where integration with external providers is preferred over custom development.

### 4.1 Identity & Access Management Integration

**FRD Reference:** IAM1-IAM2
**Implementation:** Integrate with dedicated identity provider (Keycloak or Authentik - selection in TSD)

#### Integration Architecture

```
┌─────────────┐     OIDC      ┌─────────────────┐
│   Client    │◄─────────────►│ Identity        │
│   Browser   │               │ Provider        │
└──────┬──────┘               │ (Keycloak/      │
       │                      │  Authentik)     │
       │ Bearer Token         └────────┬────────┘
       ▼                               │
┌─────────────┐    Token        ┌──────┴──────┐
│ API Gateway │◄───Validation──►│   JWKS      │
│ (Traefik)   │                 │  Endpoint   │
└──────┬──────┘                 └─────────────┘
       │
       ▼ Authenticated Request
┌─────────────┐
│  Backend    │
│  Services   │
└─────────────┘
```

#### Required Interface Contract

The application expects the following from any identity provider:

- **Authentication:** OIDC-compliant login flow with PKCE
- **Token Format:** JWT with standard claims (sub, roles, exp)
- **Role Mapping:** Roles defined in FRD 5.1 (System Admin, Recruiter, Hiring Manager, etc.)
- **MFA Support:** Enforced for elevated permission roles
- **Session Management:** Configurable token expiration (default 8 hours)

### 4.2 File Storage Integration

**FRD Reference:** FS1-FS2
**Implementation:** S3-compatible object storage (Minio or cloud provider - selection in TSD)

#### Integration Architecture

```
┌─────────────┐                      ┌─────────────────┐
│  Backend    │───── Presigned ─────►│  S3-Compatible  │
│  Service    │      URL             │  Storage        │
└──────┬──────┘                      └────────┬────────┘
       │                                      │
       │ Metadata                             │ Binary
       ▼                                      ▼
┌─────────────┐                      ┌─────────────────┐
│  PostgreSQL │                      │  Object Store   │
│  (metadata) │                      │  (files)        │
└─────────────┘                      └─────────────────┘
```

#### Required Interface Contract

- **Upload:** Presigned URL generation for client-direct upload
- **Download:** Presigned URL with expiration for secure retrieval
- **Access Control:** Bucket policies aligned with application RBAC
- **Versioning:** Object versioning enabled for contract documents
- **Malware Scan:** Integration point for file scanning before storage confirmation

---

## 5. Integration Contexts (Deferred Modules)

Per BRD v2.0.0 Section 3.4, the following modules require Buy vs Build analysis before architectural commitment. This section defines the **interface contracts** required by Core Domain modules, regardless of whether these capabilities are built or purchased.

### 5.1 Financial & Administrative Interface

**Status:** Pending Buy vs Build analysis
**FRD Reference:** FA1-FA4 (Deferred)

#### Required Interface

```typescript
interface FinancialService {
  // Payroll integration for hired candidates
  createPayrollRecord(candidateId: string, compensation: CompensationPackage): Promise<PayrollRecord>;

  // Invoice generation for client billing
  generateInvoice(clientId: string, lineItems: InvoiceItem[]): Promise<Invoice>;

  // Expense linkage for candidate onboarding costs
  linkExpense(candidateId: string, expenseId: string): Promise<void>;
}
```

**Integration Pattern:** The Candidate Management module will call this interface when a candidate reaches "Hired" status. Whether this interface connects to a custom database, Xero API, or QuickBooks API is determined by the Buy vs Build analysis.

### 5.2 Customer Support & Ticketing Interface

**Status:** Pending Buy vs Build analysis
**FRD Reference:** CT1-CT5 (Deferred)

#### Required Interface

```typescript
interface TicketingService {
  // Create support ticket from candidate or client issue
  createTicket(request: TicketRequest): Promise<Ticket>;

  // Link ticket to candidate or client record
  linkToEntity(ticketId: string, entityType: 'candidate' | 'client', entityId: string): Promise<void>;

  // Retrieve tickets for dashboard display
  getTicketsByEntity(entityType: string, entityId: string): Promise<Ticket[]>;
}
```

**Integration Pattern:** May integrate with Zammad, osTicket, Zendesk, or custom solution based on analysis outcome.

### 5.3 Project Management Interface

**Status:** Pending Buy vs Build analysis
**FRD Reference:** PM1-PM3 (Deferred)

#### Required Interface

```typescript
interface ProjectService {
  // Create onboarding project for hired candidate
  createProject(name: string, linkedCandidateId?: string): Promise<Project>;

  // Create task within project
  createTask(projectId: string, task: TaskDefinition): Promise<Task>;

  // Link task to candidate activity
  linkTaskToCandidate(taskId: string, candidateId: string): Promise<void>;
}
```

### 5.4 CRM Interface

**Status:** Pending Buy vs Build analysis
**FRD Reference:** CRM1-CRM4 (Deferred)

#### Required Interface

```typescript
interface CRMService {
  // Link candidate to client account
  linkCandidateToClient(candidateId: string, clientId: string): Promise<void>;

  // Retrieve client for candidate dashboard
  getClientById(clientId: string): Promise<Client>;

  // Log communication event
  logInteraction(clientId: string, interaction: Interaction): Promise<void>;
}
```

---

## 6. Security Architecture

Aligned with BRD requirement for Zero Trust posture (BRD Section 3.3).

### 6.1 Zero Trust Principles

- **Never Trust, Always Verify:** Every request is authenticated and authorized, regardless of network location.
- **Least Privilege:** Users and services receive minimum necessary permissions.
- **Assume Breach:** Design with the assumption that perimeter defenses may be compromised.

### 6.2 Authentication & Authorization

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layers                           │
├─────────────────────────────────────────────────────────────┤
│  1. Edge (API Gateway)                                       │
│     - TLS 1.3 termination                                    │
│     - Rate limiting                                          │
│     - JWT validation                                         │
├─────────────────────────────────────────────────────────────┤
│  2. Service-to-Service                                       │
│     - mTLS between services                                  │
│     - Service mesh authentication                            │
├─────────────────────────────────────────────────────────────┤
│  3. Application                                              │
│     - RBAC enforcement per FRD 5.1                           │
│     - Attribute-based access for sensitive data              │
├─────────────────────────────────────────────────────────────┤
│  4. Data                                                     │
│     - Encryption at rest (AES-256)                           │
│     - Column-level encryption for PII                        │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Security Controls

| Control | Implementation |
|---------|----------------|
| Authentication | OIDC via Identity Provider |
| Authorization | JWT claims + application RBAC |
| Transport Security | TLS 1.3 (external), mTLS (internal) |
| Secret Management | External secrets store (Vault or equivalent) |
| Audit Logging | All security events to immutable log store |

---

## 7. High Availability & Disaster Recovery Architecture

Aligned with FRD 8.2 availability targets (99.9% uptime, 4h RTO, 1h RPO).

### 7.1 Availability Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    High Availability                         │
├─────────────────────────────────────────────────────────────┤
│  Application Layer                                           │
│  - Stateless services with horizontal scaling                │
│  - Health checks and automatic restart                       │
│  - Rolling deployments with zero downtime                    │
├─────────────────────────────────────────────────────────────┤
│  Database Layer                                              │
│  - Primary-replica configuration                             │
│  - Automatic failover                                        │
│  - Connection pooling                                        │
├─────────────────────────────────────────────────────────────┤
│  Storage Layer                                               │
│  - Object storage replication                                │
│  - Cross-region backup (if applicable)                       │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Backup & Recovery

| Component | Backup Frequency | Retention | RTO | RPO |
|-----------|-----------------|-----------|-----|-----|
| PostgreSQL | Continuous WAL + Daily full | 30 days | 2 hours | 15 minutes |
| Object Storage | Cross-zone replication | 90 days | 1 hour | Near-zero |
| Configuration | Git-versioned | Indefinite | 30 minutes | Zero |

### 7.3 Disaster Recovery Procedure

1. **Detection:** Automated monitoring alerts on service degradation
2. **Assessment:** Determine scope of failure (service, zone, region)
3. **Recovery:** Execute runbook for affected component
4. **Validation:** Verify data integrity and service functionality
5. **Post-mortem:** Document incident and update procedures

---

## 8. Observability Architecture

Aligned with BRD requirement for AI-Enablement Foundation (machine-readable event logs) and modern observability standards.

### 8.1 OpenTelemetry Integration

All services implement OpenTelemetry instrumentation for unified observability.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Service A  │     │  Service B  │     │  Service C  │
│  (OTel SDK) │     │  (OTel SDK) │     │  (OTel SDK) │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ▼
              ┌─────────────────────┐
              │  OTel Collector     │
              └──────────┬──────────┘
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Metrics    │   │   Logs      │   │   Traces    │
│ (Prometheus)│   │  (Loki)     │   │  (Jaeger)   │
└─────────────┘   └─────────────┘   └─────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Grafana Dashboard  │
              └─────────────────────┘
```

### 8.2 Observability Standards

| Signal | Format | Retention | Purpose |
|--------|--------|-----------|---------|
| Metrics | Prometheus format | 15 days (high-res), 1 year (aggregated) | Performance monitoring, alerting |
| Logs | Structured JSON | 90 days | Debugging, audit trail |
| Traces | OpenTelemetry | 7 days | Request flow analysis |

### 8.3 AI-Enablement

Per BRD Section 3.5, all workflow events are emitted in machine-readable format:

- **Event Format:** JSON with standardized schema (defined in TSD)
- **Event Bus:** NATS with schema registry
- **Retention:** Events retained for AI training/analysis (configurable)
- **Access:** API endpoint for programmatic event retrieval (INT1 requirement)

---

## 9. Data Privacy Architecture

Aligned with FRD 5.2 compliance requirements (Philippine DPA, GDPR).

### 9.1 PII Classification

| Classification | Examples | Storage | Access |
|----------------|----------|---------|--------|
| PII-High | SSS number, TIN, bank account | Encrypted column, audit logged | Admin + Explicit consent |
| PII-Medium | Email, phone, address | Encrypted at rest | Role-based (Recruiter+) |
| PII-Low | Name, job title | Standard encryption | All authenticated users |

### 9.2 Data Residency

- **Philippine Citizen Data:** Must remain in Philippine-compliant data centers
- **Implementation:** Database and storage configured with region constraints
- **Verification:** Automated compliance checks in deployment pipeline

### 9.3 Privacy Operations

| Operation | Trigger | Implementation |
|-----------|---------|----------------|
| Data Export (SAR) | User request | Automated export job generates JSON/CSV |
| Anonymization | Retention expiry or request | Replace PII with anonymized identifiers |
| Consent Withdrawal | User request | Flag record, restrict processing |
| Audit Access | Compliance review | Query audit log by candidate ID |

---

## 10. Cross-Cutting Services

### 10.1 Event Bus Architecture

All inter-module communication uses asynchronous events for decoupling.

- **Technology:** Asynchronous messaging service (Reference: NATS)
- **Pattern:** Publish-subscribe with topic-based routing
- **Schema:** All events validated against JSON Schema (defined in TSD)
- **Idempotency:** Consumers must handle duplicate events via eventId checking

### 10.2 API Gateway

- **Technology:** Edge API Gateway (Reference: Traefik)
- **Responsibilities:** Routing, rate limiting, SSL termination, authentication passthrough
- **Configuration:** Infrastructure-as-code, version controlled

---

## 11. Future Enhancements (Phase 2+)

Per BRD Section 2.1.1, the following are explicitly deferred:

### 11.1 SaaS Commercialization (Phase 2)

- Multi-tenant architecture
- Client-specific module packaging
- Billing and metering integration
- Public API documentation

### 11.2 AI Agent Integration

- Expose module capabilities as "skills" for AI agents
- Event stream access for AI observation and learning
- Automated decision support based on workflow patterns

---

## 12. Appendices

### Appendix A: Technology Reference Implementations

The following tools are proposed based on capability requirements. Final selection confirmed in TSD.

| Capability | Reference Implementation | Alternatives to Evaluate |
|------------|-------------------------|-------------------------|
| API Gateway | Traefik | Kong, Nginx |
| Object Storage | Minio | AWS S3, Ceph |
| Identity Provider | Keycloak | Authentik, Auth0 |
| Messaging | NATS | RabbitMQ, Redis Streams |
| Workflow Platform | Windmill.dev | Temporal, custom |
| Database | PostgreSQL | None (selected) |

### Appendix B: Migration Queue Integration

Items from BRD/FRD reviews to be incorporated:

| Source | Item | Status |
|--------|------|--------|
| BRD | Keycloak/Authentik for IAM | ✅ Incorporated in Section 4.1 |
| BRD | S3-compatible storage | ✅ Incorporated in Section 4.2 |
| BRD | Zammad/osTicket for ticketing | ✅ Noted in Section 5.2 |
| FRD | NATS messaging | ✅ Incorporated in Section 10.1 |

### Appendix C: References

- BRD v2.0.0 - Business Requirements Document
- FRD v2.0.0 - Functional Requirements Document
- TSD - Technical Specification Document (detailed implementation)
- OpenAPI Specification - API contract definitions
- OpenTelemetry Documentation - Observability standards
