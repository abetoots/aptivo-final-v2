---
concern: durable-persistence
version: 1.0
name: Durable Persistence: Resume Point Documentation
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Durable Persistence: Resume Point Documentation" (durable-persistence v1.0). Severity level: error. Every long-running process must document:
1. Where checkpoints occur (between which steps)
2. How state is persisted (storage mechanism, durability guarantees)
3. What happens on crash/restart (resume at last checkpoint vs. restart)
4. What data is at risk between checkpoints
5. How recovery is triggered (automatic vs. manual)

Long-running processes include: multi-step workflows, batch jobs,
orchestrated sagas, approval flows, data pipelines, and any process
that spans more than a single request-response cycle. Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Durable Persistence / Resume Point Documentation
# =============================================================================
# This concern validates that all long-running processes have explicitly
# documented checkpoint/resume points, crash recovery behavior, and state
# persistence strategies. Without these, process failures lead to data loss,
# stuck workflows, or expensive manual recovery.
#
# WHY THIS MATTERS:
# Long-running processes (minutes to days) WILL fail. Network partitions,
# deployments, OOM kills, and hardware failures are inevitable. Without
# documented resume points, the team must choose between restarting from
# scratch (expensive, potentially dangerous) or manual intervention
# (error-prone, doesn't scale).
#
# TYPICAL MANIFESTATION:
# - ADD describes a "multi-step workflow" but no checkpoint strategy
# - FRD requires "durable execution" but ADD doesn't specify recovery behavior
# - Process has some checkpoints but gaps between them risk data loss
# =============================================================================

concern:
  id: "durable-persistence"
  version: "1.0"
  name: "Durable Persistence: Resume Point Documentation"
  category: "core"
  severity: "error"

  description: |
    Every long-running process must document:
    1. Where checkpoints occur (between which steps)
    2. How state is persisted (storage mechanism, durability guarantees)
    3. What happens on crash/restart (resume at last checkpoint vs. restart)
    4. What data is at risk between checkpoints
    5. How recovery is triggered (automatic vs. manual)

    Long-running processes include: multi-step workflows, batch jobs,
    orchestrated sagas, approval flows, data pipelines, and any process
    that spans more than a single request-response cycle.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - async-workflows
    - long-running
    - orchestration
    - durable-execution
    - batch-processing
    - saga

  escalate_if:
    - payments        # financial data at risk between checkpoints
    - approval-gates  # approval state must survive crashes

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every long-running process in the documented
    system, then evaluate its checkpoint and recovery posture.

    STEP 1: IDENTIFY LONG-RUNNING PROCESSES
    Scan all documents for processes that span multiple steps or time periods:
    - Multi-step workflows (order processing, onboarding, provisioning)
    - Approval flows that wait for human input
    - Batch processing jobs (data import, report generation, migrations)
    - Orchestrated sagas (distributed transactions across services)
    - Scheduled pipelines (ETL, data synchronization)
    - Any process described as "long-running", "durable", or "multi-phase"

    Estimate duration: is this seconds, minutes, hours, or days?

    STEP 2: FOR EACH PROCESS, MAP CHECKPOINT LOCATIONS
    Identify where state is saved:
    - Between which steps are checkpoints placed?
    - What state is captured at each checkpoint?
    - Where is the checkpoint stored? (database, workflow engine, file system)
    - Are checkpoints transactional with the step they follow?

    Look for terms: checkpoint, save point, persist, commit, state store,
    workflow state, saga log, event store, durable, resume

    STEP 3: EVALUATE CRASH RECOVERY BEHAVIOR
    For each process, determine what happens on unexpected termination:
    - Does it resume at the last checkpoint?
    - Does it restart from the beginning?
    - Does it require manual intervention?
    - Is there potential for data loss?
    - Is there potential for duplicate processing of steps?

    STEP 4: IDENTIFY CHECKPOINT GAPS
    Look for steps between checkpoints where failure would cause:
    - Loss of completed work
    - Inconsistent state (some side effects applied, others not)
    - Need for manual recovery

    Pay special attention to:
    - Steps that have side effects (API calls, payments, notifications)
    - Steps that are expensive to re-execute
    - Steps where re-execution is dangerous (double-charge, double-notification)

    STEP 5: EVALUATE RECOVERY TRIGGERS
    How is recovery initiated?
    - Automatic detection and restart?
    - Monitoring alert → manual restart?
    - Scheduler retry on next cycle?
    - No recovery mechanism documented?

  checklist:
    - id: "process-identification"
      question: "Are all long-running processes explicitly identified as such?"
    - id: "checkpoint-coverage"
      question: "Does each long-running process document where checkpoints occur?"
    - id: "state-storage"
      question: "Is the checkpoint storage mechanism documented with durability guarantees?"
    - id: "crash-recovery"
      question: "Is crash recovery behavior explicitly documented for each process?"
    - id: "data-loss-risk"
      question: "Is the data at risk between checkpoints identified and accepted?"
    - id: "recovery-trigger"
      question: "Is the mechanism for triggering recovery documented?"

  evidence_required:
    - field: "process_name"
      type: "string"
      description: "Name of the long-running process (e.g., 'OrderFulfillmentWorkflow', 'DataMigrationJob')"
      required: true

    - field: "duration_estimate"
      type: "string"
      description: "Estimated duration of the process (e.g., 'minutes', 'hours', 'days', 'depends on approval')"
      required: true

    - field: "checkpoint_locations"
      type: "array"
      description: "List of documented checkpoint locations (e.g., ['after payment confirmed', 'after inventory reserved', 'after shipment created'])"
      required: true

    - field: "state_storage"
      type: "string | null"
      description: "How and where checkpoint state is persisted (e.g., 'PostgreSQL workflow_state table', 'Temporal server', 'Redis with AOF')"
      required: true

    - field: "crash_recovery_behavior"
      type: "enum"
      values:
        - "resume-at-last-step"
        - "restart-from-beginning"
        - "manual-intervention"
        - "data-loss"
        - "unknown"
      description: "What happens when the process crashes unexpectedly"
      required: true

    - field: "resume_behavior"
      type: "string | null"
      description: "Detailed description of how the process resumes (e.g., 'Temporal replays event history to rebuild state, then continues from last completed activity')"
      required: true

    - field: "data_loss_between_checkpoints"
      type: "string | null"
      description: "What data or progress is at risk between checkpoints (e.g., 'Inventory reservation may be lost if crash occurs between payment and reservation steps')"
      required: true

    - field: "recovery_trigger"
      type: "string | null"
      description: "How recovery is initiated (e.g., 'automatic via Temporal', 'manual restart by operator', 'cron re-checks stuck workflows every 5 minutes')"
      required: true

    - field: "source_location"
      type: "string"
      description: "Exact location where this is documented (e.g., 'ADD Section 5.3, Workflow State Management')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. A long-running process has NO documented checkpoints
       (checkpoint_locations is empty)

    2. crash_recovery_behavior is "unknown" or "data-loss" for any process
       that handles payments, approvals, or user-facing state

    3. state_storage is NULL or vague (e.g., "state is persisted" without
       specifying where or how)

    4. A process has side-effecting steps (payments, notifications, external
       API calls) between checkpoints with no documented recovery strategy

    5. recovery_trigger is NULL - no mechanism to detect or recover from
       crashed processes

    6. resume_behavior is NULL for a process marked as "durable" or
       "resumable" in design documents

    Report as WARNING when:

    1. Checkpoints exist but gaps between them are acknowledged without
       mitigation (accepted risk should be documented)

    2. crash_recovery_behavior is "restart-from-beginning" for a process
       with side effects (re-execution may cause duplicates)

    3. data_loss_between_checkpoints identifies risk but no mitigation
       is documented

    4. Recovery is documented as "manual-intervention" without specifying
       the procedure or runbook reference

    5. Process uses an external orchestrator (Temporal, Step Functions) but
       doesn't document the orchestrator's own durability guarantees

  recommendation_template: |
    ## Gap: {process_name} - Missing Resume Point Documentation

    **Location:** {source_location}
    **Duration:** {duration_estimate}
    **Recovery:** {crash_recovery_behavior}

    ### Required Documentation

    Add explicit documentation covering:

    1. **Checkpoint Map**
       - List every step in the process
       - Mark which steps have checkpoints
       - Identify gaps where crash = data loss
       - Example: "Checkpoints after: [payment-confirmed], [inventory-reserved],
         [shipment-created]. Gap: between payment and inventory (reservation may
         be lost on crash)."

    2. **State Storage**
       - Where is checkpoint state stored?
       - What durability guarantees does the storage provide?
       - Example: "Workflow state stored in PostgreSQL workflow_state table.
         Checkpoints are transactional with step completion."

    3. **Crash Recovery**
       - What happens on unexpected termination?
       - How is the last valid state determined?
       - How are partially-completed steps handled?
       - Example: "On crash, process resumes at last checkpoint. Partially
         completed steps are rolled back via compensation."

    4. **Recovery Trigger**
       - How are crashed processes detected?
       - How is recovery initiated?
       - Example: "Cron job checks for workflows in 'in-progress' state
         older than 2x expected duration. Automatic restart triggered."

# -----------------------------------------------------------------------------
# EXAMPLES: Help the LLM understand what to look for
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 5.3"
      text: |
        "The OrderFulfillmentWorkflow is implemented as a Temporal workflow.
        Steps: validate → charge → reserve-inventory → create-shipment → notify.
        Temporal persists workflow state after each activity completion.
        On crash, Temporal replays the event history to rebuild state and
        resumes from the last completed activity. Activities are idempotent.
        If Temporal itself is unavailable, workflows queue and resume when
        Temporal recovers. Monitoring: alert if any workflow exceeds 4h."
      assessment: |
        process_name: "OrderFulfillmentWorkflow"
        duration_estimate: "minutes to hours"
        checkpoint_locations: ["after validate", "after charge", "after reserve-inventory", "after create-shipment", "after notify"]
        state_storage: "Temporal server (backed by PostgreSQL)"
        crash_recovery_behavior: "resume-at-last-step"
        resume_behavior: "Temporal replays event history, resumes from last completed activity"
        data_loss_between_checkpoints: "None - Temporal checkpoints after each activity"
        recovery_trigger: "Automatic via Temporal; alert if workflow exceeds 4h"

  poorly_documented:
    - source: "ADD Section 4.1"
      text: |
        "The data import pipeline processes CSV files in batches.
        Files are processed sequentially. Progress is tracked."
      assessment: |
        process_name: "DataImportPipeline"
        duration_estimate: "unknown (depends on file size)"
        checkpoint_locations: []
        state_storage: null
        crash_recovery_behavior: "unknown"
        resume_behavior: null
        data_loss_between_checkpoints: "Unknown - no checkpoints documented"
        recovery_trigger: null
        gap: "No checkpoint strategy. Crash during processing means unknown state -
              some records imported, others not. No way to resume without reprocessing
              entire file (risking duplicates)."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "Multi-Expert Consensus (Claude, Gemini, ChatGPT)"
  related_concerns:
    - "idempotency-boundaries"     # resume/retry must be idempotent
    - "state-ownership-clarity"    # who owns the persisted state?
    - "failure-domain-isolation"   # what fails when the orchestrator fails?
  references:
    - "Temporal.io: Workflow Durability Guarantees"
    - "AWS Step Functions: Error Handling and Retry"
    - "Designing Data-Intensive Applications, Ch. 11 - Stream Processing (Kleppmann)"
    - "Enterprise Integration Patterns: Process Manager"

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

**Evaluated**: 2026-03-01 (Session 4: Resilience & Failure Modes)
**Review**: `RESILIENCE_FAILURE_MODES_MULTI_REVIEW.md`
**Verdict**: CONDITIONAL PASS — 2 ERRORs (resolved), 4 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| E11: Saga pattern incomplete checkpoints | ERROR | **RESOLVED** — Added common-patterns.md §8.3 |
| E12: Audit export missing checkpoints | ERROR | **RESOLVED** — Added ADD §9.5.1 checkpoint table |
| W8: Inngest durability guarantees not documented | WARN | Accepted (managed service SLA) |
| W9: Data deletion no checkpoint strategy | WARN | Accepted (Phase 1 risk) |
| W10: Retention enforcement no recovery trigger | WARN | Accepted (idempotent design) |
| W11: PostgreSQL projection divergence | WARN | Accepted (monolith reduces risk) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
