---
concern: dependency-runbook
version: 1.0
name: Dependency Runbook Coverage
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Dependency Runbook Coverage" (dependency-runbook v1.0). Severity level: warn. Every external dependency identified in architecture documents must have
a documented failure response procedure in operational runbooks. This
includes:
1. External APIs (payment gateways, identity providers, email services)
2. Databases (primary, replicas, managed services)
3. Message queues (RabbitMQ, Kafka, SQS)
4. Caches (Redis, Memcached, CDN caches)
5. CDNs and edge services
6. Third-party SaaS services (monitoring, logging, feature flags)

For each dependency, the runbook must document: what happens when it is
unavailable, what the fallback or degradation strategy is, how to detect
the outage, how to communicate impact, and who to contact for escalation
(both internal team and vendor support). Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Dependency Runbook Coverage
# =============================================================================
# This concern validates that every external dependency (third-party APIs,
# databases, message queues, caches, CDNs) has a documented failure response
# procedure including fallback strategies, degradation modes, and escalation
# contacts. Dependencies without operational docs become black boxes during
# incidents.
#
# WHY THIS MATTERS:
# External dependencies are the most common source of production incidents.
# When Stripe goes down, when the primary database fails over, when Redis
# becomes unreachable - the team needs to know IMMEDIATELY: what is the
# impact, what is the fallback, who do we contact, and how do we communicate
# to users. Without pre-documented procedures, every dependency outage
# becomes a novel problem-solving exercise under pressure, with extended
# downtime and poor customer communication.
#
# TYPICAL MANIFESTATION:
# - ADD lists "uses Stripe for payments" but no procedure for Stripe outage
# - ADD describes database replication but no procedure for failover
# - Message queue is a critical dependency but no documentation of what
#   happens to in-flight messages when it goes down
# - No vendor contact information for escalating third-party outages
# - Fallback/degradation strategy is assumed but never documented
# =============================================================================

concern:
  id: "dependency-runbook"
  version: "1.0"
  name: "Dependency Runbook Coverage"
  category: "operational"
  severity: "warn"

  description: |
    Every external dependency identified in architecture documents must have
    a documented failure response procedure in operational runbooks. This
    includes:
    1. External APIs (payment gateways, identity providers, email services)
    2. Databases (primary, replicas, managed services)
    3. Message queues (RabbitMQ, Kafka, SQS)
    4. Caches (Redis, Memcached, CDN caches)
    5. CDNs and edge services
    6. Third-party SaaS services (monitoring, logging, feature flags)

    For each dependency, the runbook must document: what happens when it is
    unavailable, what the fallback or degradation strategy is, how to detect
    the outage, how to communicate impact, and who to contact for escalation
    (both internal team and vendor support).

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - external-api
    - third-party
    - database
    - message-queue

  escalate_if:
    - payments        # payment dependency outages have direct revenue impact
    - approval-gates  # approval dependency outages block business processes

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically list all external dependencies from architecture documents,
    then verify each has a documented failure response procedure with fallback
    strategy, degradation mode, and escalation contacts.

    STEP 1: LIST ALL EXTERNAL DEPENDENCIES
    Scan all documents (ADD, FRD, infrastructure docs) for external
    dependencies. An external dependency is anything that:
    - Runs in a separate process or on a separate host
    - Is operated by a third party
    - Can become unavailable independently of the application
    - Has its own failure modes outside the team's control

    Categories to look for:
    - External APIs: payment gateways (Stripe, PayPal), identity providers
      (Auth0, Okta), email/SMS services (SendGrid, Twilio), analytics
    - Databases: primary databases, read replicas, managed database services
      (RDS, Cloud SQL), data warehouses
    - Message queues: RabbitMQ, Kafka, SQS, Pub/Sub, event buses
    - Caches: Redis, Memcached, Elasticache, application-level caches
    - CDNs: CloudFront, Fastly, Cloudflare, static asset hosting
    - Third-party services: feature flag services (LaunchDarkly), monitoring
      (Datadog, New Relic), secret managers (Vault, AWS Secrets Manager)
    - Infrastructure: DNS, load balancers, certificate authorities

    For each dependency, record:
    - Name and type
    - What system functionality depends on it
    - Whether it is on a critical path

    STEP 2: CHECK FAILURE SCENARIO DOCUMENTATION
    For each dependency identified in Step 1, look for documentation of:
    - What happens when this dependency is completely unavailable?
    - What is the expected duration of unavailability the system can tolerate?
    - Is there a health check or monitoring for this dependency?
    - How is the outage detected (alert, health check failure, error spike)?

    STEP 3: CHECK FALLBACK AND DEGRADATION STRATEGY
    For each dependency, look for:
    - Fallback strategy: what the system does instead (cached data, alternative
      provider, queue for later, graceful error)
    - Degradation mode: what features are reduced or disabled
    - User communication: what users see during the outage
    - Automatic recovery: how the system resumes normal operation when the
      dependency recovers

    STEP 4: CHECK CONTACT AND ESCALATION INFORMATION
    For each dependency, look for:
    - Internal owner: which team owns the integration
    - Vendor support: contact information for the third-party provider
    - Escalation criteria: when to contact vendor support vs. wait
    - SLA references: what uptime the vendor guarantees
    - Status page: URL for the vendor's status page

    STEP 5: PRIORITIZE BY CRITICALITY
    - Critical dependencies: on the payment, authentication, or core workflow
      path - full runbook coverage is mandatory
    - Standard dependencies: affect features but not core business - runbook
      coverage is strongly recommended
    - Non-critical dependencies: affect non-essential features - basic
      documentation is recommended

  checklist:
    - id: "dependency-inventory"
      question: "Have all external dependencies been identified from architecture documents?"
    - id: "failure-scenario"
      question: "Is the failure scenario documented for each dependency (what happens when it's down)?"
    - id: "fallback-strategy"
      question: "Is there a documented fallback or degradation strategy for each dependency?"
    - id: "degradation-mode"
      question: "Is the degraded user experience documented for each dependency outage?"
    - id: "contact-escalation"
      question: "Are contact and escalation details documented for each external dependency?"

  evidence_required:
    - field: "dependency_name"
      type: "string"
      description: "Name of the external dependency (e.g., 'Stripe Payment API', 'Primary PostgreSQL database', 'RabbitMQ message broker', 'Redis cache cluster')"
      required: true

    - field: "dependency_type"
      type: "enum"
      values:
        - "external-api"
        - "database"
        - "message-queue"
        - "cache"
        - "cdn"
        - "third-party-service"
        - "other"
      description: "Category of the external dependency"
      required: true

    - field: "dependency_source"
      type: "string"
      description: "Document and section where the dependency is referenced (e.g., 'ADD Section 3.1 - Payment Integration', 'ADD Section 2.4 - Data Layer')"
      required: true

    - field: "failure_procedure_exists"
      type: "boolean"
      description: "Whether a documented procedure exists for when this dependency is unavailable"
      required: true

    - field: "fallback_strategy"
      type: "string | null"
      description: "The documented fallback when this dependency is down (e.g., 'Return cached data', 'Queue requests for retry', 'Switch to backup provider', 'Show maintenance page')"
      required: true

    - field: "degradation_mode"
      type: "string | null"
      description: "How the system degrades when this dependency is unavailable (e.g., 'Read-only mode', 'Payment processing paused, orders accepted with pending status', 'Notifications delayed')"
      required: true

    - field: "contact_info_documented"
      type: "boolean"
      description: "Whether vendor contact information and escalation path are documented for this dependency"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate based on available documentation"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. A critical-path dependency (payment gateway, authentication provider,
       primary database) has failure_procedure_exists = FALSE - teams will
       have no guidance during a critical dependency outage

    2. A critical-path dependency has fallback_strategy = NULL - no documented
       plan for maintaining service when the dependency is down

    3. A critical-path dependency has degradation_mode = NULL - no documented
       understanding of how the system behaves during the outage

    Report as WARNING when:

    1. Any non-critical dependency has failure_procedure_exists = FALSE
       - the dependency is known but its failure impact is undocumented

    2. failure_procedure_exists = TRUE but fallback_strategy = NULL
       - the procedure acknowledges the failure but provides no alternative

    3. failure_procedure_exists = TRUE but degradation_mode = NULL
       - the procedure exists but does not describe the user experience
       during the outage

    4. contact_info_documented = FALSE for any third-party dependency
       - no vendor contact means the team cannot escalate externally

    5. A dependency has a fallback strategy but it has never been tested
       or the documentation does not reference testing/validation

    6. Multiple dependencies share the same generic fallback without
       dependency-specific procedures

  recommendation_template: |
    ## Gap: {dependency_name} - Missing Failure Response Procedure

    **Dependency Type:** {dependency_type}
    **Dependency Source:** {dependency_source}
    **Failure Procedure Exists:** {failure_procedure_exists}

    ### Required Documentation

    Create a runbook entry for this dependency covering:

    1. **Failure Detection**
       - How is the outage detected? (health check, error rate spike, vendor status page)
       - What alert fires when this dependency is down?
       - How to distinguish between this dependency failing vs. network issue?

    2. **Impact Assessment**
       - What system features are affected?
       - How many users are impacted?
       - Is there data loss risk?

    3. **Fallback Strategy**
       - What does the system do instead? (cache, queue, alternative, error)
       - How is the fallback activated? (automatic, feature flag, manual)
       - How long can the system operate in fallback mode?

    4. **Degradation Mode**
       - What do users experience during the outage?
       - What communication goes to users? (status page, in-app banner)
       - Which features remain available vs. unavailable?

    5. **Recovery**
       - How does the system detect the dependency has recovered?
       - How is normal operation resumed? (automatic, manual drain, replay)
       - What verification confirms full recovery?

    6. **Escalation and Contacts**
       - Internal team owner: [team name, Slack channel]
       - Vendor support: [contact method, SLA, account ID]
       - Status page: [URL]
       - When to escalate: [time threshold, impact threshold]

# -----------------------------------------------------------------------------
# EXAMPLES: Help the LLM understand what to look for
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 3.1 + Runbook Section 7.2"
      text: |
        "ADD: The PaymentService integrates with Stripe API for charge
        processing. Stripe is a critical-path dependency.

        Runbook 7.2 - Stripe Outage Procedure:
        Detection: Alert 'stripe-health-check-fail' fires when 3 consecutive
        health checks fail. Cross-reference with status.stripe.com.
        Fallback: Activate PAYMENT_QUEUE_MODE feature flag. Orders accepted
        with 'payment-pending' status. Payments queued to DLQ.
        Degradation: Users see 'Payment processing may be delayed' banner.
        Order confirmation shows 'Payment will be processed shortly.'
        Recovery: When Stripe recovers, drain payment queue via
        'rake payments:process_pending'. Monitor payment_success_rate.
        Contacts: Stripe support - support@stripe.com, Account ID: acct_xxx,
        Internal owner: #payments-team Slack channel."
      assessment: |
        dependency_name: "Stripe Payment API"
        dependency_type: "external-api"
        dependency_source: "ADD Section 3.1"
        failure_procedure_exists: true
        fallback_strategy: "Queue payments with pending status, process when recovered"
        degradation_mode: "Orders accepted, payment delayed, user sees banner"
        contact_info_documented: true
        confidence: "high"

  poorly_documented:
    - source: "ADD Section 2.3"
      text: |
        "The system uses Redis for session caching and rate limiting.
        Redis is deployed as a single-node instance on AWS ElastiCache."
      assessment: |
        dependency_name: "Redis cache (ElastiCache)"
        dependency_type: "cache"
        dependency_source: "ADD Section 2.3"
        failure_procedure_exists: false
        fallback_strategy: null
        degradation_mode: null
        contact_info_documented: false
        confidence: "high"
        gap: "Redis is used for session caching AND rate limiting. If Redis
              goes down: sessions may be lost (users logged out), rate limiting
              is disabled (potential abuse). No fallback documented. Single-node
              deployment has no redundancy. Need: fallback to database-backed
              sessions, application-level rate limiting, and ElastiCache failover
              procedure."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "doc-lint v0.2"
  related_concerns:
    - "resilience-triad"           # dependencies need timeout/retry/CB
    - "failure-domain-isolation"   # dependency failures should be contained
    - "failure-mode-coverage"      # dependency failures are a subset of all failure modes
    - "alerting-slo-alignment"    # dependency outages may violate SLOs
  references:
    - "Google SRE Book: Chapter 21 - Handling Overload"
    - "Release It! 2nd Edition (Nygard) - Integration Points"
    - "AWS Well-Architected: Reliability - Dependencies"
    - "Architecture Patterns for Dependency Management (Microsoft)"

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
**Verdict**: PASS — 0 ERRORs, 5 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| W4: LLM providers lack runbook playbook | WARN | Accepted (automatic fallback documented in ADD; dedicated playbook recommended) |
| W5: File Storage lacks runbook playbook | WARN | Accepted (failure domain documented in ADD; dedicated playbook recommended) |
| W6: ClamAV lacks runbook entry | WARN | Accepted (circuit breaker documented; operational entry recommended) |
| W7: Vendor contact directory missing | WARN | Accepted (recommended addition to Runbook) |
| W8: Dependency fallback strategies untested | WARN | Accepted (requires_human_review — quarterly chaos testing recommended) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
