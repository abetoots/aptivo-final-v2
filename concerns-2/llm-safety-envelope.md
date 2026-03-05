---
concern: llm-safety-envelope
version: 1.0
name: LLM Safety Envelope
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "LLM Safety Envelope" (llm-safety-envelope v1.0). Severity level: error. Each LLM integration must document:
1. Prompt-injection defenses (how adversarial input is mitigated)
2. Output validation (how LLM responses are validated before use)
3. Deterministic/fallback strategy (what happens when LLM fails or is unavailable)
4. Token and cost limits (per-request and per-user/session bounds) Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: LLM Safety Envelope
# =============================================================================
# This concern validates that each LLM integration documents prompt-injection
# defenses, output validation, deterministic/fallback strategy, and token/cost
# limits. LLM integrations without safety envelopes are vulnerable to prompt
# injection, generate unvalidated outputs, and can incur unbounded API costs.
#
# WHY THIS MATTERS:
# LLM integrations are fundamentally different from traditional API calls.
# Inputs (prompts) can be manipulated by adversarial users to override system
# instructions (prompt injection). Outputs are non-deterministic and can
# contain hallucinated data, harmful content, or leaked system prompts.
# Token usage directly drives cost, and without limits, a single user session
# can generate hundreds of dollars in API charges.
# =============================================================================

concern:
  id: "llm-safety-envelope"
  version: "1.0"
  name: "LLM Safety Envelope"
  category: "security"
  severity: "error"

  description: |
    Each LLM integration must document:
    1. Prompt-injection defenses (how adversarial input is mitigated)
    2. Output validation (how LLM responses are validated before use)
    3. Deterministic/fallback strategy (what happens when LLM fails or is unavailable)
    4. Token and cost limits (per-request and per-user/session bounds)

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - ai-provider

  escalate_if:
    - payments
    - pii

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every LLM integration in the documented system,
    then evaluate whether each has a documented safety envelope.

    STEP 1: IDENTIFY LLM INTEGRATIONS
    Scan all documents for LLM/AI model usage:
    - Direct API calls to model providers (OpenAI, Anthropic, Google, etc.)
    - AI gateway/proxy services (LiteLLM, Portkey, Helicone)
    - Embedded model usage (local inference, fine-tuned models)
    - RAG (Retrieval-Augmented Generation) pipelines
    - Agent frameworks (LangChain, LlamaIndex, CrewAI)
    - Look for: LLM, model, prompt, completion, token, embedding, AI

    STEP 2: FOR EACH INTEGRATION, CHECK PROMPT-INJECTION DEFENSES
    a) How is user input separated from system instructions?
       - System/user message separation?
       - Input sanitization or filtering?
       - Instruction hierarchy enforcement?
    b) Are there documented attack scenarios and mitigations?
    c) Is there monitoring for prompt injection attempts?

    STEP 3: FOR EACH INTEGRATION, CHECK OUTPUT VALIDATION
    a) How are LLM responses validated before use?
       - Schema validation (structured output)?
       - Content filtering (harmful/inappropriate content)?
       - Hallucination detection (fact-checking against ground truth)?
    b) What happens when validation fails?
    c) Are outputs sanitized before display to users?

    STEP 4: FOR EACH INTEGRATION, CHECK FALLBACK STRATEGY
    a) What happens when the LLM is unavailable or returns errors?
       - Fallback to simpler model?
       - Fallback to deterministic logic?
       - Graceful degradation with cached responses?
    b) What is the timeout for LLM API calls?
    c) How are rate limits from the provider handled?

    STEP 5: FOR EACH INTEGRATION, CHECK TOKEN/COST LIMITS
    a) Per-request token limits (max input + output tokens)?
    b) Per-user/session rate limits?
    c) Global cost caps (daily/monthly budget)?
    d) How are limits enforced? (client-side, gateway, provider-side)

    STEP 6: FLAG GAPS
    Any LLM integration without documented defenses, validation, fallback,
    or cost limits is a gap.

  checklist:
    - id: "integration-inventory"
      question: "Are all LLM integrations identified with their provider and purpose?"
    - id: "prompt-injection-defense"
      question: "Does each integration document prompt-injection defenses?"
    - id: "output-validation"
      question: "Does each integration document output validation before use?"
    - id: "fallback-strategy"
      question: "Does each integration document fallback behavior when the LLM is unavailable?"
    - id: "token-cost-limits"
      question: "Does each integration document token and cost limits?"

  evidence_required:
    - field: "integration_name"
      type: "string"
      description: "Name of the LLM integration (e.g., 'GPT-4 product description generator', 'Claude customer support agent', 'RAG pipeline for knowledge base search')"
      required: true

    - field: "prompt_injection_defense_documented"
      type: "boolean"
      description: "Whether prompt-injection defenses are documented"
      required: true

    - field: "output_validation_documented"
      type: "boolean"
      description: "Whether output validation is documented"
      required: true

    - field: "fallback_strategy_documented"
      type: "boolean"
      description: "Whether fallback/degradation strategy is documented"
      required: true

    - field: "token_cost_limits_documented"
      type: "boolean"
      description: "Whether token and cost limits are documented"
      required: true

    - field: "source_location"
      type: "string"
      description: "Where this integration is documented (e.g., 'ADD Section 4.5 - AI Architecture')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. prompt_injection_defense_documented is FALSE for any user-facing LLM
       integration - adversarial users can override system instructions

    2. output_validation_documented is FALSE and the LLM output is used in
       business-critical decisions or displayed to users - hallucinated or
       harmful content can reach end users

    3. token_cost_limits_documented is FALSE - unbounded token usage can
       generate unexpected costs

    4. All four documented fields are FALSE - the integration has no
       safety envelope at all

    Report as WARNING when:

    1. fallback_strategy_documented is FALSE - LLM unavailability causes
       complete feature failure

    2. prompt_injection_defense_documented is TRUE but relies solely on
       "system prompt instructions" without structural defenses

    3. token_cost_limits_documented is TRUE at request level but no
       per-user/session limits exist

  recommendation_template: |
    ## Gap: {integration_name} - Missing LLM Safety Envelope

    **Location:** {source_location}

    ### Required Documentation

    1. **Prompt-Injection Defenses**
       - How is user input isolated from system instructions?
       - Example: "User input is placed in a separate user message.
         System prompt uses instruction hierarchy markers. Input is
         scanned for known injection patterns before sending to model.
         Monitoring alerts on anomalous prompt patterns."

    2. **Output Validation**
       - How are LLM responses validated?
       - Example: "Structured output mode with JSON schema validation.
         Content filtered for PII leakage and harmful content.
         Hallucination check against product database for factual claims."

    3. **Fallback Strategy**
       - What happens when the LLM fails?
       - Example: "On timeout (30s) or error, fall back to template-based
         responses. If fallback fails, return generic message with option
         to contact human support."

    4. **Token/Cost Limits**
       - What are the per-request and per-user bounds?
       - Example: "Max 4096 input + 1024 output tokens per request.
         Per-user: 100 requests/hour. Global: $500/day budget via
         AI gateway. Over-limit requests return 429."

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 4.5 - AI Architecture"
      text: |
        "Product description generator uses GPT-4 via AI gateway.
        Prompt injection: user input placed in separate message, input
        scanned for injection patterns, system prompt uses delimiters.
        Output: JSON schema validation, content filter for inappropriate
        content, product facts checked against catalog DB.
        Fallback: on timeout (30s), return cached description or generic
        template. Cost: max 2048 tokens/request, 50 req/user/hour,
        $200/day budget via Helicone gateway."
      assessment: |
        integration_name: "GPT-4 product description generator"
        prompt_injection_defense_documented: true
        output_validation_documented: true
        fallback_strategy_documented: true
        token_cost_limits_documented: true
        confidence: "high"

  poorly_documented:
    - source: "ADD Section 3.2"
      text: |
        "The customer support chatbot uses an LLM to answer user questions
        based on our knowledge base."
      assessment: |
        integration_name: "Customer support chatbot (LLM)"
        prompt_injection_defense_documented: false
        output_validation_documented: false
        fallback_strategy_documented: false
        token_cost_limits_documented: false
        confidence: "high"
        gap: "No safety envelope documented. Users can potentially inject
              prompts to override system behavior, outputs are not validated
              for accuracy or harmful content, no fallback exists for LLM
              outages, and token usage is unbounded."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "Multi-Expert Consensus (Claude, Gemini, Codex)"
  related_concerns:
    - "input-validation"
    - "threat-model-coverage"
    - "cost-budget-enforcement"
  references:
    - "OWASP Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/"
    - "NIST AI Risk Management Framework: https://www.nist.gov/artificial-intelligence/ai-risk-management-framework"

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

**Evaluated**: 2026-03-01 (Session 2: LLM + PII + Data Compliance)
**Review**: `LLM_PII_DATA_COMPLIANCE_MULTI_REVIEW.md`
**Verdict**: CONDITIONAL PASS — 2 ERRORs (resolved), 1 WARNING, 1 NOTE

| Finding | Severity | Status |
|---------|----------|--------|
| E1: Prompt injection defenses unmitigated | ERROR | **RESOLVED** — ADD §14.5.1 LLM Safety Envelope |
| E2: LLM output validation missing | ERROR | **RESOLVED** — ADD §14.5.1 structured output + Zod |
| W1: Per-user/session token limits missing | WARN | Accepted (Phase 2 — Phase 1 workflows are system-initiated) |
| N1: Prompt/response content not logged for audit | NOTE | Accepted (Phase 2 consideration) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
