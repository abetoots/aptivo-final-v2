---
concern: horizontal-traceability
version: 1.0
name: Horizontal Traceability
type: concern
project: aptivo-final-v2
generated: 2026-03-04T08:56:50.894Z
---

## System Message

You are a documentation validator evaluating the concern: "Horizontal Traceability" (horizontal-traceability v1.0). [Tier 3 — Structural] This is a structural concern. You may assume tier 1 (foundational) and tier 2 (behavioral) concerns are established. Evaluate structural coherence across the documentation. Severity level: warn. Validates that every business requirement in the BRD can be traced
forward through a corresponding FRD feature and into an ADD component
that implements it. Conversely, every ADD component should trace back
to a business justification. This creates a complete traceability
matrix: BRD -> FRD -> ADD, with no orphans in any direction. Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Horizontal Traceability
# =============================================================================
# This concern validates that technical components in architecture documents
# (ADD/TSD) can be traced back to business requirements (BRD), and that
# functional features (FRD) link to both business goals and technical
# implementations. Every requirement should flow from BRD -> FRD -> ADD
# without orphans in any direction.
#
# WHY THIS MATTERS:
# Without traceability, teams build features nobody asked for, miss
# requirements that were explicitly promised to stakeholders, and cannot
# answer "why does this component exist?" during architecture reviews.
# Orphaned components waste engineering effort; orphaned requirements
# mean broken promises to the business.
#
# TYPICAL MANIFESTATION:
# - ADD describes a "Notification Microservice" but no BRD requirement
#   mentions notifications
# - BRD requires "real-time fraud detection" but FRD has no feature for it
# - FRD specifies "bulk export" feature but ADD has no component to deliver it
# =============================================================================

concern:
  id: "horizontal-traceability"
  version: "1.0"
  name: "Horizontal Traceability"
  category: "core"
  severity: "warn"

  description: |
    Validates that every business requirement in the BRD can be traced
    forward through a corresponding FRD feature and into an ADD component
    that implements it. Conversely, every ADD component should trace back
    to a business justification. This creates a complete traceability
    matrix: BRD -> FRD -> ADD, with no orphans in any direction.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - requirements-tracing
    - compliance
    - audit
    - enterprise

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Build a horizontal traceability matrix across BRD, FRD, and ADD documents,
    then identify orphans and gaps in each direction.

    STEP 1: EXTRACT BRD REQUIREMENTS AND GOALS
    Scan the BRD for all stated business requirements, goals, and objectives:
    - Explicit requirements (numbered, labeled, or stated as "shall/must")
    - Business goals and success criteria
    - User needs and stakeholder expectations
    - Compliance or regulatory requirements
    - Non-functional requirements (performance, availability, security)

    For each requirement, capture:
    - A unique identifier (explicit ID if present, or synthesized: "BRD-001")
    - The requirement text or summary
    - The section/location where it appears

    STEP 2: EXTRACT FRD FEATURES
    Scan the FRD for all functional features, user stories, or capabilities:
    - Feature descriptions and acceptance criteria
    - User stories or use cases
    - Functional specifications
    - Interface requirements
    - Data requirements

    For each feature, capture:
    - A unique identifier (explicit ID if present, or synthesized: "FRD-001")
    - The feature text or summary
    - Any explicit references to BRD requirements
    - The section/location where it appears

    STEP 3: EXTRACT ADD COMPONENTS
    Scan the ADD for all technical components, services, and modules:
    - Microservices, APIs, and endpoints
    - Data stores and schemas
    - Background workers and scheduled jobs
    - Infrastructure components
    - Integration points and adapters

    For each component, capture:
    - The component name
    - Its purpose and responsibility
    - Any explicit references to FRD features or BRD requirements
    - The section/location where it appears

    STEP 4: BUILD TRACEABILITY MATRIX
    Map the relationships across documents:
    - For each BRD requirement, find the FRD feature(s) that address it
    - For each FRD feature, find the ADD component(s) that implement it
    - For each ADD component, trace back to its FRD feature and BRD requirement
    - Note: multiple FRD features may map to one BRD requirement, and
      multiple ADD components may support one FRD feature

    STEP 5: FLAG ORPHANS IN EACH DIRECTION
    Identify gaps in traceability:

    a) Forward orphans (BRD -> FRD):
       BRD requirements with no corresponding FRD feature.
       These are business promises with no functional specification.

    b) Forward orphans (FRD -> ADD):
       FRD features with no corresponding ADD component.
       These are specified features with no technical plan to deliver them.

    c) Backward orphans (ADD -> FRD/BRD):
       ADD components with no corresponding FRD feature or BRD requirement.
       These are "ghost components" with no business justification.

    d) Backward orphans (FRD -> BRD):
       FRD features with no corresponding BRD requirement.
       These are scope creep - features nobody asked for.

  checklist:
    - id: "brd-to-frd-coverage"
      question: "Does every BRD requirement have at least one corresponding FRD feature?"
    - id: "frd-to-add-coverage"
      question: "Does every FRD feature have at least one corresponding ADD component?"
    - id: "add-to-brd-justification"
      question: "Does every ADD component trace back to a BRD requirement?"
    - id: "no-scope-creep"
      question: "Are there FRD features that have no corresponding BRD requirement (scope creep)?"
    - id: "explicit-references"
      question: "Do documents use explicit cross-references (IDs, section numbers) rather than implicit mapping?"

  evidence_required:
    - field: "requirement_id"
      type: "string"
      description: "Unique identifier for the traced item (e.g., 'BRD-001', 'FRD-Feature-Login', 'ADD-PaymentService')"
      required: true

    - field: "requirement_source"
      type: "string"
      description: "Which document and section the item originates from (e.g., 'BRD Section 2.1')"
      required: true

    - field: "mapped_to_frd"
      type: "boolean"
      description: "Whether this BRD requirement has a corresponding FRD feature"
      required: true

    - field: "mapped_to_add"
      type: "boolean"
      description: "Whether this requirement/feature has a corresponding ADD component"
      required: true

    - field: "frd_reference"
      type: "string | null"
      description: "The FRD feature or section that addresses this requirement (e.g., 'FRD Section 4.2 - User Authentication')"
      required: true

    - field: "add_reference"
      type: "string | null"
      description: "The ADD component or section that implements this feature (e.g., 'ADD Section 5.1 - AuthService')"
      required: true

    - field: "source_location"
      type: "string"
      description: "Exact location where the traced item is defined (e.g., 'BRD Section 3.1, Requirement R-005')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Confidence that the traceability mapping is accurate (low if mapping is inferred rather than explicit)"
      required: true

  failure_condition: |
    Report as ERROR when:

    1. A BRD business requirement has no corresponding FRD feature
       (mapped_to_frd is FALSE) - a business promise has no functional
       specification and will likely be missed during implementation.

    2. Multiple BRD requirements reference critical business objectives
       (revenue, compliance, security) and have no FRD or ADD mapping.

    3. An explicit traceability link is broken - a document references
       a requirement ID that does not exist in the source document.

    Report as WARNING when:

    1. An FRD feature has no corresponding ADD component
       (mapped_to_add is FALSE) - a specified feature has no technical
       plan to deliver it.

    2. An ADD component has no corresponding BRD requirement
       (backward orphan) - a technical component exists without
       business justification (potential scope creep or gold-plating).

    3. An FRD feature has no corresponding BRD requirement
       (scope creep) - a feature was specified that nobody asked for.

    4. Traceability is inferred rather than explicit (confidence is "low")
       - documents don't use cross-references, so mapping is guesswork.

  recommendation_template: |
    ## Gap: Traceability Break - {requirement_id}

    **Source:** {requirement_source}
    **Location:** {source_location}
    **Mapped to FRD:** {mapped_to_frd}
    **Mapped to ADD:** {mapped_to_add}
    **FRD Reference:** {frd_reference}
    **ADD Reference:** {add_reference}

    ### Traceability Gap

    This item cannot be fully traced across BRD -> FRD -> ADD.

    ### Resolution Options

    1. **Add Missing Coverage** (if requirement is valid):
       Create the corresponding FRD feature or ADD component to
       ensure this requirement has full coverage from business
       intent to technical implementation.

    2. **Add Explicit Cross-References**:
       Update documents to use explicit requirement IDs and
       section references so traceability is unambiguous.

    3. **Remove Orphaned Item** (if no longer needed):
       If an ADD component or FRD feature has no business
       justification, consider whether it should be removed
       to reduce scope and maintenance burden.

    ### Why This Matters
    Traceability gaps mean either business requirements go unmet
    (broken promises to stakeholders) or engineering effort is
    wasted on unjustified components (scope creep). During audits
    and compliance reviews, gaps are flagged as control failures.

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "BRD Section 2.1"
      text: |
        "REQ-001: The system shall support real-time fraud detection on all
        payment transactions, flagging suspicious activity within 500ms."
      mapping: |
        requirement_id: "REQ-001"
        requirement_source: "BRD Section 2.1"
        mapped_to_frd: true
        frd_reference: "FRD Section 4.3 - Fraud Detection Feature (references REQ-001)"
        mapped_to_add: true
        add_reference: "ADD Section 5.4 - FraudDetectionService (references FRD-4.3)"
        confidence: "high"
        note: "Full traceability chain with explicit cross-references"

  orphan_brd_requirement:
    - source: "BRD Section 3.2"
      text: |
        "REQ-012: The system shall provide multi-language support for
        all customer-facing interfaces (English, Spanish, French)."
      mapping: |
        requirement_id: "REQ-012"
        requirement_source: "BRD Section 3.2"
        mapped_to_frd: false
        frd_reference: null
        mapped_to_add: false
        add_reference: null
        confidence: "high"
        gap: "BRD requires multi-language support but FRD has no
              internationalization feature and ADD has no i18n component.
              This business requirement will be missed."

  orphan_add_component:
    - source: "ADD Section 6.2"
      text: |
        "The AnalyticsPipeline service collects user behavior data,
        processes it through Apache Kafka, and stores aggregations
        in a time-series database for dashboard consumption."
      mapping: |
        requirement_id: "ADD-AnalyticsPipeline"
        requirement_source: "ADD Section 6.2"
        mapped_to_frd: false
        frd_reference: null
        mapped_to_add: true
        add_reference: "ADD Section 6.2 - AnalyticsPipeline"
        confidence: "high"
        gap: "ADD describes an analytics pipeline but neither BRD nor FRD
              mentions analytics, dashboards, or user behavior tracking.
              This component has no business justification."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 3
  recommended_after:
    - "feasibility-check"
  author: "doc-lint v0.2"
  related_concerns:
    - "api-contract-consistency"    # API specs should also trace to requirements
    - "sla-architecture-alignment"  # SLA promises are a form of BRD requirement
    - "feasibility-check"           # requirements must be feasible before tracing
  references:
    - "IEEE 830 - Software Requirements Specification"
    - "CMMI - Requirements Traceability Practice"
    - "ISO 25010 - Systems and software quality requirements"
    - "TOGAF - Architecture Requirements Management"

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
