---
concern: auth-scheme-compliance
version: 1.0
name: Auth Scheme Compliance
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Auth Scheme Compliance" (auth-scheme-compliance v1.0). Severity level: error. Validates that authentication and authorization implementations described
in architecture and design documents (ADD) faithfully follow the
authentication standards declared in requirements documents (FRD/BRD).
Each auth standard (OAuth2, SAML, JWT, API keys, mTLS) has specific
protocol-mandated elements that must be present for the implementation
to be considered compliant. A partial or contradictory implementation
creates security gaps that the declared standard was designed to prevent. Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Auth Scheme Compliance
# =============================================================================
# This concern validates that authentication implementations described in
# architecture documents (ADD) actually follow the authentication standards
# declared in requirements documents (FRD/BRD). Auth standards are not
# interchangeable - each has specific protocol requirements, security
# properties, and integration patterns that must be respected.
#
# WHY THIS MATTERS:
# When a project declares "we use OAuth2" but the architecture implements
# basic auth with API keys, the security model is fundamentally different.
# OAuth2 provides delegated authorization, token expiration, scope-based
# access, and revocation. Basic auth provides none of these. Mismatches
# between declared and implemented auth schemes create false confidence
# in the security posture, fail compliance audits, and expose systems to
# attacks the declared standard was supposed to prevent.
#
# TYPICAL MANIFESTATIONS:
# - FRD declares OAuth2 but ADD implements static API keys without rotation
# - BRD requires SAML SSO but ADD describes custom session-based auth with
#   no IdP federation
# - FRD specifies JWT with RS256 but ADD uses HS256 with a shared secret
# - ADD claims PKCE support but no code_verifier/code_challenge flow is
#   documented in the auth sequence
# - FRD requires MFA but ADD only describes single-factor password auth
# =============================================================================

concern:
  id: "auth-scheme-compliance"
  version: "1.0"
  name: "Auth Scheme Compliance"
  category: "compliance"
  severity: "error"

  description: |
    Validates that authentication and authorization implementations described
    in architecture and design documents (ADD) faithfully follow the
    authentication standards declared in requirements documents (FRD/BRD).
    Each auth standard (OAuth2, SAML, JWT, API keys, mTLS) has specific
    protocol-mandated elements that must be present for the implementation
    to be considered compliant. A partial or contradictory implementation
    creates security gaps that the declared standard was designed to prevent.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - authentication
    - oauth
    - saml
    - sso
    - jwt

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Compare the authentication standard declared in requirements documents
    (FRD/BRD) against the authentication implementation described in the
    architecture document (ADD). Verify that the implementation faithfully
    follows the declared standard, including all protocol-required elements.

    STEP 1: EXTRACT AUTH STANDARD DECLARATIONS FROM FRD/BRD
    Scan the FRD and BRD for all statements about authentication and
    authorization standards:

    a) Declared Standards
       - What authentication standard is named? (OAuth2, SAML 2.0, OpenID
         Connect, JWT, API keys, mTLS, Kerberos, LDAP, basic auth, etc.)
       - Is a specific version or profile specified? (OAuth2 Authorization
         Code, OAuth2 Client Credentials, SAML Web SSO Profile, etc.)
       - Are multiple auth methods described for different contexts?
         (user auth vs. service-to-service auth vs. admin auth)

    b) Auth Requirements
       - Are specific auth flows documented? (authorization code + PKCE,
         implicit, client credentials, device code)
       - Is MFA/2FA mentioned as a requirement?
       - Are session requirements described? (timeout, renewal, concurrent
         session limits)
       - Are scope or permission models defined?

    c) Security Constraints
       - Token lifetime or session duration requirements
       - Key rotation or credential rotation requirements
       - Revocation requirements (ability to revoke tokens/sessions)
       - Algorithm constraints (RS256, ES256, etc.)

    For each declaration, capture the exact text, section, and document.

    STEP 2: EXTRACT AUTH IMPLEMENTATION FROM ADD
    Scan the ADD for all descriptions of how authentication is implemented:

    a) Implementation Mechanism
       - What auth mechanism is described in the architecture?
       - What components handle authentication? (auth service, gateway,
         identity provider, token service)
       - What protocols or libraries are referenced?

    b) Auth Flow Details
       - What is the documented auth flow? (login sequence, token exchange,
         session creation)
       - What tokens or credentials are issued? (JWT, session cookie, API key)
       - How are tokens validated? (signature verification, introspection
         endpoint, local validation)
       - Where are credentials stored? (database, vault, config file)

    c) Integration Points
       - Is an external Identity Provider (IdP) documented?
       - Is a token endpoint described?
       - Are redirect URIs configured?
       - Is token refresh documented?

    For each implementation detail, capture the exact text and section.

    STEP 3: VERIFY IMPLEMENTATION MATCHES DECLARED STANDARD
    For each declared standard, check that the implementation satisfies
    the standard's mandatory requirements:

    OAuth2 requires:
    - Authorization server with token endpoint
    - Grant type specification (authorization_code, client_credentials, etc.)
    - Token issuance and validation flow
    - Scope definitions
    - Token expiration and refresh mechanism
    - PKCE for public clients (RFC 7636)

    SAML 2.0 requires:
    - Identity Provider (IdP) configuration
    - Service Provider (SP) metadata
    - Assertion Consumer Service (ACS) URL
    - Signed assertions (certificate/key management)
    - NameID format and attribute mapping

    JWT requires:
    - Signing algorithm specification (RS256, HS256, ES256)
    - Key management (public/private key pair or shared secret)
    - Claims structure (iss, sub, aud, exp, iat, etc.)
    - Token validation logic
    - Key rotation strategy

    API Key requires:
    - Key generation mechanism
    - Key storage and transmission method (header, query param)
    - Key rotation policy
    - Key revocation capability

    STEP 4: CHECK FOR STANDARD-REQUIRED ELEMENTS
    Flag any protocol-mandated elements that are missing from the
    implementation documentation:

    - Token refresh flow (OAuth2/JWT): Is there a documented mechanism to
      obtain new tokens without re-authentication?
    - PKCE (OAuth2 public clients): Are code_verifier and code_challenge
      documented in the authorization flow?
    - Nonce validation (OpenID Connect): Is nonce generation and validation
      documented to prevent replay attacks?
    - Assertion signing (SAML): Is the certificate chain and signature
      validation process documented?
    - Key rotation (JWT/API keys): Is there a documented process for
      rotating signing keys or API keys without downtime?
    - Token revocation (OAuth2/JWT): Can issued tokens be invalidated
      before expiration?

  checklist:
    - id: "standard-declared"
      question: "Is a specific authentication standard explicitly named in FRD/BRD?"
    - id: "implementation-matches"
      question: "Does the ADD implementation mechanism match the declared standard?"
    - id: "protocol-elements"
      question: "Are all protocol-required elements present in the implementation?"
    - id: "token-lifecycle"
      question: "Is the complete token lifecycle documented (issuance, validation, refresh, revocation)?"
    - id: "key-management"
      question: "Is key or credential management documented (storage, rotation, revocation)?"
    - id: "mfa-compliance"
      question: "If MFA is required by FRD/BRD, is it reflected in the ADD auth flow?"

  evidence_required:
    - field: "declared_standard"
      type: "string"
      description: "The auth standard declared in FRD/BRD (e.g., 'OAuth2 Authorization Code with PKCE', 'SAML 2.0 Web SSO', 'JWT with RS256')"
      required: true

    - field: "declaration_source"
      type: "string"
      description: "Where the auth standard is declared (e.g., 'FRD Section 3.1 - Authentication Requirements')"
      required: true

    - field: "implementation_mechanism"
      type: "string"
      description: "The auth mechanism actually described in the ADD (e.g., 'API key passed in X-API-Key header', 'JWT signed with HS256 shared secret')"
      required: true

    - field: "implementation_source"
      type: "string"
      description: "Where the implementation is described (e.g., 'ADD Section 4.2 - Auth Service Architecture')"
      required: true

    - field: "compliance_status"
      type: "enum"
      values:
        - "compliant"       # implementation faithfully follows the declared standard
        - "non-compliant"   # implementation contradicts or uses a different standard
        - "partial"         # implementation follows the standard but is missing required elements
        - "undeclared"      # ADD describes auth but FRD/BRD never declared a standard
      description: "Whether the implementation matches the declared standard"
      required: true

    - field: "missing_elements"
      type: "string | null"
      description: "Protocol-required elements missing from the implementation (e.g., 'No PKCE flow documented', 'No token refresh mechanism', 'No IdP metadata exchange')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Confidence in the compliance assessment (low if documents are vague about auth details)"
      required: true

  failure_condition: |
    Report as ERROR when:

    1. compliance_status is "non-compliant" - the implementation contradicts
       the declared standard (e.g., FRD says OAuth2 but ADD implements basic
       auth). This is a fundamental security architecture mismatch.

    2. Standard-required elements are missing and their absence creates a
       security vulnerability:
       - OAuth2 without token refresh (forces long-lived tokens or frequent
         re-authentication)
       - OAuth2 public client without PKCE (vulnerable to authorization
         code interception)
       - SAML without assertion signing (vulnerable to assertion forgery)
       - JWT without key rotation (compromised key cannot be mitigated)
       - OpenID Connect without nonce validation (vulnerable to replay)

    3. FRD/BRD requires MFA but ADD auth flow only describes single-factor
       authentication.

    4. Auth flow described in ADD is missing critical steps that the declared
       standard mandates (e.g., no token endpoint for OAuth2, no ACS URL
       for SAML).

    Report as WARNING when:

    1. compliance_status is "partial" - implementation follows the standard
       but is missing non-critical elements (e.g., token revocation not
       documented but tokens have short expiry).

    2. compliance_status is "undeclared" - ADD describes an auth mechanism
       but FRD/BRD never declared what standard should be used. The
       implementation may be fine but the requirements gap should be noted.

    3. Auth standard is declared and implemented but key management details
       are vague (e.g., "keys are stored securely" without specifying where
       or how rotation works).

  recommendation_template: |
    ## Gap: Auth Scheme Compliance - {declared_standard}

    **Declared Standard:** {declared_standard}
    **Declaration Source:** {declaration_source}
    **Implementation Mechanism:** {implementation_mechanism}
    **Implementation Source:** {implementation_source}
    **Compliance Status:** {compliance_status}

    ### Missing Elements
    {missing_elements}

    ### Resolution Options

    1. **Align Implementation to Standard** (if the declared standard is correct):
       Update the ADD to describe an implementation that faithfully follows
       the declared standard, including all protocol-required elements
       (token refresh, PKCE, nonce validation, etc.).

    2. **Update Requirements** (if the implementation is correct):
       Revise the FRD/BRD to accurately reflect the auth standard being
       used. Document the security trade-offs of the chosen approach.

    3. **Add Missing Protocol Elements**:
       For each missing element, add documentation describing how it is
       handled. Protocol-required elements are not optional - they exist
       to prevent specific attack vectors.

    ### Why This Matters
    Auth scheme mismatches create false confidence in security posture.
    If the FRD promises OAuth2 but the system uses API keys, the security
    guarantees of OAuth2 (token expiration, scope limitation, revocation)
    are absent. Compliance audits (SOC 2, PCI DSS, HIPAA) will flag
    implementations that don't match declared standards.

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "FRD Section 3.1"
      text: |
        "The system shall authenticate users via OAuth2 Authorization Code
        flow with PKCE. Access tokens shall be JWT signed with RS256, with
        a 15-minute expiry and refresh token support."
      mapping: |
        declared_standard: "OAuth2 Authorization Code with PKCE"
        declaration_source: "FRD Section 3.1"
        implementation_mechanism: "OAuth2 Authorization Code with PKCE via Auth0 IdP, RS256 JWT access tokens, 15-min expiry, refresh token rotation"
        implementation_source: "ADD Section 4.2 - Authentication Architecture"
        compliance_status: "compliant"
        missing_elements: null
        confidence: "high"
        note: "Full compliance - all protocol-required elements are documented"

  non_compliant:
    - source: "FRD Section 2.4"
      text: |
        "Authentication shall use OAuth2 with delegated authorization to
        support third-party application access."
      mapping: |
        declared_standard: "OAuth2"
        declaration_source: "FRD Section 2.4"
        implementation_mechanism: "Static API keys generated per user, passed in X-API-Key header, no expiration"
        implementation_source: "ADD Section 5.1 - API Security"
        compliance_status: "non-compliant"
        missing_elements: "No OAuth2 authorization server, no token endpoint, no grant type flow, no scopes, no token expiration, no refresh mechanism. Implementation is basic API key auth, not OAuth2."
        confidence: "high"
        gap: "FRD declares OAuth2 but ADD implements static API keys. The security properties are fundamentally different - no delegated authorization, no token expiration, no scope-based access control."

  partial_compliance:
    - source: "BRD Section 4.1"
      text: |
        "The platform shall support SAML 2.0 Single Sign-On with enterprise
        identity providers for all B2B customer access."
      mapping: |
        declared_standard: "SAML 2.0 Web SSO"
        declaration_source: "BRD Section 4.1"
        implementation_mechanism: "SAML integration via AWS Cognito, IdP metadata import supported, ACS URL configured"
        implementation_source: "ADD Section 3.3 - Enterprise SSO"
        compliance_status: "partial"
        missing_elements: "No documentation of assertion signing certificate management, no attribute mapping specification, no single logout (SLO) flow documented"
        confidence: "medium"
        gap: "SAML implementation is partially documented but missing certificate lifecycle management and attribute mapping details"

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "doc-lint v0.2"
  related_concerns:
    - "api-contract-consistency"     # auth scheme should match API spec security definitions
    - "horizontal-traceability"      # auth requirements should trace from BRD to ADD
    - "logging-pii-compliance"       # auth tokens in logs are a PII concern
  references:
    - "RFC 6749: The OAuth 2.0 Authorization Framework"
    - "RFC 7636: Proof Key for Code Exchange (PKCE)"
    - "RFC 7519: JSON Web Token (JWT)"
    - "OASIS SAML 2.0 Technical Overview"
    - "OpenID Connect Core 1.0 Specification"
    - "NIST SP 800-63B: Digital Identity Guidelines - Authentication"

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
**Verdict**: CONDITIONAL PASS — 0 ERRORs, 5 WARNINGs (overlap with auth-boundary-consistency)

Findings for this concern overlap substantially with auth-boundary-consistency (W1-W5) and secrets-management (W6). See the bundled review for full details.

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
