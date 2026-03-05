---
concern: trace-context-propagation
version: 1.0
name: Trace Context Propagation
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Trace Context Propagation" (trace-context-propagation v1.0). Severity level: warn. Services in distributed transactions must document:
1. Trace context propagation across HTTP/gRPC boundaries
2. Trace context propagation across message bus boundaries
3. The propagation mechanism (W3C Trace Context, B3, custom headers)
4. Boundaries where trace context is created, forwarded, or terminated Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Trace Context Propagation
# =============================================================================
# This concern validates that services in distributed transactions document
# trace context propagation across process and message bus boundaries.
# Without trace propagation, distributed debugging requires correlating
# disconnected log entries across services - a slow, error-prone process.
#
# WHY THIS MATTERS:
# In distributed systems, a single user request may span dozens of services.
# Without trace context propagation (W3C Trace Context, B3 headers, etc.),
# each service's logs and metrics are isolated. When an incident occurs,
# engineers must manually correlate events across services using timestamps
# and heuristics. Proper trace propagation lets you follow a request from
# edge to database in a single trace view.
# =============================================================================

concern:
  id: "trace-context-propagation"
  version: "1.0"
  name: "Trace Context Propagation"
  category: "operational"
  severity: "warn"

  description: |
    Services in distributed transactions must document:
    1. Trace context propagation across HTTP/gRPC boundaries
    2. Trace context propagation across message bus boundaries
    3. The propagation mechanism (W3C Trace Context, B3, custom headers)
    4. Boundaries where trace context is created, forwarded, or terminated

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - observability
    - microservices
    - distributed

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every service boundary and message bus in the
    documented system, then evaluate whether trace context propagation is
    documented across each boundary.

    STEP 1: IDENTIFY DISTRIBUTED BOUNDARIES
    Scan all documents for service-to-service communication:
    - HTTP/REST calls between services
    - gRPC calls between services
    - Message queue publishing/consuming (Kafka, SQS, RabbitMQ)
    - Event bus communication
    - External API calls (outbound)
    - Async job dispatching
    - Look for: service call, API call, publish, consume, queue, topic

    STEP 2: FOR EACH BOUNDARY, CHECK TRACE PROPAGATION
    a) Is trace context propagated across this boundary?
    b) What mechanism is used?
       - W3C Trace Context (traceparent/tracestate headers)
       - B3 headers (X-B3-TraceId, X-B3-SpanId)
       - Custom correlation ID
       - OpenTelemetry auto-instrumentation
    c) Is the propagation automatic (SDK/middleware) or manual?
    d) What happens when incoming trace context is missing?

    STEP 3: CHECK MESSAGE BUS PROPAGATION
    For asynchronous boundaries (queues, event buses):
    a) Is trace context included in message metadata/headers?
    b) Is a new trace created for async processing, linked to the original?
    c) Can a trace follow a request from producer → queue → consumer?

    STEP 4: CHECK CROSS-BOUNDARY COMPLETENESS
    a) Are there boundaries where trace context is dropped?
    b) Are external service calls included in traces?
    c) Are batch jobs and cron tasks traceable?

    STEP 5: FLAG GAPS
    Any distributed boundary without documented trace propagation is a gap.

  checklist:
    - id: "boundary-inventory"
      question: "Are all service-to-service boundaries identified?"
    - id: "http-propagation"
      question: "Is trace context propagated across HTTP/gRPC service calls?"
    - id: "message-bus-propagation"
      question: "Is trace context propagated across message queue/event bus boundaries?"
    - id: "propagation-mechanism"
      question: "Is the propagation mechanism documented (W3C, B3, custom)?"

  evidence_required:
    - field: "service_name"
      type: "string"
      description: "Name of the service or boundary (e.g., 'OrderService → PaymentService HTTP call', 'OrderService → Kafka orders topic')"
      required: true

    - field: "trace_propagation_documented"
      type: "boolean"
      description: "Whether trace context propagation is documented for this boundary"
      required: true

    - field: "propagation_mechanism"
      type: "string | null"
      description: "The documented propagation mechanism (e.g., 'W3C Trace Context via OpenTelemetry SDK', 'B3 headers via Zipkin', 'Custom X-Correlation-Id header')"
      required: true

    - field: "cross_boundary_type"
      type: "string"
      description: "Type of boundary (e.g., 'HTTP', 'gRPC', 'Kafka', 'SQS', 'EventBridge')"
      required: true

    - field: "source_location"
      type: "string"
      description: "Where this boundary is documented (e.g., 'ADD Section 4.1 - Service Communication')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. A payment or financial transaction spans multiple services and
       trace_propagation_documented is FALSE - incident debugging for
       financial transactions requires full traceability

    Report as WARNING when:

    1. trace_propagation_documented is FALSE for any service boundary -
       distributed debugging requires manual correlation

    2. HTTP boundaries have propagation but message bus boundaries do not -
       async processing creates trace gaps

    3. propagation_mechanism is "custom correlation ID" without integration
       into the observability platform - custom IDs require manual lookup

    4. Some services have propagation but others don't - partial coverage
       creates blind spots in traces

  recommendation_template: |
    ## Gap: {service_name} - Missing Trace Context Propagation

    **Location:** {source_location}
    **Boundary Type:** {cross_boundary_type}

    ### Required Documentation

    1. **Propagation Mechanism**
       - What standard is used for trace propagation?
       - Example: "W3C Trace Context (traceparent header) propagated via
         OpenTelemetry SDK auto-instrumentation for all HTTP calls."

    2. **Message Bus Propagation**
       - How is trace context included in async messages?
       - Example: "Trace context serialized into Kafka message headers
         (traceparent key). Consumer creates child span linked to
         producer's trace context."

    3. **Boundary Coverage**
       - Which boundaries propagate context and which create new traces?
       - Example: "All internal HTTP calls propagate context. External
         API calls create linked spans. Cron jobs create new root traces."

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 4.1 - Observability Architecture"
      text: |
        "All services use OpenTelemetry SDK for trace propagation. HTTP
        calls propagate W3C Trace Context headers automatically. Kafka
        messages include traceparent in message headers; consumers create
        child spans linked to the producer trace. External API calls
        create linked spans. Cron jobs create new root traces tagged
        with job_name."
      assessment: |
        service_name: "All services (OpenTelemetry)"
        trace_propagation_documented: true
        propagation_mechanism: "W3C Trace Context via OpenTelemetry SDK"
        cross_boundary_type: "HTTP + Kafka"
        confidence: "high"

  poorly_documented:
    - source: "ADD Section 3.2"
      text: |
        "The system uses distributed tracing with Jaeger for monitoring."
      assessment: |
        service_name: "System (Jaeger tracing)"
        trace_propagation_documented: false
        propagation_mechanism: null
        cross_boundary_type: "unspecified"
        confidence: "medium"
        gap: "Tracing tool mentioned but no documentation of how trace
              context is propagated across service boundaries or message
              buses. Engineers cannot determine which boundaries are
              covered or what propagation standard is used."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "Multi-Expert Consensus (Claude, Gemini, Codex)"
  related_concerns:
    - "alerting-slo-alignment"
    - "failure-mode-coverage"
  references:
    - "W3C Trace Context: https://www.w3.org/TR/trace-context/"
    - "OpenTelemetry: https://opentelemetry.io/docs/concepts/context-propagation/"

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
**Verdict**: PASS — 0 ERRORs, 7 WARNINGs, 1 NOTE

| Finding | Severity | Status |
|---------|----------|--------|
| W24: Inngest waitForEvent() trace break | WARN | Accepted (document trace propagation for HITL events) |
| W25: BullMQ job trace context not propagated | WARN | Accepted (add trace context to QueuedMCPRequest) |
| W26: Novu notification trace context missing | WARN | Accepted (include traceId in novu.trigger() payload) |
| W27: MCP tool call trace context not propagated | WARN | Accepted (add traceparent header on HTTP transport) |
| W28: Propagation mechanism not standardized | WARN | Accepted (declare W3C Trace Context as standard) |
| W29: Supabase JWT validation not traced | WARN | Accepted (add span around JWT validation) |
| W30: Outbound webhook delivery trace context missing | WARN | Accepted (add traceparent to WebhookEventPayload) |
| N1: Observability doc K8s vs PaaS inconsistency | NOTE | Accepted (update §2.2-2.3 for DO App Platform) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
