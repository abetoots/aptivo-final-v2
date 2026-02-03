---
id: FRD-MKJP625C
title: 2. Functional Requirement Document
status: Deprecated
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
deprecated: true
superseded_by:
  - platform-core-frd.md
  - hr-domain-frd.md
  - crypto-domain-frd.md
---

> **⚠️ DEPRECATED DOCUMENT**
>
> This document has been superseded by the hierarchical documentation structure:
> - **Platform Core FRD**: `platform-core-frd.md` - Shared infrastructure
> - **HR Domain FRD**: `hr-domain-frd.md` - HR-specific requirements
> - **Crypto Domain FRD**: `crypto-domain-frd.md` - Trading-specific requirements
>
> See `APTIVO_STRATEGY_MULTI_REVIEW.md` for the strategic rationale behind this restructuring.
>
> Archived copy: `docs/_archived/aptivo-frd-v2.md`

# 2. Functional Requirement Document

Created by: Abe Caymo
Created time: February 18, 2025 1:44 PM
Category: Strategy doc
Last edited by: Abe Caymo
Last updated time: June 4, 2025 1:45 PM

# Functional Requirements Document (FRD)

Functional requirements detail the specific "how" the system should operate to achieve the goals in the BRD, specifying the features and functions needed to fulfill the business needs. It should use plain language as much as possible.

*Outsourcing Digital Agency – Integrated Internal Systems Ecosystem*

*v2.0.0 – [01/14/2026]*

> **Revision History (v2.0.0):** Multi-model document review conducted (Gemini 3 Pro Preview, Gemini 2.5 Pro, Codex MCP). Consensus: 3.8/10 - document required major restructuring. Changes applied: Reorganized into phase-aligned sections (Core Domain, Integrations, Cross-Cutting, Deferred), added acceptance criteria for all Core Domain requirements, added RBAC role definitions, added Data Privacy & Compliance section, added WCAG 2.2 accessibility requirements, reframed SaaS features as Interoperability, moved technical prescriptions to TSD.

---

## 1. Executive Summary

This document outlines the functional specifications for the integrated internal systems ecosystem, aligned with the phased approach defined in BRD v2.0.0.

**Phase 1 MVP Focus:** This FRD prioritizes the *Core Domain* modules (Candidate Management, Workflow Automation) and *Foundational Integrations* (Identity & Access Management, File Storage) that deliver immediate internal operational efficiency.

**Deferred Scope:** Requirements for modules pending Buy vs Build analysis (Financial, Ticketing, Project Management, CRM) and SaaS commercialization features are documented in the Deferred section and are explicitly out-of-scope for Phase 1 MVP.

The audience for this document includes the development team, who will use it to build the system, and key stakeholders, who will use it to understand how the system will function in practice. It describes *what the system will do* from a user perspective, without detailing the underlying technology used to build it.

---

## 2. Definitions & Acronyms

- **API:** Application Programming Interface – a set of routines, protocols, and tools for building software applications.
- **BRD:** Business Requirements Document – outlines the business needs and objectives.
- **FRD:** Functional Requirements Document – describes what the system should do.
- **ADD:** Application Design Document – details the architectural design and technical solution.
- **TSD:** Technical Specification Document – provides detailed technical requirements and implementation guidelines.
- **QA:** Quality Assurance – processes to ensure the product meets the desired quality standards.
- **SOP:** Standard Operating Procedure – documented processes for routine tasks.
- **OAuth:** Open Authorization – a protocol for token-based authentication and authorization.
- **TLS/SSL:** Protocols for secure data transmission over the network.
- **CRUD:** Create, Read, Update, Delete – basic operations for managing data.
- **RBAC:** Role-Based Access Control – permission model based on user roles.
- **PII:** Personally Identifiable Information – data that can identify an individual.
- **WCAG:** Web Content Accessibility Guidelines – standards for web accessibility.

---

## 3. Phase 1 MVP: Core Domain Specifications

These modules represent the agency's unique value proposition and require detailed functional specifications for custom development.

### 3.1 Candidate Management Module

> **Migrated:** Requirements CM1-CM5 are now maintained in [hr-domain-frd.md](hr-domain-frd.md) as FR-HR-CM-001 through FR-HR-CM-005.
>
> **ID Mapping:**
> | New ID | Original ID | Description |
> |--------|-------------|-------------|
> | FR-HR-CM-001 | CM1 | Centralized Candidate Repository |
> | FR-HR-CM-002 | CM2 | Workflow & Status Management |
> | FR-HR-CM-003 | CM3 | Interview Process Management |
> | FR-HR-CM-004 | CM4 | Contract Drafting & Compliance |
> | FR-HR-CM-005 | CM5 | Data Privacy & Consent |

---

### 3.2 Workflow Automation Module

**Purpose:** Rule-based automation engine for cross-module process automation.
**Success Metric (from BRD):** Automate 60% of routine HR administrative tasks within 12 months.

#### WA1: Rule-Based Workflow Engine

**Requirement:** The system shall provide a rule-based engine to automate transitions and actions across modules.

**Acceptance Criteria:**
- Users can define automation rules with trigger conditions and resulting actions.
- Supported triggers include: status changes, time-based events, and external events.
- Supported actions include: send notification, update field, create task, call webhook.
- Rules execute automatically when trigger conditions are met.
- Failed rule executions are logged with error details and can be retried.
- Rules can be enabled/disabled without deletion.

#### WA2: User-Defined Automation Rules

**Requirement:** The system shall allow non-technical users to create automation rules through a visual interface.

**Acceptance Criteria:**
- A visual rule builder allows creating rules without writing code.
- The builder provides dropdowns for selecting triggers, conditions, and actions.
- Users can preview rule logic before activation.
- Rules support conditional logic (if/else branching).
- Users can test rules against sample data before enabling.

#### WA3: Scheduled & Recurring Automation

**Requirement:** The system shall support scheduled and recurring automated tasks.

**Acceptance Criteria:**
- Users can schedule one-time automation tasks for a future date/time.
- Users can configure recurring tasks (daily, weekly, monthly).
- Recurring tasks include: reminder emails, report generation, data cleanup.
- Users can view upcoming scheduled tasks and cancel/modify them.
- Execution history shows all past runs with status and output.

---

## 4. Phase 1 MVP: Integration Requirements

These capabilities require integration with external providers rather than custom development. Requirements define the functional interface, not the implementation.

### 4.1 Identity & Access Management Integration

**Purpose:** Secure authentication and authorization via integration with a dedicated identity provider.
**Implementation:** To be selected during technical design phase (see ADD/TSD).

#### IAM1: Centralized Authentication

**Requirement:** The system shall authenticate all users through the corporate identity provider.

**Acceptance Criteria:**
- Users authenticate via Single Sign-On (SSO) through the identity provider.
- The system does not store user passwords locally.
- Authentication tokens have configurable expiration (default: 8 hours).
- Session timeout after configurable inactivity period (default: 30 minutes).
- Multi-Factor Authentication (MFA) is enforced for users with elevated permissions.

#### IAM2: Role-Based Access Control

**Requirement:** The system shall enforce permissions based on user roles defined in the identity provider.

**Acceptance Criteria:**
- Access is denied by default; permissions are explicitly granted per role.
- Role assignments are managed in the identity provider and synchronized to the application.
- Permission changes take effect on next user session (not requiring re-authentication).
- Access attempts to unauthorized resources are logged.

### 4.2 File Storage Integration

**Purpose:** Unified document storage via integration with centralized object storage.
**Implementation:** To be selected during technical design phase (see ADD/TSD).

#### FS1: Document Storage Interface

**Requirement:** The system shall store and retrieve documents through the object storage service.

**Acceptance Criteria:**
- Files are uploaded to the storage service, not stored in the application database.
- The application stores metadata (filename, size, upload date, uploader) and a reference to the storage location.
- Supported file types include: PDF, DOCX, images (PNG, JPG), and common document formats.
- Maximum file size: 50MB per file.
- Files are scanned for malware before storage.

#### FS2: Access Control & Linking

**Requirement:** The system shall enforce access controls on files and support linking files to business entities.

**Acceptance Criteria:**
- File access inherits permissions from the linked business entity (e.g., candidate profile).
- Files can be linked to multiple entities (e.g., a contract linked to both candidate and client).
- Deleting a business entity does not automatically delete linked files; orphan file cleanup is a separate process.
- File access (view, download) is logged with user and timestamp.

---

## 5. Phase 1 MVP: Cross-Cutting Requirements

Requirements that apply across all Phase 1 modules.

### 5.1 Role Definitions (RBAC)

The following roles are defined for Phase 1:

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| System Admin | Full system access | All permissions, user management, workflow configuration |
| Recruiter | Primary user for candidate management | Create/edit candidates, schedule interviews, generate contracts |
| Recruiting Coordinator | Supports recruiter operations | View candidates, schedule interviews, cannot generate contracts |
| Interviewer | Provides interview feedback | View assigned candidates, submit interview feedback |
| Hiring Manager | Approves hiring decisions | View candidates, approve/reject offers, approve contracts |
| Client User | External client access | View candidates assigned to their account, view reports |

### 5.2 Data Privacy & Compliance

**Requirement:** The system shall comply with Philippine Data Privacy Act (RA 10173), DOLE regulations, and GDPR (if applicable).

**Acceptance Criteria:**
- All PII access is logged with user, timestamp, and action.
- PII data is encrypted at rest and in transit.
- Candidate data retention periods are configurable per data category.
- The system supports bulk anonymization for records past retention period.
- Data residency controls ensure Philippine citizen data remains in compliant storage.
- Consent withdrawal immediately restricts further processing of that candidate's data.

### 5.3 Audit Logging

**Requirement:** The system shall maintain comprehensive audit logs for compliance and security.

**Acceptance Criteria:**
- All create, update, delete operations on core entities are logged.
- Logs include: timestamp, user, action, affected entity, before/after values.
- Logs are immutable; they cannot be modified or deleted by application users.
- Logs are retained for a minimum of 7 years (configurable for compliance).
- Authorized users can search and export audit logs for specific entities or date ranges.

### 5.4 Interoperability

**Purpose:** Enable integration with other internal tools and future AI-driven automation.

#### INT1: Workflow Logic Export

**Requirement:** The system shall provide programmatic access to workflow rules and business logic.

**Acceptance Criteria:**
- An API endpoint exports workflow rules in machine-readable format (JSON).
- Export includes: trigger conditions, actions, and current status (enabled/disabled).
- Access to the export API requires appropriate authorization.
- The export format is documented for consumption by other internal systems.

#### INT2: Extensible Action Points

**Requirement:** The workflow engine shall support extension points for integration with other systems.

**Acceptance Criteria:**
- Workflow actions can include webhook calls to external URLs.
- Webhook payloads include relevant entity data in JSON format.
- Webhook failures are logged and can be configured for retry.
- The system can receive inbound webhooks to trigger workflow events.

---

## 6. User Interface Requirements

### 6.1 Design Standards

- **Unified Interface:** All modules present a consistent UI with common design language, navigation, and terminology.
- **Visual Workflow Representation:** Candidate and ticket workflows display as visual boards (Kanban-style) with drag-and-drop transitions.
- **Responsive Design:** The interface is fully functional on desktop (1024px+), tablet (768px+), and mobile (320px+) viewports.

### 6.2 Accessibility (WCAG 2.2 AA)

**Requirement:** The system shall meet WCAG 2.2 Level AA accessibility standards.

**Acceptance Criteria:**
- All interactive elements are keyboard navigable.
- All images have descriptive alt text.
- Color contrast ratios meet AA standards (4.5:1 for normal text, 3:1 for large text).
- Form fields have associated labels.
- Error messages are announced to screen readers.
- Focus indicators are visible on all interactive elements.
- The interface supports browser zoom up to 200% without loss of functionality.

---

## 7. Use Cases / End-to-End Scenarios

### 7.1 Candidate Onboarding Scenario

**Actors:** HR Recruiter, Interviewer, Hiring Manager, Candidate

1. **Application Submission:** A candidate submits an application; system creates candidate record in "New" status.
2. **Duplicate Check:** System checks for existing candidate with same email; alerts Recruiter if found.
3. **Screening:** Recruiter reviews application, updates status to "Under Review."
4. **Interview Scheduling:** Recruiter uses CM3 to schedule interview; candidate and interviewer receive email invitations.
5. **Interview Feedback:** Interviewer submits structured feedback via CM3 form.
6. **Offer Decision:** Hiring Manager reviews feedback, approves or rejects offer.
7. **Contract Generation:** Recruiter generates contract from template using CM4; system validates compliance fields.
8. **Contract Approval:** Hiring Manager digitally approves contract.
9. **Onboarding:** Candidate status updated to "Hired"; workflow automation (WA1) triggers onboarding tasks.

**Error Scenarios:**
- If email service integration fails during interview scheduling, the system queues the notification for retry and alerts the Recruiter.
- If compliance fields are incomplete in contract, system blocks sending and displays specific missing fields.

### 7.2 Client Dashboard Scenario

**Actors:** Client User

1. **Login:** Client User authenticates via SSO (IAM1).
2. **Dashboard View:** System displays aggregated data for candidates assigned to client's account.
3. **Real-Time Status:** Client views current pipeline status for their requisitions.
4. **Talent Pool Search:** Client uses search/filter to find candidates by skills, availability, or past ratings.
5. **Report Generation:** Client downloads summary report of hiring activity and SLA compliance.

**Access Control:**
- Client User can only view candidates explicitly assigned to their account.
- Client User cannot view salary details or internal interview feedback scores.

---

## 8. Non-Functional Requirements

### 8.1 Performance

| Metric | Target |
|--------|--------|
| Page load time (90th percentile) | < 2 seconds |
| API response time (90th percentile) | < 500ms |
| Search results returned | < 1 second for up to 10,000 records |
| Concurrent users supported | 500 |

### 8.2 Availability

| Metric | Target |
|--------|--------|
| System uptime | 99.9% (excludes planned maintenance) |
| Planned maintenance window | Sundays 02:00-06:00 PHT |
| Recovery Time Objective (RTO) | 4 hours |
| Recovery Point Objective (RPO) | 1 hour |

### 8.3 Security

- All data encrypted in transit (TLS 1.3).
- All PII encrypted at rest.
- Session tokens rotate on privilege changes.
- Failed login attempts trigger progressive delays and account lockout after 5 failures.
- Security events forwarded to SIEM for monitoring.

### 8.4 Maintainability

- Modular architecture allows independent updates to each module.
- All configuration externalized; no hardcoded values for environment-specific settings.
- Comprehensive logging for troubleshooting (see 5.3 Audit Logging).

---

## 9. Deferred Requirements

The following requirements are explicitly out-of-scope for Phase 1 MVP and are documented for future phases.

### 9.1 Phase 1+ (Pending Buy vs Build Analysis)

Per BRD v2.0.0 Section 3.4, the following modules require formal Buy vs Build analysis before development commitment. Detailed requirements are preserved below for reference during analysis.

---

#### Financial & Administrative Management Module

*Status:* Pending Buy vs Build analysis. Requirements below will become integration specifications OR build specifications based on analysis outcome.

**FA1: Accounting & Invoicing**
- Record financial transactions and maintain a general ledger.
- Generate invoices with line items, taxes, and payment terms.
- Reconcile payments against invoices.
- Support multiple currencies if applicable.

**FA2: Payroll Processing**
- Process payroll calculations including base salary, overtime, deductions, and bonuses.
- Automated tax and compliance checks for Philippine regulations (BIR, SSS, PhilHealth, Pag-IBIG).
- Support multi-currency payments if applicable for SaaS expansion.
- Generate payslips and tax documents (BIR Form 2316).

**FA3: Expense Tracking**
- Track employee and project expenses with receipt attachments.
- Approval workflows for expense reimbursement.
- Integration with payroll for approved reimbursements.

**FA4: Financial Reporting**
- Generate standard financial reports: cash flow, expense summaries, profit/loss.
- Customizable report periods (monthly, quarterly, annual).
- Export reports in PDF and CSV formats.

---

#### Customer Support & Ticketing Module

*Status:* Pending Buy vs Build analysis.

**CT1: Ticket Intake & Submission**
- Capture support requests through web forms and email channels.
- Auto-generate ticket number and confirmation to submitter.
- Support file attachments on ticket submission.

**CT2: Categorization & Routing**
- Automatically categorize tickets based on keywords or form fields.
- Route tickets to appropriate team or agent based on category, priority, and region.
- Manual reassignment by agents with appropriate permissions.

**CT3: Workflow & SLA Tracking**
- Support ticket lifecycle: New → In Progress → Pending → Resolved → Closed.
- Define SLA targets per ticket priority (e.g., P1: 4-hour response, 24-hour resolution).
- Automated SLA breach notifications to agents and supervisors.

**CT4: Collaboration & Communication**
- Internal comments visible only to support team.
- External replies sent to ticket submitter via email.
- File attachments on ticket updates.
- @mention other agents for collaboration.

**CT5: Support Reporting**
- Metrics: average response time, average resolution time, ticket volume by category.
- Customer satisfaction ratings (CSAT) collection post-resolution.
- Dashboard for real-time ticket queue visibility.

---

#### Project Management Module

*Status:* Pending Buy vs Build analysis.

**PM1: Task & Project Tracking**
- Create projects with associated tasks, subtasks, and milestones.
- Assign tasks to team members with due dates.
- Track task status: To Do → In Progress → Review → Done.

**PM2: Cross-Module Integration**
- Link tasks to candidate management activities (e.g., "Onboard John Doe").
- Link tasks to support tickets (e.g., "Resolve client issue #1234").
- Aggregate project progress across linked entities.

**PM3: Scheduling & Notifications**
- Set deadlines and dependencies between tasks.
- Automatic notifications for approaching deadlines.
- Gantt chart or timeline view for project visualization.

---

#### CRM Module

*Status:* Pending Buy vs Build analysis.

**CRM1: Client & Lead Database**
- Centralized database for clients and leads.
- Store contact information, company details, communication history.
- Custom fields for industry-specific data.

**CRM2: Pipeline Tracking**
- Visual pipeline interface for lead progression (Lead → Qualified → Proposal → Negotiation → Won/Lost).
- Drag-and-drop stage transitions.
- Pipeline analytics: conversion rates, average deal size.

**CRM3: Cross-Module Integration**
- Link CRM records to candidate management (which candidates belong to which client).
- Link CRM records to project management (which projects are for which client).
- Unified client view across all modules.

**CRM4: Automated Communications**
- Automated follow-up email sequences for leads.
- Email templates with merge fields.
- Campaign tracking with open/click metrics.

### 9.2 Phase 2 (SaaS Commercialization - Deferred)

Per BRD v2.0.0 Section 2.1.1, commercialization is deferred to Phase 2.

**SA1: System Modularity for Clients (Multi-tenancy)**
- Enable/disable modules per client account for tiered service packaging.
- *Status:* Deferred to Phase 2. Requires multi-tenant architecture not in Phase 1 scope.

---

## 10. Appendices

### Appendix A: Requirement Traceability Matrix

| Req ID | Requirement | BRD Reference | Phase |
|--------|-------------|---------------|-------|
| CM1 | Centralized Candidate Repository | BRD 3.2 | Phase 1 |
| CM2 | Workflow & Status Management | BRD 3.2 | Phase 1 |
| CM3 | Interview Process Management | BRD 3.2 | Phase 1 |
| CM4 | Contract Drafting & Compliance | BRD 3.2 | Phase 1 |
| CM5 | Data Privacy & Consent | BRD 5 (Constraints) | Phase 1 |
| WA1 | Rule-Based Workflow Engine | BRD 3.2 | Phase 1 |
| WA2 | User-Defined Automation Rules | BRD 3.2 | Phase 1 |
| WA3 | Scheduled & Recurring Automation | BRD 3.2 | Phase 1 |
| IAM1 | Centralized Authentication | BRD 3.3 | Phase 1 |
| IAM2 | Role-Based Access Control | BRD 3.3 | Phase 1 |
| FS1 | Document Storage Interface | BRD 3.3 | Phase 1 |
| FS2 | Access Control & Linking | BRD 3.3 | Phase 1 |
| INT1 | Workflow Logic Export | BRD 3.5 | Phase 1 |
| INT2 | Extensible Action Points | BRD 3.5 | Phase 1 |

### Appendix B: Migration from v1.0.1

Items removed from Section 3 and migrated to Deferred (Section 9):
- 3.2 Financial & Administrative Management Module (FA1-FA4)
- 3.5 Customer Support & Ticketing Module (CT1-CT5)
- 3.7 Project Management Module (PM1-PM3)
- 3.9 CRM Module (CRM1-CRM4)
- 3.6 SaaS and AI-Readiness (SA1 only; SA2/SA3 reframed as INT1/INT2)

Items migrated to TSD (scope creep):
- Definition of "NATS" (messaging system implementation detail)
