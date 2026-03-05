---
concern: error-path-coverage
version: 1.0
name: Error Path Test Coverage
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Error Path Test Coverage" (error-path-coverage v1.0). Severity level: warn. Validates that every documented error path, failure mode, and degraded
behavior in the ADD and FRD has a corresponding test specification. Error
paths are the code paths exercised when things go wrong: timeouts, retry
exhaustion, circuit breaker activation, validation failures, auth failures,
dependency outages, and data integrity violations. These paths are
disproportionately responsible for production incidents because they are
exercised rarely during development but frequently under production load. Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Error Path Test Coverage
# =============================================================================
# This concern validates that every error path and failure mode documented in
# the ADD or FRD has a corresponding test specification. Error paths include
# timeout handling, retry exhaustion, circuit breaker trips, validation
# failures, authentication failures, dependency outages, and data corruption
# scenarios. These are the paths most likely to cause production incidents
# yet least likely to be tested.
#
# WHY THIS MATTERS:
# Happy paths get tested naturally because developers exercise them during
# development. Error paths are invisible until production traffic triggers
# them. When a payment gateway times out, when a circuit breaker opens, when
# a retry budget is exhausted - the system follows code paths that were never
# verified. The result: cascading failures, data corruption, silent data loss,
# or user-facing errors that expose internal system details. Error paths in
# distributed systems are especially dangerous because they involve partial
# failures, network partitions, and race conditions that are difficult to
# reason about without explicit testing.
#
# TYPICAL MANIFESTATION:
# - ADD documents "circuit breaker opens after 5 failures" but no test
#   verifies the fallback behavior when the circuit is open
# - FRD specifies "show friendly error message on payment timeout" but no
#   test simulates a payment timeout to verify the message
# - ADD describes retry policy with exponential backoff but no test verifies
#   behavior after all retries are exhausted
# - Validation rules documented in FRD but only happy-path inputs tested
# =============================================================================

concern:
  id: "error-path-coverage"
  version: "1.0"
  name: "Error Path Test Coverage"
  category: "test-coverage"
  severity: "warn"

  description: |
    Validates that every documented error path, failure mode, and degraded
    behavior in the ADD and FRD has a corresponding test specification. Error
    paths are the code paths exercised when things go wrong: timeouts, retry
    exhaustion, circuit breaker activation, validation failures, auth failures,
    dependency outages, and data integrity violations. These paths are
    disproportionately responsible for production incidents because they are
    exercised rarely during development but frequently under production load.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - error-handling
    - resilience
    - fault-tolerance
    - testing

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically extract every documented error path and failure mode from
    the ADD and FRD, then verify that each one has a corresponding test
    specification that exercises the error condition and verifies the expected
    system behavior.

    STEP 1: EXTRACT DOCUMENTED ERROR PATHS FROM ADD AND FRD
    Scan all architecture and functional documents for explicitly described
    failure scenarios, error handling behavior, and degraded modes:

    a) TIMEOUT HANDLING
       - API call timeouts (connection timeout, read timeout, total timeout)
       - Database query timeouts
       - Message queue consumption timeouts
       - User session timeouts
       - Async operation timeouts (job execution, workflow step timeouts)
       - Look for: timeout, deadline, max-wait, TTL, expires

    b) RETRY EXHAUSTION
       - What happens after all retry attempts fail
       - Dead letter queue behavior when messages cannot be processed
       - Final fallback after retry budget is consumed
       - User notification when retries are exhausted
       - Look for: retry exhausted, max retries, final failure, dead letter,
         give up, no more retries, retry budget

    c) CIRCUIT BREAKER ACTIVATION
       - Behavior when circuit breaker opens (fail-fast, cached response,
         degraded mode, queue for later)
       - Half-open state behavior (probe requests)
       - Circuit breaker recovery and close behavior
       - Cascading circuit breaker effects across services
       - Look for: circuit breaker, circuit open, fail-fast, fallback,
         half-open, degraded mode, bulkhead

    d) VALIDATION FAILURES
       - Input validation errors (malformed data, missing fields, type errors)
       - Business rule violations (insufficient funds, exceeded quota)
       - Schema validation failures (API request/response mismatch)
       - Data integrity violations (duplicate keys, referential integrity)
       - Look for: validation, invalid, malformed, schema error, constraint
         violation, duplicate, integrity

    e) AUTHENTICATION AND AUTHORIZATION FAILURES
       - Invalid credentials handling
       - Expired token behavior
       - Insufficient permissions response
       - Session hijacking or token theft detection
       - OAuth/OIDC error flows (authorization denied, token refresh failure)
       - Look for: unauthorized, forbidden, 401, 403, token expired, auth
         failure, permission denied, access denied

    f) DEPENDENCY FAILURES
       - External service unavailability (third-party API down)
       - Database connection pool exhaustion
       - Message broker unavailability
       - DNS resolution failures
       - TLS certificate expiration or mismatch
       - Look for: unavailable, connection refused, connection pool, service
         down, dependency failure, 503, 502

    g) DATA CORRUPTION AND CONSISTENCY FAILURES
       - Handling of corrupted or unexpected data formats
       - Stale cache behavior and cache invalidation failures
       - Eventual consistency window behavior
       - Conflict resolution for concurrent writes
       - Look for: corrupt, stale, inconsistent, conflict, race condition,
         concurrent, out of sync

    For each error path, record:
    - A descriptive identifier for the error path
    - The source document and section where it is described
    - The error type category (from the list above)
    - The documented expected behavior when this error occurs

    STEP 2: CHECK FOR CORRESPONDING TEST SPECIFICATIONS
    For each documented error path identified in Step 1, search across all
    test documentation for test coverage:

    a) DIRECT ERROR PATH TESTS
       - Test cases that explicitly simulate the error condition
       - Test descriptions that mention the specific failure mode
       - Chaos engineering or fault injection test plans
       - Look for: test case, negative test, error test, failure test,
         fault injection, chaos test

    b) TEST APPROACH ASSESSMENT
       For each error path, determine what test approach is used:
       - Mock/stub-based: external dependency is mocked to return errors
       - Fault injection: actual infrastructure faults are simulated
       - Integration test: real dependencies in controlled failure state
       - Manual test procedure: exploratory testing script
       - No test: error path has no test specification

    c) COVERAGE COMPLETENESS
       For each error path test, verify it covers:
       - The trigger condition (what causes the error)
       - The system's immediate response (error handling logic)
       - The user-facing behavior (error message, degraded UI, retry prompt)
       - The system's recovery behavior (how it returns to normal)
       - Side effects (logging, alerting, metrics, audit trail)

    STEP 3: FLAG ERROR PATHS WITHOUT TEST COVERAGE
    Identify all gaps and assess their severity based on blast radius:

    a) CRITICAL GAPS (payment, auth, data integrity error paths)
       - Payment timeout without test: risk of double charges or lost payments
       - Auth failure without test: risk of security bypass or information leak
       - Data corruption without test: risk of silent data loss
       - These error paths affect user trust, financial accuracy, or security

    b) SIGNIFICANT GAPS (resilience and dependency error paths)
       - Circuit breaker without test: fallback behavior unverified
       - Retry exhaustion without test: final failure behavior unknown
       - Dependency outage without test: cascading failure risk unverified

    c) MODERATE GAPS (validation and user experience error paths)
       - Validation failure without test: error messages may be unhelpful
       - Session timeout without test: user experience during timeout unknown
       - These affect user experience but not system integrity

  checklist:
    - id: "error-paths-extracted"
      question: "Have all documented error paths and failure modes been identified from ADD and FRD?"
    - id: "timeout-paths-tested"
      question: "Do all documented timeout scenarios have test specifications that simulate the timeout and verify handling behavior?"
    - id: "retry-exhaustion-tested"
      question: "Is the behavior after retry exhaustion tested for each documented retry policy?"
    - id: "circuit-breaker-tested"
      question: "Are circuit breaker open-state, half-open, and recovery behaviors tested?"
    - id: "auth-error-paths-tested"
      question: "Are authentication and authorization failure paths tested (expired tokens, invalid credentials, insufficient permissions)?"
    - id: "dependency-failure-tested"
      question: "Are dependency unavailability scenarios tested for each external dependency?"

  evidence_required:
    - field: "error_path"
      type: "string"
      description: "Description of the error path or failure mode (e.g., 'Payment gateway timeout after 10s causes retry, then fallback to queued processing')"
      required: true

    - field: "error_source"
      type: "string"
      description: "Document and section where the error path is documented (e.g., 'ADD Section 5.3, Resilience Policy for PaymentService')"
      required: true

    - field: "error_type"
      type: "enum"
      values:
        - "timeout"
        - "retry-exhaustion"
        - "circuit-breaker"
        - "validation-failure"
        - "auth-failure"
        - "dependency-failure"
        - "data-corruption"
        - "other"
      description: "Category of the error path"
      required: true

    - field: "test_exists"
      type: "boolean"
      description: "Whether a test specification exists that exercises this specific error path"
      required: true

    - field: "test_reference"
      type: "string | null"
      description: "Reference to the test specification (e.g., 'Test Plan Section 7.2, TC-089 - Payment Gateway Timeout') or null if no test found"
      required: true

    - field: "test_approach"
      type: "string | null"
      description: "How the error condition is simulated in the test (e.g., 'Mock Stripe API to return 504 after 10s delay', 'Fault injection via Chaos Monkey') or null if no test exists"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Confidence that the test adequately exercises the error path: 'high' if test explicitly simulates the exact failure mode, 'medium' if test covers a related scenario, 'low' if coverage is inferred"
      required: true

  failure_condition: |
    Report as ERROR when:

    1. A payment or financial error path has no test coverage
       (error_type is "timeout", "retry-exhaustion", or "dependency-failure"
       AND the error path involves payment processing, billing, or financial
       transactions). Untested payment error paths risk double charges,
       lost payments, or financial data inconsistency.

    2. An authentication or authorization error path has no test coverage
       (error_type is "auth-failure"). Untested auth error paths risk
       security bypasses, session fixation, or information disclosure.

    3. A documented circuit breaker fallback behavior has no test verifying
       what the user experiences when the circuit is open. The fallback
       is the most critical path - it runs when the system is already
       degraded.

    4. A data corruption or consistency error path has no test coverage
       (error_type is "data-corruption"). Untested corruption handling
       risks silent data loss or propagation of corrupt data.

    5. More than 60% of documented error paths have no test specifications
       (systemic lack of error path testing).

    Report as WARNING when:

    1. Any documented error path lacks a corresponding test specification
       (test_exists is FALSE) regardless of error type.

    2. A test exists but uses a simplistic approach that may not accurately
       simulate the real failure mode (e.g., returning an error code vs.
       simulating actual network timeout with delay).

    3. A test covers the error trigger but does not verify recovery behavior
       (test confirms error is caught but not that system recovers to normal
       operation afterward).

    4. An error path is tested at the unit level only but involves
       cross-service behavior that requires integration testing.

    5. Error paths are documented in the ADD but the test plan has no
       dedicated section for negative/error testing (suggests error testing
       was not systematically planned).

  recommendation_template: |
    ## Gap: Untested Error Path - {error_path}

    **Error Type:** {error_type}
    **Source:** {error_source}
    **Test Exists:** {test_exists}

    ### Missing Error Path Test

    This error path is documented in the architecture or functional
    specification but has no corresponding test specification. When this
    failure mode occurs in production, the system's behavior will be
    unverified and may not match documented expectations.

    ### Recommended Actions

    1. **Create Error Path Test**:
       Add a test case that explicitly simulates this failure condition
       and verifies the documented handling behavior.

    2. **Define Test Approach**:
       - For timeouts: use configurable delays or mock delayed responses
       - For dependency failures: mock dependency to return error/unavailable
       - For circuit breaker: trigger enough failures to open the circuit,
         then verify fallback behavior
       - For auth failures: use invalid/expired credentials and verify
         appropriate error responses without information leakage

    3. **Verify Complete Error Handling**:
       The test should verify:
       - Error is detected correctly (trigger condition)
       - System responds appropriately (error handling logic)
       - User sees correct feedback (error message, degraded UI)
       - System recovers properly (return to normal after error clears)
       - Observability works (logs, metrics, alerts are emitted)

    4. **Consider Chaos Engineering**:
       For critical error paths in distributed systems, consider fault
       injection testing that simulates real infrastructure failures
       rather than mocked responses.

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 5.3 - PaymentService Resilience"
      text: |
        "When the Stripe API call times out after 10 seconds, the system
        queries Stripe's charge status endpoint before retrying. If the
        charge exists, the system proceeds as successful. If not, the
        system retries with the same idempotency key. After 3 failed
        retries, the payment is queued for manual review and the user
        sees 'Payment is being verified, we will email you within 1 hour.'"
      mapping: |
        error_path: "Stripe API timeout -> status check -> retry or queue"
        error_source: "ADD Section 5.3"
        error_type: "timeout"
        test_exists: true
        test_reference: "Test Plan Section 7.2, TC-089 through TC-092"
        test_approach: "Mock Stripe API with configurable delay. TC-089:
          timeout + charge found (proceed). TC-090: timeout + charge not
          found (retry). TC-091: 3 retries exhausted (queue for review).
          TC-092: verify user-facing message during uncertainty."
        confidence: "high"

  poorly_documented:
    - source: "ADD Section 4.1 - Circuit Breaker Configuration"
      text: |
        "The InventoryService circuit breaker opens after 5 failures in
        60 seconds. When open, the system uses cached inventory counts.
        The circuit enters half-open state after 30 seconds and sends
        a probe request."
      mapping: |
        error_path: "InventoryService circuit breaker open -> cached counts"
        error_source: "ADD Section 4.1"
        error_type: "circuit-breaker"
        test_exists: false
        test_reference: null
        test_approach: null
        confidence: "high"
        gap: "Circuit breaker behavior is documented in detail (open, cached
              fallback, half-open probe) but no test verifies: (1) the circuit
              actually opens after 5 failures, (2) cached counts are returned
              when open, (3) probe request works in half-open state, (4) system
              recovers when dependency returns. All four behaviors are untested."

  partial_coverage:
    - source: "FRD Section 6.2 - Input Validation"
      text: |
        "The registration form validates: (1) email is valid format and
        unique, (2) password meets complexity requirements (8+ chars,
        uppercase, number, special), (3) phone number is valid E.164
        format. On validation failure, display specific error messages
        next to each invalid field."
      mapping: |
        error_path: "Registration validation failure -> field-specific errors"
        error_source: "FRD Section 6.2"
        error_type: "validation-failure"
        test_exists: true
        test_reference: "Test Plan Section 3.1, TC-008"
        test_approach: "Submit registration with invalid email, verify error"
        confidence: "medium"
        gap: "TC-008 only tests invalid email format. No tests for: duplicate
              email (uniqueness constraint), password complexity violations
              (each sub-requirement), invalid phone format, or multiple
              simultaneous validation errors. Coverage is partial."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "doc-lint v0.2"
  related_concerns:
    - "resilience-triad"              # documents the timeout/retry/CB policies that create error paths
    - "requirement-test-mapping"      # error paths are a subset of testable requirements
    - "boundary-condition-coverage"   # boundary violations are a form of error path
    - "failure-domain-isolation"      # error paths should not cross failure domain boundaries
  references:
    - "Release It! 2nd Edition (Nygard) - Stability Antipatterns"
    - "ISTQB: Negative Testing and Error Guessing Techniques"
    - "Netflix Chaos Engineering: Principles of Chaos"
    - "Google SRE Book: Testing for Reliability, Chapter 17"

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

**Evaluated**: 2026-03-04 (Session 7: Testing & Observability)
**Review**: `TESTING_OBSERVABILITY_MULTI_REVIEW.md`
**Verdict**: PASS — 0 ERRORs, 13 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| W1: Systemic — no error path test section exists | WARN | Accepted (create Error Path Test Plan) |
| W2: Circuit breaker fallback untested | WARN | Accepted (test MCP + LLM fallback behavior) |
| W3: Auth failure paths untested | WARN | Accepted (test JWKS stale-if-error, expired token, Supabase outage) |
| W4: Redis per-consumer degradation untested | WARN | Accepted (test 4 distinct fail-open/closed policies) |
| W5: Retry exhaustion final behavior untested | WARN | Accepted (test behavior after all retries exhausted) |
| W6: Audit service blocking untested | WARN | Accepted (test sync audit write blocking) |
| W7: DB connection pool exhaustion untested | WARN | Accepted (test 21st connection behavior) |
| W8: Inngest checkpoint recovery untested | WARN | Accepted (test memoized step re-execution) |
| W9: Saga compensation path untested | WARN | Accepted (test compensation states and crash recovery) |
| W10: HITL decision race condition untested | WARN | Accepted (test concurrent approval behavior) |
| W11: Webhook signature verification failure untested | WARN | Accepted (test 401 on invalid signature) |
| W12: LLM provider fallback untested | WARN | Accepted (test primary→secondary switching) |
| W13: Dead letter queue untested | WARN | Accepted (test DLQ routing) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
