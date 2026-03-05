---
concern: cache-consistency-contract
version: 1.0
name: Cache Consistency Contract
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Cache Consistency Contract" (cache-consistency-contract v1.0). Severity level: error. Every caching layer in the system must document:
1. The invalidation mechanism (TTL, event-driven, manual purge)
2. A freshness SLO (maximum acceptable staleness)
3. Stale-read behavior (what happens when stale data is served)
4. Cache key strategy (how cache entries are keyed and partitioned) Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Cache Consistency Contract
# =============================================================================
# This concern validates that every caching layer documents its invalidation
# mechanism, freshness SLO, and stale-read behavior. Caching without explicit
# contracts leads to mysterious staleness bugs, inconsistent reads across
# services, and incidents that are nearly impossible to reproduce.
#
# WHY THIS MATTERS:
# Caching is one of the most powerful performance tools and one of the most
# common sources of subtle production bugs. When a cache layer doesn't document
# how it invalidates entries, how fresh data is guaranteed to be, or what
# happens when stale data is served, every consumer of that cache operates on
# assumptions. Those assumptions diverge across teams and break under load,
# during deployments, or after infrastructure changes.
# =============================================================================

concern:
  id: "cache-consistency-contract"
  version: "1.0"
  name: "Cache Consistency Contract"
  category: "core"
  severity: "error"

  description: |
    Every caching layer in the system must document:
    1. The invalidation mechanism (TTL, event-driven, manual purge)
    2. A freshness SLO (maximum acceptable staleness)
    3. Stale-read behavior (what happens when stale data is served)
    4. Cache key strategy (how cache entries are keyed and partitioned)

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - caching

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every caching layer in the documented system,
    then evaluate whether each layer has a documented consistency contract.

    STEP 1: IDENTIFY CACHING LAYERS
    Scan all documents for caching infrastructure and patterns:
    - Application-level caches (in-memory, local cache)
    - Distributed caches (Redis, Memcached, Hazelcast)
    - CDN caching (CloudFront, Fastly, Cloudflare)
    - Database query caches (MySQL query cache, materialized views)
    - API response caches (HTTP cache headers, gateway caching)
    - Browser/client-side caches (service worker, local storage)
    - DNS caching

    STEP 2: FOR EACH CACHE LAYER, CHECK DOCUMENTATION
    a) Invalidation mechanism:
       - TTL-based (time-to-live expiration)
       - Event-driven (cache busted on write/update events)
       - Manual purge (API call or deployment step)
       - Write-through (cache updated on every write)
       - Cache-aside (application manages cache population)
       - Undefined/not documented
    b) Freshness SLO:
       - Maximum acceptable staleness (e.g., "data may be up to 60s stale")
       - Consistency guarantee (e.g., "read-after-write within same session")
       - No freshness guarantee documented
    c) Stale-read behavior:
       - Serve stale and refresh in background (stale-while-revalidate)
       - Return error if stale beyond threshold
       - Always serve stale as fallback
       - Undefined behavior on stale reads

    STEP 3: CHECK CACHE BOUNDARIES
    - Are cache boundaries clear? (what data is cached vs. always fresh)
    - Are there documented cache warming strategies for cold starts?
    - How do deployments affect caches? (cache flush on deploy?)

    STEP 4: FLAG GAPS
    Any caching layer without a documented invalidation mechanism, freshness
    SLO, or stale-read behavior is a gap that must be reported.

  checklist:
    - id: "cache-inventory"
      question: "Are all caching layers identified with their scope and purpose?"
    - id: "invalidation-mechanism"
      question: "Does each cache layer document how entries are invalidated?"
    - id: "freshness-slo"
      question: "Is there a documented maximum acceptable staleness for each cache?"
    - id: "stale-read-behavior"
      question: "Is the behavior when stale data is encountered documented?"

  evidence_required:
    - field: "cache_layer_name"
      type: "string"
      description: "Name of the caching layer (e.g., 'Redis product catalog cache', 'CloudFront static assets CDN', 'In-memory session cache')"
      required: true

    - field: "invalidation_documented"
      type: "boolean"
      description: "Whether the cache invalidation mechanism is explicitly documented"
      required: true

    - field: "invalidation_mechanism"
      type: "string | null"
      description: "The documented invalidation strategy (e.g., 'TTL of 300s + event-driven purge on product update', 'Write-through on every database write')"
      required: true

    - field: "freshness_slo"
      type: "string | null"
      description: "The documented maximum acceptable staleness (e.g., '60 seconds', 'read-after-write consistent', 'best effort, no SLO')"
      required: true

    - field: "stale_read_behavior"
      type: "string | null"
      description: "What happens when stale data is served (e.g., 'Serve stale, refresh async', 'Return 504 if stale > 5min', 'Always serve stale as fallback')"
      required: true

    - field: "source_location"
      type: "string"
      description: "Where this cache is documented (e.g., 'ADD Section 4.3 - Caching Strategy')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. invalidation_documented is FALSE - a cache without a documented
       invalidation mechanism will serve stale data indefinitely

    2. freshness_slo is NULL and the cached data is used for business-critical
       decisions (pricing, availability, permissions) - consumers cannot reason
       about data correctness

    3. stale_read_behavior is NULL for caches serving user-facing data -
       users may see inconsistent or outdated information without knowing it

    Report as WARNING when:

    1. invalidation_documented is TRUE but freshness_slo is NULL - the cache
       is invalidated but no guarantee is made about maximum staleness

    2. stale_read_behavior is "serve stale" without a staleness threshold -
       stale data could be served indefinitely

    3. Cache invalidation relies solely on TTL without event-driven purge
       for frequently-updated data

  recommendation_template: |
    ## Gap: {cache_layer_name} - Missing Cache Consistency Contract

    **Location:** {source_location}

    ### Required Documentation

    Add a cache consistency contract covering:

    1. **Invalidation Mechanism**
       - How are cache entries invalidated?
       - Example: "Product cache entries expire after 5 minutes (TTL).
         On product update, a cache purge event is published to invalidate
         the specific entry immediately."

    2. **Freshness SLO**
       - What is the maximum acceptable staleness?
       - Example: "Product data may be up to 5 minutes stale under normal
         conditions. During cache purge failures, data may be up to 15
         minutes stale before the circuit breaker bypasses cache."

    3. **Stale-Read Behavior**
       - What happens when stale data is detected?
       - Example: "Stale reads serve cached data and trigger async refresh.
         If cache is unreachable, requests fall through to database with
         a 500ms timeout."

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 4.3 - Caching Strategy"
      text: |
        "Product catalog data is cached in Redis with a 5-minute TTL.
        On product update events from the catalog service, the specific
        cache key is invalidated immediately. Freshness SLO: data is at
        most 5 minutes stale. If Redis is unreachable, requests fall
        through to the database with a 500ms timeout. Stale reads during
        Redis recovery serve the last known value."
      assessment: |
        cache_layer_name: "Redis product catalog cache"
        invalidation_documented: true
        invalidation_mechanism: "5-minute TTL + event-driven purge on product update"
        freshness_slo: "5 minutes maximum staleness"
        stale_read_behavior: "Serve last known value during Redis recovery, fall through to DB"
        confidence: "high"

  poorly_documented:
    - source: "ADD Section 3.1"
      text: |
        "We use Redis to cache frequently accessed data for performance."
      assessment: |
        cache_layer_name: "Redis cache (unspecified scope)"
        invalidation_documented: false
        invalidation_mechanism: null
        freshness_slo: null
        stale_read_behavior: null
        confidence: "high"
        gap: "No invalidation mechanism, freshness SLO, or stale-read behavior
              documented. Consumers of this cache cannot reason about data
              correctness or plan for cache failures."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "Multi-Expert Consensus (Claude, Gemini, Codex)"
  related_concerns:
    - "state-ownership-clarity"
    - "resilience-triad"
  references:
    - "HTTP Caching (RFC 9111): https://httpwg.org/specs/rfc9111.html"
    - "Cache-Aside Pattern: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside"

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
**Verdict**: CONDITIONAL PASS — 3 ERRORs (resolved), 4 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| E8: Entity cache missing stale-read behavior | ERROR | **RESOLVED** — Added common-patterns.md §6.4 |
| E9: MCP response cache missing stale-read + key strategy | ERROR | **RESOLVED** — Added ADD §5.6 stale-read table |
| E10: Permission cache missing freshness SLO | ERROR | **RESOLVED** — Added common-patterns.md §6.4 security note |
| W4: Entity cache freshness SLO not explicit | WARN | Accepted (TTLs serve as implicit SLOs) |
| W5: Session cache invalidation | WARN | Accepted (JWT-based auth; requires_human_review) |
| W6: Cache warming / cold start | WARN | Accepted (cache-aside is standard) |
| W7: TTL-only invalidation risk | WARN | Accepted (event-driven exists for entities) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
