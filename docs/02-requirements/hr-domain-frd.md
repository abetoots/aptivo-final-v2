---
id: FRD-HR-DOMAIN
title: HR Operations Domain - Functional Requirements Document
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-02'
parent: platform-core-frd.md
---

# HR Operations Domain - Functional Requirements Document

**Version**: 1.0.0
**Date**: February 2, 2026
**Status**: Draft (Multi-Model Consensus Review)
**Dependencies**: `platform-core-frd.md` (Inherits Core Capabilities)
**BRD Reference**: `../01-strategy/hr-domain-addendum.md`

---

## 1. Executive Summary

This document defines the functional requirements for the **HR Operations Domain Application** built upon the Aptivo Agentic Core. It specifies the candidate management, interview scheduling, and contract approval workflows required to execute the business objectives defined in `hr-domain-addendum.md`.

### 1.1 Scope

This FRD covers:
- HR-specific workflow definitions (State Machines)
- Candidate management requirements (CM1-CM5)
- Philippine regulatory compliance (DPA, DOLE, BIR)
- HR tool integrations via MCP
- Role-based access control for HR operations

### 1.2 Platform Core Inheritance

This domain application relies on the **Platform Core** for the following capabilities (do NOT reimplement):

| Core Capability | Usage in HR Domain |
|-----------------|-------------------|
| Workflow Orchestration (FR-CORE-WFE-*) | Candidate lifecycle, interview, contract workflows |
| HITL Gateway (FR-CORE-HITL-*) | Offer approval, contract approval |
| MCP Layer (FR-CORE-MCP-*) | Gmail, Calendar, PDF parsers |
| LLM Gateway (FR-CORE-LLM-*) | Resume parsing, candidate matching |
| Notification Bus (FR-CORE-NOTIF-*) | Candidate updates, internal alerts |
| Audit Service (FR-CORE-AUD-*) | PII access logs, consent records |
| Identity Service (FR-CORE-ID-*) | HR team, clients, interviewers |

---

## 2. Domain Data Model

The following entities must be defined in the domain schema (`aptivo_hr.*`).

### 2.1 Core Entities

| Entity | Business Purpose | Key Fields |
|--------|------------------|------------|
| Candidate | Applicant profile | Name, Email, Phone, Resume, Skills[], Status, ConsentStatus |
| Application | Job application linking candidate to position | CandidateID, PositionID, AppliedDate, Source, CurrentStage |
| Interview | Scheduled interview | ApplicationID, InterviewerID, DateTime, Location, Type, Status |
| InterviewFeedback | Interviewer assessment | InterviewID, Rating, Strengths, Concerns, Recommendation |
| Contract | Employment agreement | CandidateID, TemplateID, Terms, Version, Status, ApprovalChain |
| Position | Open job requisition | Title, ClientID, Requirements[], Status, SLA |
| Client | Client organization | Name, Preferences, ActivePositions[], ContactInfo |
| ConsentRecord | DPA compliance tracking | CandidateID, ConsentType, ConsentDate, ConsentText, Withdrawn |

---

## 3. Workflow Specifications (State Machines)

All workflows must be implemented using the **Platform Core Durable Execution Engine** (FR-CORE-WFE-*).

### 3.1 Candidate Application Workflow

**Workflow ID**: HR-WF-CANDIDATE-001
**Trigger**: Application received (email, form, referral)

| State | Description | Transitions |
|-------|-------------|-------------|
| `received` | Application captured in system | → `screening` (consent given), → `consent_pending` (no consent) |
| `consent_pending` | Awaiting candidate consent | → `screening` (consent given), → `withdrawn` (declined) |
| `screening` | AI-assisted initial review | → `under_review` |
| `under_review` | Human review by Recruiter | → `interview_scheduled`, → `rejected` |
| `interview_scheduled` | Interview confirmed | → `interviewed` |
| `interviewed` | Feedback collected | → `offer_pending`, → `rejected` |
| `offer_pending` | Awaiting HITL approval | → `offer_extended` (approved), → `rejected` (denied) |
| `offer_extended` | Offer sent to candidate | → `hired` (accepted), → `rejected` (declined) |
| `hired` | Candidate accepted, trigger onboarding | Terminal |
| `rejected` | Application closed | Terminal |
| `withdrawn` | Candidate withdrew | Terminal |

### 3.2 Interview Scheduling Workflow

**Workflow ID**: HR-WF-INTERVIEW-001
**Trigger**: Candidate advanced to interview stage

| State | Description | Transitions |
|-------|-------------|-------------|
| `scheduling` | Finding available slots | → `proposed` (slots found), → `manual_intervention` (no slots) |
| `proposed` | Time slots sent to candidate | → `confirmed` (slot selected), → `scheduling` (reschedule) |
| `confirmed` | Interview scheduled | → `reminder_sent` |
| `reminder_sent` | 24h reminder dispatched | → `completed`, → `no_show`, → `canceled` |
| `completed` | Interview done | → `feedback_pending` |
| `feedback_pending` | Awaiting interviewer input | → `feedback_received` |
| `feedback_received` | Ready for review | Terminal |
| `no_show` | Candidate did not attend | Terminal |
| `canceled` | Interview canceled | Terminal |
| `manual_intervention` | Requires recruiter action | → `scheduling` |

### 3.3 Contract Approval Workflow

**Workflow ID**: HR-WF-CONTRACT-001
**Trigger**: Offer approved, contract drafted

| State | Description | Transitions |
|-------|-------------|-------------|
| `drafting` | Template selected, terms populated | → `compliance_check` |
| `compliance_check` | Philippine labor law validation | → `pending_approval` (pass), → `drafting` (fail) |
| `pending_approval` | HITL approval required | → `approved` (approved), → `drafting` (changes requested), → `rejected` |
| `approved` | Ready to send | → `sent` |
| `sent` | Awaiting candidate signature | → `signed`, → `expired` |
| `signed` | Contract executed | → `onboarding` |
| `onboarding` | Trigger onboarding tasks | Terminal |
| `rejected` | Contract rejected | Terminal |
| `expired` | Candidate did not sign in time | Terminal |

---

## 4. Candidate Management Requirements

### 4.1 FR-HR-CM-001: Centralized Candidate Repository

**Requirement**: The system shall provide a centralized repository for all candidate data.

**Acceptance Criteria**:
- Stores candidate profiles including: name, contact details, resume/CV, application status, skills, interview history
- Each candidate record has a unique identifier
- Users can search candidates by name, skills, status, or date range
- Duplicate candidate detection alerts users when a candidate with matching email or phone exists
- All candidate data modifications are logged with timestamp and user

### 4.2 FR-HR-CM-002: Workflow & Status Management

**Requirement**: The system shall support customizable candidate workflows with visual stage management.

**Acceptance Criteria**:
- A default candidate lifecycle is provided
- Users with Admin role can add, rename, reorder, or remove workflow stages
- Users cannot delete a stage that contains active candidates; the system displays an error message
- Users can move candidates between stages via drag-and-drop interface
- Stage changes trigger configurable notifications to relevant stakeholders
- Each workflow stage can have an optional SLA (e.g., "candidates should not remain in 'Under Review' for more than 5 business days")

### 4.3 FR-HR-CM-003: Interview Process Management

**Requirement**: The system shall provide interview scheduling and feedback collection capabilities.

**Acceptance Criteria**:
- Users can schedule interviews with date, time, location (physical or virtual), and assigned interviewers
- Interview invitations are sent to candidates and interviewers via email integration
- Calendar integration allows checking interviewer availability before scheduling
- Interviewers can submit structured feedback through a form within the candidate profile
- Feedback forms support rating scales, text comments, and recommendation fields
- Interview history is retained on the candidate profile for future reference

### 4.4 FR-HR-CM-004: Contract Drafting & Compliance

**Requirement**: The system shall provide modular contract drafting with version control and approval workflows.

**Acceptance Criteria**:
- Users with appropriate permissions can create and manage contract templates
- Contract templates support variable fields (candidate name, salary, start date, benefits)
- Users can generate a contract by selecting a template and populating specific terms
- All contract versions are retained with version numbers and timestamps
- Contracts require digital approval from designated approvers before sending
- Contracts include compliance flags for Philippine labor law requirements
- The system prevents sending contracts without required compliance fields completed

### 4.5 FR-HR-CM-005: Data Privacy & Consent

**Requirement**: The system shall enforce data privacy requirements for candidate information.

**Acceptance Criteria**:
- The system records explicit consent from candidates before storing PII
- Consent records include: consent type (job processing, marketing), date, and consent text shown
- The candidate profile displays current consent status
- The system supports "Right to be Forgotten" requests: authorized users can anonymize a candidate record
- Anonymization removes PII while retaining anonymized aggregate data for analytics
- An export function generates a machine-readable file (JSON/CSV) for Subject Access Requests

---

## 5. Philippine Compliance Requirements

### 5.1 FR-HR-COMP-001: DPA Consent Enforcement

**Requirement**: The system shall enforce Philippine Data Privacy Act requirements.

**Acceptance Criteria**:
- Consent required before PII storage (links to FR-HR-CM-005)
- Consent withdrawal immediately restricts further processing
- All consent actions are audited via Platform Core Audit Service
- Data used only for stated purposes (purpose limitation)

### 5.2 FR-HR-COMP-002: DPA Subject Rights

**Requirement**: The system shall support data subject rights under DPA.

**Acceptance Criteria**:
- Subject Access Request (SAR) export supported (JSON/CSV)
- Anonymization supported for erasure requests
- Audit trail of all SAR actions
- Response within regulatory timeframes

### 5.3 FR-HR-COMP-003: DOLE Contract Compliance

**Requirement**: The system shall validate contracts against DOLE regulations.

**Acceptance Criteria**:
- Mandatory benefits validated (SSS, PhilHealth, Pag-IBIG)
- Probation term limits enforced
- Non-compliant contracts blocked from approval
- Compliance issues displayed with specific remediation

### 5.4 FR-HR-COMP-004: BIR Retention Support

**Requirement**: The system shall support BIR record retention requirements.

**Acceptance Criteria**:
- Employment/contract records retained per configured policy (default 7 years)
- Retention policy changes are auditable
- Warning before records eligible for deletion

### 5.5 FR-HR-COMP-005: Tax Data Export

**Requirement**: The system shall support export for payroll/tax integration.

**Acceptance Criteria**:
- Export contains required fields for payroll systems
- Export action is audited
- Format compatible with common payroll providers

---

## 6. HR-Specific Roles (RBAC)

### 6.1 FR-HR-RBAC-001: HR Role Definitions

**Requirement**: The system shall define HR-specific roles extending Core Identity Service.

**Acceptance Criteria**:
- Roles are managed through Platform Core Identity Service (FR-CORE-ID-002)
- Domain-specific roles can be assigned to users
- Role changes are audited

**Role Definitions**:

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| System Admin | Full HR system access | All permissions, user management, workflow config |
| Recruiter | Primary candidate management | Create/edit candidates, schedule interviews, draft contracts |
| Recruiting Coordinator | Support operations | View candidates, schedule interviews, no contracts |
| Interviewer | Interview participation | View assigned candidates, submit feedback only |
| Hiring Manager | Approval authority | View candidates, approve offers, approve contracts |
| Client User | External visibility | View assigned candidates, view reports, no edits |

### 6.2 FR-HR-RBAC-002: Permission Enforcement

**Requirement**: The system shall enforce role-based permissions on all operations.

**Acceptance Criteria**:
- Access denied by default; permissions explicitly granted per role
- Recruiter: create/edit candidates, schedule interviews
- Interviewer: view assigned candidates, submit feedback only
- Client User: view assigned pipeline, no edits
- Hiring Manager: approve offers/contracts
- Access violations are blocked and logged via Audit Service

---

## 7. Integration Requirements (MCP)

This domain requires specific MCP Servers registered with the Core MCP Layer.

### 7.1 Communication Integrations (Priority A+)

| Server | Capabilities | Notes |
|--------|--------------|-------|
| Gmail | ReadInbox, SendEmail, SearchEmail | Application intake, notifications |
| Google Calendar | GetAvailability, CreateEvent, UpdateEvent | Interview scheduling |

### 7.2 Document Integrations (Priority A)

| Server | Capabilities | Notes |
|--------|--------------|-------|
| Google Drive | UploadFile, DownloadFile, ShareFile | Resume/contract storage |
| PDF Parser | ExtractText, ParseStructure | Resume parsing |

### 7.3 Future Integrations (Priority B)

| Server | Capabilities | Notes |
|--------|--------------|-------|
| LinkedIn | GetProfile (limited) | Candidate enrichment |
| DocuSign/PandaDoc | SendForSignature, GetStatus | E-signatures |

---

## 8. User Interface Requirements

### 8.1 Dashboard Widgets

| Widget | Purpose |
|--------|---------|
| Pipeline Overview | Visual Kanban of all active candidates |
| Pending Approvals | HITL items awaiting decision |
| SLA Alerts | Candidates approaching/exceeding stage limits |
| Interview Schedule | Upcoming interviews |
| Recent Activity | Timeline of system events |

### 8.2 Core Screens

| Screen | Purpose |
|--------|---------|
| Candidate Profile | Full candidate view with history |
| Interview Scheduler | Calendar-based scheduling |
| Contract Builder | Template selection and customization |
| Compliance Dashboard | DPA consent status, retention alerts |
| Client Portal | Filtered view for external clients |

---

## 9. Non-Functional Requirements

### 9.1 Performance

| Metric | Target |
|--------|--------|
| Application acknowledgment | <5 minutes from receipt |
| Resume parsing | <30 seconds |
| Dashboard load | <2 seconds |
| Search results | <1 second for 10,000 candidates |

### 9.2 Availability

| Metric | Target |
|--------|--------|
| System uptime | 99.9% |
| Maintenance window | Sundays 02:00-06:00 PHT |

---

## 10. Validation Scenarios

### 10.1 Scenario: Candidate Onboarding

**Given**: A candidate submits an application via email
**When**: The system processes the application
**Then**:
- Candidate record created in "received" status
- Duplicate check performed
- Consent request sent if not already consented
- Recruiter notified of new application

### 10.2 Scenario: Consent Enforcement

**Given**: A candidate has not provided consent
**When**: A recruiter attempts to view candidate PII
**Then**: PII is masked and workflow cannot proceed past "consent_pending"

### 10.3 Scenario: Contract Compliance Block

**Given**: A contract is missing mandatory benefits fields
**When**: The contract enters compliance_check
**Then**: Workflow returns to "drafting" with specific missing fields listed

### 10.4 Scenario: Client Access Control

**Given**: A Client User is logged in
**When**: They attempt to view a candidate not assigned to their account
**Then**: Access is denied and attempt is logged

---

## 11. Traceability Matrix

| Requirement ID | Description | BRD Reference | Original FRD |
|----------------|-------------|---------------|--------------|
| FR-HR-CM-001 | Centralized Candidate Repository | BO-HR-001 | CM1 |
| FR-HR-CM-002 | Workflow & Status Management | BO-HR-002 | CM2 |
| FR-HR-CM-003 | Interview Process Management | BO-HR-001 | CM3 |
| FR-HR-CM-004 | Contract Drafting & Compliance | BO-HR-002 | CM4 |
| FR-HR-CM-005 | Data Privacy & Consent | Section 5 | CM5 |
| FR-HR-COMP-001-005 | Philippine Compliance | Section 5 | Section 5.2 |
| FR-HR-RBAC-001-002 | Role Definitions | Section 6 | Section 5.1 |

---

## 12. Downstream TSD Links

The following Technical Specification Documents implement the requirements defined in this FRD:

| TSD ID | Document | Implements |
|--------|----------|------------|
| TSD-HR-CANDIDATE-MGMT | [candidate-management.md](../04-specs/hr/candidate-management.md) | FR-HR-CM-001 through FR-HR-CM-005 |
| TSD-HR-WORKFLOW | [workflow-automation.md](../04-specs/hr/workflow-automation.md) | Workflow automation requirements |
| TSD-CORE-DATABASE | [database.md](../04-specs/database.md) | HR domain data model (Section 2) |
| TSD-CORE-FILE-STORAGE | [file-storage.md](../04-specs/file-storage.md) | Resume/contract storage |

---

## 13. References

| Document | Purpose |
|----------|---------|
| Platform Core FRD | Shared infrastructure requirements |
| HR Domain BRD Addendum | Business requirements this FRD implements |
| Original FRD v2.0 | Historical reference (`docs/_archived/`) |
| Platform Core ADD | Architecture design document |

---

**END OF HR DOMAIN FRD**
