---
concern: auth-boundary-consistency
version: 1.0
name: Auth Boundary Consistency
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Auth Boundary Consistency" (auth-boundary-consistency v1.0). Severity level: error. Authentication and authorization requirements defined in the FRD must be
consistently enforced in the ADD's technical design. This concern checks
that every access control rule described in business requirements has a
corresponding implementation mechanism in the architecture, and that no
endpoints or resources exist in the ADD without matching auth requirements
from the FRD. Gaps between stated auth policy and designed enforcement
represent broken access control - the #1 vulnerability in the OWASP Top 10. Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Auth Boundary Consistency
# =============================================================================
# This concern validates that authentication and authorization requirements
# described in the FRD (who can access what) are consistently reflected in
# the ADD's implementation design (middleware placement, token validation,
# scope checking, tenant isolation).
#
# WHY THIS MATTERS:
# Auth requirements are often described in business terms ("only admins can
# delete users") but the technical implementation must enforce those rules at
# every relevant boundary. When FRD auth rules don't match ADD implementation,
# one of two things is true: (1) the system has unprotected endpoints that
# should require auth, or (2) the documentation is inconsistent and the team
# cannot verify correctness. Either way, it's a security gap that attackers
# exploit through privilege escalation, broken access control, and tenant
# data leakage.
#
# TYPICAL MANIFESTATION:
# - FRD says "admin-only endpoint" but ADD has no middleware/guard for it
# - FRD defines 4 roles but ADD only implements checks for 2 of them
# - Multi-tenant FRD but ADD has no tenant isolation in data access layer
# - ADD describes JWT validation but FRD requires scope-based access that
#   isn't reflected in token claims or middleware
# - API endpoint exists in ADD but has no auth requirement in either document
# =============================================================================

concern:
  id: "auth-boundary-consistency"
  version: "1.0"
  name: "Auth Boundary Consistency"
  category: "security"
  severity: "error"

  description: |
    Authentication and authorization requirements defined in the FRD must be
    consistently enforced in the ADD's technical design. This concern checks
    that every access control rule described in business requirements has a
    corresponding implementation mechanism in the architecture, and that no
    endpoints or resources exist in the ADD without matching auth requirements
    from the FRD. Gaps between stated auth policy and designed enforcement
    represent broken access control - the #1 vulnerability in the OWASP Top 10.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - authentication
    - authorization
    - multi-tenant
    - rbac

  escalate_if:
    - multi-tenant       # tenant isolation gaps cause cross-tenant data leakage
    - payments           # financial endpoints require strict access control
    - pii                # PII access without proper auth is a regulatory violation

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Compare authentication and authorization requirements from the FRD against
    the implementation design in the ADD. Identify any gaps where auth rules
    are not enforced, partially enforced, or inconsistently designed.

    STEP 1: EXTRACT AUTH REQUIREMENTS FROM FRD
    Scan the FRD for all access control requirements:

    a) Roles and Permissions
       - What roles are defined? (e.g., admin, manager, user, guest, service)
       - What permissions does each role have?
       - Are there hierarchical roles (admin inherits manager permissions)?
       - Look for: role, permission, access, authorize, privilege, RBAC, ACL

    b) Resource Access Rules
       - Which resources require authentication to access?
       - Which resources are public (no auth required)?
       - Are there resource-level permissions (user can edit own profile only)?
       - Look for: access control, protected, restricted, public, owner-only

    c) Multi-Tenancy Requirements
       - Is the system multi-tenant?
       - How should tenant data be isolated?
       - Can users access data across tenants?
       - Look for: tenant, organization, workspace, isolation, scoping

    d) Authentication Requirements
       - What authentication methods are supported? (password, OAuth, SSO, API key)
       - Are there MFA requirements for sensitive operations?
       - What session management rules exist? (timeout, concurrent sessions)
       - Look for: login, authentication, MFA, session, token, credential

    STEP 2: EXTRACT AUTH IMPLEMENTATION FROM ADD
    Scan the ADD for the technical auth design:

    a) Authentication Mechanisms
       - What auth middleware/guards are described?
       - How are tokens validated? (JWT verification, session lookup, API key check)
       - Where in the request pipeline does auth happen?
       - Look for: middleware, guard, interceptor, filter, JWT, token, session

    b) Authorization Enforcement
       - How are role checks implemented? (decorator, middleware, policy engine)
       - Where are permission checks performed? (API gateway, service layer, DB query)
       - Are there scope-based access controls on tokens?
       - Look for: authorize, permission check, role guard, policy, scope, claim

    c) Tenant Isolation Mechanisms
       - How is tenant scoping implemented? (row-level security, schema per tenant,
         DB per tenant, query filter)
       - Where is the tenant context extracted and propagated?
       - Are there global queries that bypass tenant scoping?
       - Look for: tenant filter, row-level security, schema, tenant context

    d) Endpoint Protection Map
       - Which endpoints have auth middleware applied?
       - Are there catch-all defaults (all endpoints require auth unless excluded)?
       - Are there explicitly unprotected/public endpoints?
       - Look for: route guard, protected route, public route, auth required

    STEP 3: COMPARE FRD REQUIREMENTS TO ADD IMPLEMENTATION
    For each auth requirement from FRD, verify ADD has a matching mechanism:

    a) Role-to-Enforcement Mapping
       - For each role defined in FRD, is there a corresponding check in ADD?
       - If FRD defines 4 roles, does ADD implement checks for all 4?
       - Are role checks at the right granularity (endpoint, resource, field)?

    b) Resource Protection Coverage
       - For each protected resource in FRD, does ADD show auth middleware?
       - Are there endpoints in ADD that handle protected resources but
         lack auth configuration?

    c) Tenant Isolation Verification
       - If FRD requires tenant isolation, does ADD implement it at data access layer?
       - Are there queries or operations that could leak data across tenants?
       - Is tenant context propagated through async operations (background jobs,
         event handlers)?

    STEP 4: CHECK FOR GAPS AND INCONSISTENCIES
    Identify the following gap types:

    a) Missing Implementation
       - FRD requires auth but ADD has no corresponding mechanism
       - FRD defines a role but ADD never checks for it

    b) Missing Requirement
       - ADD implements auth on an endpoint but FRD doesn't define who can access it
       - ADD has role checks for roles not defined in FRD

    c) Inconsistent Rules
       - FRD says "admin only" but ADD implements "admin or manager"
       - FRD requires MFA for sensitive ops but ADD doesn't reference MFA

    d) Unprotected Endpoints
       - Endpoints in ADD that handle sensitive data but have no auth in either doc
       - Background jobs or async handlers that access protected resources
         without auth context propagation

  checklist:
    - id: "roles-coverage"
      question: "Does the ADD implement enforcement for every role defined in the FRD?"
    - id: "endpoint-protection"
      question: "Does every endpoint that handles protected resources have auth middleware in the ADD?"
    - id: "tenant-isolation"
      question: "If the FRD requires multi-tenancy, does the ADD implement tenant isolation at the data access layer?"
    - id: "permission-granularity"
      question: "Do ADD permission checks match FRD access rules at the correct granularity (endpoint, resource, field)?"
    - id: "auth-default"
      question: "Does the ADD define a secure default (all endpoints require auth unless explicitly public)?"
    - id: "async-auth-propagation"
      question: "Is auth context propagated through async operations (background jobs, event handlers)?"

  evidence_required:
    - field: "auth_requirement"
      type: "string"
      description: "The auth rule from FRD (e.g., 'Only admin users can delete other users', 'Tenant data must be isolated')"
      required: true

    - field: "requirement_source"
      type: "string"
      description: "Where the requirement is documented (e.g., 'FRD Section 2.3, Access Control Matrix')"
      required: true

    - field: "protected_resource"
      type: "string"
      description: "The resource or endpoint this requirement protects (e.g., 'DELETE /api/users/:id', 'User PII data store')"
      required: true

    - field: "required_roles"
      type: "string"
      description: "Roles that FRD says should have access (e.g., 'admin', 'admin, manager', 'resource-owner')"
      required: true

    - field: "implementation_mechanism"
      type: "string | null"
      description: "How the ADD enforces this rule (e.g., 'AdminGuard middleware on route', 'Row-level security policy on users table', 'JWT scope check in service layer'). Null if no implementation found."
      required: true

    - field: "implementation_source"
      type: "string | null"
      description: "Where the implementation is documented in ADD (e.g., 'ADD Section 5.1, Middleware Stack'). Null if no implementation found."
      required: true

    - field: "consistency_status"
      type: "enum"
      values:
        - "consistent"              # FRD requirement matches ADD implementation
        - "inconsistent"            # FRD and ADD disagree on the auth rules
        - "missing-implementation"  # FRD has requirement but ADD has no enforcement
        - "missing-requirement"     # ADD has enforcement but FRD doesn't define the rule
      description: "Whether the FRD requirement and ADD implementation are aligned"
      required: true

    - field: "gap_detail"
      type: "string | null"
      description: "If not consistent, describe the specific gap (e.g., 'FRD requires admin-only but ADD has no role check on this endpoint'). Null if consistent."
      required: false

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate based on available documentation"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. consistency_status is "missing-implementation" - FRD requires auth but
       ADD has no corresponding enforcement mechanism. This means the requirement
       will likely not be implemented, leaving the resource unprotected.

    2. consistency_status is "inconsistent" and the ADD is LESS restrictive
       than the FRD - FRD says "admin only" but ADD allows broader access.
       The implementation would grant more access than the business requires.

    3. A multi-tenant system has no documented tenant isolation mechanism in
       the ADD - tenant data leakage is the most severe form of broken access
       control in SaaS systems.

    4. An endpoint that handles PII or payment data has no auth mechanism
       in either FRD or ADD - sensitive data accessible without authentication.

    5. The ADD has no secure default for auth - endpoints are unprotected
       unless explicitly guarded, creating risk of accidentally public endpoints.

    Report as WARNING when:

    1. consistency_status is "missing-requirement" - ADD implements auth but
       FRD doesn't define the rule. The enforcement exists but the requirement
       is undocumented, making it hard to verify correctness.

    2. consistency_status is "inconsistent" and the ADD is MORE restrictive
       than the FRD - not a security risk but indicates documentation drift.

    3. Auth context propagation through async operations is not documented -
       background jobs or event handlers might bypass auth checks.

    4. Role hierarchy is defined in FRD but ADD doesn't document how
       inheritance is implemented.

    5. MFA is mentioned in FRD but ADD doesn't specify how MFA is enforced
       at the technical level.

  recommendation_template: |
    ## Gap: Auth Boundary Mismatch - {protected_resource}

    **Requirement:** {auth_requirement}
    **Source:** {requirement_source}
    **Required Roles:** {required_roles}
    **Implementation:** {implementation_mechanism}
    **Status:** {consistency_status}

    ### Gap Detail
    {gap_detail}

    ### Required Documentation

    1. **Add Auth Enforcement to ADD**
       Document the specific middleware, guard, or policy that enforces
       this auth requirement:
       - Where in the request pipeline is the check performed?
       - What mechanism is used? (JWT claim, role guard, policy engine)
       - What happens on auth failure? (401, 403, redirect)
       - Example: "AdminGuard middleware applied to DELETE /api/users/:id.
         Extracts 'role' claim from JWT. Returns 403 if role !== 'admin'."

    2. **Verify Completeness**
       Ensure all endpoints for this resource have consistent auth:
       - CRUD operations should have appropriate role checks
       - List/search endpoints should filter by tenant/ownership
       - Bulk operations should enforce the same rules as single operations

    3. **Test Strategy**
       Document how this auth boundary will be verified:
       - Unit tests for middleware/guard logic
       - Integration tests for endpoint access with different roles
       - Negative tests for unauthorized access attempts

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "FRD Section 2.3 + ADD Section 5.1"
      text: |
        "FRD: 'Only users with the admin role can delete other user accounts.
        Managers can view and edit user profiles but cannot delete accounts.
        Users can only view and edit their own profile.'

        ADD: 'User Management API auth middleware stack:
        - DELETE /api/users/:id → AdminGuard (requires role=admin in JWT)
        - PUT /api/users/:id → ManagerOrOwnerGuard (requires role=admin|manager
          OR userId matches JWT sub claim)
        - GET /api/users/:id → OwnerOrManagerGuard (same as PUT)
        - GET /api/users → AdminOrManagerGuard (requires role=admin|manager)
        All guards extract role from JWT claims validated by AuthMiddleware.
        Unauthorized requests receive 403 Forbidden with error code AUTH_INSUFFICIENT_ROLE.'"
      assessment: |
        auth_requirement: "Role-based access to user management"
        protected_resource: "User Management API (/api/users)"
        required_roles: "admin (full), manager (view/edit), user (own profile)"
        implementation_mechanism: "AdminGuard, ManagerOrOwnerGuard, OwnerOrManagerGuard middleware"
        consistency_status: "consistent"
        confidence: "high"

  poorly_documented:
    - source: "FRD Section 3.1 + ADD Section 4.2"
      text: |
        "FRD: 'The system supports four roles: admin, manager, analyst, and viewer.
        Admins have full access. Managers can manage their team's resources.
        Analysts can view and export reports. Viewers can only view dashboards.'

        ADD: 'Authentication is handled by JWT tokens. The API gateway validates
        tokens before forwarding requests to backend services.'"
      assessment: |
        auth_requirement: "Four-role RBAC with different access levels"
        protected_resource: "All API endpoints"
        required_roles: "admin, manager, analyst, viewer"
        implementation_mechanism: null
        consistency_status: "missing-implementation"
        gap_detail: "FRD defines 4 roles with distinct permissions but ADD only describes
                     JWT token validation at the gateway level. No role-based guards,
                     no permission checks on individual endpoints, no mapping of roles
                     to allowed operations. The gateway validates token authenticity but
                     does not enforce authorization rules."
        confidence: "high"

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "doc-lint v0.2"
  related_concerns:
    - "threat-model-coverage"      # auth endpoints are attack surfaces requiring threat models
    - "api-contract-consistency"   # auth schemes in ADD should match API spec security definitions
    - "input-validation"           # auth tokens and credentials are inputs that need validation
  references:
    - "OWASP Top 10 A01:2021 - Broken Access Control: https://owasp.org/Top10/A01_2021-Broken_Access_Control/"
    - "NIST SP 800-162: Guide to Attribute Based Access Control"
    - "OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html"
    - "CWE-862: Missing Authorization"

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

**Evaluated**: 2026-03-01 (Session 1: Security Deep-Dive)
**Review**: `SECURITY_DEEP_DIVE_MULTI_REVIEW.md`
**Verdict**: CONDITIONAL PASS — 0 ERRORs, 5 WARNINGs (W1-W5)

| Finding | Severity | Status |
|---------|----------|--------|
| W1: Access control matrix missing | WARN | **RESOLVED** — ADD §8.3.1 added |
| W2: MFA enforcement not designed | WARN | Accepted (Supabase MFA path exists) |
| W3: Session controls deferred to Supabase | WARN | Accepted (document Supabase config) |
| W4: JWT token lifetimes undocumented | WARN | Accepted (Supabase defaults) |
| W5: Session revocation lacks app-level API | WARN | Accepted (Phase 1 via Supabase dashboard) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
