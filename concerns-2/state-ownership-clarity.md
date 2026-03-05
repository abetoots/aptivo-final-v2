---
concern: state-ownership-clarity
version: 1.0
name: State Ownership Clarity
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "State Ownership Clarity" (state-ownership-clarity v1.0). Severity level: error. Every piece of stateful data that crosses component boundaries must have:
1. A clearly identified owner component (single source of truth)
2. A documented write access model (single-owner vs. multi-writer)
3. A documented handoff protocol (how state moves between components)
4. A conflict resolution strategy (when concurrent writes occur)
5. A persistence location (where the authoritative state lives)

State ownership is the root cause concern for many data consistency
issues. When ownership is unclear, idempotency gaps, failure domain
violations, and persistence bugs become inevitable. Produce structured JSON output following the evidence_required fields in the schema.

## Prompt

# Documentation Validation: Guided Reasoning Evaluation

You are a documentation validator performing structured verification. Your task is to evaluate project documentation against a formally-defined concern schema.

## How This Works

1. You will receive a **Concern Schema** (in YAML format) that defines:
   - What engineering invariant must be validated
   - What questions to answer
   - What evidence structure to produce
   - What conditions constitute a gap/failure

2. You will receive **Project Documents** to evaluate

3. Your job is to:
   - Execute the evaluation defined in `evaluation.question`
   - Produce findings in the structure defined by `evidence_required`
   - Flag gaps according to `failure_condition`
   - Cite specific source locations for all findings

---

## Section A: Concern Schema

The following YAML defines what you are evaluating. Read it carefully - it is your evaluation specification.

```yaml
# =============================================================================
# CONCERN: State Ownership Clarity
# =============================================================================
# This concern validates that every stateful handoff in the system has a
# clearly documented owner, source of truth, and conflict resolution strategy.
# This is a "root cause" concern - unclear state ownership is the underlying
# cause of many data inconsistency bugs that manifest as other problems.
#
# WHY THIS MATTERS:
# When two or more components can modify the same state, and ownership is
# undocumented, the result is: split-brain scenarios, lost updates, stale
# reads, and subtle data corruption that may not surface for weeks. This is
# especially dangerous in distributed systems where network partitions and
# async messaging make "who wrote last?" a non-trivial question.
#
# TYPICAL MANIFESTATION:
# - Two services both write to the same database table
# - Event-driven system where multiple consumers update the same entity
# - Handoff from ServiceA to ServiceB with no documented "source of truth"
# - State replicated across services with no conflict resolution
# =============================================================================

concern:
  id: "state-ownership-clarity"
  version: "1.0"
  name: "State Ownership Clarity"
  category: "core"
  severity: "error"

  description: |
    Every piece of stateful data that crosses component boundaries must have:
    1. A clearly identified owner component (single source of truth)
    2. A documented write access model (single-owner vs. multi-writer)
    3. A documented handoff protocol (how state moves between components)
    4. A conflict resolution strategy (when concurrent writes occur)
    5. A persistence location (where the authoritative state lives)

    State ownership is the root cause concern for many data consistency
    issues. When ownership is unclear, idempotency gaps, failure domain
    violations, and persistence bugs become inevitable.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - microservices
    - distributed
    - async-workflows
    - event-driven
    - message-queue

  escalate_if:
    - payments        # payment state ownership must be unambiguous
    - approval-gates  # approval state handoffs are critical
    - pii             # personal data ownership has compliance implications

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every piece of state that crosses component
    boundaries, then evaluate whether ownership and handoff are documented.

    STEP 1: IDENTIFY STATEFUL ARTIFACTS
    Scan all documents for data that is created, modified, or read by
    multiple components:
    - Domain entities (orders, users, payments, approvals)
    - Workflow state (status fields, phase tracking, progress)
    - Configuration and feature flags
    - Cached or replicated data
    - Session state and authentication tokens
    - Audit logs and event histories

    For each, identify which components touch it (read and/or write).

    STEP 2: DETERMINE OWNERSHIP MODEL
    For each stateful artifact, determine:

    a) Who is the owner?
       - Is there a single source of truth?
       - Is it explicitly documented or only implied?
       - Look for: "owned by", "source of truth", "authoritative", "master"

    b) What is the write access model?
       - Single-owner: only one component writes; others read via API or events
       - Multi-writer: multiple components can write (requires coordination)
       - Shared-database: components write directly to shared storage
       - Unknown: not documented

    c) How does state move between components?
       - API calls (synchronous handoff)
       - Events/messages (asynchronous handoff)
       - Shared database (implicit handoff)
       - File/blob transfer

    STEP 3: EVALUATE HANDOFF PROTOCOLS
    For each state handoff, determine:
    - Is the handoff point explicitly identified?
    - Is the handoff protocol documented (how state is transferred)?
    - What happens if the handoff fails?
    - Is there a rollback or compensation mechanism?

    STEP 4: EVALUATE CONFLICT RESOLUTION
    For multi-writer scenarios:
    - How are concurrent writes detected?
    - How are conflicts resolved? (last-writer-wins, merge, manual)
    - Is there optimistic concurrency (version fields)?
    - Is there pessimistic locking?
    - What happens during network partitions?

    STEP 5: FLAG OWNERSHIP GAPS
    Any stateful artifact where ownership is ambiguous is a gap.
    Pay special attention to:
    - Data modified by multiple services (hidden multi-writer)
    - Event-driven updates where multiple consumers act on the same entity
    - Cached copies without documented staleness guarantees
    - State that "just appears" in a database without a documented writer

  checklist:
    - id: "ownership-declaration"
      question: "Is the owner component explicitly identified for each stateful artifact?"
    - id: "write-access-model"
      question: "Is the write access model documented (single-owner, multi-writer, shared-db)?"
    - id: "handoff-protocol"
      question: "Are state handoff points and protocols documented?"
    - id: "conflict-resolution"
      question: "For multi-writer state, is conflict resolution documented?"
    - id: "source-of-truth"
      question: "Is the source of truth identified for each piece of cross-boundary state?"

  evidence_required:
    - field: "state_artifact"
      type: "string"
      description: "Name of the stateful data (e.g., 'Order.status', 'PaymentRecord', 'ApprovalState')"
      required: true

    - field: "owner_component"
      type: "string | null"
      description: "Component that owns this state (e.g., 'OrderService', 'PaymentService'). NULL if unclear."
      required: true

    - field: "source_of_truth"
      type: "string | null"
      description: "Where the authoritative version lives (e.g., 'OrderService.order_db.orders table', 'Temporal workflow state')"
      required: true

    - field: "write_access_model"
      type: "enum"
      values:
        - "single-owner"
        - "multi-writer"
        - "shared-database"
        - "unknown"
      description: "How write access is structured for this state"
      required: true

    - field: "handoff_point"
      type: "string | null"
      description: "Where state transitions between components (e.g., 'OrderService emits OrderPaid event consumed by FulfillmentService')"
      required: true

    - field: "handoff_protocol"
      type: "string | null"
      description: "How the handoff works (e.g., 'Async event via RabbitMQ', 'Synchronous API call POST /fulfill', 'Shared database write')"
      required: true

    - field: "conflict_resolution"
      type: "string | null"
      description: "How concurrent writes are handled (e.g., 'Optimistic concurrency with version field', 'Last-writer-wins', 'Not applicable - single owner')"
      required: true

    - field: "persistence_location"
      type: "string | null"
      description: "Where this state is physically stored (e.g., 'PostgreSQL orders.status column', 'Redis cache with 5m TTL')"
      required: true

    - field: "source_location"
      type: "string"
      description: "Exact location where this is documented (e.g., 'ADD Section 4.1, Data Architecture')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. owner_component is NULL for any stateful artifact that is modified by
       multiple components (no declared owner)

    2. write_access_model is "unknown" - team hasn't analyzed who can write

    3. write_access_model is "multi-writer" or "shared-database" AND
       conflict_resolution is NULL (concurrent writes possible without
       documented resolution strategy)

    4. source_of_truth is NULL for any artifact involved in cross-service
       handoffs (no authoritative version declared)

    5. handoff_point is NULL for state that moves between components
       (implicit handoff via shared database without documented protocol)

    6. A payment or approval state artifact has any of the above gaps

    Report as WARNING when:

    1. write_access_model is "shared-database" even with conflict resolution
       (shared database is an anti-pattern that creates hidden coupling;
       should document why this trade-off was chosen)

    2. conflict_resolution is "last-writer-wins" without justification
       (this is often a sign of unconsidered conflict handling)

    3. State is replicated/cached across services but staleness guarantees
       are not documented

    4. handoff_protocol is documented but failure handling for the handoff
       is not (what happens when the event is lost?)

    5. owner_component is declared but downstream components can directly
       modify the underlying storage (bypass of ownership)

  recommendation_template: |
    ## Gap: {state_artifact} - Unclear State Ownership

    **Location:** {source_location}
    **Current Owner:** {owner_component}
    **Write Model:** {write_access_model}

    ### Required Documentation

    Add explicit documentation covering:

    1. **Owner Declaration**
       - Which component is the single source of truth?
       - Why this component? (closest to the business logic)
       - Example: "Order.status is owned by OrderService. All status changes
         go through OrderService API. Other services read via events."

    2. **Write Access Model**
       - Who can write? Through what interface?
       - Example: "Single-owner: only OrderService writes to orders table.
         PaymentService communicates status via PaymentCompleted event."

    3. **Handoff Protocol**
       - How does state move between components?
       - What guarantees does the handoff provide?
       - Example: "OrderService emits OrderPaid event to RabbitMQ.
         FulfillmentService consumes and creates shipment. Event includes
         order_id, amount, and version for idempotent processing."

    4. **Conflict Resolution** (if multi-writer)
       - How are concurrent writes detected and resolved?
       - Example: "Optimistic concurrency: orders table has version column.
         UPDATE ... WHERE version = expected_version. On conflict, retry
         with fresh read."

# -----------------------------------------------------------------------------
# EXAMPLES: Help the LLM understand what to look for
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 4.2"
      text: |
        "Order.status is owned by OrderService (source of truth: orders table
        in order_db). Only OrderService writes to this field. Status transitions:
        created → payment-pending → paid → fulfilling → shipped → delivered.

        Handoff: When payment completes, PaymentService emits PaymentCompleted
        event. OrderService consumes this event and transitions status to 'paid'.
        Event includes payment_id and order_version for idempotent processing.

        FulfillmentService reads order status via OrderService API (read-only).
        Conflict resolution: N/A (single owner). Version field prevents stale
        event processing."
      assessment: |
        state_artifact: "Order.status"
        owner_component: "OrderService"
        source_of_truth: "orders table in order_db"
        write_access_model: "single-owner"
        handoff_point: "PaymentService emits PaymentCompleted event"
        handoff_protocol: "Async event via RabbitMQ with order_version"
        conflict_resolution: "N/A - single owner; version field prevents stale events"
        persistence_location: "PostgreSQL order_db.orders.status"

  poorly_documented:
    - source: "ADD Section 3.1"
      text: |
        "The order status is updated by the OrderService when processing,
        by the PaymentService when payment completes, and by the
        FulfillmentService when shipment is created."
      assessment: |
        state_artifact: "Order.status"
        owner_component: null
        source_of_truth: null
        write_access_model: "multi-writer"
        handoff_point: null
        handoff_protocol: null
        conflict_resolution: null
        persistence_location: null
        gap: "Three services write to the same field with no documented owner,
              no conflict resolution, and no handoff protocol. If PaymentService
              writes 'paid' while FulfillmentService writes 'fulfilling'
              simultaneously, the result is undefined."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 1
  author: "Multi-Expert Consensus (Claude, Gemini, ChatGPT)"
  related_concerns:
    - "idempotency-boundaries"     # duplicate writes affect state ownership
    - "failure-domain-isolation"   # shared state creates hidden failure domains
    - "durable-persistence"        # persistent state must have clear ownership
  references:
    - "Building Microservices, 2nd Edition (Newman) - Data Ownership"
    - "Designing Data-Intensive Applications, Ch. 5 - Replication (Kleppmann)"
    - "Domain-Driven Design (Evans) - Bounded Contexts and Aggregates"
    - "Pat Helland: Data on the Outside vs. Data on the Inside"

```

---

## Section B: Documents Under Review

## Documents

Read the following files fully before evaluation:

- **BRD** (brd): `docs/01-strategy/platform-core-brd.md`
- **FRD** (frd): `docs/02-requirements/platform-core-frd.md`
- **ADD** (add): `docs/03-architecture/platform-core-add.md`
- **RUNBOOK** (runbook): `docs/06-operations/01-runbook.md`
- **TSD** (tsd): `docs/04-specs/index.md`
- **API_SPEC** (api_spec): `docs/04-specs/openapi/aptivo-core-v1.yaml`
- **GUIDELINE** (guideline): `docs/05-guidelines/05a-Coding-Guidelines.md`

---

## Section C: Your Instructions

### Step 1: Parse the Concern Schema

From the YAML above, identify:
- **Concern ID & Version:** `concern.id` and `concern.version` (or `interaction.id` for interaction matrices)
- **Evaluation Task:** `evaluation.question` - this is your primary task
- **Evidence Structure:** `evidence_required` - this defines your output format
- **Failure Criteria:** `failure_condition` - this defines what constitutes a gap
- **Severity:** `concern.severity` or `interaction.severity`

If the schema includes `evaluation.checklist`, use those as sub-tasks.
If the schema includes `failure_modes` (for interaction matrices), evaluate each one.

### Step 2: Execute the Evaluation

Perform the evaluation task defined in `evaluation.question`.

For each item you find:
- Collect all fields specified in `evidence_required`
- Cite exact source locations (e.g., "ADD Section 4.2, paragraph 3")
- Note your confidence level (high/medium/low)

### Step 3: Identify Gaps

Apply the `failure_condition` criteria to determine gaps.

For each gap:
- Classify severity based on the schema's criteria
- Document what's missing and where you searched
- Provide a concrete recommendation

### Step 4: Produce Structured Output

Return your findings in this JSON structure:

```json
{
  "schema_type": "concern | interaction",
  "schema_id": "[from concern.id or interaction.id]",
  "schema_version": "[from concern.version or interaction.version]",

  "coverage": {
    "complete": true,
    "documents_reviewed": ["BRD", "FRD", "ADD"],
    "missing_or_partial": [],
    "declared_exclusions": []
  },

  "items_evaluated": [
    {
      "source_location": "exact citation",
      "confidence": "high | medium | low"
    }
  ],

  "gaps": [
    {
      "id": "gap-1",
      "related_item": "which item or failure_mode this relates to",
      "severity": "error | warn | note",
      "confidence": "high | medium | low",
      "description": "what is missing",
      "source_searched": "where you looked",
      "failure_condition_triggered": "which condition from the schema",
      "risk": "concrete consequence if unaddressed",
      "recommendation": "specific documentation to add",
      "requires_human_review": false
    }
  ],

  "summary": {
    "items_found": 0,
    "fully_documented": 0,
    "gaps_found": 0,
    "errors": 0,
    "warnings": 0,
    "notes": 0,
    "human_review_required": 0
  },

  "metadata": {
    "confidence_note": "any caveats about this evaluation",
    "coverage_warning": "statement if coverage.complete is false"
  }
}
```

### Confidence Operationalization

| Severity | Confidence | Action |
|----------|------------|--------|
| error | high | Hard block - must fix before sign-off |
| error | medium | Soft block - requires explicit acknowledgment |
| error | low | Human review required - flag `requires_human_review: true` |
| warn | any | Advisory - requires acknowledgment but doesn't block |
| note | any | Informational only |

When `confidence` is `low`, always set `requires_human_review: true`.

---

## Section D: Evaluation Rules

### Citation Requirements

- Every finding MUST include a `source_location`
- Format: "[Document] Section X.Y, paragraph/line Z"
- If you cannot find documentation, describe where you searched

### Evidence Standards

- **Explicit > Implicit:** If something is implied but not stated, that is a gap
- **Specific > Vague:** "Will be handled appropriately" is not documentation
- **Present > Assumed:** Do not assume documentation exists elsewhere

### Severity Classification

Apply the severity rules from `failure_condition` in the schema. Generally:
- **ERROR:** Missing documentation for critical invariants; blocks sign-off
- **WARN:** Incomplete or implicit documentation; requires acknowledgment
- **NOTE:** Minor gaps or suggestions; informational only

---

Now read the Concern Schema in Section A, then evaluate the documents in Section B according to the instructions above.
