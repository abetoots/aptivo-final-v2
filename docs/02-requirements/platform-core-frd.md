---
id: FRD-PLATFORM-CORE
title: Platform Core - Functional Requirements Document
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-02'
parent: ../01-strategy/platform-core-brd.md
children:
  - crypto-domain-frd.md
  - hr-domain-frd.md
---

# Platform Core Functional Requirements Document (FRD)

**Version**: 1.0.0
**Date**: February 2, 2026
**Status**: Draft (Multi-Model Consensus Review)
**Parent Document**: `../01-strategy/platform-core-brd.md`

---

## 1. Executive Summary

This document defines the functional requirements for the **Aptivo Agentic Core**, the shared infrastructure underpinning both the Crypto Trading and HR Operations domains.

The core architecture follows the **Durable Execution** pattern, ensuring that long-running business processes (spanning days or weeks) can execute reliably despite server restarts, network failures, or downstream service outages. It provides standardized services—Workflow, HITL, MCP, LLM, Notification, Audit, and Identity—that domain applications leverage to implement specific business logic.

**Scope Boundary**: This document defines *what the system does* from a functional perspective. Implementation details (technology choices, database schemas, API specifications) are defined in the ADD/TSD.

---

## 2. Definitions & Acronyms

| Term | Definition |
|------|------------|
| **Durable Execution** | A paradigm where code execution state is persisted, allowing transparent retries and sleep without resource consumption |
| **Activity** | A discrete step in a workflow that performs a side effect (e.g., API call, DB write) |
| **Workflow** | A deterministic sequence of logic that orchestrates Activities |
| **Signal** | An external event sent to a running workflow to change its state (e.g., HITL approval) |
| **HITL** | Human-in-the-Loop; manual approval gate for automated decisions |
| **MCP** | Model Context Protocol; standard for AI tool/data integration |

---

## 3. Workflow Engine

**Purpose**: Orchestrate long-running, multi-step business processes with state persistence and fault tolerance.
**Pattern Reference**: Durable Execution / Statecharts.
**BRD Reference**: BO-CORE-001, Section 3.1.1

### FR-CORE-WFE-001: Define Workflows as Explicit States and Transitions

**Requirement**: The system shall support defining workflows as explicit states with allowed transitions.

**Acceptance Criteria**:
- Can create, update, and delete workflow definitions with states and allowed transitions
- Invalid transitions are rejected and recorded as errors
- Workflow definitions are versioned with active/inactive flags
- **Phase 1**: Workflows are defined via SDK/Code by developers
- **Phase 2+**: Visual rule builder for non-technical users (deferred)

**FRD vs ADD/TSD**:
- FRD: workflow definition capability, versioning, transition validation
- ADD/TSD: state machine library choice, schema design, execution runtime

> **Traceability to Original FRD (WA1-WA3)**:
> - **WA1 (Rule-Based Workflow Engine)**: Covered by FR-CORE-WFE-001 through FR-CORE-WFE-007. Trigger conditions = FR-CORE-WFE-004, Actions = workflow nodes, Retry logic = FR-CORE-WFE-005.
> - **WA2 (Visual Rule Builder)**: Strategically deferred to Phase 2. Phase 1 uses SDK/Code definitions.
> - **WA3 (Scheduled/Recurring Automation)**: Covered by FR-CORE-WFE-003 (Durable Timers) which supports scheduling and recurring operations.

### FR-CORE-WFE-002: Durable State Persistence

**Requirement**: The system shall persist the state of executing workflows such that execution can resume automatically from the last successful step after a system crash or restart.

**Acceptance Criteria**:
- A workflow interrupted mid-execution (e.g., by server kill) resumes automatically upon system restart
- No business logic is re-executed for steps already completed (replay capability)
- Local variable state is preserved across restarts without manual intervention
- Workflow instance has current state and full transition history
- History includes timestamps, actor (system/user), and reason metadata
- Instances can be queried by status, owner, and time range

### FR-CORE-WFE-003: Durable Timers (Sleep Capability)

**Requirement**: The system shall support "sleep" or "wait" operations for extended durations (up to 30 days) without consuming active compute resources.

**Acceptance Criteria**:
- A workflow can define a sleep instruction (e.g., "wait 3 days")
- The system releases compute resources during the sleep period
- The workflow wakes up and resumes execution accurately after the duration expires
- Supports one-time and recurring scheduled operations

### FR-CORE-WFE-004: Execute Workflows from Multiple Trigger Types

**Requirement**: The system shall support triggering workflows from multiple event sources.

**Acceptance Criteria**:
- Supports triggers from user actions, scheduled jobs, and external events
- Trigger activation creates a new workflow instance with a traceable origin
- Trigger execution can be enabled/disabled per workflow version

### FR-CORE-WFE-005: Handle Failures with Retry and Compensation

**Requirement**: The system shall enforce configurable retry policies and support compensation for rollback scenarios.

**Acceptance Criteria**:
- Users can define retry counts, backoff factors, and maximum intervals per step
- Transient errors (e.g., network timeout) trigger automatic retries
- Non-retriable errors trigger immediate failure handling
- Failed step can be retried without duplicating prior completed steps
- Optional compensation action can be defined for rollback scenarios

### FR-CORE-WFE-006: Support Parallel and Conditional Paths

**Requirement**: The system shall support branching and parallel execution within workflows.

**Acceptance Criteria**:
- Workflow can branch based on conditions
- Parallel branches can execute independently and rejoin
- Conditions are evaluated deterministically with logged outcomes

### FR-CORE-WFE-007: Parent/Child Workflow Orchestration

**Requirement**: The system shall allow workflows to trigger and await results from child workflows.

**Acceptance Criteria**:
- A parent workflow can spawn a child workflow (asynchronous or synchronous)
- The parent workflow can halt execution until the child completes or fails
- Failure in a child workflow propagates to the parent according to defined policy

---

## 4. HITL Gateway (Human-in-the-Loop)

**Purpose**: Securely pause automation for human approval and resume upon decision.
**BRD Reference**: BO-CORE-004, Section 3.1.2

### FR-CORE-HITL-001: Create Approval Requests with Context

**Requirement**: The system shall generate secure approval requests with structured context for human review.

**Acceptance Criteria**:
- Workflow can pause and emit an approval request with structured context
- Generating a request creates a unique interaction ID
- Request payload includes cryptographically signed token ensuring parameters cannot be tampered with
- Approval request includes who requested, what action, and supporting data
- Request is visible to designated approvers only

### FR-CORE-HITL-002: Workflow Suspension and Resumption

**Requirement**: The workflow engine shall suspend execution while awaiting human input and resume immediately upon receipt.

**Acceptance Criteria**:
- Workflows explicitly transition to a SUSPENDED state when issuing an HITL request
- Receiving an approval/rejection signal triggers the workflow to wake up
- If no decision is received within configurable timeout (TTL), workflow auto-resumes with TIMEOUT error path
- Request generation triggers workflow suspension (integrates with FR-CORE-WFE-003)

### FR-CORE-HITL-003: Approve, Reject, or Request Changes

**Requirement**: The system shall support multiple decision outcomes for approval requests.

**Acceptance Criteria**:
- Approver can approve or reject with optional comments
- Option to request additional information before decision
- Decision resumes or terminates the workflow as configured

### FR-CORE-HITL-004: Enforce Approval Policies

**Requirement**: The system shall support configurable approval policies per workflow step.

**Acceptance Criteria**:
- Supports single-approver and multi-approver policies
- Supports approval expiry with auto-reject
- Policies can be set per workflow step

### FR-CORE-HITL-005: Multi-Channel Action Endpoints

**Requirement**: The system shall expose approval actions via HTTP endpoints consumable by multiple frontends.

**Acceptance Criteria**:
- API endpoints exist for approve/reject actions
- Accessing these endpoints requires authentication
- Channels (Web, Telegram, Email) can invoke same endpoints

### FR-CORE-HITL-006: Audit All HITL Actions

**Requirement**: Every HITL request and decision shall be recorded in the audit log.

**Acceptance Criteria**:
- Includes approver identity, timestamp, and decision rationale
- Records original request context for compliance

---

## 5. MCP Integration Layer

**Purpose**: Universal connector for external data sources and tools.
**BRD Reference**: Section 3.1.3

### FR-CORE-MCP-001: Register and Manage MCP Tools

**Requirement**: The system shall maintain a dynamic registry of available MCP servers and their capabilities.

**Acceptance Criteria**:
- System configuration defines available MCP servers (URL, transport type)
- On startup, the core queries each MCP server for its capabilities
- MCP tools can be registered with capabilities and access policies
- Tools can be enabled/disabled without code changes
- Tool list is queryable by domain and capability (Phase 1: tool registration via configuration; Phase 2: runtime discovery API)
- Unavailable servers are flagged but do not prevent system startup

### FR-CORE-MCP-002: Execute MCP Requests with Standard Error Handling

**Requirement**: The system shall act as a proxy for tool execution with standard error handling.

**Acceptance Criteria**:
- Workflows invoke tools via a generic interface
- The system creates a strict timeout boundary around tool execution
- Tool outputs are validated against the MCP schema before being returned
- Requests are queued and executed with retries on transient errors
- Errors are standardized and surfaced to calling workflow
- Failure events are logged with context

### FR-CORE-MCP-003: Enforce Rate Limits and Circuit Breaking

**Requirement**: The system shall enforce rate limits and implement circuit breaking for failing services.

**Acceptance Criteria**:
- Per-tool rate limits can be configured
- Requests exceeding limits are queued, not rejected (Durable Execution pattern)
- Tools automatically degrade/disable after repeated failures
- Workflows receive explicit "service unavailable" signals
- Responses are cached based on configurable TTLs

---

## 6. LLM Gateway

**Purpose**: Provider-agnostic access to large language models with cost control.
**BRD Reference**: BO-CORE-003, Section 3.1.4

### FR-CORE-LLM-001: Route Requests to Configured Providers

**Requirement**: The system shall provide a unified interface for LLM requests across providers.

**Acceptance Criteria**:
- Supports multiple providers (OpenAI, Anthropic, Google), selectable per workflow
- Switching providers requires only configuration change, not code change
- The system normalizes input messages and output content formats
- Requests include model/version metadata

### FR-CORE-LLM-002: Track Usage and Cost Per Workflow

**Requirement**: The system shall log token usage and estimated cost for every LLM interaction.

**Acceptance Criteria**:
- Every request log includes prompt_tokens, completion_tokens, and model
- Usage is tagged by domain (Crypto/HR) and workflow_id
- Cost attribution is available for reporting
- Budget limits can block or warn when exceeded
- Daily budget limit can be set; exceeding it prevents further requests

### FR-CORE-LLM-003: Fallback on Provider Failure

**Requirement**: The system shall automatically retry requests with a backup provider on failure.

**Acceptance Criteria**:
- If primary provider fails (5xx errors or rate limits), request is retried on secondary
- Fallback events are logged as warnings
- Workflow receives explicit error if no fallback available
- Failure reason is logged and reported
- Prompt caching strategy documented for cost optimization (referenced in BRD §3.1.4)

---

## 7. Notification Bus

**Purpose**: Unified delivery system for all user communications.
**BRD Reference**: Section 3.1.5

### FR-CORE-NOTIF-001: Send Notifications via Multiple Channels

**Requirement**: The system shall support notification delivery across multiple channels.

**Acceptance Criteria**:
- Supports at least email plus one chat/push channel
- Delivery failures are retried and logged
- Users can opt out by channel

### FR-CORE-NOTIF-002: Template-Based Messaging

**Requirement**: The system shall render messages using templates with parameter substitution.

**Acceptance Criteria**:
- Templates support variable substitution (e.g., `{{candidate_name}}`)
- Templates support markdown rendering for platforms that support it
- Templates can be versioned and toggled
- Templates can be scoped by domain

### FR-CORE-NOTIF-003: Priority Routing and Quiet Hours

**Requirement**: The system shall route messages to different channels based on priority levels.

**Acceptance Criteria**:
- CRITICAL: Pushed immediately via urgent channels
- NORMAL: Sent via standard channels
- LOW: Batched into digests (requires Durable Timer)
- Quiet hours respected except for urgent messages
- Priority overrides are auditable

---

## 8. Audit Service

**Purpose**: Immutable logging for compliance and security.
**BRD Reference**: BO-CORE-002, Section 3.1.6

### FR-CORE-AUD-001: Immutable Audit Logging for Critical Actions

**Requirement**: The system shall emit structured audit logs for all state-changing events.

**Acceptance Criteria**:
- All critical actions produce an append-only audit event
- Audit events are tamper-evident
- Events include: timestamp, actor_id, action, resource_id, metadata
- Logs are written to an append-only store
- Sensitive PII in metadata is automatically masked or hashed based on configuration

### FR-CORE-AUD-002: Query and Export Audit Logs

**Requirement**: Authorized users must be able to search and export audit trails.

**Acceptance Criteria**:
- Audits can be filtered by time range, actor, entity
- Export supports standard formats (CSV/JSON)
- Export includes a checksum to verify integrity
- Export actions are themselves audited

### FR-CORE-AUD-003: Retention Policies with Domain Overrides

**Requirement**: The system shall enforce retention policies with domain-specific overrides.

**Acceptance Criteria**:
- Default retention policy applies platform-wide (7 years minimum)
- Domains can override with shorter/longer retention where permitted
- Retention actions are logged

---

## 8.5 File Storage Service

**Purpose**: S3-compatible object storage for documents and system artifacts.
**BRD Reference**: Section 3.1.8 (File Storage Service — shared infrastructure for secure file upload, malware scanning, and storage management)

> **Justification**: Both domains require file storage (HR: resumes, contracts; Crypto: trade charts, logs). Providing a unified storage interface in the core prevents duplicate implementations and ensures consistent access control patterns. This aligns with FS1-FS2 from the original FRD.

### FR-CORE-BLOB-001: S3-Compatible Storage Interface

**Requirement**: The system shall provide an abstract interface for file storage operations.

**Acceptance Criteria**:
- Upload files via presigned URLs (client-direct upload)
- Download files via presigned URLs with expiration
- Store metadata (filename, size, upload date, uploader) separately from binary content
- Support file versioning for critical documents
- Maximum file size configurable (default: 50MB)

### FR-CORE-BLOB-002: Access Control and Linking

**Requirement**: The system shall enforce access controls on stored files.

**Acceptance Criteria**:
- File access inherits permissions from linked business entity
- Files can be linked to multiple entities
- File access (view, download) is logged with user and timestamp
- Malware scanning integration point before storage confirmation

**FRD vs ADD/TSD**:
- FRD: storage interface requirements, access control behavior
- ADD/TSD: S3 provider selection (Minio, AWS S3, etc.), bucket policies

---

## 9. Identity Service

**Purpose**: Authentication and authorization for all platform users.
**BRD Reference**: Section 3.1.7

### FR-CORE-ID-001: Secure Authentication Without Passwords

**Requirement**: The system shall support authentication primarily via passwordless methods.

**Acceptance Criteria**:
- Users authenticate via passwordless method (Magic Links, OAuth, Passkeys)
- No passwords are stored in the database
- Account recovery is supported without storing passwords
- Authentication events are auditable
- Multi-Factor Authentication (MFA): Phase 1 — optional enrollment with step-up for sensitive operations (see ADD §8.6). Phase 2 — mandatory MFA for admin roles
- **Phase 1**: Magic links + social login (Google/GitHub OAuth) via Supabase Auth free tier
- **Phase 2+**: SSO via standard protocols (OIDC/SAML) for enterprise deployments (requires Supabase Pro tier or equivalent)
- **Phase 2+**: Integration with centralized Identity Provider for enterprise deployments

### FR-CORE-ID-002: Role-Based Access Control (RBAC)

**Requirement**: The system shall enforce permissions via roles assigned to users.

**Acceptance Criteria**:
- Core roles defined: Admin, User, Viewer
- Domain roles (e.g., Trader, Recruiter) can be superimposed on Core roles
- Roles can be defined per domain
- Permissions are enforced on all core APIs
- Role changes are audited
- Access denied by default; permissions explicitly granted per role

### FR-CORE-ID-003: Session Management

**Requirement**: The system shall manage user sessions with configurable controls.

**Acceptance Criteria**:
- Sessions have configurable timeouts
- Sessions can be revoked by admins
- Concurrent session limits are supported
- Session tokens rotate on privilege changes

---

## 10. Non-Functional Requirements

### 10.1 Performance

| Metric | Target |
|--------|--------|
| Concurrent sleeping workflows | 10,000+ |
| HITL request delivery latency | <10s P95 |
| MCP request success rate | >99% (with retries) |
| Workflow execution success rate | >99% |

### 10.2 Reliability

| Metric | Target |
|--------|--------|
| System RTO (process restart) | <1 minute |
| Workflow state durability | Zero loss on crash |

### 10.3 Security

| Requirement | Target |
|-------------|--------|
| HITL token expiry | 7 days default (configurable per domain) |
| Service-to-service auth | Internal API keys required |
| Audit log integrity | Tamper-evident, append-only |

### 10.4 Maintainability

| Requirement | Target |
|-------------|--------|
| Core SDK | Typed TypeScript SDK for domain developers |
| Configuration | All environment-specific values externalized |

---

## 11. Cross-Cutting Requirements

### 11.1 Interoperability

**FR-CORE-INT-001: Workflow Logic Export**

**Requirement**: The system shall provide programmatic access to workflow definitions.

**Acceptance Criteria**:
- API endpoint exports workflow definitions in machine-readable format (JSON)
- Export includes: states, transitions, and current status (enabled/disabled)
- Access to the export API requires appropriate authorization

**FR-CORE-INT-002: Extensible Action Points**

**Requirement**: The workflow engine shall support extension points for integration with other systems.

**Acceptance Criteria**:
- Workflow actions can include webhook calls to external URLs
- Webhook payloads include relevant entity data in JSON format
- Webhook failures are logged and can be configured for retry
- The system can receive inbound webhooks to trigger workflow events

### 11.2 Admin Dashboard

> **Added (Tier 3 re-evaluation HT-1, 2026-03-13)**: ADD §15 documented admin infrastructure without corresponding FRD requirements.

**FR-CORE-ADM-001: Platform Health Dashboard**

**Requirement**: The system shall provide an operations dashboard displaying real-time platform health metrics.

**Acceptance Criteria**:
- Dashboard shows pending HITL request count, active workflow count, recent audit events, and SLO health status
- SLO health indicates `healthy` or `degraded` based on configured thresholds
- Data sourced from the same metric queries used by automated SLO monitoring
- Access restricted to users with `platform/admin.view` permission

**FR-CORE-ADM-002: LLM Usage and Budget Monitoring**

**Requirement**: The system shall provide cost tracking and budget monitoring for LLM usage across domains and providers.

**Acceptance Criteria**:
- Usage analytics show cost breakdown by domain, provider, and time period
- Budget endpoint reports daily and monthly spend against configured limits
- Burn rate projection calculated from current month spending
- Alert threshold flags domains exceeding configured daily spend limits
- Range-based queries support configurable time windows (1-365 days)

**FR-CORE-ADM-003: Audit Log Viewer**

**Requirement**: The system shall provide paginated access to audit logs with filtering capabilities.

**Acceptance Criteria**:
- Audit logs queryable by resource type and actor
- Pagination enforced with configurable limit (max 200 per page)
- Results ordered by timestamp (most recent first)
- Access restricted to users with `platform/admin.view` permission

### 11.3 Observability

> **Added (Tier 3 re-evaluation HT-1, 2026-03-13)**: ADD §16 documented observability infrastructure without corresponding FRD requirements.

**FR-CORE-OBS-001: Automated SLO Monitoring**

**Requirement**: The system shall continuously evaluate service level objectives against defined thresholds.

**Acceptance Criteria**:
- SLO evaluations run on a recurring schedule (configurable interval)
- Metrics evaluated: workflow success rate, MCP tool success rate, HITL delivery latency, audit integrity (DLQ count)
- Each evaluation produces structured log output for external ingestion
- Metric queries shared between SLO monitoring and admin dashboard to ensure consistency

**FR-CORE-OBS-002: Threshold-Based Alerting**

**Requirement**: The system shall generate alert events when SLO thresholds are breached.

**Acceptance Criteria**:
- Alert fired when workflow success rate falls below configured threshold
- Alert fired when MCP tool success rate falls below configured threshold
- Alert fired when HITL delivery latency exceeds configured P95 target
- Alert fired when audit DLQ backlog exceeds configured count threshold
- Alert events include metric name, current value, threshold, and evaluation timestamp

---

## 12. Downstream TSD Links

The following Technical Specification Documents implement the requirements defined in this FRD:

| TSD ID | Document | Implements |
|--------|----------|------------|
| TSD-CORE-API | [api.md](../04-specs/api.md) | API standards, error handling |
| TSD-CORE-AUTH | [authentication.md](../04-specs/authentication.md) | Identity Service (Section 9) |
| TSD-CORE-PATTERNS | [common-patterns.md](../04-specs/common-patterns.md) | Shared implementation patterns |
| TSD-CORE-CONFIG | [configuration.md](../04-specs/configuration.md) | Configuration management |
| TSD-CORE-DATABASE | [database.md](../04-specs/database.md) | Data model implementation |
| TSD-CORE-FILE-STORAGE | [file-storage.md](../04-specs/file-storage.md) | File Storage Service (Section 8.5) |
| TSD-CORE-DEFERRED | [deferred-contracts.md](../04-specs/deferred-contracts.md) | Deferred modules interface contracts |
| TSD-CORE-OBSERVABILITY | [observability.md](../04-specs/observability.md) | Audit Service, logging requirements |
| TSD-CORE-PROJECT-STRUCTURE | [project-structure.md](../04-specs/project-structure.md) | Monorepo and build setup |
| TSD-MCP-LAYER | [platform-core/mcp-layer.md](../04-specs/platform-core/mcp-layer.md) | MCP Integration Layer (Section 5) |
| TSD-HITL-GATEWAY | [platform-core/hitl-gateway.md](../04-specs/platform-core/hitl-gateway.md) | HITL Approval Gateway (Section 4) |
| TSD-LLM-GATEWAY | [platform-core/llm-gateway.md](../04-specs/platform-core/llm-gateway.md) | LLM Gateway (Section 6) |
| TSD-ADMIN-OPS | [platform-core/admin-ops-api.md](../04-specs/platform-core/admin-ops-api.md) | Admin Dashboard (Section 11.2) |
| TSD-AUDIT | [platform-core/audit.md](../04-specs/platform-core/audit.md) | Audit Service (Section 8) |

---

## 13. References

| Document | Purpose |
|----------|---------|
| Platform Core BRD | Business requirements this FRD implements |
| Crypto Domain FRD | Trading-specific functional requirements |
| HR Domain FRD | HR operations functional requirements |
| Platform Core ADD | Architecture design document |
| Original FRD v2.0 | Historical reference (`docs/_archived/`) |

---

**END OF PLATFORM CORE FRD**
