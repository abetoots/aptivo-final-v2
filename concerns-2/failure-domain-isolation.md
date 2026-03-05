---
concern: failure-domain-isolation
version: 1.0
name: Failure Domain Isolation
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Failure Domain Isolation" (failure-domain-isolation v1.0). Severity level: error. Every component in a distributed system must document:
1. Its failure domain (what boundary contains its failures)
2. Its blast radius (what other components are affected when it fails)
3. How failures propagate (synchronously, asynchronously, or both)
4. What the outcome of propagation is (cascading, contained, degraded)
5. What isolation mechanisms prevent cascade

Failure domains should be explicit, not implicit. Shared resources
(databases, message brokers, config stores) often create hidden
coupling between components that appear independent. Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Failure Domain Isolation
# =============================================================================
# This concern validates that every component in a distributed system has a
# declared failure domain and documented blast radius. Without explicit
# boundaries, a failure in one component can cascade unpredictably through
# the entire system.
#
# WHY THIS MATTERS:
# In distributed systems, the question is not IF a component will fail, but
# WHEN and HOW FAR the failure spreads. Without declared failure domains,
# teams cannot reason about blast radius, cannot design containment
# strategies, and cannot prioritize recovery actions during incidents.
#
# TYPICAL MANIFESTATION:
# - ADD lists microservices but doesn't declare which can fail independently
# - Component fails and takes down unrelated services via shared database
# - No documentation of what happens to Service B when Service A is down
# =============================================================================

concern:
  id: "failure-domain-isolation"
  version: "1.0"
  name: "Failure Domain Isolation"
  category: "core"
  severity: "error"

  description: |
    Every component in a distributed system must document:
    1. Its failure domain (what boundary contains its failures)
    2. Its blast radius (what other components are affected when it fails)
    3. How failures propagate (synchronously, asynchronously, or both)
    4. What the outcome of propagation is (cascading, contained, degraded)
    5. What isolation mechanisms prevent cascade

    Failure domains should be explicit, not implicit. Shared resources
    (databases, message brokers, config stores) often create hidden
    coupling between components that appear independent.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - microservices
    - distributed
    - multi-component
    - event-driven

  escalate_if:
    - payments        # payment service failure must be contained
    - approval-gates  # approval service failure shouldn't block all workflows

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every component in the documented system,
    then evaluate whether failure domains and blast radius are documented.

    STEP 1: IDENTIFY COMPONENTS AND THEIR BOUNDARIES
    Scan all documents for distinct components:
    - Microservices or service modules
    - Databases and data stores
    - Message brokers and event streams
    - External dependencies (third-party APIs)
    - Shared infrastructure (load balancers, API gateways, DNS)
    - Background workers and scheduled jobs

    For each component, identify:
    - What resources does it own exclusively?
    - What resources does it share with other components?
    - What are its upstream dependencies?
    - What are its downstream dependents?

    STEP 2: MAP FAILURE DOMAINS
    A failure domain is a boundary within which failures are contained.
    For each component, determine:
    - Is the failure domain explicitly declared?
    - What shared resources create hidden coupling?
    - Can this component fail without affecting others?

    Look for: failure domain, blast radius, isolation, bulkhead,
    independent deployment, shared nothing, shared database

    STEP 3: EVALUATE BLAST RADIUS
    For each component, determine what happens when it fails:
    - Which other components are directly affected?
    - Are there indirect/transitive effects?
    - Is the failure synchronous (caller blocks) or async (delayed impact)?
    - What is the outcome: cascading failure, contained failure, or graceful degradation?

    STEP 4: EVALUATE ISOLATION MECHANISMS
    For each component, identify what prevents cascade:
    - Circuit breakers on callers
    - Bulkhead patterns (separate thread pools, connection pools)
    - Async decoupling (message queues between components)
    - Fallback behavior (cached responses, degraded mode)
    - Independent databases (no shared-database coupling)

    STEP 5: ASSESS CRITICALITY AND PRIORITIZE
    Not all components are equally important:
    - Critical: failure causes revenue loss or data corruption
    - Standard: failure causes feature degradation
    - Non-critical: failure is tolerable for extended periods

    Ensure critical components have the strongest isolation guarantees.

  checklist:
    - id: "domain-declaration"
      question: "Does each component explicitly declare its failure domain?"
    - id: "blast-radius"
      question: "Is the blast radius documented for each component's failure?"
    - id: "shared-resources"
      question: "Are shared resources (databases, brokers) identified as coupling points?"
    - id: "isolation-mechanisms"
      question: "Are isolation mechanisms documented for preventing cascade?"
    - id: "criticality-assessment"
      question: "Are components classified by criticality with appropriate isolation?"

  evidence_required:
    - field: "component_name"
      type: "string"
      description: "Name of the component (e.g., 'PaymentService', 'OrderDatabase', 'RabbitMQ Broker')"
      required: true

    - field: "criticality"
      type: "enum"
      values:
        - "critical"
        - "standard"
        - "non-critical"
      description: "How critical is this component to overall system operation"
      required: true

    - field: "failure_domain"
      type: "string | null"
      description: "The declared failure domain boundary (e.g., 'Payment subsystem', 'isolated - no shared state', 'shares OrderDB with OrderService')"
      required: true

    - field: "blast_radius"
      type: "string | null"
      description: "What is affected when this component fails (e.g., 'Only payment processing; orders queue for later', 'All services using shared DB')"
      required: true

    - field: "propagation_mode"
      type: "enum"
      values:
        - "sync"
        - "async"
        - "both"
        - "unknown"
      description: "How does failure propagate to other components (sync = caller blocks, async = delayed impact)"
      required: true

    - field: "propagation_outcome"
      type: "enum"
      values:
        - "cascading"
        - "contained"
        - "degraded"
        - "unknown"
      description: "What is the result of failure propagation (cascading = unbounded spread, contained = isolated, degraded = graceful reduction)"
      required: true

    - field: "impacted_components"
      type: "array"
      description: "List of components directly affected by this component's failure (e.g., ['OrderService', 'NotificationService', 'ReportingDashboard'])"
      required: true

    - field: "isolation_mechanisms"
      type: "string | null"
      description: "What prevents cascade (e.g., 'Circuit breaker on callers, async via message queue, separate database')"
      required: true

    - field: "fallback_behavior"
      type: "string | null"
      description: "What callers do when this component is unavailable (e.g., 'Return cached data', 'Queue requests', 'Show maintenance page')"
      required: true

    - field: "source_location"
      type: "string"
      description: "Exact location where this is documented (e.g., 'ADD Section 3.1, Component Overview')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. failure_domain is NULL for any component - no declared isolation boundary

    2. blast_radius is NULL for any component classified as "critical"

    3. propagation_outcome is "cascading" or "unknown" for any component -
       unbounded failure spread is unacceptable

    4. propagation_mode is "unknown" - team hasn't analyzed how failures spread

    5. A shared resource (database, broker) is identified but no isolation
       mechanism is documented for it

    6. impacted_components is empty for a component that has known downstream
       dependents (indicates failure analysis hasn't been performed)

    7. A "critical" component has no documented isolation_mechanisms

    Report as WARNING when:

    1. failure_domain is declared but blast_radius is vague
       (e.g., "limited impact" without specifics)

    2. propagation_outcome is "degraded" but fallback_behavior is NULL
       (degradation is claimed but not specified)

    3. isolation_mechanisms reference patterns (circuit breaker, bulkhead)
       but don't specify configuration

    4. Components share a database but claim independent failure domains
       without documenting how database failure is isolated

    5. criticality is not explicitly assessed - all components treated equally

  recommendation_template: |
    ## Gap: {component_name} - Missing Failure Domain Documentation

    **Location:** {source_location}
    **Criticality:** {criticality}
    **Current Blast Radius:** {blast_radius}

    ### Required Documentation

    Add explicit documentation covering:

    1. **Failure Domain Declaration**
       - What boundary contains this component's failures?
       - What resources are exclusive vs. shared?
       - Example: "PaymentService operates in the payment failure domain.
         It has its own database and communicates via async messages."

    2. **Blast Radius Mapping**
       - What happens when this component is completely unavailable?
       - Which components are directly affected? Transitively?
       - Example: "PaymentService failure affects: order completion (queued),
         refund processing (delayed). Does NOT affect: order browsing, search."

    3. **Isolation Mechanisms**
       - How is cascade prevented?
       - Example: "OrderService uses circuit breaker (5 failures/60s) when
         calling PaymentService. On open circuit, orders are accepted with
         'payment-pending' status and retried via background job."

    4. **Fallback Behavior**
       - What do callers experience during failure?
       - Example: "Users see 'Payment processing delayed' message.
         Order is confirmed with payment retried within 1 hour."

# -----------------------------------------------------------------------------
# EXAMPLES: Help the LLM understand what to look for
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 3.2"
      text: |
        "The PaymentService operates in an isolated failure domain:
        - Own database (payment_db, separate from order_db)
        - Communicates with OrderService via async events (RabbitMQ)
        - No synchronous dependencies on other internal services

        Blast radius: PaymentService failure affects payment processing only.
        Orders continue to be created with 'payment-pending' status.
        OrderService has a circuit breaker (5 failures/60s) on payment calls.
        When circuit opens, payments are queued and retried hourly."
      assessment: |
        component_name: "PaymentService"
        criticality: "critical"
        failure_domain: "Isolated - own database, async communication"
        blast_radius: "Payment processing only; orders queue with payment-pending"
        propagation_mode: "async"
        propagation_outcome: "degraded"
        impacted_components: ["OrderService (degraded - queues payments)"]
        isolation_mechanisms: "Separate database, async via RabbitMQ, circuit breaker on callers"
        fallback_behavior: "Orders accepted with payment-pending, retried hourly"

  poorly_documented:
    - source: "ADD Section 2.1"
      text: |
        "The system consists of OrderService, PaymentService, and
        NotificationService. All services use the shared application database."
      assessment: |
        component_name: "OrderService"
        criticality: "critical"
        failure_domain: null
        blast_radius: null
        propagation_mode: "unknown"
        propagation_outcome: "unknown"
        impacted_components: []
        isolation_mechanisms: null
        fallback_behavior: null
        gap: "Shared database creates hidden coupling. If PaymentService causes
              database lock contention or schema migration issues, OrderService
              and NotificationService are also affected. No failure domains declared."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 1
  author: "Multi-Expert Consensus (Claude, Gemini, ChatGPT)"
  related_concerns:
    - "resilience-triad"           # circuit breakers are isolation mechanisms
    - "state-ownership-clarity"    # shared state creates hidden failure domains
    - "durable-persistence"        # what happens to persistent state when domain fails?
  references:
    - "Release It! 2nd Edition (Nygard) - Failure Domains and Bulkheads"
    - "Building Microservices, 2nd Edition (Newman) - Isolation and Autonomy"
    - "AWS Well-Architected: Reliability - Fault Isolation"
    - "Google SRE Book: Managing Critical State"

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
