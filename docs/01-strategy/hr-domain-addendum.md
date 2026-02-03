---
id: BRD-HR-DOMAIN
title: HR Operations Domain - Business Requirements Addendum
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-02'
parent: platform-core-brd.md
---

# HR Operations Domain - Business Requirements Addendum

**Version**: 1.0.0
**Date**: February 2, 2026
**Status**: Draft
**Parent Document**: `platform-core-brd.md`

---

## Document Purpose

This addendum defines **HR/agency operations-specific** business requirements that extend the Aptivo Platform Core. It does NOT redefine shared infrastructure - those are inherited from the parent document.

**What this document covers**:
- HR-specific business objectives
- Candidate management requirements
- Agency workflow definitions
- Philippine regulatory compliance (DPA, DOLE, BIR)
- Client relationship requirements

**What this document does NOT cover** (see Platform Core BRD):
- Workflow engine architecture
- HITL approval mechanism
- LLM gateway
- Notification system
- Identity/authentication
- Audit logging infrastructure

---

## 1. Domain Overview

### 1.1 Purpose

AI-augmented HR operations platform for an outsourcing digital agency, automating candidate management, interview scheduling, contract workflows, and client visibility.

### 1.2 Target Users

| User | Role | Primary Needs |
|------|------|---------------|
| HR Recruiter | Primary operator | Candidate pipeline management, time savings |
| Hiring Manager | Decision maker | Candidate review, offer approval |
| Client User | External stakeholder | Pipeline visibility, oversight |
| Candidate | Job applicant | Transparent process, quick responses |
| VA Team (6-8) | Service delivery | Task management, client communication |

### 1.3 Business Value

- Reduce time-to-hire by 25%
- Automate 60% of routine HR administrative tasks
- Achieve 90% candidate retention rate within 2 years
- Provide clients with real-time pipeline visibility

### 1.4 Market Strategy (Revised)

**Original BRD Target**: 15% enterprise market share in 3 years
**Revised Target** (per multi-model consensus): 2-3 SME client pilots with measurable workflow wins

**Rationale**: The team has more experience with foreign clients (GCC, freelancing). Starting with small clients aligns with actual capabilities and service-first commercialization strategy.

---

## 2. Domain-Specific Objectives

### 2.1 Agency Objectives

#### BO-HR-001: Reduce Time-to-Hire
**Target**: 25% reduction within 12 months of launch
**Success Metrics**:
- Baseline: Current time-to-hire (to be measured)
- Target: 25% faster with automated workflows
- Measurement: Days from application to offer acceptance

#### BO-HR-002: Automate Routine HR Tasks
**Target**: 60% of routine tasks automated within 12 months
**Success Metrics**:
- Interview scheduling: Automated
- Candidate screening: AI-assisted
- Contract drafting: Template-based with approval
- Status updates: Automatic notifications

#### BO-HR-003: Improve Candidate Experience
**Target**: 4.5/5 satisfaction score within 2 years
**Success Metrics**:
- Response time: <24 hours
- Process transparency: Real-time status
- Communication quality: Clear, professional

### 2.2 Client Objectives

#### BO-HR-004: Provide Process Visibility
**Target**: Real-time dashboard for client oversight
**Success Metrics**:
- Pipeline status: Always current
- Interview schedules: Visible to client
- Offer/contract status: Trackable

### 2.3 Platform Integration Points

| Platform Core Component | HR Domain Usage |
|------------------------|-----------------|
| Workflow Engine | Candidate lifecycle, interview, contract workflows |
| HITL Gateway | Offer approval, contract approval, hiring decisions |
| MCP Integration | Gmail, Calendar, LinkedIn, PDF parsers |
| LLM Gateway | Resume parsing, candidate matching, email drafting |
| Notification Bus | Candidate emails, client updates, internal alerts |
| Audit Service | PII access logs, consent records, compliance trail |
| Identity Service | HR team, clients, interviewers with role-based access |

---

## 3. Domain Data Requirements

### 3.1 Data Entities (Conceptual)

> **Note**: This section describes *what data must be stored* at the business level. Actual database schemas (tables, columns, types, indexes) are defined in the FRD/TSD. Domain data is isolated from other domains.

#### Core Business Entities

| Entity | Business Purpose |
|--------|------------------|
| Candidates | Applicant profiles with skills and application history |
| Applications | Job applications linking candidates to positions |
| Interviews | Scheduled interviews with feedback collection |
| Contracts | Employment agreements with version control |
| Clients | Client organizations with preferences and active positions |
| Positions | Open job requisitions with requirements |
| Consent Records | DPA/GDPR compliance tracking |

### 3.2 Data Privacy Requirements

| Requirement | Implementation |
|-------------|----------------|
| Consent Recording | Explicit consent before storing PII |
| Right to be Forgotten | Anonymization capability |
| Subject Access Request | Data export in JSON/CSV |
| PII Tagging | Machine-readable privacy markers |
| Access Logging | All PII access logged (via Platform Core) |

### 3.3 Data Retention

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| Contracts | 7 years | BIR/DOLE compliance |
| Candidate PII | Until consent withdrawal + 30 days | DPA compliance |
| Interview feedback | 2 years | Reference for future applications |
| Consent records | 7 years | Compliance audit |
| Audit logs | 7 years | Regulatory requirement |

---

## 4. HR Workflows (Business Process Overview)

> **Scope Note**: This section describes business processes and outcomes at a high level. Detailed workflow specifications (state machines, transitions, acceptance criteria) are defined in the FRD.

### 4.1 Candidate Application Workflow

**Business Outcome**: Efficiently process applications from receipt to hire/reject decision with compliance safeguards.

**Process Summary**:
- Receive applications from multiple channels (email, forms, referrals)
- AI-assisted initial screening and skills extraction
- Human review and interview scheduling
- HITL approval for offers
- Track candidate status with SLA enforcement

**Platform Components Used**: Workflow Engine, MCP Integration, LLM Gateway, HITL Gateway, Notification Bus, Audit Service

**Domain-Specific Business Rules**:
- Duplicate detection for candidates
- SLA tracking (no stage >5 business days)
- Consent required before PII storage

### 4.2 Interview Scheduling Workflow

**Business Outcome**: Automate interview coordination with calendar integration and reminders.

**Process Summary**:
- Check interviewer availability
- Propose and confirm time slots with candidates
- Send automated reminders
- Collect interviewer feedback after completion

**Platform Components Used**: MCP Integration, Notification Bus, HITL Gateway

**Domain-Specific Business Rules**:
- Time zone support for international candidates
- Candidate-initiated rescheduling allowed

### 4.3 Contract Approval Workflow

**Business Outcome**: Ensure compliant, approved employment contracts with full audit trail.

**Process Summary**:
- Draft contracts from templates with populated terms
- Validate compliance with Philippine labor law
- Route for HITL approval
- Track signatures and trigger onboarding

**Platform Components Used**: Workflow Engine, HITL Gateway, MCP Integration, Audit Service

**Domain-Specific Business Rules**:
- Mandatory benefits and probation term validation
- Version control for all contract iterations
- Approval chain enforcement

---

## 5. Regulatory Compliance

### 5.1 Philippine Data Privacy Act (RA 10173)

| Requirement | Implementation |
|-------------|----------------|
| Consent | Explicit consent recorded before PII storage |
| Purpose limitation | Data used only for stated purposes |
| Retention limits | Configurable per data category |
| Breach notification | Audit logs enable rapid response |
| Subject rights | Export, anonymization capabilities |

### 5.2 DOLE Regulations

| Requirement | Implementation |
|-------------|----------------|
| Employment contracts | Template compliance validation |
| Probation terms | System-enforced limits |
| Mandatory benefits | Compliance flags in contract workflow |

### 5.3 BIR Tax Compliance

| Requirement | Implementation |
|-------------|----------------|
| Record retention | 7-year minimum for employment records |
| Tax data export | Data export compatible with external payroll/tax systems |

> **Note**: Actual tax document generation (e.g., BIR Form 2316) is handled by integrated payroll systems. This domain provides data export capabilities, not payroll processing.

### 5.4 GDPR (If EU Data)

| Requirement | Implementation |
|-------------|----------------|
| Right to erasure | Anonymization capability |
| Data portability | JSON/CSV export |
| Consent withdrawal | Immediate processing restriction |

---

## 6. Role Definitions (RBAC)

### 6.1 Internal Roles

| Role | Permissions |
|------|-------------|
| System Admin | Full access, user management, workflow config |
| Recruiter | Create/edit candidates, schedule interviews, draft contracts |
| Recruiting Coordinator | View candidates, schedule interviews, no contracts |
| Interviewer | View assigned candidates, submit feedback |
| Hiring Manager | View candidates, approve offers, approve contracts |

### 6.2 External Roles

| Role | Permissions |
|------|-------------|
| Client User | View assigned candidates, view reports, no edits |
| Candidate (future) | View own status, upload documents |

---

## 7. MCP Tool Requirements

### 7.1 Required MCP Integrations

| Category | Tools | Priority |
|----------|-------|----------|
| Email | Gmail API | A+ |
| Calendar | Google Calendar | A+ |
| Document Storage | Google Drive / S3 | A |
| PDF Processing | PDF parser | A |
| Professional Network | LinkedIn (limited) | B |

### 7.2 Future Integrations

- E-signature: DocuSign / PandaDoc
- Background checks: Third-party providers
- Payroll: Integration with financial systems

---

## 8. Non-Functional Requirements (Business Constraints)

> **Scope Note**: Detailed NFR targets and acceptance criteria are defined in the FRD. This section captures business-critical constraints only.

### 8.1 Critical Business Constraints

| Constraint | Rationale |
|------------|-----------|
| Responsive candidate experience | Quick acknowledgments build trust |
| Business hours availability | HR operations are time-sensitive |
| Data recovery capability | PII and contracts must be recoverable |

### 8.2 Operational Windows

| Constraint | Business Need |
|------------|---------------|
| Low-traffic maintenance | Minimal disruption to hiring processes |
| Philippine timezone alignment | Primary user base is PHT |

---

## 9. Success Metrics (Domain-Specific)

### 9.1 Operational KPIs

| KPI | Baseline | Target |
|-----|----------|--------|
| Time-to-hire | TBD | 25% reduction |
| Manual task hours/week | TBD | 60% reduction |
| Candidate satisfaction | TBD | 4.5/5 |

### 9.2 Business KPIs

| KPI | Target |
|-----|--------|
| Client pilots | 2-3 within 6 months |
| Candidate retention | 90% within 2 years |
| Process automation rate | 60% of routine tasks |

---

## 10. Phase Alignment

### Phase 2B: HR Production (Months 3-6)

**Purpose**: Deliver actual business value for agency operations.

**Deliverables**:
1. HR workflow requirements documented at business level
2. Gmail/Calendar MCP integrations
3. Candidate workflow automation
4. Contract approval with HITL
5. Production-ready HR dashboard

**Validation Gate**: First client pilot using automated candidate pipeline

### Phase 3: Expansion (Month 6+)

**Gated by**:
- [ ] Platform core stable (crypto stress test passing)
- [ ] First client pilot successful
- [ ] Compliance validation complete

**Expansion scope**:
- Additional clients
- Advanced workflows (onboarding automation)
- Reporting/analytics dashboard

---

## 11. Migration from Original BRD

### 11.1 What Changed

| Original BRD | This Addendum |
|--------------|---------------|
| 15% enterprise market share | 2-3 SME client pilots |
| Custom ATS build | Buy/integrate + workflow automation |
| Standalone system | Domain app on shared platform |
| Full feature set | MVP focused on core workflows |

### 11.2 What Remains

- Candidate management as core function
- Contract workflow with compliance
- Client visibility dashboard
- Philippine regulatory compliance

### 11.3 What's Deferred

- Financial & Administrative Module → Buy vs Build analysis
- Customer Support & Ticketing → Integrate existing tools
- Project Management → Use existing tools
- CRM → Use existing tools
- SaaS commercialization → After internal validation

---

## 12. References

| Document | Purpose |
|----------|---------|
| Platform Core BRD | Shared infrastructure requirements |
| HR Domain FRD | Functional requirements (to be created) |
| Original Aptivo BRD v2.0 | Historical reference |
| Multi-Model Review | Strategic analysis |

---

**END OF HR DOMAIN ADDENDUM**
