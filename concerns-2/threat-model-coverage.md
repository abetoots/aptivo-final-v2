---
concern: threat-model-coverage
version: 1.0
name: Threat Model Coverage
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Threat Model Coverage" (threat-model-coverage v1.0). Severity level: error. Every documented attack surface in a system must have a corresponding
threat model that enumerates potential threats and documents mitigations.
Attack surfaces include external-facing APIs, authentication endpoints,
data stores containing PII, payment processing flows, and file upload
handlers. A threat model should use a recognized methodology (STRIDE,
attack trees, DREAD, or equivalent risk assessment) and explicitly map
each identified threat to a mitigation strategy or an accepted residual
risk with justification. Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Threat Model Coverage
# =============================================================================
# This concern validates that every documented attack surface has a
# corresponding threat model with enumerated threats and documented
# mitigations. Systems that handle PII, process payments, or expose
# external-facing APIs without threat models are operating blind to
# their risk posture.
#
# WHY THIS MATTERS:
# Attack surfaces without threat models are undefended by design. When a
# system exposes external APIs, handles personally identifiable information,
# or processes financial transactions, adversaries WILL probe those surfaces.
# Without a documented threat model (STRIDE, attack trees, risk assessment),
# the team cannot reason about what attacks are possible, which mitigations
# are in place, and where residual risk remains. Post-breach discovery of
# unmodeled threats is the most expensive way to learn.
#
# TYPICAL MANIFESTATION:
# - ADD describes external-facing REST API but no threat model exists
# - FRD mentions PII collection (email, SSN, address) with no data
#   classification or threat enumeration
# - Payment flow documented in ADD but no risk assessment for fraud,
#   replay, or amount tampering
# - System accepts file uploads but no analysis of malware, path traversal,
#   or resource exhaustion risks
# =============================================================================

concern:
  id: "threat-model-coverage"
  version: "1.0"
  name: "Threat Model Coverage"
  category: "security"
  severity: "error"

  description: |
    Every documented attack surface in a system must have a corresponding
    threat model that enumerates potential threats and documents mitigations.
    Attack surfaces include external-facing APIs, authentication endpoints,
    data stores containing PII, payment processing flows, and file upload
    handlers. A threat model should use a recognized methodology (STRIDE,
    attack trees, DREAD, or equivalent risk assessment) and explicitly map
    each identified threat to a mitigation strategy or an accepted residual
    risk with justification.

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - security
    - authentication
    - pii
    - payments
    - external-api

  escalate_if:
    - pii               # regulatory exposure (GDPR, CCPA, HIPAA)
    - payments           # financial loss from unmodeled threats
    - file-upload        # malware and resource exhaustion vectors

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every attack surface documented in the system,
    then evaluate whether a threat model exists for each surface with
    enumerated threats and documented mitigations.

    STEP 1: IDENTIFY ATTACK SURFACES FROM DESIGN DOCUMENTS
    Scan the ADD (Architecture Design Document) and FRD (Functional Requirements
    Document) for components that represent attack surfaces:

    a) External-Facing API Endpoints
       - REST APIs, GraphQL endpoints, gRPC services exposed to clients
       - Public endpoints (no auth required) vs. authenticated endpoints
       - Admin/management endpoints
       - Look for: endpoint, route, path, API, public, external

    b) Authentication and Authorization Flows
       - Login endpoints, token issuance, session management
       - OAuth flows, SSO integration points
       - Password reset, MFA enrollment
       - Look for: auth, login, token, session, OAuth, SSO, password

    c) Data Stores Containing Sensitive Data
       - Databases storing PII (names, emails, SSNs, addresses, phone numbers)
       - Credential stores (password hashes, API keys, tokens)
       - Financial records (payment info, transaction history)
       - Look for: PII, personal data, user data, credentials, payment

    d) Payment Processing Flows
       - Payment initiation, confirmation, refund flows
       - Integration with payment gateways (Stripe, PayPal, Adyen)
       - Financial state transitions (pending, captured, refunded)
       - Look for: payment, charge, refund, transaction, billing

    e) File Upload Handlers
       - User-submitted files (images, documents, CSVs)
       - Import/export functionality
       - Webhook payloads with attachments
       - Look for: upload, import, file, attachment, blob

    f) Other Surfaces
       - Webhook receivers (inbound from third parties)
       - Email/SMS sending (injection vectors)
       - WebSocket connections (persistent stateful channels)

    STEP 2: CHECK FOR THREAT MODELING DOCUMENTATION
    For each identified attack surface, search the documents for:

    a) Formal Threat Model
       - STRIDE analysis (Spoofing, Tampering, Repudiation, Info Disclosure,
         Denial of Service, Elevation of Privilege)
       - Attack trees mapping attack paths to mitigations
       - DREAD scoring (Damage, Reproducibility, Exploitability, Affected Users,
         Discoverability)
       - Risk assessment with likelihood and impact ratings
       - Look for: threat model, STRIDE, attack tree, risk assessment, DREAD,
         threat analysis, security analysis

    b) Informal Threat Coverage
       - Security considerations section that lists potential attacks
       - Mitigation strategies described alongside features
       - Security requirements linked to attack scenarios
       - Look for: security considerations, attack, mitigation, defense,
         protection, vulnerability

    STEP 3: FOR EACH ATTACK SURFACE, EVALUATE THREAT COVERAGE
    For every attack surface identified in Step 1, determine:

    a) Are threats explicitly enumerated?
       - What specific attacks are possible against this surface?
       - Are attack vectors described (not just generic "security risks")?
       - Example: "SQL injection via search parameter" not just "injection attacks"

    b) Are mitigations documented for each threat?
       - What controls prevent or detect each enumerated threat?
       - Are mitigations specific and actionable?
       - Example: "Parameterized queries via ORM" not just "input validation"

    c) Is residual risk acknowledged?
       - Are there threats without full mitigation that are accepted?
       - Is the acceptance justified with likelihood/impact reasoning?

    d) Is the threat model current?
       - Does it reference the current architecture (not a legacy version)?
       - Are recently added features covered?

    STEP 4: ASSESS COMPLETENESS AND GAPS
    For each attack surface, classify the threat model as:
    - COMPLETE: Threats enumerated, mitigations documented, residual risk acknowledged
    - PARTIAL: Some threats listed but incomplete coverage or missing mitigations
    - ABSENT: No threat model or security analysis exists for this surface
    - STALE: Threat model exists but references outdated architecture

  checklist:
    - id: "surfaces-identified"
      question: "Are all external-facing attack surfaces identified in the documentation?"
    - id: "threat-enumeration"
      question: "Does each attack surface have explicitly enumerated threats (not just generic security risks)?"
    - id: "mitigations-documented"
      question: "Is each enumerated threat mapped to a specific mitigation strategy?"
    - id: "pii-threats"
      question: "Do data stores containing PII have threat models covering data breach, unauthorized access, and data exfiltration?"
    - id: "payment-threats"
      question: "Do payment flows have threat models covering fraud, replay, amount tampering, and unauthorized transactions?"
    - id: "residual-risk"
      question: "Is residual risk explicitly acknowledged and justified where mitigations are incomplete?"

  evidence_required:
    - field: "attack_surface"
      type: "string"
      description: "Name of the attack surface (e.g., 'POST /api/users - User Registration Endpoint', 'UserDB - PII Data Store', 'Stripe Payment Flow')"
      required: true

    - field: "surface_source"
      type: "string"
      description: "Where the attack surface is documented (e.g., 'ADD Section 4.2, API Layer', 'FRD Section 3.1, User Management')"
      required: true

    - field: "surface_type"
      type: "enum"
      values:
        - "api-endpoint"
        - "data-store"
        - "auth-flow"
        - "payment-flow"
        - "file-upload"
        - "other"
      description: "Classification of the attack surface"
      required: true

    - field: "threat_model_exists"
      type: "boolean"
      description: "Does any form of threat model or security analysis exist for this surface?"
      required: true

    - field: "threats_enumerated"
      type: "string | null"
      description: "List of specific threats identified for this surface (e.g., 'SQL injection, XSS, CSRF, brute force login'). Null if no threat model exists."
      required: true

    - field: "mitigations_documented"
      type: "string | null"
      description: "Mitigations documented for enumerated threats (e.g., 'Parameterized queries, CSP headers, CSRF tokens, rate limiting'). Null if no mitigations exist."
      required: true

    - field: "threat_model_source"
      type: "string | null"
      description: "Where the threat model is documented (e.g., 'ADD Section 7, Security Analysis', 'Separate Threat Model Document v2.1'). Null if absent."
      required: false

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate based on available documentation"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. threat_model_exists is FALSE for any attack surface - no threat analysis
       has been performed at all for a documented surface

    2. surface_type is "data-store" with PII and mitigations_documented is NULL -
       PII storage without documented protections is a regulatory and legal risk

    3. surface_type is "payment-flow" and mitigations_documented is NULL -
       payment processing without documented mitigations exposes the system
       to fraud and financial loss

    4. threat_model_exists is TRUE but threats_enumerated is NULL or empty -
       a threat model that doesn't enumerate specific threats provides no value

    5. threats_enumerated lists threats but mitigations_documented is NULL -
       identified threats without any mitigations means known risks are unaddressed

    Report as WARNING when:

    1. threat_model_exists is TRUE but coverage is partial - some threats are
       enumerated but the analysis appears incomplete for the surface type

    2. mitigations_documented references generic controls (e.g., "input validation",
       "encryption") without specifics (e.g., which inputs, what algorithm, what mode)

    3. surface_type is "api-endpoint" and threats only cover OWASP Top 10 without
       business-logic-specific threats (e.g., privilege escalation via API parameter
       manipulation, IDOR, mass assignment)

    4. threat_model_source references a document version that appears outdated
       relative to the current architecture

    5. No residual risk acknowledgment - every surface claims full mitigation
       (unrealistic for complex systems)

  recommendation_template: |
    ## Gap: Missing Threat Model - {attack_surface}

    **Surface Type:** {surface_type}
    **Source:** {surface_source}
    **Threat Model:** {threat_model_exists}

    ### Required Documentation

    Create a threat model for this attack surface covering:

    1. **Threat Enumeration**
       Use STRIDE or equivalent methodology to identify threats:
       - Spoofing: Can an attacker impersonate a legitimate user/system?
       - Tampering: Can data be modified in transit or at rest?
       - Repudiation: Can actions be performed without audit trail?
       - Information Disclosure: Can sensitive data be leaked?
       - Denial of Service: Can the surface be overwhelmed?
       - Elevation of Privilege: Can an attacker gain unauthorized access?

    2. **Mitigation Mapping**
       For each identified threat, document:
       - The specific control that mitigates it
       - How the control is implemented (not just "we use encryption")
       - Example: "SQL injection mitigated by parameterized queries via
         Prisma ORM; all database access goes through the ORM layer"

    3. **Residual Risk**
       For threats without full mitigation:
       - State the residual risk explicitly
       - Justify acceptance with likelihood/impact reasoning
       - Document monitoring/detection as compensating controls

    4. **Review Cadence**
       - When should this threat model be re-evaluated?
       - What changes would trigger a review? (new endpoints, new data types)

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 7 - Security Analysis"
      text: |
        "Threat Model: User Registration API (POST /api/users)

        STRIDE Analysis:
        - Spoofing: Bot registration → Mitigation: CAPTCHA + rate limiting (10 req/min/IP)
        - Tampering: Parameter injection → Mitigation: Schema validation via Zod,
          only whitelisted fields accepted (email, name, password)
        - Repudiation: Account creation without audit → Mitigation: All registrations
          logged with IP, timestamp, user-agent in audit_log table
        - Info Disclosure: Email enumeration → Mitigation: Generic response for
          existing/non-existing emails ('Check your inbox')
        - DoS: Registration spam → Mitigation: Rate limiting + CAPTCHA + email verification
        - EoP: Mass assignment to admin role → Mitigation: Role field not accepted in
          registration payload; default role is 'user'

        Residual Risk: Sophisticated bots may bypass CAPTCHA. Accepted because
        email verification provides second factor and monitoring alerts on
        registration rate anomalies."
      assessment: |
        attack_surface: "POST /api/users - User Registration"
        surface_type: "api-endpoint"
        threat_model_exists: true
        threats_enumerated: "Spoofing (bot registration), Tampering (parameter injection), Repudiation (unaudited creation), Info Disclosure (email enumeration), DoS (registration spam), EoP (mass assignment)"
        mitigations_documented: "CAPTCHA, rate limiting, schema validation, audit logging, generic responses, default role assignment"
        confidence: "high"

  poorly_documented:
    - source: "ADD Section 4.1"
      text: |
        "The system exposes a REST API for user management, including
        registration, profile updates, and account deletion. Standard
        security best practices are followed."
      assessment: |
        attack_surface: "User Management API"
        surface_type: "api-endpoint"
        threat_model_exists: false
        threats_enumerated: null
        mitigations_documented: null
        gap: "No threat model exists. 'Standard security best practices' is not
              a threat model - it doesn't enumerate what threats exist or what
              specific controls are in place. Registration, profile updates, and
              account deletion each have distinct attack vectors that need analysis."
        confidence: "high"

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 1
  author: "doc-lint v0.2"
  related_concerns:
    - "auth-boundary-consistency"   # auth surfaces need both threat models and consistent boundaries
    - "secrets-management"          # credential stores are attack surfaces requiring threat models
    - "input-validation"            # input boundaries are attack surfaces
  references:
    - "OWASP Threat Modeling: https://owasp.org/www-community/Threat_Modeling"
    - "Microsoft STRIDE: https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats"
    - "NIST SP 800-154: Guide to Data-Centric System Threat Modeling"
    - "Adam Shostack: Threat Modeling - Designing for Security"

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
