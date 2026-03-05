---
concern: requirement-test-mapping
version: 1.0
name: Requirement-Test Mapping
type: concern
project: aptivo-final-v2
generated: 2026-03-04T08:56:50.894Z
---

## System Message

You are a documentation validator evaluating the concern: "Requirement-Test Mapping" (requirement-test-mapping v1.0). [Tier 3 — Structural] This is a structural concern. You may assume tier 1 (foundational) and tier 2 (behavioral) concerns are established. Evaluate structural coherence across the documentation. Severity level: warn. Validates that every testable requirement in the FRD (features, acceptance
criteria, business rules, user stories) has a corresponding test
specification in the test plan or test documentation. Requirements without
test coverage are unverified assumptions - the team cannot prove the system
satisfies them. This concern builds a traceability matrix from requirements
to tests and flags any requirement that lacks test coverage. Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Requirement-Test Mapping
# =============================================================================
# This concern validates that every testable requirement documented in the FRD
# (functional requirements, acceptance criteria, business rules, user stories)
# has a corresponding test specification. Without explicit mapping from
# requirements to tests, teams cannot verify whether the system actually
# satisfies what was promised to stakeholders.
#
# WHY THIS MATTERS:
# Untested requirements are unverified promises. When acceptance criteria
# exist in the FRD but no test plan covers them, the team has no way to
# confirm delivery. During UAT, stakeholders discover missing functionality
# that was "specified but never verified." This leads to late-stage rework,
# missed deadlines, and eroded trust between engineering and product teams.
#
# TYPICAL MANIFESTATION:
# - FRD defines "user can export report as CSV" with acceptance criteria,
#   but test plan has no export-related test cases
# - Business rule states "orders over $10,000 require manager approval"
#   but no test verifies the threshold behavior
# - User story says "as a user, I can reset my password via email" but
#   test suite only covers happy-path login, not password reset flow
# =============================================================================

concern:
  id: "requirement-test-mapping"
  version: "1.0"
  name: "Requirement-Test Mapping"
  category: "test-coverage"
  severity: "warn"

  description: |
    Validates that every testable requirement in the FRD (features, acceptance
    criteria, business rules, user stories) has a corresponding test
    specification in the test plan or test documentation. Requirements without
    test coverage are unverified assumptions - the team cannot prove the system
    satisfies them. This concern builds a traceability matrix from requirements
    to tests and flags any requirement that lacks test coverage.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - testing
    - qa
    - acceptance-criteria
    - requirements-tracing

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically extract every testable requirement from the FRD and verify
    that each one has a corresponding test specification documented somewhere
    in the project documentation (test plan, test cases, QA documentation).

    STEP 1: EXTRACT TESTABLE REQUIREMENTS FROM FRD
    Scan the FRD for all items that represent testable behavior:

    a) FUNCTIONAL REQUIREMENTS
       - Features with explicit behavior descriptions
       - "The system shall..." or "The system must..." statements
       - Numbered or labeled requirements (FR-001, REQ-001, etc.)
       - Look for: shall, must, will, should, supports, provides, enables

    b) ACCEPTANCE CRITERIA
       - Given/When/Then statements
       - Bullet-pointed criteria under features or user stories
       - Definition of Done items that describe verifiable outcomes
       - Look for: acceptance criteria, definition of done, DoD, given/when/then

    c) BUSINESS RULES
       - Conditional logic governing system behavior
       - Threshold-based rules (e.g., "orders above $X require approval")
       - Validation rules (e.g., "email must be unique per account")
       - Calculation rules (e.g., "discount = 10% for orders over $100")
       - Look for: business rule, policy, constraint, validation, threshold

    d) USER STORIES
       - "As a [role], I want [capability], so that [benefit]"
       - Each user story implies testable behavior
       - Stories with multiple acceptance criteria may need multiple tests
       - Look for: as a, I want, so that, user story, epic, feature

    e) NON-FUNCTIONAL REQUIREMENTS WITH TESTABLE THRESHOLDS
       - Performance targets (e.g., "page load under 2 seconds")
       - Availability targets (e.g., "99.9% uptime")
       - Security requirements (e.g., "session expires after 30 minutes")
       - Look for: SLA, performance, latency, throughput, availability

    For each requirement, record:
    - A unique identifier (use explicit ID if present, or synthesize one)
    - The requirement text or summary
    - The source section in the FRD
    - Whether it is testable (most should be; flag any that are not)

    STEP 2: CHECK FOR CORRESPONDING TEST SPECIFICATIONS
    For each testable requirement identified in Step 1, search across all
    available documentation for test coverage:

    a) DIRECT REFERENCES
       - Test cases that explicitly reference the requirement ID
       - Test plan sections that name the feature or business rule
       - Look for: test case, TC-, test plan, test spec, test scenario

    b) IMPLICIT COVERAGE
       - Test descriptions that match the requirement's behavior, even without
         explicit ID references
       - Integration tests that exercise the feature end-to-end
       - Be cautious: implicit coverage is lower confidence than explicit

    c) TEST TYPES TO CHECK
       - Unit tests: individual function/method behavior
       - Integration tests: cross-component behavior
       - End-to-end tests: full user workflow
       - Acceptance tests: stakeholder-facing verification
       - Manual test procedures: exploratory or UAT scripts
       - Performance tests: for non-functional requirements

    For each requirement, record:
    - Whether a test specification exists (true/false)
    - The test reference (document, section, test case ID)
    - The type of test (unit, integration, e2e, acceptance, manual, none)
    - Confidence level (high if explicit reference, low if inferred)

    STEP 3: FLAG REQUIREMENTS WITHOUT TEST SPECIFICATIONS
    Identify all gaps and assess their severity:

    a) CRITICAL GAPS (likely ERROR severity)
       - Business rules with financial impact (pricing, billing, discounts)
       - Authentication and authorization requirements
       - Data integrity requirements (uniqueness, referential integrity)
       - Compliance or regulatory requirements
       - Requirements explicitly marked as "critical" or "P0"

    b) SIGNIFICANT GAPS (likely WARNING severity)
       - User-facing features without any test coverage
       - Non-functional requirements with specific thresholds but no tests
       - User stories without acceptance test coverage

    c) MINOR GAPS (informational)
       - Requirements covered by one test type but not others
       - Features with manual test procedures but no automated tests
       - Nice-to-have features without test plans

    STEP 4: ASSESS OVERALL COVERAGE
    Calculate the coverage ratio and identify patterns:
    - Total testable requirements found
    - Requirements with test specifications (covered)
    - Requirements without test specifications (uncovered)
    - Coverage ratio (covered / total)
    - Patterns: are entire feature areas untested? Are business rules
      consistently missing tests while UI features have full coverage?

  checklist:
    - id: "requirements-extracted"
      question: "Have all testable requirements been identified from the FRD (features, acceptance criteria, business rules, user stories)?"
    - id: "test-specs-checked"
      question: "Has each requirement been checked against test documentation for corresponding test specifications?"
    - id: "critical-rules-covered"
      question: "Do critical business rules (financial, auth, compliance) have explicit test specifications?"
    - id: "acceptance-criteria-covered"
      question: "Do acceptance criteria defined in user stories have corresponding acceptance tests?"
    - id: "coverage-ratio-assessed"
      question: "Has an overall requirement-to-test coverage ratio been calculated and assessed?"

  evidence_required:
    - field: "requirement_id"
      type: "string"
      description: "Unique identifier for the requirement (e.g., 'FR-001', 'BIZ-RULE-003', 'US-Login-01')"
      required: true

    - field: "requirement_text"
      type: "string"
      description: "The requirement text or a concise summary (e.g., 'Orders over $10,000 require manager approval before processing')"
      required: true

    - field: "requirement_source"
      type: "string"
      description: "FRD section and location where the requirement is defined (e.g., 'FRD Section 4.2, Acceptance Criteria #3')"
      required: true

    - field: "test_spec_exists"
      type: "boolean"
      description: "Whether a corresponding test specification was found in any test documentation"
      required: true

    - field: "test_reference"
      type: "string | null"
      description: "Reference to the test specification covering this requirement (e.g., 'Test Plan Section 5.1, TC-042') or null if none found"
      required: true

    - field: "test_type"
      type: "enum"
      values:
        - "unit"
        - "integration"
        - "e2e"
        - "acceptance"
        - "manual"
        - "none"
      description: "The type of test that covers this requirement, or 'none' if no test exists"
      required: true

    - field: "coverage_status"
      type: "enum"
      values:
        - "covered"
        - "partial"
        - "uncovered"
      description: "'covered' if test fully addresses requirement, 'partial' if test exists but does not cover all acceptance criteria, 'uncovered' if no test found"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Confidence in the mapping accuracy: 'high' if explicit ID reference links requirement to test, 'medium' if test description matches requirement behavior, 'low' if inferred from context"
      required: true

  failure_condition: |
    Report as ERROR when:

    1. A critical business rule (financial logic, pricing, billing, discount
       calculations) has no test specification (test_spec_exists is FALSE and
       requirement involves money, payments, or financial calculations).

    2. An authentication or authorization requirement has no test coverage
       (e.g., "only admins can delete records" with no auth test).

    3. A compliance or regulatory requirement has no test specification
       (requirement text mentions compliance, regulation, GDPR, PCI, SOX,
       HIPAA, or similar regulatory frameworks).

    4. More than 50% of testable requirements have no test specifications
       (systemic lack of test planning).

    5. An explicitly numbered requirement (FR-001, REQ-XXX) is referenced
       in the FRD as critical/P0 and has coverage_status "uncovered".

    Report as WARNING when:

    1. Any testable requirement lacks a corresponding test specification
       (test_spec_exists is FALSE) regardless of severity.

    2. A requirement has "partial" coverage (test exists but does not fully
       address all acceptance criteria for that requirement).

    3. Coverage is inferred rather than explicit (confidence is "low") -
       the test may exist but the mapping is guesswork.

    4. A user story has acceptance criteria defined but no acceptance-level
       test (only unit tests cover the underlying behavior).

    5. Non-functional requirements with specific thresholds (performance,
       availability) have no corresponding performance or load tests.

  recommendation_template: |
    ## Gap: Untested Requirement - {requirement_id}

    **Requirement:** {requirement_text}
    **Source:** {requirement_source}
    **Test Coverage:** {coverage_status}
    **Test Type:** {test_type}

    ### Missing Test Specification

    This requirement has no corresponding test specification in the test
    documentation. Without a test, there is no way to verify that the
    system satisfies this requirement before release.

    ### Recommended Actions

    1. **Create Test Specification**:
       Add a test case to the test plan that explicitly references
       {requirement_id} and verifies each acceptance criterion.

    2. **Choose Appropriate Test Level**:
       - For business rules: integration or acceptance tests
       - For user-facing features: e2e or acceptance tests
       - For data validation: unit tests with boundary cases
       - For non-functional requirements: performance/load tests

    3. **Add Explicit Traceability**:
       Include requirement ID ({requirement_id}) in the test case
       metadata so the mapping is unambiguous and auditable.

    4. **Define Expected Results**:
       Each test case should specify:
       - Preconditions and test data setup
       - Steps to execute
       - Expected outcome for each acceptance criterion
       - Pass/fail criteria

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "FRD Section 3.1 - Order Processing"
      text: |
        "FR-005: The system shall require manager approval for all orders
        exceeding $10,000. Acceptance criteria: (1) Orders at or below
        $10,000 proceed automatically, (2) Orders above $10,000 enter
        'pending approval' state, (3) Manager receives email notification,
        (4) Manager can approve or reject from dashboard."
      mapping: |
        requirement_id: "FR-005"
        requirement_source: "FRD Section 3.1"
        test_spec_exists: true
        test_reference: "Test Plan Section 6.2, TC-031 through TC-034"
        test_type: "acceptance"
        coverage_status: "covered"
        confidence: "high"
        note: "Each acceptance criterion has a dedicated test case with
               explicit FR-005 reference. TC-031 tests threshold boundary
               ($10,000 exact), TC-032 tests above threshold, TC-033 tests
               email notification, TC-034 tests approve/reject flow."

  poorly_documented:
    - source: "FRD Section 5.3 - Reporting"
      text: |
        "US-022: As a finance manager, I want to export monthly revenue
        reports as CSV, so that I can import them into our accounting
        system. Acceptance criteria: (1) Report includes all transactions
        for the selected month, (2) CSV format matches accounting system
        import spec, (3) Export completes within 30 seconds for up to
        100,000 transactions."
      mapping: |
        requirement_id: "US-022"
        requirement_source: "FRD Section 5.3"
        test_spec_exists: false
        test_reference: null
        test_type: "none"
        coverage_status: "uncovered"
        confidence: "high"
        gap: "User story US-022 has three specific acceptance criteria but
              no test cases exist in the test plan. The CSV export feature,
              format compliance, and performance threshold (30s for 100K
              records) are all unverified."

  partial_coverage:
    - source: "FRD Section 2.4 - Authentication"
      text: |
        "FR-012: The system shall lock user accounts after 5 consecutive
        failed login attempts. Acceptance criteria: (1) Account locks after
        exactly 5 failures, (2) Locked account shows appropriate message,
        (3) Account auto-unlocks after 30 minutes, (4) Admin can manually
        unlock accounts."
      mapping: |
        requirement_id: "FR-012"
        requirement_source: "FRD Section 2.4"
        test_spec_exists: true
        test_reference: "Test Plan Section 4.1, TC-015"
        test_type: "integration"
        coverage_status: "partial"
        confidence: "medium"
        gap: "TC-015 tests account lockout after 5 failures (criterion 1)
              but does not test the 30-minute auto-unlock (criterion 3)
              or admin manual unlock (criterion 4). Two of four acceptance
              criteria are untested."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 3
  recommended_after:
    - "horizontal-traceability"
  author: "doc-lint v0.2"
  related_concerns:
    - "horizontal-traceability"       # requirements must first be traceable before testing can be verified
    - "error-path-coverage"           # error paths are a subset of testable requirements
    - "boundary-condition-coverage"   # boundary conditions are a subset of testable requirements
  references:
    - "IEEE 829 - Standard for Software Test Documentation"
    - "ISTQB Foundation Level: Test Design Techniques"
    - "Requirements Traceability Matrix (RTM) Best Practices"
    - "BDD: Specification by Example (Gojko Adzic)"

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
