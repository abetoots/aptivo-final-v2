---
concern: alerting-slo-alignment
version: 1.0
name: Alerting-SLO Alignment
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Alerting-SLO Alignment" (alerting-slo-alignment v1.0). Severity level: warn. Every SLO defined in business requirements (BRD), functional requirements
(FRD), or architecture documents (ADD) must have a corresponding alerting
rule that detects when the SLO is at risk or breached. Conversely, every
alerting rule should trace back to a documented SLO or explicit business
justification. This bidirectional mapping ensures:
1. SLOs are enforceable, not aspirational
2. Alerts are meaningful, not noise
3. Burn-rate alerting catches slow degradation before breach
4. Notification channels reach the right responders
5. Error budgets are actively monitored and managed Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Alerting-SLO Alignment
# =============================================================================
# This concern validates that every Service Level Objective (SLO) defined in
# business or technical documents has a corresponding alerting rule, and that
# every alerting rule maps to a documented SLO. Misalignment means either
# SLOs are aspirational (no enforcement) or alerts are noise (no business
# justification).
#
# WHY THIS MATTERS:
# SLOs without alerts are promises nobody is watching. Alerts without SLOs are
# noise that causes alert fatigue. When an SLO for 99.9% availability has no
# burn-rate alert, the team discovers the breach only after customers complain.
# When alerts fire for metrics nobody committed to, on-call engineers waste
# time investigating non-issues while real SLO violations go undetected.
# Proper alignment ensures operational effort is directed at what the business
# actually cares about.
#
# TYPICAL MANIFESTATION:
# - BRD defines "99.95% uptime for payment processing" but no alert monitors it
# - ADD defines error budget but no burn-rate alerting is configured
# - Alerts exist for CPU usage and memory but not for user-facing latency SLOs
# - SLOs are defined in one document, alerting in another, with no cross-ref
# - Alert thresholds don't match SLO targets (alert at 95% when SLO is 99.9%)
# =============================================================================

concern:
  id: "alerting-slo-alignment"
  version: "1.0"
  name: "Alerting-SLO Alignment"
  category: "operational"
  severity: "warn"

  description: |
    Every SLO defined in business requirements (BRD), functional requirements
    (FRD), or architecture documents (ADD) must have a corresponding alerting
    rule that detects when the SLO is at risk or breached. Conversely, every
    alerting rule should trace back to a documented SLO or explicit business
    justification. This bidirectional mapping ensures:
    1. SLOs are enforceable, not aspirational
    2. Alerts are meaningful, not noise
    3. Burn-rate alerting catches slow degradation before breach
    4. Notification channels reach the right responders
    5. Error budgets are actively monitored and managed

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - sla
    - monitoring
    - observability
    - alerting

  escalate_if:
    - payments        # payment SLOs have direct revenue impact
    - sla             # contractual SLA violations carry financial penalties

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically extract all SLOs from business and technical documents,
    extract all alerting rules from operational documents, then verify
    bidirectional alignment between them.

    STEP 1: EXTRACT SLOs FROM REQUIREMENTS AND ARCHITECTURE
    Scan all documents (BRD, FRD, ADD, SLA agreements) for Service Level
    Objectives and related commitments:
    - Availability targets: "99.9% uptime", "99.95% availability"
    - Latency targets: "p99 latency < 500ms", "p50 response time < 200ms"
    - Error rate targets: "error rate < 0.1%", "success rate > 99.9%"
    - Throughput targets: "support 1000 requests/second"
    - Durability targets: "zero data loss", "RPO < 1 minute"
    - Freshness targets: "data no older than 5 minutes"

    For each SLO, record:
    - The exact target (metric, threshold, measurement window)
    - The source document and section
    - Whether it is customer-facing or internal
    - Whether there is an associated error budget

    STEP 2: EXTRACT ALERTING RULES FROM OPERATIONAL DOCUMENTS
    Scan all operational documents (monitoring configs, alerting docs,
    dashboards, runbooks) for defined alerts:
    - Threshold alerts: "alert when error rate > X%"
    - Burn-rate alerts: "alert when error budget consumption rate > X"
    - Anomaly alerts: "alert on deviation from baseline"
    - Absence alerts: "alert when no data received for X minutes"

    For each alert, record:
    - The metric and threshold
    - The notification channel (PagerDuty, Slack, email)
    - The severity (page, ticket, informational)
    - The associated runbook or response procedure

    STEP 3: MAP SLOs TO ALERTS (FORWARD MAPPING)
    For each SLO identified in Step 1:
    - Is there at least one alert that monitors this SLO?
    - Does the alert threshold align with the SLO target?
      (e.g., if SLO is 99.9%, does the alert fire before 99.9% is breached?)
    - Is there a burn-rate alert for gradual degradation?
      (e.g., "consuming error budget 10x faster than sustainable rate")
    - Is the notification channel appropriate for the SLO severity?
      (customer-facing SLOs should page, internal SLOs may ticket)

    STEP 4: MAP ALERTS TO SLOs (REVERSE MAPPING)
    For each alert identified in Step 2:
    - Does this alert map to a documented SLO?
    - If not, is there a documented business justification?
    - Are there orphan alerts that fire without clear purpose?
    - Are there alerts whose thresholds contradict SLO targets?

    STEP 5: ASSESS BURN-RATE ALERTING
    For each SLO with an error budget:
    - Is there multi-window burn-rate alerting?
      (fast burn: 1-hour window, slow burn: 6-hour window)
    - Does the burn rate alert fire with enough lead time to respond
      before the error budget is exhausted?
    - Is there a process for what happens when error budget is depleted?

  checklist:
    - id: "slo-extraction"
      question: "Have all SLOs been identified across BRD, FRD, ADD, and SLA documents?"
    - id: "alert-extraction"
      question: "Have all alerting rules been identified from operational documentation?"
    - id: "forward-mapping"
      question: "Does every SLO have at least one corresponding alert?"
    - id: "reverse-mapping"
      question: "Does every alert map to a documented SLO or business justification?"
    - id: "burn-rate-coverage"
      question: "Do SLOs with error budgets have burn-rate alerting configured?"

  evidence_required:
    - field: "slo_name"
      type: "string"
      description: "Name or description of the SLO (e.g., 'Payment processing availability', 'API p99 latency', 'Order creation success rate')"
      required: true

    - field: "slo_source"
      type: "string"
      description: "Document and section where the SLO is defined (e.g., 'BRD Section 2.1 - Availability Requirements', 'SLA Agreement Section 3')"
      required: true

    - field: "slo_target"
      type: "string"
      description: "The specific SLO target value (e.g., '99.95% availability over 30-day rolling window', 'p99 < 500ms', 'error rate < 0.1%')"
      required: true

    - field: "alert_exists"
      type: "boolean"
      description: "Whether at least one alerting rule monitors this SLO"
      required: true

    - field: "alert_reference"
      type: "string | null"
      description: "Location of the alerting rule if it exists (e.g., 'Monitoring Doc Section 4.1', 'PagerDuty service: payment-availability')"
      required: true

    - field: "alert_threshold"
      type: "string | null"
      description: "The alert threshold and how it relates to the SLO (e.g., 'Fires when availability drops below 99.97% (gives 0.02% buffer before SLO breach)')"
      required: true

    - field: "burn_rate_alert"
      type: "boolean"
      description: "Whether a burn-rate alert exists for gradual error budget consumption"
      required: true

    - field: "notification_channel_documented"
      type: "boolean"
      description: "Whether the alert's notification channel is documented (who gets paged/notified)"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate based on available documentation"
      required: true

  failure_condition: |
    Report as WARNING when ANY of the following are true:

    1. An SLO has alert_exists = FALSE - the SLO is defined but nobody is
       watching for violations

    2. An alert exists but has no documented SLO justification - potential
       alert noise that contributes to alert fatigue

    3. alert_exists = TRUE but alert_threshold does not align with slo_target
       - the alert fires at the wrong threshold (too late to prevent breach
       or too early causing false alarms)

    4. An SLO has an error budget defined but burn_rate_alert = FALSE
       - slow degradation will exhaust the error budget without warning

    5. alert_exists = TRUE but notification_channel_documented = FALSE
       - the alert fires but it is unclear who receives the notification

    6. SLOs are defined in one document and alerting in another with no
       explicit cross-reference between them

    7. Multiple SLOs share a single alert that cannot distinguish which
       SLO is being violated

  recommendation_template: |
    ## Gap: {slo_name} - Missing Alerting Coverage

    **SLO Source:** {slo_source}
    **SLO Target:** {slo_target}
    **Alert Exists:** {alert_exists}
    **Burn Rate Alert:** {burn_rate_alert}

    ### Required Documentation

    Add alerting configuration that covers this SLO:

    1. **Threshold Alert**
       - Metric: [the metric that measures this SLO]
       - Threshold: [value that gives early warning before SLO breach]
       - Window: [measurement window matching SLO definition]
       - Example: "Alert when 5-minute rolling availability < 99.97%
         (0.02% buffer before 99.95% SLO breach)"

    2. **Burn-Rate Alert**
       - Fast burn: [alert when error budget consumed at >14.4x rate in 1h]
       - Slow burn: [alert when error budget consumed at >3x rate in 6h]
       - Example: "Alert when 1h burn rate > 14.4x (budget would exhaust
         in ~5 days at this rate)"

    3. **Notification Channel**
       - Who is notified: [team, rotation, individual]
       - Severity: [page for customer-facing, ticket for internal]
       - Runbook link: [link to response procedure]

    4. **Cross-Reference**
       - Add SLO reference in alerting documentation
       - Add alert reference in SLO documentation
       - Ensure both documents stay synchronized

# -----------------------------------------------------------------------------
# EXAMPLES: Help the LLM understand what to look for
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "BRD Section 2.1 + Monitoring Doc Section 4.1"
      text: |
        "BRD: Payment processing must maintain 99.95% availability over a
        30-day rolling window. Error budget: 21.6 minutes of downtime per month.

        Monitoring Doc: Payment availability alert configuration:
        - Threshold alert: fires when 5-min availability < 99.97% (Slack #payments-alerts)
        - Fast burn-rate: fires when 1h burn rate > 14.4x (PagerDuty payments-oncall)
        - Slow burn-rate: fires when 6h burn rate > 3x (JIRA ticket to payments team)
        - Dashboard: grafana.internal/d/payment-slos
        - Runbook: runbook.internal/payment-availability"
      assessment: |
        slo_name: "Payment processing availability"
        slo_source: "BRD Section 2.1"
        slo_target: "99.95% availability, 30-day rolling, 21.6min error budget"
        alert_exists: true
        alert_reference: "Monitoring Doc Section 4.1"
        alert_threshold: "5-min availability < 99.97% (buffer before 99.95% breach)"
        burn_rate_alert: true
        notification_channel_documented: true
        confidence: "high"

  poorly_documented:
    - source: "BRD Section 3.2"
      text: |
        "The API must have low latency. Response times should be fast enough
        for a good user experience. We will monitor performance."
      assessment: |
        slo_name: "API latency"
        slo_source: "BRD Section 3.2"
        slo_target: "Undefined - 'low latency' and 'fast enough' are not measurable"
        alert_exists: false
        alert_reference: null
        alert_threshold: null
        burn_rate_alert: false
        notification_channel_documented: false
        confidence: "high"
        gap: "SLO is vague and unmeasurable. No specific latency target (p50, p99),
              no measurement window, no error budget. Impossible to create meaningful
              alerting without a concrete target. Need specific values like
              'p99 < 500ms over 5-minute window'."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "doc-lint v0.2"
  related_concerns:
    - "failure-mode-coverage"      # alerts should trigger runbook procedures
    - "resilience-triad"           # timeout/retry configs affect SLO achievement
    - "rollback-documentation"     # rollback may be needed when SLOs are breached
  references:
    - "Google SRE Book: Chapter 4 - Service Level Objectives"
    - "Google SRE Workbook: Chapter 5 - Alerting on SLOs"
    - "Implementing Service Level Objectives (Alex Hidalgo)"
    - "Sloth: SLO Generation Framework for Prometheus"

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

**Evaluated**: 2026-03-01 (Session 5: SLA & Promise Validation)
**Review**: `SLA_PROMISE_VALIDATION_MULTI_REVIEW.md`
**Verdict**: PASS — 0 ERRORs, 6 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| W13: Workflow success rate SLO has no alert | WARN | Accepted (HTTP 5xx is partial proxy; dedicated alert recommended) |
| W14: HITL delivery latency SLO has no specific alert | WARN | Accepted (generic HTTP P95 exists; HITL-specific recommended) |
| W15: MCP success rate SLO has no alert | WARN | Accepted (circuit breaker metrics exist; dedicated alert recommended) |
| W16: Audit integrity SLO has no alert | WARN | Accepted (no tamper detection until Phase 3+) |
| W17: No burn-rate alerting | WARN | Accepted (Phase 2+ recommendation) |
| W18: No SLO-alert cross-reference | WARN | Accepted (cross-reference table recommended for Runbook) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
