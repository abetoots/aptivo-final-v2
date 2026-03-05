---
concern: regional-failure-containment
version: 1.0
name: Regional Failure Containment
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Regional Failure Containment" (regional-failure-containment v1.0). Severity level: error. Every multi-region claim must document:
1. Failover trigger (what conditions cause failover, manual vs. automatic)
2. Data consistency mode during failover (sync, async, eventual)
3. Failback procedure (how to return to normal after recovery)
4. Regional isolation boundaries (blast radius of a regional failure) Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Regional Failure Containment
# =============================================================================
# This concern validates that multi-region claims document failover trigger,
# data consistency mode, and failback procedure. Multi-region architectures
# without explicit failover contracts provide false confidence - the system
# appears highly available but may fail to actually failover when needed.
#
# WHY THIS MATTERS:
# Multi-region deployments are expensive and complex. When a team claims
# "active-active" or "multi-region failover" without documenting how failover
# is triggered, what data consistency is maintained during failover, and how
# to fail back, they're describing aspirational architecture rather than
# operational reality. Untested, undocumented failover is worse than no
# failover - it creates false confidence that delays incident response.
# =============================================================================

concern:
  id: "regional-failure-containment"
  version: "1.0"
  name: "Regional Failure Containment"
  category: "operational"
  severity: "error"

  description: |
    Every multi-region claim must document:
    1. Failover trigger (what conditions cause failover, manual vs. automatic)
    2. Data consistency mode during failover (sync, async, eventual)
    3. Failback procedure (how to return to normal after recovery)
    4. Regional isolation boundaries (blast radius of a regional failure)

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - multi-region
    - availability
    - distributed

  escalate_if:
    - payments

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every multi-region claim in the documented system,
    then evaluate whether each documents failover triggers, data consistency,
    and failback procedures.

    STEP 1: IDENTIFY MULTI-REGION CLAIMS
    Scan all documents for multi-region architecture:
    - Active-active deployments
    - Active-passive (primary/secondary) regions
    - Cross-region failover configurations
    - Geo-replicated databases or caches
    - Regional load balancing (Route 53, Cloud DNS, Traffic Manager)
    - Look for: multi-region, active-active, active-passive, failover,
      cross-region, geo-replication, regional

    STEP 2: FOR EACH CLAIM, CHECK FAILOVER TRIGGER
    a) What conditions trigger failover?
       - Health check failures (how many, how long?)
       - Manual decision (who decides, what's the process?)
       - Automated failover (what system detects and triggers?)
    b) What is the expected failover time (RTO)?
    c) Is there a documented decision tree for partial vs. full failover?

    STEP 3: FOR EACH CLAIM, CHECK DATA CONSISTENCY
    a) What replication mode is used?
       - Synchronous (strong consistency, higher latency)
       - Asynchronous (eventual consistency, potential data loss)
    b) What is the replication lag under normal conditions?
    c) What is the maximum acceptable data loss (RPO)?
    d) How are conflicts resolved in active-active setups?

    STEP 4: FOR EACH CLAIM, CHECK FAILBACK PROCEDURE
    a) How does the system return to normal after the failed region recovers?
    b) Is failback automatic or manual?
    c) How is data reconciled between regions after failback?
    d) Is there a verification step before failback completes?

    STEP 5: FLAG GAPS
    Any multi-region claim without documented failover triggers, data
    consistency mode, or failback procedure is a gap.

  checklist:
    - id: "region-inventory"
      question: "Are all multi-region deployments identified with their topology (active-active, active-passive)?"
    - id: "failover-trigger"
      question: "Is the failover trigger (conditions, mechanism, decision process) documented?"
    - id: "data-consistency"
      question: "Is the data consistency mode during failover documented (RPO, replication lag)?"
    - id: "failback-procedure"
      question: "Is the failback procedure documented for returning to normal operations?"
    - id: "regional-isolation"
      question: "Are regional isolation boundaries documented (what fails when a region fails)?"

  evidence_required:
    - field: "deployment_name"
      type: "string"
      description: "Name of the multi-region deployment (e.g., 'OrderService active-active US-East/US-West', 'Primary DB active-passive EU/US')"
      required: true

    - field: "failover_trigger_documented"
      type: "boolean"
      description: "Whether failover trigger conditions are documented"
      required: true

    - field: "data_consistency_documented"
      type: "boolean"
      description: "Whether data consistency mode during failover is documented"
      required: true

    - field: "failback_documented"
      type: "boolean"
      description: "Whether the failback procedure is documented"
      required: true

    - field: "source_location"
      type: "string"
      description: "Where this multi-region claim is documented (e.g., 'ADD Section 6.2 - High Availability')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. failover_trigger_documented is FALSE - the team cannot reliably
       trigger failover when needed

    2. data_consistency_documented is FALSE for a system handling
       financial transactions - data loss during failover could cause
       monetary discrepancies

    3. All three documented fields are FALSE - the multi-region claim
       is completely undocumented operationally

    Report as WARNING when:

    1. failback_documented is FALSE - the team may be unable to return
       to normal operations after recovery

    2. data_consistency_documented is FALSE - teams cannot reason about
       potential data loss during failover

    3. Failover is documented as "manual" without a documented runbook
       or decision tree

    4. Active-active is claimed but conflict resolution is not documented

  recommendation_template: |
    ## Gap: {deployment_name} - Missing Regional Failover Documentation

    **Location:** {source_location}

    ### Required Documentation

    1. **Failover Trigger**
       - What conditions trigger failover?
       - Example: "Route 53 health checks: 3 consecutive failures (30s
         interval) trigger automatic DNS failover to US-West. Manual
         override available via runbook in PagerDuty."

    2. **Data Consistency**
       - What is the replication mode and acceptable data loss?
       - Example: "Async replication with ~2s lag. RPO: 5 seconds.
         During failover, transactions in the replication lag window
         may be lost. Reconciliation job runs on failback."

    3. **Failback Procedure**
       - How to return to normal after recovery?
       - Example: "Manual failback after region recovery: 1) Verify
         replication caught up, 2) Run reconciliation job, 3) Gradually
         shift traffic back over 30 minutes, 4) Verify metrics."

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 6.2 - High Availability"
      text: |
        "OrderService runs active-passive across US-East (primary) and
        US-West (secondary). Failover trigger: Route 53 health checks,
        3 failures triggers automatic DNS switch (RTO: ~60s). Database:
        async replication, ~2s lag, RPO: 5s. Failback: manual after
        replication sync verified, traffic shifted gradually over 30min."
      assessment: |
        deployment_name: "OrderService active-passive US-East/US-West"
        failover_trigger_documented: true
        data_consistency_documented: true
        failback_documented: true
        confidence: "high"

  poorly_documented:
    - source: "ADD Section 3.1"
      text: |
        "The system is deployed across multiple regions for high
        availability and disaster recovery."
      assessment: |
        deployment_name: "System multi-region deployment (unspecified)"
        failover_trigger_documented: false
        data_consistency_documented: false
        failback_documented: false
        confidence: "high"
        gap: "Multi-region claimed but no failover trigger, data consistency
              mode, or failback procedure documented. Cannot determine if
              failover actually works or what data loss to expect."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "Multi-Expert Consensus (Claude, Gemini, Codex)"
  related_concerns:
    - "failure-mode-coverage"
    - "sla-architecture-alignment"
  references:
    - "AWS Multi-Region Architecture: https://aws.amazon.com/solutions/implementations/multi-region-application-architecture/"
    - "Azure Traffic Manager: https://learn.microsoft.com/en-us/azure/traffic-manager/"

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

**Evaluated**: 2026-03-03 (Session 6: Operational Readiness)
**Review**: `OPERATIONAL_READINESS_MULTI_REVIEW.md`
**Verdict**: PASS — 2 ERRORs resolved, 3 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| E1: Phase 2+ multi-region DR has no operational contract | ERROR | **Resolved** — Added Phase 1 failback procedure, DR decision criteria, Phase 2+ design parameters to Runbook §8.6 |
| E2: Phase 2+ PostgreSQL HA failover has no operational contract | ERROR | **Resolved** — Added Phase 2+ HA design target with failover/replication/failback/pool parameters to ADD §2.3.2 |
| W1: Phase 1 DR missing failback procedure | WARN | **Resolved** (covered by E1 fix — failback procedure added) |
| W2: Phase 1 DR missing decision criteria | WARN | **Resolved** (covered by E1 fix — decision criteria table added) |
| W3: Regional isolation boundaries incomplete for SaaS deps | WARN | Accepted (SaaS dep mapping is Phase 2+ design parameter) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
