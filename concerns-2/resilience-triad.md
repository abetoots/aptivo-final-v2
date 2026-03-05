---
concern: resilience-triad
version: 1.0
name: Resilience Triad: Timeout / Retry / Circuit Breaker
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Resilience Triad: Timeout / Retry / Circuit Breaker" (resilience-triad v1.0). Severity level: error. Every external dependency must document all three legs of the resilience triad:
1. Timeout: Maximum wait time before abandoning a call
2. Retry: Policy for re-attempting failed calls (count, backoff, conditions)
3. Circuit Breaker: Threshold for stopping calls to a failing dependency

These three mechanisms must be coherent: the total timeout must accommodate
the retry budget (retry_count * per_attempt_timeout + backoff delays).
Without all three, the system is vulnerable to cascading failures. Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Resilience Triad (Timeout / Retry / Circuit Breaker)
# =============================================================================
# This concern validates that every external dependency has explicitly
# documented timeout, retry, and circuit breaker policies. These three
# mechanisms form a "triad" - without all three, the system is vulnerable
# to cascading failures, resource exhaustion, or silent degradation.
#
# WHY THIS MATTERS:
# A missing timeout means indefinite hangs. A missing retry policy means
# transient failures become permanent. A missing circuit breaker means a
# failing dependency can take down the entire system through resource
# exhaustion. These are the top 3 causes of cascading outages.
#
# TYPICAL MANIFESTATION:
# - ADD says "calls Payment Gateway" but no timeout specified
# - Retry count documented but no backoff strategy or circuit breaker
# - Timeout documented but retry budget exceeds total timeout
# =============================================================================

concern:
  id: "resilience-triad"
  version: "1.0"
  name: "Resilience Triad: Timeout / Retry / Circuit Breaker"
  category: "core"
  severity: "error"

  description: |
    Every external dependency must document all three legs of the resilience triad:
    1. Timeout: Maximum wait time before abandoning a call
    2. Retry: Policy for re-attempting failed calls (count, backoff, conditions)
    3. Circuit Breaker: Threshold for stopping calls to a failing dependency

    These three mechanisms must be coherent: the total timeout must accommodate
    the retry budget (retry_count * per_attempt_timeout + backoff delays).
    Without all three, the system is vulnerable to cascading failures.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - external-api
    - external-dependency
    - microservices
    - distributed

  escalate_if:
    - payments        # financial impact if dependency hangs
    - approval-gates  # business process blocked if dependency unavailable

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every external dependency in the documented system,
    then evaluate whether all three resilience mechanisms are documented.

    STEP 1: IDENTIFY EXTERNAL DEPENDENCIES
    Scan all documents for components that depend on external systems:
    - Third-party APIs (payment gateways, identity providers, notification services)
    - Internal microservices called over the network
    - Databases and data stores (especially remote/managed)
    - Message brokers and event streams
    - External file storage (S3, blob storage)
    - DNS, certificate authorities, secret managers
    - Any service where network latency or failure is possible

    STEP 2: FOR EACH DEPENDENCY, EVALUATE THE TRIAD

    a) TIMEOUT
       - Is a timeout explicitly documented?
       - What is the timeout value? (connection timeout, read timeout, total timeout)
       - Is there a per-attempt timeout vs. total operation timeout?
       - Look for: timeout, deadline, max-wait, TTL

    b) RETRY
       - Is a retry policy explicitly documented?
       - What triggers a retry? (which error codes, timeout, network error)
       - How many retries? What backoff strategy? (fixed, exponential, jitter)
       - Are retries idempotent-safe? (link to idempotency-boundaries concern)
       - Look for: retry, backoff, exponential, jitter, max-attempts

    c) CIRCUIT BREAKER
       - Is a circuit breaker pattern documented?
       - What is the failure threshold? (e.g., 5 failures in 60 seconds)
       - What happens when the circuit opens? (fail-fast, return default, degrade)
       - How does the circuit recover? (half-open state, probe interval)
       - Look for: circuit breaker, bulkhead, fail-fast, half-open, fallback

    STEP 3: VALIDATE TRIAD COHERENCE
    For each dependency where all three are documented, verify they are coherent:
    - total_timeout >= retry_count * per_attempt_timeout + total_backoff_delay
    - If total_timeout < retry budget, retries will be cut short by timeout
    - Circuit breaker threshold should account for retry multiplication

    Example incoherence:
    - Timeout: 5 seconds
    - Retry: 3 attempts with 2s backoff
    - Required minimum: 3 * 5s + 2 * 2s = 19s total, but timeout is only 5s

    STEP 4: EVALUATE FALLBACK BEHAVIOR
    When the circuit opens or all retries are exhausted:
    - What does the caller experience?
    - Is degraded behavior documented?
    - Are there explicit fallback strategies?

    STEP 5: FLAG GAPS
    Any dependency missing one or more legs of the triad is a gap.
    Pay special attention to dependencies where:
    - Only timeouts are documented (no retry/CB)
    - Retry is documented without idempotency consideration
    - No fallback behavior is specified for when the dependency is unavailable

  checklist:
    - id: "timeout-coverage"
      question: "Does every external dependency have an explicit timeout documented?"
    - id: "retry-coverage"
      question: "Does every external dependency have a retry policy with count, backoff, and trigger conditions?"
    - id: "circuit-breaker-coverage"
      question: "Does every external dependency have a circuit breaker with threshold, open behavior, and recovery?"
    - id: "triad-coherence"
      question: "Are timeout, retry, and circuit breaker values coherent with each other?"
    - id: "fallback-behavior"
      question: "Is fallback behavior documented for when a dependency is unavailable?"

  evidence_required:
    - field: "dependency_name"
      type: "string"
      description: "Name of the external dependency (e.g., 'Stripe Payment API', 'UserService')"
      required: true

    - field: "dependency_type"
      type: "enum"
      values:
        - "third-party-api"
        - "internal-service"
        - "database"
        - "message-broker"
        - "file-storage"
        - "infrastructure"
        - "other"
      description: "Category of the external dependency"
      required: true

    - field: "timeout_documented"
      type: "boolean"
      description: "Is a timeout explicitly documented for this dependency?"
      required: true

    - field: "timeout_values"
      type: "string | null"
      description: "Documented timeout values (e.g., 'connection: 3s, read: 10s, total: 30s')"
      required: true

    - field: "retry_documented"
      type: "boolean"
      description: "Is a retry policy explicitly documented?"
      required: true

    - field: "retry_policy"
      type: "string | null"
      description: "Documented retry policy (e.g., '3 attempts, exponential backoff 1s/2s/4s, on 5xx and timeout')"
      required: true

    - field: "circuit_breaker_documented"
      type: "boolean"
      description: "Is a circuit breaker pattern documented?"
      required: true

    - field: "circuit_breaker_policy"
      type: "string | null"
      description: "Documented circuit breaker policy (e.g., 'open after 5 failures in 60s, half-open probe every 30s')"
      required: true

    - field: "fallback_behavior"
      type: "enum"
      values:
        - "fail-fast"
        - "return-default"
        - "return-cache"
        - "degrade-gracefully"
        - "queue-for-later"
        - "undefined"
      description: "What happens when the dependency is unavailable and all retries/CB are exhausted"
      required: true

    - field: "triad_gap"
      type: "string | null"
      description: "Which legs of the triad are missing or incoherent (e.g., 'missing circuit breaker', 'timeout < retry budget')"
      required: true

    - field: "source_location"
      type: "string"
      description: "Exact location where this is documented (e.g., 'ADD Section 6.1, paragraph 2')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. Any leg of the triad is undocumented for an external dependency:
       - timeout_documented is FALSE
       - retry_documented is FALSE
       - circuit_breaker_documented is FALSE

    2. Timeout is documented but has no specific value (vague language like
       "appropriate timeout" or "will time out eventually")

    3. Retry is documented without specifying:
       - Maximum retry count
       - Backoff strategy
       - Which failures trigger retries

    4. Circuit breaker is documented but missing:
       - Failure threshold (count and window)
       - Open-circuit behavior
       - Recovery mechanism (half-open)

    5. Triad incoherence: total_timeout < retry_count * per_attempt_timeout + backoff
       (retries will be silently cut short by timeout)

    6. A payment or approval-gate dependency has ANY missing triad leg

    Report as WARNING when:

    1. fallback_behavior is "undefined" for any dependency

    2. Circuit breaker threshold is documented but seems too high
       (e.g., 100 failures before opening - likely too permissive)

    3. Retry policy exists but no mention of idempotency consideration
       (retries without idempotency may cause duplicate side effects)

    4. Only two of three triad legs are documented (partial coverage)

    5. Triad values are documented but coherence is not explicitly stated
       (team may not have verified the math)

  recommendation_template: |
    ## Gap: {dependency_name} - Incomplete Resilience Triad

    **Location:** {source_location}
    **Dependency Type:** {dependency_type}
    **Missing:** {triad_gap}

    ### Required Documentation

    Add explicit documentation covering all three legs:

    1. **Timeout**
       - Connection timeout: [value]
       - Read/response timeout: [value]
       - Total operation timeout: [value]
       - Example: "Connection timeout: 3s, read timeout: 10s, total: 30s"

    2. **Retry Policy**
       - Max attempts: [count]
       - Backoff: [fixed/exponential/exponential+jitter]
       - Retry conditions: [which errors trigger retry]
       - Idempotency: [link to idempotency strategy]
       - Example: "3 attempts, exponential backoff (1s, 2s, 4s) with jitter,
         retry on 5xx and timeout, idempotent via X-Idempotency-Key"

    3. **Circuit Breaker**
       - Failure threshold: [count in window]
       - Open behavior: [fail-fast/return-default/degrade]
       - Recovery: [half-open probe interval]
       - Example: "Open after 5 failures in 60s, fail-fast with cached response,
         probe every 30s to detect recovery"

    4. **Coherence Check**
       - Verify: total_timeout >= retry_count * per_attempt_timeout + backoff
       - Document the calculation explicitly

# -----------------------------------------------------------------------------
# EXAMPLES: Help the LLM understand what to look for
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 6.1"
      text: |
        "The PaymentService calls Stripe API with: connection timeout 3s,
        read timeout 10s. On 5xx or timeout, retry up to 3 times with
        exponential backoff (1s, 2s, 4s) plus jitter. Circuit breaker opens
        after 5 failures in 60s; when open, return cached exchange rates and
        queue payment for later. Half-open probe every 30s.
        Total budget: 3 * 10s + 1s + 2s + 4s = 37s < 45s total timeout."
      assessment: |
        timeout_documented: true
        timeout_values: "connection: 3s, read: 10s, total: 45s"
        retry_documented: true
        retry_policy: "3 attempts, exponential backoff 1s/2s/4s + jitter, on 5xx and timeout"
        circuit_breaker_documented: true
        circuit_breaker_policy: "open after 5 failures in 60s, half-open probe every 30s"
        fallback_behavior: "queue-for-later"
        triad_gap: null

  poorly_documented:
    - source: "ADD Section 4.3"
      text: |
        "The notification service calls the email provider. Retries are
        attempted on failure."
      assessment: |
        timeout_documented: false
        timeout_values: null
        retry_documented: false (vague - no count, backoff, or trigger conditions)
        retry_policy: null
        circuit_breaker_documented: false
        circuit_breaker_policy: null
        fallback_behavior: "undefined"
        triad_gap: "All three legs missing or vague. No timeout, no retry details, no circuit breaker."

  incoherent_triad:
    - source: "ADD Section 5.2"
      text: |
        "Calls UserService with 5s timeout. Retry 3 times with 2s fixed delay.
        Circuit breaker opens after 10 failures in 30s."
      assessment: |
        timeout_documented: true
        timeout_values: "5s total"
        retry_documented: true
        retry_policy: "3 attempts, 2s fixed delay"
        circuit_breaker_documented: true
        circuit_breaker_policy: "open after 10 failures in 30s"
        fallback_behavior: "undefined"
        triad_gap: "Incoherent: retry budget = 3 * 5s + 2 * 2s = 19s but timeout is 5s. Retries 2 and 3 will always be cut short."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "Multi-Expert Consensus (Claude, Gemini, ChatGPT)"
  related_concerns:
    - "idempotency-boundaries"    # retries must be idempotent-safe
    - "failure-domain-isolation"   # circuit breaker prevents cascade across domains
    - "api-contract-consistency"   # timeout/retry claims should match API spec
  references:
    - "Release It! 2nd Edition (Nygard) - Stability Patterns"
    - "Microsoft Azure Architecture: Circuit Breaker Pattern"
    - "AWS Well-Architected: Reliability Pillar - Retry with Backoff"
    - "Polly (.NET) / Resilience4j (Java) - Resilience Libraries"

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
**Verdict**: CONDITIONAL PASS — 7 ERRORs (resolved), 3 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| E1: LLM Gateway missing CB + vague timeout/retry | ERROR | **RESOLVED** — Added ADD §2.3.3 Resilience Triad Reference |
| E2: Inngest Cloud missing triad | ERROR | **RESOLVED** — Added ADD §2.3.3 |
| E3: Novu Cloud missing triad | ERROR | **RESOLVED** — Added ADD §2.3.3 |
| E4: Supabase Auth incomplete triad | ERROR | **RESOLVED** — Added ADD §2.3.3 |
| E5: PostgreSQL missing triad | ERROR | **RESOLVED** — Added ADD §2.3.3 |
| E6: Redis missing triad | ERROR | **RESOLVED** — Added ADD §2.3.3 |
| E7: File Storage/ClamAV incomplete triad | ERROR | **RESOLVED** — Added ADD §2.3.3 |
| W1: MCP triad coherence not explicitly documented | WARN | Accepted (composition is correct; advisory) |
| W2: LLM retry idempotency/cost impact | WARN | Accepted (Inngest memoization prevents duplicates) |
| W3: TSD-ADD documentation split | WARN | Accepted (consolidation deferred) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
