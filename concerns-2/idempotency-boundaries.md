---
concern: idempotency-boundaries
version: 1.0
name: Idempotency at Trust Boundaries
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Idempotency at Trust Boundaries" (idempotency-boundaries v1.0). Severity level: error. Every operation that crosses a trust boundary must document:
1. Whether it is idempotent
2. What mechanism enforces idempotency
3. What happens when a duplicate request is received
4. The idempotency window (if time-bounded)

Trust boundaries include: external API calls (outbound), webhook handlers
(inbound), database writes, message queue publishing, payment processing,
and any operation that could be retried or replayed. Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Idempotency at Trust Boundaries
# =============================================================================
# This concern validates that all operations crossing trust boundaries have
# explicitly documented idempotency guarantees. Trust boundaries include:
# external APIs, webhooks, database writes, message publishing, and any
# point where retry/replay could cause duplicate processing.
#
# WHY THIS MATTERS:
# Without idempotency guarantees, retries and message redelivery can cause
# duplicate charges, double-processing, inconsistent state, and data corruption.
# This is one of the most common sources of production incidents in distributed
# systems, yet it's frequently left implicit or undocumented.
# =============================================================================

concern:
  id: "idempotency-boundaries"
  version: "1.0"
  name: "Idempotency at Trust Boundaries"
  category: "core"
  severity: "error"
  
  description: |
    Every operation that crosses a trust boundary must document:
    1. Whether it is idempotent
    2. What mechanism enforces idempotency
    3. What happens when a duplicate request is received
    4. The idempotency window (if time-bounded)
    
    Trust boundaries include: external API calls (outbound), webhook handlers
    (inbound), database writes, message queue publishing, payment processing,
    and any operation that could be retried or replayed.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  # Load when ANY of these signals are present
  any_of:
    - external-api
    - webhooks
    - payments
    - async-workflows
    - message-queue
    - event-driven
    - distributed
    
  # Boost severity if these signals are also present
  escalate_if:
    - payments        # Financial impact
    - approval-gates  # Business process impact
    - pii             # Data integrity impact

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  # Primary question the LLM must answer
  question: |
    Systematically identify every operation in the documented system that 
    crosses a trust boundary, then evaluate its idempotency posture.
    
    STEP 1: IDENTIFY TRUST-BOUNDARY OPERATIONS
    Scan all documents for operations that:
    - Call external APIs or services
    - Handle incoming webhooks or callbacks
    - Write to databases (especially INSERT/UPDATE)
    - Publish messages to queues or event streams
    - Process payments or financial transactions
    - Modify approval states or workflow status
    - Send notifications (email, SMS, push)
    
    STEP 2: FOR EACH OPERATION, DETERMINE
    a) Is idempotency explicitly mentioned?
       - Look for terms: idempotent, idempotency key, deduplication, 
         exactly-once, at-most-once, replay protection
    b) What mechanism is documented?
       - Idempotency key (client-generated or server-generated)
       - Conditional writes (IF NOT EXISTS, version checks)
       - Deduplication window (time-based)
       - Message deduplication (by message ID)
       - Database constraints (unique keys)
    c) What is the documented duplicate behavior?
       - Return cached response
       - Reject with error
       - Silently ignore
       - Undefined/not documented
    d) Is there an idempotency window/TTL?
       - How long is an idempotency key valid?
       - What happens after expiry?
    
    STEP 3: IDENTIFY RETRY SOURCES (CAUSAL ANALYSIS)
    For each operation, identify ALL sources that could cause re-execution:
    - Client-side retry (on timeout, network error)
    - Load balancer retry (on 502/503/timeout)
    - SDK built-in retry (AWS SDK, Stripe SDK, etc.)
    - Message queue redelivery (at-least-once semantics)
    - Cron/scheduler re-execution on failure
    - Human retry via UI/API
    - Webhook provider retry policies
    - Orchestrator retry (Temporal, Step Functions)
    
    Calculate worst-case retry multiplication:
    Example: client 3x × LB 2x × SDK 3x = 18 potential executions
    
    STEP 4: FLAG GAPS
    Any operation where idempotency is implicit, assumed, or undocumented
    is a gap that must be reported. Pay special attention to operations
    where retry sources are undocumented - this often indicates the team
    hasn't considered the full blast radius of duplicate execution.

  # Specific sub-questions to ensure completeness
  checklist:
    - id: "outbound-api"
      question: "For each external API call, is retry behavior documented with idempotency guarantees?"
    - id: "inbound-webhook"
      question: "For each webhook handler, is duplicate delivery handling documented?"
    - id: "database-write"
      question: "For critical database writes, are there documented safeguards against duplicate inserts?"
    - id: "message-publish"
      question: "For message publishing, is exactly-once or at-least-once semantics documented with dedup strategy?"
    - id: "payment-ops"
      question: "For payment operations, is there an explicit idempotency key strategy?"
    - id: "state-transition"
      question: "For state machine transitions, is duplicate event handling documented?"

  # Structured output requirements
  evidence_required:
    - field: "operation_name"
      type: "string"
      description: "Name or description of the operation (e.g., 'PaymentWebhook.handleEvent')"
      required: true
      
    - field: "operation_type"
      type: "enum"
      values: 
        - "outbound-api-call"
        - "inbound-webhook"
        - "database-write"
        - "message-publish"
        - "payment-operation"
        - "state-transition"
        - "notification-send"
        - "other"
      required: true
      
    - field: "boundary_crossed"
      type: "string"
      description: "What trust boundary is being crossed (e.g., 'External Payment Gateway', 'Order Database')"
      required: true
      
    - field: "idempotency_documented"
      type: "boolean"
      description: "Is idempotency explicitly documented for this operation?"
      required: true
      
    - field: "idempotency_mechanism"
      type: "string | null"
      description: "The documented mechanism (e.g., 'Client-provided idempotency key in X-Idempotency-Key header')"
      required: true
      
    - field: "duplicate_behavior"
      type: "enum | null"
      values:
        - "return-cached-response"
        - "reject-with-error"
        - "silently-ignore"
        - "retry-safe-operation"
        - "undefined"
        - null
      description: "What happens when a duplicate request is received"
      required: true
      
    - field: "idempotency_window"
      type: "string | null"
      description: "TTL or validity window for idempotency (e.g., '24 hours', 'permanent', 'not specified')"
      required: false
      
    - field: "retry_sources"
      type: "array"
      description: "All known sources that could cause re-execution of this operation. REQUIRED for all side-effecting operations. Use ['none identified - justification: ...'] if genuinely none exist."
      examples:
        - "Client retry on timeout"
        - "Load balancer retry on 502/503"
        - "SDK built-in retry (e.g., AWS SDK, Stripe SDK)"
        - "Message queue redelivery (at-least-once)"
        - "Cron job re-execution on failure"
        - "Human retry via UI"
        - "Webhook provider retry (e.g., Stripe retries for 72h)"
      required: true
      
    - field: "max_retry_depth"
      type: "string | null"
      description: "Worst-case multiplication of retry sources (e.g., 'client 3x × LB 2x × SDK 3x = 18x'). Required when multiple retry sources exist."
      required: false
      
    - field: "source_location"
      type: "string"
      description: "Exact location where this is documented (e.g., 'ADD Section 4.2, paragraph 3')"
      required: true
      
    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true
      
    - field: "notes"
      type: "string | null"
      description: "Any additional context or caveats"
      required: false

  # When to report a failure
  failure_condition: |
    Report as ERROR when ANY of the following are true:
    
    1. idempotency_documented is FALSE for any trust-boundary operation
    
    2. idempotency_mechanism is NULL or contains only vague language like
       "will be handled" or "should be idempotent" without specifics
    
    3. duplicate_behavior is NULL or "undefined" for operations involving:
       - Payments or financial transactions
       - Approval or authorization workflows
       - User-facing state changes
    
    4. A payment operation lacks an explicit idempotency key strategy
    
    5. retry_sources is NULL or empty for ANY side-effecting operation
       (database writes, external API calls, payments, state transitions,
       message publishing, notifications). Retries exist whether documented
       or not (SDK defaults, LB behavior, queue redelivery) - teams must
       explicitly enumerate them or state "none identified"
    
    Report as WARNING when:
    
    1. idempotency_window is not specified for time-sensitive operations
    
    2. duplicate_behavior is "silently-ignore" without justification
    
    3. Idempotency is implied by database constraints but not explicitly documented
    
    4. retry_sources lists multiple sources but max_retry_depth is not calculated
       (indicates retry multiplication risk may not be understood)
    
    5. retry_sources states "none identified" without justification - most
       operations have at least one retry source (client timeout, LB, SDK)

  # Template for recommendations
  recommendation_template: |
    ## Gap: {operation_name} - Missing Idempotency Documentation
    
    **Location:** {source_location}
    **Operation Type:** {operation_type}
    **Trust Boundary:** {boundary_crossed}
    
    ### Required Documentation
    
    Add explicit documentation covering:
    
    1. **Idempotency Mechanism**
       - What key/identifier is used to detect duplicates?
       - Is it client-provided or server-generated?
       - Example: "The client must provide a unique `X-Idempotency-Key` header.
         The server stores this key with the request hash for 24 hours."
    
    2. **Duplicate Behavior**
       - What happens when a duplicate is detected?
       - Example: "Duplicate requests return the cached response from the
         original request with HTTP 200. No side effects are repeated."
    
    3. **Idempotency Window** (if applicable)
       - How long is the idempotency key valid?
       - What happens after expiry?
       - Example: "Idempotency keys expire after 24 hours. Requests with
         expired keys are treated as new requests."
    
    ### Example Documentation Pattern
    
    ```
    ## {operation_name} - Idempotency Guarantee
    
    This operation is idempotent. Duplicate handling:
    
    - **Mechanism:** [describe how duplicates are detected]
    - **Behavior:** [describe what happens on duplicate]
    - **Window:** [specify TTL if applicable]
    - **Client Contract:** [what callers must do]
    ```

# -----------------------------------------------------------------------------
# EXAMPLES: Help the LLM understand what to look for
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 5.2"
      text: |
        "The payment webhook handler uses the `event_id` from the payment 
        provider as an idempotency key. Before processing, we check if this 
        event_id exists in the processed_events table. If found, we return 
        HTTP 200 without reprocessing. The event_id is retained for 30 days."
      assessment: |
        idempotency_documented: true
        idempotency_mechanism: "event_id from provider, stored in processed_events table"
        duplicate_behavior: "return-cached-response"
        idempotency_window: "30 days"
        
  poorly_documented:
    - source: "ADD Section 4.1"
      text: |
        "The order service calls the payment gateway to process charges.
        Retries are attempted up to 3 times on failure."
      assessment: |
        idempotency_documented: false
        idempotency_mechanism: null
        duplicate_behavior: null
        gap: "Retry behavior documented but no idempotency key strategy. 
              3 retries could result in 3 charges if the failure occurs 
              after the charge is processed but before response is received."

  implicit_not_explicit:
    - source: "ADD Section 3.3"
      text: |
        "User records are inserted with a unique email constraint.
        Duplicate registrations are rejected by the database."
      assessment: |
        idempotency_documented: false (implicit via DB constraint)
        idempotency_mechanism: "Database unique constraint on email"
        duplicate_behavior: "reject-with-error"
        gap: "Idempotency is achieved via database constraint but not 
              explicitly documented as an idempotency strategy. Should 
              document the intended behavior and error handling."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "Multi-Expert Consensus (Claude, Gemini, ChatGPT)"
  references:
    - "Stripe API Idempotency: https://stripe.com/docs/api/idempotent_requests"
    - "AWS Lambda Powertools Idempotency: https://docs.powertools.aws.dev/lambda/python/latest/utilities/idempotency/"
    - "Designing Data-Intensive Applications, Ch. 11 (Kleppmann)"

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

---

## Resolution Status

**Evaluated**: 2026-03-01 (Session 3: API Contracts & Schema)
**Review**: `API_CONTRACTS_SCHEMA_MULTI_REVIEW.md`
**Verdict**: PASS — 0 ERRORs, 4 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| W6: Workflow CRUD no explicit idempotency | WARN | Accepted (low-frequency admin operation) |
| W7: Novu transactionId dedup window undocumented | WARN | Accepted (requires integration testing) |
| W8: Role assignment implicitly idempotent | WARN | Accepted (PUT semantics) |
| W9: MCP Redis recovery edge case | WARN | Accepted (requires human review for financial ops) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
