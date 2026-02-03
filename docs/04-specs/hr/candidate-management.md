---
id: TSD-HR-CANDIDATE-MGMT
title: Candidate Management Module Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
parent: ../../03-architecture/platform-core-add.md
---
# Candidate Management Module Specification

**FRD Reference:** CM1-CM5 (Section 3.1)

---

## 1. Module Overview

### 1.1 Purpose

Centralized management of candidate data, workflows, interviews, and contracts for the recruitment process.

### 1.2 Success Metric

Per BRD v2.0.0: **Reduce time-to-hire by 25% within 12 months of launch.**

### 1.3 Scope

| Feature | FRD Ref | Status |
|---------|---------|--------|
| Candidate Repository | CM1 | ✅ Specified |
| Interview Scheduling | CM2 | ✅ Specified |
| Interview Feedback | CM3 | ✅ Specified |
| Contract Generation | CM4 | ✅ Specified |
| Dashboard & Reporting | CM5 | ✅ Specified |

---

## 2. Service Dependencies

```typescript
interface CandidateServiceDeps extends BaseDependencies {
  // repositories
  candidateRepo: CandidateRepository;
  interviewRepo: InterviewRepository;
  feedbackRepo: InterviewFeedbackRepository;
  contractRepo: ContractRepository;

  // external services
  emailService: EmailService;
  calendarService: CalendarService;
  fileStorage: FileStorageService;

  // internal
  eventBus: EventBus;
  cache: CacheClient;
  logger: Logger;
}

interface CandidateRepository {
  findById(id: string): Promise<Result<Candidate, NotFoundError | PersistenceError>>;
  findByEmail(email: string): Promise<Result<Candidate | null, PersistenceError>>;
  findAll(filters: CandidateFilters, pagination: Pagination): Promise<Result<PaginatedResult<Candidate>, PersistenceError>>;
  create(data: CreateCandidateInput): Promise<Result<Candidate, DuplicateError | PersistenceError>>;
  update(id: string, data: UpdateCandidateInput): Promise<Result<Candidate, NotFoundError | PersistenceError>>;
  delete(id: string): Promise<Result<void, NotFoundError | PersistenceError>>;
}

interface EmailService {
  sendWelcomeEmail(candidate: Candidate): Promise<Result<void, NetworkError>>;
  sendInterviewInvite(interview: Interview, candidate: Candidate): Promise<Result<void, NetworkError>>;
  sendContractEmail(contract: Contract, candidate: Candidate): Promise<Result<void, NetworkError>>;
}

interface CalendarService {
  createEvent(event: CalendarEventInput): Promise<Result<CalendarEvent, NetworkError>>;
  updateEvent(eventId: string, event: CalendarEventInput): Promise<Result<CalendarEvent, NetworkError>>;
  deleteEvent(eventId: string): Promise<Result<void, NetworkError>>;
}

interface FileStorageService {
  generateUploadUrl(key: string, contentType: string): Promise<Result<PresignedUrl, NetworkError>>;
  generateDownloadUrl(key: string, expiresIn?: number): Promise<Result<string, NetworkError>>;
  deleteFile(key: string): Promise<Result<void, NetworkError>>;
}
```

---

## 3. Domain Types

### 3.1 Candidate Entity

```typescript
import { z } from 'zod';

// status enum
export const CandidateStatusSchema = z.enum([
  'new',
  'screening',
  'interviewing',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
]);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

// candidate schema
export const CandidateSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  status: CandidateStatusSchema,
  resumeFileId: z.string().uuid().nullable(),
  source: z.string().nullable(),
  referredById: z.string().uuid().nullable(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

// valid status transitions
export const STATUS_TRANSITIONS: Record<CandidateStatus, CandidateStatus[]> = {
  new: ['screening', 'rejected', 'withdrawn'],
  screening: ['interviewing', 'rejected', 'withdrawn'],
  interviewing: ['offer', 'rejected', 'withdrawn'],
  offer: ['hired', 'rejected', 'withdrawn'],
  hired: [], // terminal
  rejected: [], // terminal
  withdrawn: [], // terminal
};
```

### 3.2 Interview Entity

```typescript
export const InterviewTypeSchema = z.enum([
  'screening',
  'technical',
  'behavioral',
  'panel',
  'final',
]);

export const InterviewStatusSchema = z.enum([
  'scheduled',
  'in_progress',
  'completed',
  'canceled',
  'no_show',
  'rescheduled',
]);

export const InterviewSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  type: InterviewTypeSchema,
  status: InterviewStatusSchema,
  scheduledAt: z.date(),
  durationMinutes: z.number().int().positive(),
  location: z.string().nullable(),
  calendarEventId: z.string().nullable(),
  meetingLink: z.string().url().nullable(),
  outcome: z.enum(['pass', 'fail', 'maybe']).nullable(),
  outcomeNotes: z.string().nullable(),
  completedAt: z.date().nullable(),
  interviewers: z.array(z.object({
    userId: z.string().uuid(),
    role: z.enum(['lead', 'interviewer', 'observer']),
  })),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Interview = z.infer<typeof InterviewSchema>;
```

### 3.3 Domain Errors

```typescript
type CandidateError =
  | ValidationError
  | NotFoundError
  | DuplicateError
  | PersistenceError
  | NetworkError
  | { _tag: 'InvalidEmail'; email: string }
  | { _tag: 'InvalidPhone'; phone: string }
  | { _tag: 'InvalidStatusTransition'; from: CandidateStatus; to: CandidateStatus }
  | { _tag: 'InterviewConflict'; candidateId: string; proposedTime: Date }
  | { _tag: 'ContractAlreadyExists'; candidateId: string };
```

---

## 4. API Endpoints

### 4.1 Candidate CRUD

#### POST /api/v1/candidates

Create a new candidate.

```typescript
// request schema
const CreateCandidateRequestSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  source: z.string().max(100).optional(),
  referredById: z.string().uuid().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  notes: z.string().max(10000).optional(),
});

// response: 201 Created
interface CreateCandidateResponse {
  data: Candidate;
}

// errors: 400 (ValidationError), 409 (DuplicateCandidate)
```

**Business Rules:**
- Email must be unique across all candidates
- Phone validation based on E.164 format
- Initial status is always `new`

**Side Effects:**
- Publishes `aptivo.candidate.created` event
- Sends welcome email (async, non-blocking)

#### GET /api/v1/candidates

List candidates with filtering and pagination.

```typescript
// query parameters
interface ListCandidatesQuery {
  page?: number;        // default: 1
  pageSize?: number;    // default: 20, max: 100
  status?: CandidateStatus | CandidateStatus[];
  source?: string;
  q?: string;           // full-text search
  sort?: 'createdAt' | '-createdAt' | 'name' | '-name';
}

// response: 200 OK
interface ListCandidatesResponse {
  data: Candidate[];
  meta: PaginationMeta;
  links: PaginationLinks;
}
```

**Performance:**
- Cache: 5 minutes for list queries
- P95 latency target: < 500ms

#### GET /api/v1/candidates/{id}

Get candidate by ID.

```typescript
// response: 200 OK
interface GetCandidateResponse {
  data: Candidate & {
    interviews: Interview[];
    contracts: Contract[];
  };
}

// errors: 404 (NotFoundError)
```

**Performance:**
- Cache: 10 minutes per candidate
- Includes related interviews and contracts

#### PATCH /api/v1/candidates/{id}

Update candidate details.

```typescript
// request schema
const UpdateCandidateRequestSchema = CreateCandidateRequestSchema.partial();

// response: 200 OK with updated Candidate
// errors: 400 (ValidationError), 404 (NotFoundError)
```

**Side Effects:**
- Invalidates candidate cache
- Publishes `aptivo.candidate.updated` event

#### PATCH /api/v1/candidates/{id}/status

Update candidate status.

```typescript
// request schema
const UpdateStatusRequestSchema = z.object({
  status: CandidateStatusSchema,
  reason: z.string().max(500).optional(),
});

// response: 200 OK with updated Candidate
// errors: 400 (InvalidStatusTransition), 404 (NotFoundError)
```

**Business Rules:**
- Status transitions must follow `STATUS_TRANSITIONS` map
- Invalid transitions return 400

**Side Effects:**
- Publishes `aptivo.candidate.status-changed` event
- Triggers workflow automation (if configured)
- Sends notification emails for certain transitions

### 4.2 Interview Management

#### POST /api/v1/candidates/{candidateId}/interviews

Schedule an interview.

```typescript
// request schema
const CreateInterviewRequestSchema = z.object({
  type: InterviewTypeSchema,
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  location: z.string().max(500).optional(),
  interviewerIds: z.array(z.string().uuid()).min(1).max(10),
});

// response: 201 Created with Interview
// errors: 404 (CandidateNotFound), 409 (InterviewConflict)
```

**Business Rules:**
- Cannot schedule overlapping interviews for same candidate
- All interviewers must be valid users

**Side Effects:**
- Creates calendar event (timeout: 3s)
- Sends invite emails to all participants
- Publishes `aptivo.interview.scheduled` event

#### GET /api/v1/interviews/{id}

Get interview details.

```typescript
// response: 200 OK
interface GetInterviewResponse {
  data: Interview & {
    candidate: Candidate;
    feedback: InterviewFeedback[];
  };
}
```

#### PATCH /api/v1/interviews/{id}

Update interview (reschedule, cancel).

```typescript
// request schema
const UpdateInterviewRequestSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  location: z.string().max(500).optional(),
  status: z.enum(['canceled', 'rescheduled']).optional(),
});

// response: 200 OK with updated Interview
```

**Side Effects:**
- Updates calendar event
- Sends update notification emails

#### POST /api/v1/interviews/{id}/feedback

Submit interview feedback.

```typescript
// request schema
const SubmitFeedbackRequestSchema = z.object({
  rating: z.number().int().min(1).max(5),
  recommendation: z.enum(['strong_yes', 'yes', 'maybe', 'no', 'strong_no']),
  strengths: z.string().max(5000).optional(),
  concerns: z.string().max(5000).optional(),
  technicalNotes: z.string().max(5000).optional(),
  culturalFitNotes: z.string().max(5000).optional(),
  generalNotes: z.string().max(5000).optional(),
});

// response: 201 Created
// errors: 403 (NotAssignedInterviewer), 409 (FeedbackAlreadySubmitted)
```

**Business Rules:**
- Only assigned interviewers can submit feedback
- Each interviewer can submit feedback only once

### 4.3 Contract Management

#### POST /api/v1/candidates/{candidateId}/contracts

Generate a contract.

```typescript
// request schema
const CreateContractRequestSchema = z.object({
  type: z.enum(['full_time', 'part_time', 'contractor', 'intern', 'consultant']),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
  salaryAmount: z.number().positive(),
  salaryCurrency: z.string().length(3).default('PHP'),
  salaryPeriod: z.enum(['hourly', 'monthly', 'yearly']),
});

// response: 201 Created with Contract
// errors: 409 (ContractAlreadyExists)
```

**Business Rules:**
- Only one active contract per candidate
- Candidate must be in `offer` or `hired` status

**Side Effects:**
- Generates PDF from template
- Uploads to file storage (retry: 3x exponential backoff)
- Publishes `aptivo.contract.generated` event

#### POST /api/v1/contracts/{id}/send

Send contract to candidate for signing.

```typescript
// response: 200 OK
// errors: 400 (ContractNotReady), 404 (NotFoundError)
```

**Business Rules:**
- Contract must be in `draft` or `pending_review` status

**Side Effects:**
- Sends contract email with signing link
- Updates status to `sent`
- Sets expiration date (7 days)

---

## 5. Event Catalog

| Event | When | Payload |
|-------|------|---------|
| `aptivo.candidate.created` | New candidate created | `{ candidateId, email, source }` |
| `aptivo.candidate.updated` | Candidate details changed | `{ candidateId, changes }` |
| `aptivo.candidate.status-changed` | Status transition | `{ candidateId, previousStatus, newStatus, changedBy, reason }` |
| `aptivo.interview.scheduled` | Interview scheduled | `{ interviewId, candidateId, scheduledAt, interviewers }` |
| `aptivo.interview.completed` | Interview finished | `{ interviewId, candidateId, outcome }` |
| `aptivo.contract.generated` | Contract PDF created | `{ contractId, candidateId, type }` |
| `aptivo.contract.sent` | Contract sent for signing | `{ contractId, candidateId, expiresAt }` |
| `aptivo.contract.signed` | Contract signed | `{ contractId, candidateId, signedAt }` |

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Metric | Target |
|--------|--------|
| GET endpoints P95 | < 500ms |
| POST endpoints P95 | < 1000ms |
| File uploads | Support up to 50MB |
| List queries | Support 10,000+ candidates |

### 6.2 Availability

- **SLO:** 99.9% uptime
- **Degradation:** Graceful fallback if calendar/email services unavailable

### 6.3 Data Retention

- **Active candidates:** Retained indefinitely
- **Rejected/withdrawn:** 90 days → soft delete → 24 months → purge
- **Audit logs:** 7 years (compliance)

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Candidate management requirements | [hr-domain-frd.md](../../02-requirements/hr-domain-frd.md) | FR-HR-CM-001 through FR-HR-CM-005 |
| Time-to-hire success metric | [brd.md](../../01-strategy/brd.md) | Section 2.2 (HR Domain) |
| Data privacy requirements | [hr-domain-frd.md](../../02-requirements/hr-domain-frd.md) | FR-HR-CM-005 |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| Candidate database schema | [database.md](../database.md) | Section 2.2 (Candidates Table) |
| Interview scheduling | [workflow-automation.md](workflow-automation.md) | Section 5 (Built-in Actions) |
| File storage for resumes | [file-storage.md](../file-storage.md) | Section 2.2 (Bucket Structure) |
