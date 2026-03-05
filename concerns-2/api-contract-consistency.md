---
concern: api-contract-consistency
version: 1.0
name: API Contract Consistency
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "API Contract Consistency" (api-contract-consistency v1.0). Severity level: error. Validates alignment between design documents (FRD, ADD) and API 
specifications (OpenAPI, AsyncAPI). The API spec is authoritative -
discrepancies indicate either stale documentation or implementation gaps. Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: API Contract Consistency
# =============================================================================
# This concern validates that claims made in design documents (FRD, ADD) are
# accurately reflected in API specifications (OpenAPI, AsyncAPI). The API spec
# is treated as the authoritative contract - the "binary truth" of what the
# system actually exposes.
#
# WHY THIS MATTERS:
# Design documents describe intent. API specs declare implementation reality.
# When these diverge, one of two things is true:
# 1. The spec is wrong (implementation doesn't match design)
# 2. The design is wrong (documentation is stale)
# Either way, it's a gap that causes integration failures, security issues,
# or broken client expectations.
#
# TYPICAL MANIFESTATIONS:
# - FRD describes "409 Conflict for duplicate requests" but API spec doesn't
#   define that status code
# - ADD claims idempotency but OpenAPI lacks X-Idempotency-Key header
# - FRD describes required field but API spec marks it optional
# - ADD describes auth flow but API spec has different security scheme
# =============================================================================

concern:
  id: "api-contract-consistency"
  version: "1.0"
  name: "API Contract Consistency"
  category: "core"
  severity: "error"
  
  description: |
    Validates alignment between design documents (FRD, ADD) and API 
    specifications (OpenAPI, AsyncAPI). The API spec is authoritative -
    discrepancies indicate either stale documentation or implementation gaps.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  # Load when API specs are present
  any_of:
    - external-api
    - rest-api
    - graphql
    - async-api
    - webhooks
    
  # Requires API spec to be provided
  document_requirements:
    required: [frd, add]
    contracts: [api_spec]  # At least one of: api_spec, async_spec

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Compare claims made in the FRD and ADD against the API specification.
    The API spec is the authoritative source of truth. Identify discrepancies
    where design documents claim something that the API spec contradicts or
    doesn't support.
    
    STEP 1: EXTRACT CLAIMS FROM DESIGN DOCS
    Scan FRD and ADD for claims about API behavior:
    
    a) Endpoints and Operations
       - What endpoints/operations are described?
       - What HTTP methods/verbs are specified?
       - What paths/routes are documented?
    
    b) Request/Response Contracts
       - What request fields are described as required vs optional?
       - What response fields are promised?
       - What data types are specified?
    
    c) Error Handling
       - What error codes are documented? (400, 401, 404, 409, 500, etc.)
       - What error conditions are described?
       - What error response formats are specified?
    
    d) Headers and Parameters
       - What headers are described? (especially idempotency, auth, correlation)
       - What query parameters are documented?
       - What are their constraints (required, format, validation)?
    
    e) Authentication/Authorization
       - What auth scheme is described? (API key, OAuth, JWT, etc.)
       - What scopes/permissions are mentioned?
       - What auth flows are documented?
    
    f) Idempotency and Reliability
       - Does FRD/ADD claim idempotency for operations?
       - Are retry behaviors described?
       - Are rate limits mentioned?
    
    STEP 2: VERIFY AGAINST API SPEC
    For each claim found, check if the API spec supports it:
    
    - If FRD says "returns 409 on duplicate" → verify 409 is in API spec responses
    - If ADD claims "idempotent via X-Idempotency-Key" → verify header exists in spec
    - If FRD says "email is required" → verify field is marked required in spec
    - If ADD describes "OAuth2 with scopes X,Y" → verify security scheme matches
    
    STEP 3: IDENTIFY DISCREPANCIES
    Flag as gaps:
    - Design claims something API spec doesn't support
    - API spec has something design docs don't mention (potential undocumented behavior)
    - Design and spec contradict each other
    - Design references endpoints that don't exist in spec

  checklist:
    - id: "endpoint-coverage"
      question: "Are all endpoints described in FRD/ADD present in the API spec?"
    - id: "error-codes"
      question: "Are all error codes mentioned in FRD/ADD defined in the API spec?"
    - id: "required-fields"
      question: "Do required/optional field designations match between docs and spec?"
    - id: "auth-scheme"
      question: "Does the auth scheme in ADD match the security definitions in API spec?"
    - id: "idempotency-headers"
      question: "If ADD claims idempotency, does the API spec define the idempotency mechanism?"
    - id: "response-contracts"
      question: "Do response schemas in API spec match what FRD promises to clients?"
    - id: "collection-boundedness"
      question: "For each collection/list endpoint, is there a documented bounded retrieval contract (pagination mode, max page size, stable ordering)?"

  evidence_required:
    - field: "claim_source"
      type: "string"
      description: "Where the claim was found (e.g., 'FRD Section 3.2')"
      required: true
      
    - field: "claim_type"
      type: "enum"
      values:
        - "endpoint"
        - "error-code"
        - "required-field"
        - "optional-field"
        - "header"
        - "auth-scheme"
        - "idempotency"
        - "rate-limit"
        - "response-format"
        - "other"
      required: true
      
    - field: "claim_content"
      type: "string"
      description: "What the design doc claims (e.g., 'POST /orders returns 409 on duplicate')"
      required: true
      
    - field: "api_spec_location"
      type: "string | null"
      description: "Where this should be in API spec (e.g., 'paths./orders.post.responses')"
      required: true
      
    - field: "api_spec_status"
      type: "enum"
      values:
        - "matches"           # Spec confirms the claim
        - "contradicts"       # Spec says something different
        - "missing"           # Spec doesn't define this at all
        - "partial"           # Spec partially supports the claim
        - "undocumented"      # Spec has it but design docs don't mention it
      required: true
      
    - field: "discrepancy_detail"
      type: "string | null"
      description: "If not 'matches', explain the discrepancy"
      required: false
      
    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      required: true

  failure_condition: |
    Report as ERROR when:
    
    1. api_spec_status is "contradicts" for any claim - design and spec disagree
    
    2. api_spec_status is "missing" for:
       - Error codes that FRD describes to users/clients
       - Idempotency mechanisms that ADD claims
       - Auth schemes that ADD specifies
       - Required fields that FRD promises
    
    3. FRD/ADD reference endpoints that don't exist in API spec
    
    4. Security scheme in ADD doesn't match API spec security definitions
    
    Report as WARNING when:
    
    1. api_spec_status is "partial" - spec partially supports claim
    
    2. api_spec_status is "undocumented" - spec has capabilities not in design docs
       (potential documentation gap or undocumented feature)
    
    3. Response schemas have fields in spec not mentioned in FRD
       (clients may receive unexpected data)

  recommendation_template: |
    ## Gap: Design/API Spec Mismatch - {claim_type}
    
    **Design Claim:** {claim_content}
    **Source:** {claim_source}
    **API Spec Location:** {api_spec_location}
    **Status:** {api_spec_status}
    
    ### Discrepancy
    {discrepancy_detail}
    
    ### Resolution Options
    
    1. **Update API Spec** (if design is correct):
       Add the missing definition to the API specification to match the
       documented behavior.
    
    2. **Update Design Docs** (if spec is correct):
       Revise FRD/ADD to accurately reflect what the API actually does.
    
    3. **Clarify Intent** (if ambiguous):
       Determine which is authoritative and align both documents.
    
    ### Why This Matters
    API specs are often used to generate client SDKs, documentation, and
    contract tests. Discrepancies cause:
    - Integration failures when clients expect documented behavior
    - Security gaps when auth schemes are inconsistent
    - Data integrity issues when field requirements don't match

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  match:
    - claim_source: "FRD Section 4.1"
      claim_content: "POST /orders requires 'customer_id' field"
      api_spec_location: "paths./orders.post.requestBody.schema.required"
      api_spec_status: "matches"
      note: "API spec lists customer_id in required array"
      
  contradiction:
    - claim_source: "ADD Section 3.2"
      claim_content: "Authentication via OAuth2 with 'orders:write' scope"
      api_spec_location: "components.securitySchemes"
      api_spec_status: "contradicts"
      discrepancy_detail: "API spec defines API key auth, not OAuth2"
      
  missing:
    - claim_source: "FRD Section 5.1"
      claim_content: "Returns 409 Conflict when order already exists"
      api_spec_location: "paths./orders.post.responses"
      api_spec_status: "missing"
      discrepancy_detail: "API spec only defines 200, 400, 401, 500 responses"
      
  idempotency_gap:
    - claim_source: "ADD Section 6.3"
      claim_content: "Idempotent via X-Idempotency-Key header"
      api_spec_location: "paths./payments.post.parameters"
      api_spec_status: "missing"
      discrepancy_detail: "No X-Idempotency-Key header defined in API spec"

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "Multi-Expert Consensus (Claude, Gemini, ChatGPT)"
  related_concerns:
    - "idempotency-boundaries"  # Idempotency claims should match spec
    - "resilience-triad"         # Retry/timeout claims should match spec
  references:
    - "OpenAPI Specification: https://spec.openapis.org/oas/latest.html"
    - "AsyncAPI Specification: https://www.asyncapi.com/docs/reference/specification/latest"

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
**Verdict**: CONDITIONAL PASS — 3 ERRORs (resolved), 5 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| E1: Idempotency header name contradiction | ERROR | **RESOLVED** — Standardized to `Idempotency-Key` |
| E2: Missing DELETE /workflows endpoint | ERROR | **RESOLVED** — Added to OpenAPI spec |
| E3: AuditExportStatus missing checksum | ERROR | **RESOLVED** — Added `checksumSha256` to OpenAPI + aligned ADD |
| W1: 429 not on HITL endpoints | WARN | Accepted (ADD STRIDE claim; not in FRD) |
| W2: Workflow instances missing filters | WARN | Accepted (enhancement for future sprint) |
| W3: ProblemDetails missing traceId | WARN | Accepted (alignment needed in future) |
| W4: No stable ordering on paginated endpoints | WARN | Accepted (cursor-based pagination is stable by implementation) |
| W5: Rate limiting incomplete | WARN | Accepted (Phase 1 single-region) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
