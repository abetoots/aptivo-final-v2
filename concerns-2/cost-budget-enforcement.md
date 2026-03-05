---
concern: cost-budget-enforcement
version: 1.0
name: Cost & Budget Enforcement
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Cost & Budget Enforcement" (cost-budget-enforcement v1.0). Severity level: warn. Every metered or scaling resource must document budget caps and cost
attribution. This includes auto-scaling groups, serverless functions,
managed databases, CDN bandwidth, API gateway usage, and any resource
where consumption directly drives cost. Each resource must have:
1. A documented budget cap or spending limit
2. Cost attribution to a team, service, or cost center
3. Defined behavior when budget is exceeded
4. Observability into current spend vs. budget Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Cost & Budget Enforcement
# =============================================================================
# This concern validates that every metered or auto-scaling resource has
# documented budget caps and cost attribution. Without explicit cost controls,
# scaling events, runaway queries, or misconfigured resources can generate
# unbounded cloud bills before anyone notices.
#
# WHY THIS MATTERS:
# Cloud cost overruns are one of the most common operational surprises. A single
# misconfigured auto-scaling policy, an unthrottled batch job, or a forgotten
# dev environment can generate thousands in unexpected charges. Budget caps and
# cost attribution ensure that spending is visible, bounded, and traceable to
# the team or service responsible.
# =============================================================================

concern:
  id: "cost-budget-enforcement"
  version: "1.0"
  name: "Cost & Budget Enforcement"
  category: "operational"
  severity: "warn"

  description: |
    Every metered or scaling resource must document budget caps and cost
    attribution. This includes auto-scaling groups, serverless functions,
    managed databases, CDN bandwidth, API gateway usage, and any resource
    where consumption directly drives cost. Each resource must have:
    1. A documented budget cap or spending limit
    2. Cost attribution to a team, service, or cost center
    3. Defined behavior when budget is exceeded
    4. Observability into current spend vs. budget

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - cost-management
    - auto-scaling
    - quotas

  escalate_if:
    - payments

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every metered or scaling resource in the documented
    system, then evaluate whether budget caps and cost attribution are documented.

    STEP 1: IDENTIFY METERED/SCALING RESOURCES
    Scan all documents for resources where usage drives cost:
    - Auto-scaling groups (EC2, ECS, Kubernetes HPA)
    - Serverless functions (Lambda, Cloud Functions)
    - Managed databases (RDS, DynamoDB, Cloud SQL)
    - Message queues and streaming (SQS, Kafka, Kinesis)
    - CDN and bandwidth (CloudFront, Fastly)
    - API gateways and load balancers
    - Storage (S3, GCS, blob storage)
    - Third-party API usage (Stripe, Twilio, SendGrid)

    STEP 2: FOR EACH RESOURCE, CHECK BUDGET DOCUMENTATION
    a) Is there a documented budget cap or spending limit?
       - Hard cap (service stops/throttles at limit)
       - Soft cap (alert fires but service continues)
       - No cap documented
    b) What mechanism enforces the budget?
       - Cloud provider budget alerts (AWS Budgets, GCP Billing Alerts)
       - Application-level throttling
       - Quota enforcement
       - Manual monitoring
    c) Is cost attribution documented?
       - Tagged to a team, service, or cost center?
       - Can spending be traced to the responsible owner?
    d) What happens when budget is exceeded?
       - Service degrades gracefully?
       - Hard stop?
       - Alert only?
       - Undefined?

    STEP 3: CHECK OBSERVABILITY
    For each resource:
    - Is current spend visible in dashboards or reports?
    - Are there alerts for approaching budget thresholds?
    - Is spend trending tracked over time?

    STEP 4: FLAG GAPS
    Any metered resource without a documented budget cap, cost attribution,
    or exceed behavior is a gap.

  checklist:
    - id: "resource-inventory"
      question: "Are all metered/scaling resources identified with their cost drivers?"
    - id: "budget-caps"
      question: "Does each resource have a documented budget cap or spending limit?"
    - id: "cost-attribution"
      question: "Is each resource attributed to a team, service, or cost center?"
    - id: "exceed-behavior"
      question: "Is the behavior when budget is exceeded documented for each resource?"
    - id: "spend-observability"
      question: "Is current spend vs. budget visible through dashboards or alerts?"

  evidence_required:
    - field: "resource_name"
      type: "string"
      description: "Name of the metered/scaling resource (e.g., 'OrderService auto-scaling group', 'Lambda: processPayments', 'DynamoDB orders table')"
      required: true

    - field: "budget_documented"
      type: "boolean"
      description: "Whether a budget cap or spending limit is documented for this resource"
      required: true

    - field: "budget_mechanism"
      type: "string | null"
      description: "The mechanism enforcing the budget (e.g., 'AWS Budget alert at $500/mo', 'Application-level rate limit', 'DynamoDB provisioned capacity')"
      required: true

    - field: "cost_attribution_documented"
      type: "boolean"
      description: "Whether the resource is attributed to a team, service, or cost center"
      required: true

    - field: "exceed_behavior"
      type: "string | null"
      description: "What happens when budget is exceeded (e.g., 'Throttle to baseline capacity', 'Alert on-call, no auto-stop', 'Hard limit via quota')"
      required: true

    - field: "observability_documented"
      type: "boolean"
      description: "Whether current spend vs. budget is visible through dashboards or alerts"
      required: true

    - field: "source_location"
      type: "string"
      description: "Where this resource is documented (e.g., 'ADD Section 6.1 - Infrastructure')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. An auto-scaling resource has budget_documented = FALSE - unbounded
       scaling without a budget cap can generate unlimited costs

    2. A payment-adjacent resource (payment processing, billing) has
       cost_attribution_documented = FALSE - financial resources must be
       traceable to responsible owners

    Report as WARNING when:

    1. budget_documented = FALSE for any metered resource

    2. budget_documented = TRUE but exceed_behavior is NULL or undefined -
       a budget without enforcement is just an aspiration

    3. cost_attribution_documented = FALSE - spending cannot be traced
       to the responsible team

    4. observability_documented = FALSE - team cannot see current spend
       relative to budget

  recommendation_template: |
    ## Gap: {resource_name} - Missing Cost/Budget Documentation

    **Location:** {source_location}

    ### Required Documentation

    Add cost and budget documentation covering:

    1. **Budget Cap**
       - What is the monthly/daily spending limit for this resource?
       - Is it a hard cap (service stops) or soft cap (alert only)?
       - Example: "Auto-scaling group capped at 20 instances max.
         AWS Budget alert at $2,000/month with hard stop at $3,000."

    2. **Cost Attribution**
       - Which team or cost center owns this resource's spend?
       - How is the resource tagged for billing visibility?
       - Example: "Tagged with team=payments, service=order-processing,
         env=production. Monthly cost reviewed in payments team budget."

    3. **Exceed Behavior**
       - What happens when the budget is reached?
       - Example: "At 80% budget, alert fires to #cost-alerts. At 100%,
         auto-scaling is capped and requests queue. On-call reviews within 1h."

    4. **Observability**
       - Where can current spend be monitored?
       - Example: "Grafana dashboard: Cloud Costs > OrderService.
         Daily Slack digest to #payments-costs channel."

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 6.1 - Infrastructure Costs"
      text: |
        "The OrderService auto-scaling group scales between 2-20 instances
        based on CPU utilization. Monthly budget: $3,000. AWS Budget alert
        at $2,400 (80%) notifies #infra-costs. At $3,000 hard cap, scaling
        is frozen and on-call is paged. Cost center: payments-team.
        Dashboard: Grafana > Cloud Costs > OrderService."
      assessment: |
        resource_name: "OrderService auto-scaling group"
        budget_documented: true
        budget_mechanism: "AWS Budget alert at $2,400, hard cap at $3,000"
        cost_attribution_documented: true
        exceed_behavior: "Scaling frozen, on-call paged"
        observability_documented: true
        confidence: "high"

  poorly_documented:
    - source: "ADD Section 5.2"
      text: |
        "The notification service uses Lambda functions triggered by SQS
        messages. Auto-scales based on queue depth."
      assessment: |
        resource_name: "Notification Lambda functions"
        budget_documented: false
        budget_mechanism: null
        cost_attribution_documented: false
        exceed_behavior: null
        observability_documented: false
        confidence: "high"
        gap: "Lambda scales based on queue depth with no documented budget
              cap, cost attribution, or exceed behavior. A burst of
              notifications could trigger thousands of concurrent invocations
              with unbounded cost."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "Multi-Expert Consensus (Claude, Gemini, Codex)"
  related_concerns:
    - "alerting-slo-alignment"
    - "scalability-claim-validation"
  references:
    - "AWS Well-Architected Framework - Cost Optimization Pillar"
    - "FinOps Foundation: https://www.finops.org/framework/"

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

**Evaluated**: 2026-03-01 (Session 2: LLM + PII + Data Compliance)
**Review**: `LLM_PII_DATA_COMPLIANCE_MULTI_REVIEW.md`
**Verdict**: CONDITIONAL PASS — 1 ERROR (resolved), 4 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| E9: Auto-scaling has no budget cap | ERROR | **RESOLVED** — Runbook §3.2.1 Cost Controls table |
| W9: No budget for infra resources | WARN | **RESOLVED** — Runbook §3.2.1 covers all resources |
| W10: No budget for third-party SaaS | WARN | **RESOLVED** — Runbook §3.2.1 covers Novu, Inngest, Supabase, Sentry, Grafana |
| W11: No cost attribution for non-LLM resources | WARN | **RESOLVED** — Runbook §3.2.1 includes attribution column |
| W12: LLM spend observability limited | WARN | Accepted (budget enforcement exists; dashboard deferred) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
