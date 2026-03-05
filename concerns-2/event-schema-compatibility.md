---
concern: event-schema-compatibility
version: 1.0
name: Event Schema Compatibility
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Event Schema Compatibility" (event-schema-compatibility v1.0). Severity level: error. Every versioned event or message contract must document:
1. Compatibility rule (backward, forward, full, or none)
2. Rollout order (producer-first or consumer-first deployment)
3. Rollback-safe handling (can consumers handle both old and new schemas?)
4. Schema registry integration (if applicable) Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Event Schema Compatibility
# =============================================================================
# This concern validates that every versioned event or message contract defines
# its compatibility rule, rollout order, and rollback-safe handling. Without
# explicit schema evolution contracts, producers and consumers cannot evolve
# independently, and deployments become tightly coupled across services.
#
# WHY THIS MATTERS:
# In event-driven and message-based systems, the event schema IS the API
# contract between services. When a producer changes an event schema without
# a documented compatibility rule, consumers may break silently - deserializing
# malformed data, ignoring new fields, or crashing on removed fields. Without
# rollout order documentation, a consumer deployed before the producer may
# receive events in the new format before it can handle them.
# =============================================================================

concern:
  id: "event-schema-compatibility"
  version: "1.0"
  name: "Event Schema Compatibility"
  category: "core"
  severity: "error"

  description: |
    Every versioned event or message contract must document:
    1. Compatibility rule (backward, forward, full, or none)
    2. Rollout order (producer-first or consumer-first deployment)
    3. Rollback-safe handling (can consumers handle both old and new schemas?)
    4. Schema registry integration (if applicable)

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - schema-evolution
    - async-api
    - event-driven
    - message-queue

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every versioned event or message contract in
    the documented system, then evaluate whether each defines compatibility
    rules, rollout order, and rollback-safe handling.

    STEP 1: IDENTIFY EVENT/MESSAGE CONTRACTS
    Scan all documents for events, messages, and async contracts:
    - Domain events (OrderCreated, PaymentProcessed, UserRegistered)
    - Command messages (ProcessPayment, SendNotification)
    - Integration events (between microservices)
    - Queue messages (SQS, RabbitMQ, Kafka topics)
    - AsyncAPI definitions
    - Protobuf/Avro/JSON Schema definitions
    - Look for: event, message, schema, contract, topic, queue, publish, subscribe

    STEP 2: FOR EACH CONTRACT, CHECK COMPATIBILITY RULE
    a) What compatibility mode is documented?
       - Backward compatible (new schema can read old data)
       - Forward compatible (old schema can read new data)
       - Full compatible (both directions)
       - None (breaking change)
    b) What specific changes are being made?
       - Adding fields (usually backward compatible)
       - Removing fields (usually breaking)
       - Renaming fields (usually breaking)
       - Changing field types (depends on direction)
    c) Is there a schema registry enforcing compatibility?

    STEP 3: FOR EACH CONTRACT, CHECK ROLLOUT ORDER
    a) Is the deployment order documented?
       - Consumer-first (deploy consumers that handle both schemas, then producer)
       - Producer-first (with backward-compatible change)
       - Simultaneous (risky without compatibility guarantees)
    b) What happens during the rollout window when both schemas exist?
    c) Is there a documented cutover plan?

    STEP 4: FOR EACH CONTRACT, CHECK ROLLBACK SAFETY
    a) Can the change be rolled back without data loss?
    b) Can consumers handle both old and new schemas simultaneously?
    c) What happens to messages published in new format if producer rolls back?
    d) Is there a dead-letter strategy for incompatible messages?

    STEP 5: FLAG GAPS
    Any event contract without a documented compatibility rule, rollout order,
    or rollback strategy is a gap.

  checklist:
    - id: "contract-inventory"
      question: "Are all versioned event/message contracts identified?"
    - id: "compatibility-rule"
      question: "Does each contract define its compatibility mode (backward, forward, full, none)?"
    - id: "rollout-order"
      question: "Is the deployment order (producer-first or consumer-first) documented?"
    - id: "rollback-safety"
      question: "Can the schema change be rolled back without data loss or consumer breakage?"
    - id: "dead-letter-handling"
      question: "Is there a strategy for messages that fail deserialization after schema changes?"

  evidence_required:
    - field: "contract_name"
      type: "string"
      description: "Name of the event/message contract (e.g., 'OrderCreated v2 event', 'PaymentProcessed Kafka message', 'UserRegistered Protobuf schema')"
      required: true

    - field: "compatibility_rule_documented"
      type: "boolean"
      description: "Whether the compatibility mode is explicitly documented"
      required: true

    - field: "compatibility_mode"
      type: "string | null"
      description: "The documented compatibility mode (e.g., 'backward compatible - new optional field added', 'breaking - field renamed')"
      required: true

    - field: "rollout_order_documented"
      type: "boolean"
      description: "Whether the deployment order is documented"
      required: true

    - field: "rollback_safe"
      type: "boolean | null"
      description: "Whether the change can be safely rolled back"
      required: true

    - field: "source_location"
      type: "string"
      description: "Where this contract is documented (e.g., 'AsyncAPI spec Section 3.2', 'ADD Section 5.1 - Event Architecture')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. compatibility_rule_documented is FALSE for any event contract that
       has multiple consumers - consumers cannot safely evolve

    2. rollout_order_documented is FALSE for a breaking schema change -
       deployments may cause consumer failures

    3. rollback_safe is FALSE with no documented mitigation strategy -
       a failed deployment cannot be safely reversed

    4. A schema change removes or renames fields without documenting
       consumer impact

    Report as WARNING when:

    1. compatibility_rule_documented is FALSE for any event contract

    2. rollout_order_documented is FALSE for any schema change

    3. rollback_safe is TRUE but the mechanism is not documented

    4. No schema registry is used and compatibility is enforced only
       by convention or code review

  recommendation_template: |
    ## Gap: {contract_name} - Missing Schema Compatibility Documentation

    **Location:** {source_location}

    ### Required Documentation

    1. **Compatibility Rule**
       - What compatibility mode does this change follow?
       - Example: "Backward compatible: adds optional 'priority' field
         with default value 'normal'. Existing consumers ignore the
         new field. Schema registry enforces backward compatibility."

    2. **Rollout Order**
       - In what order should services be deployed?
       - Example: "Consumer-first: deploy OrderProcessor v2 (handles
         both v1 and v2 events), then deploy OrderService v2 (produces
         v2 events). Rollout window: max 1 hour between deployments."

    3. **Rollback Safety**
       - Can this change be safely rolled back?
       - Example: "Yes - rolling back producer to v1 causes v2 events
         to stop. Consumer v2 still handles v1 events correctly.
         Any v2 events already published are processed by consumer v2."

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 5.1 - Event Architecture"
      text: |
        "OrderCreated v2 adds optional 'priority' field (default: 'normal').
        Compatibility: backward compatible (v1 consumers ignore new field).
        Schema registry enforces backward compatibility on the orders topic.
        Rollout: consumer-first - deploy handlers that accept both v1 and v2,
        then deploy producer. Rollback: safe - reverting producer to v1 stops
        v2 events; consumer v2 handles both formats."
      assessment: |
        contract_name: "OrderCreated v2 event"
        compatibility_rule_documented: true
        compatibility_mode: "backward compatible - optional field added with default"
        rollout_order_documented: true
        rollback_safe: true
        confidence: "high"

  poorly_documented:
    - source: "ADD Section 4.3"
      text: |
        "The user service publishes UserUpdated events to Kafka. We're
        changing the event format to include the new address fields."
      assessment: |
        contract_name: "UserUpdated event (schema change)"
        compatibility_rule_documented: false
        compatibility_mode: null
        rollout_order_documented: false
        rollback_safe: null
        confidence: "high"
        gap: "Schema change documented but no compatibility rule, rollout
              order, or rollback strategy. Consumers may break if they
              receive the new format before being updated."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "Multi-Expert Consensus (Claude, Gemini, Codex)"
  related_concerns:
    - "api-contract-consistency"
    - "idempotency-boundaries"
  references:
    - "Confluent Schema Registry: https://docs.confluent.io/platform/current/schema-registry/"
    - "AsyncAPI Specification: https://www.asyncapi.com/docs/reference/specification/latest"
    - "Protobuf Language Guide - Updating A Message Type"

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
**Verdict**: CONDITIONAL PASS — 2 ERRORs (resolved), 3 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| E4: No compatibility rules for event contracts | ERROR | **RESOLVED** — Added common-patterns.md §5.3 |
| E5: Outbound webhook payload schemas undocumented | ERROR | **RESOLVED** — Added ADD §12.2.3 + OpenAPI schema |
| W10: No rollout order for schema changes | WARN | **RESOLVED** — Covered in common-patterns.md §5.3 |
| W11: No schema registry for Inngest events | WARN | Accepted (Zod validation documented; registry deferred to Phase 2) |
| W12: No dead-letter strategy | WARN | **RESOLVED** — Covered in common-patterns.md §5.3 |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
