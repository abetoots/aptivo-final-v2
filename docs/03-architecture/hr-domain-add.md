---
id: ADD-HR
title: HR Domain Architecture Design Document
status: Phase 1 Complete
version: 1.0.0
owner: '@owner'
last_updated: '2026-03-12'
parent: platform-core-add.md
---

# HR Domain Architecture Design Document

**Domain**: Human Resources — Recruitment, Interviews, Contracts
**FRD Reference**: [hr-domain-frd.md](../02-requirements/hr-domain-frd.md)
**Platform ADD**: [platform-core-add.md](platform-core-add.md) (shared infrastructure)

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-03-12 | Initial as-built — Phase 1 complete (Sprints 6-7) |

---

## 1. Domain Boundary

The HR domain owns all recruitment, interview scheduling, and contract management concerns. It depends on — but does not modify — platform-core services.

### 1.1 Owned by HR Domain

| Component | Location |
|-----------|----------|
| Database tables | `candidates`, `applications`, `interviews`, `interview_feedback`, `consent_records`, `positions`, `contracts` |
| Store adapters | `CandidateStore`, `ApplicationStore`, `InterviewStore`, `ContractStore`, `PositionStore` |
| Workflows | `hr-candidate-flow`, `hr-interview-scheduling`, `hr-contract-approval` |
| RBAC | `recruiter`, `hiring-manager`, `interviewer`, `client-user` roles; 18 HR permissions |
| Notification templates | `hr-interview-scheduled`, `hr-offer-approval`, `hr-consent-request`, `hr-new-application` |
| Inngest events | `hr/application.received`, `hr/interview.scheduling.requested`, `hr/contract.approval.requested` + 6 more |

### 1.2 Consumed from Platform Core

| Service | Usage |
|---------|-------|
| LLM Gateway | Resume parsing (`gpt-4o`), contract drafting, compliance checking |
| HITL Gateway | Contract approval requests (72h timeout) |
| Audit Service | Application intake, interview scheduling, contract finalization audit trails |
| Notification Service | Candidate/recruiter/interviewer notifications |
| MCP Layer | Google Calendar (availability check, event creation) |
| File Storage | Resume uploads (via `resumeFileId` FK) |

### 1.3 Regulatory Context

Philippine regulatory requirements (from FRD):
- **DPA (Data Privacy Act)**: Consent-gated candidate data processing; `consent_records` table tracks consent lifecycle
- **DOLE**: Labor compliance checks in contract approval workflow
- **BIR**: Tax compliance flags in contract `complianceFlags` jsonb

---

## 2. Database Architecture

### 2.1 Entity-Relationship Summary

```
positions (open requisitions)
     |
candidates ──── applications ──── interviews ──── interview_feedback
     |               |
consent_records      contracts
```

### 2.2 Table Definitions

#### candidates

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `name` | varchar(200) | NOT NULL |
| `email` | varchar(255) | NOT NULL, UNIQUE |
| `phone` | varchar(50) | nullable |
| `resume_file_id` | uuid | nullable — FK to file storage |
| `skills` | jsonb | default `[]` |
| `status` | varchar(20) | default `active` |
| `consent_status` | varchar(20) | default `pending` |
| `created_at` | timestamp(tz) | default `now()` |
| `updated_at` | timestamp(tz) | default `now()` |

**Indexes**: `candidates_email_idx`, `candidates_status_idx`

#### applications

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `candidate_id` | uuid | FK → `candidates.id`, NOT NULL |
| `position_id` | uuid | nullable |
| `source` | varchar(50) | nullable — `linkedin` \| `referral` \| `website` \| etc. |
| `current_stage` | varchar(30) | default `received` |
| `applied_at` | timestamp(tz) | default `now()` |
| `updated_at` | timestamp(tz) | default `now()` |

**Indexes**: `applications_candidate_id_idx`, `applications_current_stage_idx`

#### interviews

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `application_id` | uuid | FK → `applications.id`, NOT NULL |
| `interviewer_id` | uuid | nullable |
| `date_time` | timestamp(tz) | NOT NULL |
| `location` | varchar(500) | nullable |
| `type` | varchar(20) | NOT NULL — `technical` \| `behavioral` \| `culture-fit` \| `screening` \| `panel` \| `final` |
| `status` | varchar(20) | default `scheduling` |
| `created_at` | timestamp(tz) | default `now()` |

**Indexes**: `interviews_application_id_idx`, `interviews_status_idx`

#### interview_feedback

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `interview_id` | uuid | FK → `interviews.id`, NOT NULL, UNIQUE |
| `rating` | integer | NOT NULL — 1-5 scale |
| `strengths` | text | nullable |
| `concerns` | text | nullable |
| `recommendation` | varchar(20) | NOT NULL — `strong_yes` \| `yes` \| `neutral` \| `no` \| `strong_no` |
| `submitted_at` | timestamp(tz) | default `now()` |

#### consent_records

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `candidate_id` | uuid | FK → `candidates.id`, NOT NULL |
| `consent_type` | varchar(50) | NOT NULL |
| `consent_date` | timestamp(tz) | NOT NULL |
| `consent_text` | text | NOT NULL |
| `withdrawn_at` | timestamp(tz) | nullable |

**Indexes**: `consent_records_candidate_id_idx`

#### positions

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `title` | varchar(200) | NOT NULL |
| `client_id` | uuid | nullable |
| `requirements` | jsonb | default `[]` |
| `status` | varchar(20) | default `open` |
| `sla_business_days` | integer | default `30` |
| `created_at` | timestamp(tz) | default `now()` |
| `updated_at` | timestamp(tz) | default `now()` |

**Indexes**: `positions_status_idx`

#### contracts

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `candidate_id` | uuid | FK → `candidates.id`, NOT NULL |
| `template_slug` | varchar(100) | NOT NULL |
| `terms` | jsonb | default `{}` |
| `version` | integer | default `1` |
| `status` | varchar(30) | default `drafting` |
| `compliance_flags` | jsonb | default `[]` |
| `created_at` | timestamp(tz) | default `now()` |
| `updated_at` | timestamp(tz) | default `now()` |

**Indexes**: `contracts_candidate_id_idx`, `contracts_status_idx`

---

## 3. Store Adapters

All stores follow the platform-core factory pattern: `createDrizzle*Store(db) → *Store`.

### 3.1 CandidateStore

```typescript
interface CandidateStore {
  create(candidate: { name; email; phone?; resumeFileId?;
    skills?; consentStatus? }): Promise<{ id: string }>;
  findById(id: string): Promise<CandidateRecord | null>;
  findByEmail(email: string): Promise<CandidateRecord | null>;
  updateStatus(id: string, status: string): Promise<void>;
}
```

### 3.2 ApplicationStore

```typescript
interface ApplicationStore {
  create(application: { candidateId; positionId?;
    source?; currentStage? }): Promise<{ id: string }>;
  findByCandidate(candidateId: string): Promise<ApplicationRecord[]>;
  updateStage(id: string, stage: string): Promise<void>;
}
```

### 3.3 InterviewStore

```typescript
interface InterviewStore {
  create(interview: { applicationId; interviewerId?;
    dateTime; location?; type; status? }): Promise<{ id: string }>;
  findByApplication(applicationId: string): Promise<InterviewRecord[]>;
  updateStatus(id: string, status: string): Promise<void>;
}
```

### 3.4 ContractStore

```typescript
interface ContractStore {
  create(contract: { candidateId; templateSlug; terms?;
    version?; status?; complianceFlags? }): Promise<{ id: string }>;
  findById(id: string): Promise<ContractRecord | null>;
  updateStatus(id: string, status: string): Promise<void>;
}
```

### 3.5 PositionStore

```typescript
interface PositionStore {
  create(position: { title; clientId?; requirements?;
    status?; slaBusinessDays? }): Promise<{ id: string }>;
  findById(id: string): Promise<PositionRecord | null>;
  findOpen(): Promise<PositionRecord[]>;
}
```

### 3.6 Composition Root Wiring

```typescript
// apps/web/src/lib/services.ts
export const getCandidateStore = lazy(() => createDrizzleCandidateStore(db()));
export const getApplicationStore = lazy(() => createDrizzleApplicationStore(db()));
export const getInterviewStore = lazy(() => createDrizzleInterviewStore(db()));
export const getContractStore = lazy(() => createDrizzleContractStore(db()));
export const getPositionStore = lazy(() => createDrizzlePositionStore(db()));
```

---

## 4. Workflow Architecture

### 4.1 Candidate Application Flow (S6-HR-01)

**Trigger**: `hr/application.received`
**Retries**: 0

#### Pipeline

| Step | Type | Description |
|------|------|-------------|
| 1. `parse-resume` | LLM Gateway | GPT-4o extracts name, email, phone, skills from resume text |
| 2. `check-duplicate` | Store | `findByEmail()` — deduplication check |
| 3. `create-candidate` | Store | Create/reuse candidate + create application (stage: `received`) |
| 4. `consent-check` | Notification | `hr-consent-request` template to new candidates (fire-and-forget) |
| 5. `notify-recruiter` | Notification | `hr-new-application` template (fire-and-forget) |
| 6. `audit-trail` | Audit | `hr.application.received` (fire-and-forget) |

#### Result Type

```typescript
type CandidateFlowResult =
  | { status: 'created'; candidateId: string; applicationId: string; isNew: boolean }
  | { status: 'error'; step: string; error: string };
```

#### State Transition Diagram

```
hr/application.received
         |
    [parse-resume] (LLM)
         |
    [check-duplicate]
         |---(exists)---> reuse candidate
         |---(new)------> create candidate
         |
    [create-candidate + application]
         |
    [consent-check] (fire-and-forget)
         |
    [notify-recruiter] (fire-and-forget)
         |
    [audit-trail] ---> CREATED
```

### 4.2 Interview Scheduling (S7-HR-01)

**Trigger**: `hr/interview.scheduling.requested`
**Retries**: 1

#### Pipeline

| Step | Type | Description |
|------|------|-------------|
| 1. `check-availability` | MCP | `google-calendar.getAvailableSlots()` — 7-day lookahead |
| 2. `propose-slots` | Notification | Top 3 slots via `hr-interview-slots` template |
| 3. `wait-for-selection` | Event Wait | `hr/interview.slot.selected` — 48h timeout |
| 4. `create-calendar-event` | MCP | `google-calendar.createEvent()` |
| 5. `update-interview-status` | Store | Set status to `confirmed` |
| 6. `notify-parties` | Notification | `hr-interview-confirmed` to candidate + interviewer |
| 7. `audit-trail` | Audit | `hr.interview.scheduled` |

#### Slot Validation (P1.5-07 fix)

After `waitForEvent` returns, the selected slot is validated against the originally proposed set. This prevents slot injection where a manipulated event could book an unauthorized time.

#### Interview Duration by Type

| Type | Duration |
|------|----------|
| `technical` | 60 min |
| `behavioral` | 45 min |
| `culture-fit` | 45 min |

#### Result Type

```typescript
type InterviewSchedulingResult =
  | { status: 'confirmed'; interviewId: string; dateTime: string }
  | { status: 'manual_intervention'; reason: string }
  | { status: 'canceled'; reason: string }
  | { status: 'error'; step: string; error: string };
```

#### State Transition Diagram

```
hr/interview.scheduling.requested
         |
    [check-availability] (MCP)
         |---(no slots)---> MANUAL_INTERVENTION
         |---(slots found)
         |
    [propose-slots] (notification)
         |
    [wait-for-selection]
         |---(timeout 48h)---> CANCELED
         |---(slot selected + validated)
         |
    [create-calendar-event] (MCP)
         |
    [update-interview-status] ---> confirmed
         |
    [notify-parties]
         |
    [audit-trail] ---> CONFIRMED
```

### 4.3 Contract Approval (S7-HR-02)

**Trigger**: `hr/contract.approval.requested`
**Retries**: 0

#### Pipeline

| Step | Type | Description |
|------|------|-------------|
| 1. `draft-contract` | LLM Gateway | GPT-4o drafts contract from template + terms; stores in DB |
| 2. `compliance-check` | LLM Gateway | GPT-4o reviews for regulatory compliance flags |
| 3. `hitl-approval` | HITL Gateway | Creates approval request (72h timeout) |
| 4. `wait-for-contract-decision` | Event Wait | `hr/contract.decision.submitted` — 72h timeout |
| 5. `finalize-contract` | Store + Notification | Update status + notify candidate |
| 6. `audit-trail` | Audit | `hr.contract.finalized` |
| 7. `emit-contract-approved` | Event | `hr/contract.approved` for downstream consumers |

#### Timeout Behavior

If the HITL decision is not received within 72 hours:
- Contract status updated to `expired`
- No notification sent (manual follow-up required)
- Audit trail records the expiration

#### Result Type

```typescript
type ContractApprovalResult =
  | { status: 'signed'; contractId: string; candidateId: string }
  | { status: 'rejected'; contractId: string; candidateId: string; reason: string }
  | { status: 'expired'; contractId: string; candidateId: string }
  | { status: 'error'; step: string; error: string };
```

#### State Transition Diagram

```
hr/contract.approval.requested
         |
    [draft-contract] (LLM) ---> status: draft
         |
    [compliance-check] (LLM) ---> status: pending_review
         |
    [hitl-approval]
         |
    [wait-for-contract-decision]
         |---(timeout 72h)---> status: expired ---> EXPIRED
         |---(rejected)------> status: rejected ---> [notify] ---> REJECTED
         |---(approved)
         |
    [finalize-contract] ---> status: signed ---> [notify]
         |
    [audit-trail]
         |
    [emit-contract-approved] ---> SIGNED
```

---

## 5. RBAC Model

### 5.1 Roles

| Role | Scope | Description |
|------|-------|-------------|
| `recruiter` | Full recruitment | Create/edit candidates, schedule interviews, draft contracts |
| `hiring-manager` | Approval authority | View candidates, approve offers + contracts |
| `interviewer` | Interview participation | View assigned candidates, submit feedback |
| `client-user` | External visibility | View assigned candidates + reports (read-only) |

### 5.2 Permissions Matrix

| Permission | recruiter | hiring-manager | interviewer | client-user |
|------------|-----------|----------------|-------------|-------------|
| `hr/candidate.create` | x | | | |
| `hr/candidate.view` | x | x | x | x |
| `hr/candidate.update` | x | | | |
| `hr/application.view` | x | x | | x |
| `hr/application.update` | x | | | |
| `hr/interview.create` | x | | | |
| `hr/interview.view` | x | x | x | |
| `hr/offer.create` | x | | | |
| `hr/offer.approve` | | x | | |
| `hr/offer.view` | | x | | |
| `hr/feedback.submit` | | | x | |

**Enforcement**: `checkPermission(permission)` middleware from platform-core RBAC — see [ADD §14.10](platform-core-add.md).

---

## 6. MCP Integrations

### 6.1 Registered Servers

| Server | Transport | Purpose | Used By |
|--------|-----------|---------|---------|
| `google-calendar` | HTTP | Interview scheduling | `hr-interview-scheduling` steps 1 + 4 |
| `gmail-connector` | HTTP | Email integration | Seeded, Phase 2 direct use |

### 6.2 Phase 2+ MCP Servers (from FRD)

| Server | Purpose |
|--------|---------|
| LinkedIn | Candidate sourcing + profile enrichment |
| DocuSign | Digital contract signing |
| Slack | Interview reminders + team notifications |

---

## 7. Notification Templates

| Slug | Domain | Variables | Usage |
|------|--------|-----------|-------|
| `hr-interview-scheduled` | hr | `candidateName`, `dateTime`, `location` | Post-scheduling confirmation |
| `hr-offer-approval` | hr | `candidateName`, `position`, `salary` | Offer approval request |
| `hr-consent-request` | hr | `candidateName` | DPA consent request to new candidates |
| `hr-new-application` | hr | `candidateName`, `source`, `position` | Recruiter notification |

**Additional templates used in workflows** (referenced but not yet in seed data):
- `hr-interview-slots` — proposed time slots for selection
- `hr-interview-confirmed` — confirmation to candidate + interviewer
- `hr-contract-approved` — contract signed notification
- `hr-contract-rejected` — contract rejection notification

---

## 8. Inngest Event Schema

```typescript
type HrEvents = {
  'hr/application.received': {
    data: { resumeText: string; source: string;
      positionId?: string; candidateEmail?: string };
  };
  'hr/interview.scheduling.requested': {
    data: { applicationId: string; interviewerId: string;
      interviewType: string; candidateEmail: string; candidateName: string };
  };
  'hr/interview.slot.selected': {
    data: { interviewId: string; selectedSlot: string };
  };
  'hr/interview.scheduled': {
    data: { applicationId: string; dateTime: string;
      interviewerId: string; type: string };
  };
  'hr/offer.approved': {
    data: { applicationId: string; candidateId: string;
      position: string; salary: string };
  };
  'hr/consent.withdrawn': {
    data: { candidateId: string; consentType: string; withdrawnAt: string };
  };
  'hr/contract.approval.requested': {
    data: { candidateId: string; positionId: string; templateSlug: string;
      terms: Record<string, unknown>; requestedBy: string; domain: 'hr' };
  };
  'hr/contract.decision.submitted': {
    data: { requestId: string; decision: 'approved' | 'rejected';
      reviewerNotes?: string; domain: 'hr' };
  };
  'hr/contract.approved': {
    data: { contractId: string; candidateId: string;
      positionId: string; domain: 'hr' };
  };
};
```

---

## 9. Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| DPA consent gating | Philippine Data Privacy Act requires explicit consent before processing candidate data |
| 48h slot selection timeout | Balances candidate responsiveness with scheduling urgency |
| 72h contract approval timeout | Longer than trading (15min) — contracts require stakeholder alignment |
| Slot validation post-wait | P1.5-07 fix — prevents event injection of unauthorized time slots |
| LLM-drafted contracts | Accelerates drafting while compliance check catches regulatory issues |
| Separate compliance check step | Decouples contract generation from compliance review — different concerns, different failure modes |
| Fire-and-forget notifications | Notification failures must never block recruitment workflows |
| Separate domain ADD | Platform ADD is 192KB; HR architecture evolves independently in Phase 2 |

---

## 10. Phase 2 Pointers

| Item | Source | Description |
|------|--------|-------------|
| Visual workflow builder | FRD §5.1, ADD deferred | Drag-and-drop workflow customization for recruiters |
| VMS integration | FRD §5.2 | Vendor Management System for staffing agency coordination |
| Compliance automation | FRD §5.3 | Automated DOLE/BIR compliance checks + document generation |
| Advanced analytics | FRD §5.4 | Time-to-hire, source effectiveness, pipeline conversion metrics |
| DocuSign integration | FRD §4.3 | Digital contract signing via MCP |
| Candidate portal | FRD §5.5 | Self-service candidate status tracking |
| Multi-approver HITL | ADD deferred | Contract approval chains with multiple signatories |

---

## 11. File Reference

| Artifact | Path |
|----------|------|
| FRD | `docs/02-requirements/hr-domain-frd.md` |
| Candidate Mgmt TSD | `docs/04-specs/hr/candidate-management.md` |
| Workflow TSD | `docs/04-specs/hr/workflow-automation.md` |
| Schema | `packages/database/src/schema/hr-domain.ts` |
| Store adapters | `packages/database/src/adapters/hr-stores.ts` |
| Seeds | `packages/database/src/seeds/hr-seeds.ts` |
| Candidate flow workflow | `apps/web/src/lib/workflows/hr-candidate-flow.ts` |
| Interview scheduling workflow | `apps/web/src/lib/workflows/hr-interview-scheduling.ts` |
| Contract approval workflow | `apps/web/src/lib/workflows/hr-contract-approval.ts` |
| Composition root | `apps/web/src/lib/services.ts` |
