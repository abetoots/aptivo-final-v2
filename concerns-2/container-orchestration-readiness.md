---
concern: container-orchestration-readiness
version: 1.0
name: Container Orchestration Readiness
type: concern
project: aptivo-final-v2
generated: 2026-03-01T11:59:45.522Z
---

## System Message

You are a documentation validator evaluating the concern: "Container Orchestration Readiness" (container-orchestration-readiness v1.0). Severity level: warn. Every containerized service must document:
1. Resource profiles (CPU and memory requests/limits)
2. Health check endpoints (liveness and readiness probes)
3. Health check type and configuration (HTTP, TCP, exec)
4. Graceful shutdown behavior (SIGTERM handling, drain period) Produce structured JSON output following the evidence_required fields in the schema.

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
# CONCERN: Container Orchestration Readiness
# =============================================================================
# This concern validates that containerized services document resource profiles
# (CPU/memory limits) and health check endpoints. Without these, orchestrators
# cannot make informed scheduling decisions, and unhealthy containers continue
# receiving traffic.
#
# WHY THIS MATTERS:
# Container orchestrators like Kubernetes rely on declared resource limits and
# health checks to schedule pods, evict unhealthy instances, and prevent noisy
# neighbors. Services deployed without resource limits can starve co-located
# workloads. Services without health checks continue receiving traffic even
# when they're deadlocked, out of memory, or unable to serve requests.
# =============================================================================

concern:
  id: "container-orchestration-readiness"
  version: "1.0"
  name: "Container Orchestration Readiness"
  category: "operational"
  severity: "warn"

  description: |
    Every containerized service must document:
    1. Resource profiles (CPU and memory requests/limits)
    2. Health check endpoints (liveness and readiness probes)
    3. Health check type and configuration (HTTP, TCP, exec)
    4. Graceful shutdown behavior (SIGTERM handling, drain period)

# -----------------------------------------------------------------------------
# TRIGGERS: When to load this concern
# -----------------------------------------------------------------------------
triggers:
  any_of:
    - containerization
    - kubernetes

# -----------------------------------------------------------------------------
# EVALUATION: The reasoning task
# -----------------------------------------------------------------------------
evaluation:
  question: |
    Systematically identify every containerized service in the documented
    system, then evaluate whether each has documented resource profiles and
    health check endpoints.

    STEP 1: IDENTIFY CONTAINERIZED SERVICES
    Scan all documents for services running in containers:
    - Docker containers, Kubernetes pods/deployments
    - ECS tasks, Cloud Run services, Azure Container Instances
    - Any service described with container images, Dockerfiles, or
      container orchestration configuration
    - Look for: container, docker, pod, deployment, helm, k8s, ECS

    STEP 2: FOR EACH SERVICE, CHECK RESOURCE PROFILES
    a) CPU limits:
       - Are CPU requests and limits documented?
       - Are they based on load testing or profiling data?
    b) Memory limits:
       - Are memory requests and limits documented?
       - Is there headroom for garbage collection / memory spikes?
    c) Are resource profiles different per environment (dev/staging/prod)?

    STEP 3: FOR EACH SERVICE, CHECK HEALTH CHECKS
    a) Liveness probe:
       - Is there a liveness check? (determines if container should restart)
       - What type? (HTTP endpoint, TCP socket, exec command)
       - What are the timing parameters? (initial delay, period, threshold)
    b) Readiness probe:
       - Is there a readiness check? (determines if container receives traffic)
       - Does it check downstream dependencies?
       - What happens during startup? (readiness gates)
    c) Startup probe (if applicable):
       - For slow-starting services, is there a startup probe?

    STEP 4: FLAG GAPS
    Any containerized service without documented resource limits or health
    checks is a gap.

  checklist:
    - id: "service-inventory"
      question: "Are all containerized services identified with their orchestration platform?"
    - id: "resource-limits"
      question: "Does each service document CPU and memory requests/limits?"
    - id: "health-checks"
      question: "Does each service have documented liveness and readiness probes?"
    - id: "graceful-shutdown"
      question: "Does each service document SIGTERM handling and drain period?"

  evidence_required:
    - field: "service_name"
      type: "string"
      description: "Name of the containerized service (e.g., 'OrderService pod', 'PaymentWorker ECS task')"
      required: true

    - field: "resource_limits_documented"
      type: "boolean"
      description: "Whether CPU and memory requests/limits are documented"
      required: true

    - field: "health_check_documented"
      type: "boolean"
      description: "Whether liveness and/or readiness probes are documented"
      required: true

    - field: "health_check_type"
      type: "string | null"
      description: "Type of health check (e.g., 'HTTP GET /healthz', 'TCP port 8080', 'exec: pg_isready')"
      required: true

    - field: "source_location"
      type: "string"
      description: "Where this service is documented (e.g., 'ADD Section 5.1 - Deployment Architecture')"
      required: true

    - field: "confidence"
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Your confidence that this assessment is accurate"
      required: true

  failure_condition: |
    Report as ERROR when ANY of the following are true:

    1. A production service has resource_limits_documented = FALSE and
       health_check_documented = FALSE - the service is completely
       unprepared for orchestration

    Report as WARNING when:

    1. resource_limits_documented = FALSE - the orchestrator cannot make
       informed scheduling decisions

    2. health_check_documented = FALSE - unhealthy containers continue
       receiving traffic

    3. health_check_type is only liveness without readiness - the service
       may receive traffic before it's ready

    4. Resource limits are documented but appear to be placeholder values
       (e.g., "256Mi" for a JVM service that needs at least 512Mi)

  recommendation_template: |
    ## Gap: {service_name} - Missing Container Orchestration Config

    **Location:** {source_location}

    ### Required Documentation

    1. **Resource Profiles**
       - CPU request/limit (e.g., "request: 250m, limit: 1000m")
       - Memory request/limit (e.g., "request: 512Mi, limit: 1Gi")
       - Basis for values (load test results, profiling data)

    2. **Health Checks**
       - Liveness probe: endpoint, type, timing
       - Readiness probe: endpoint, type, timing
       - Example: "Liveness: HTTP GET /healthz every 10s, 3 failures to restart.
         Readiness: HTTP GET /ready every 5s, checks DB connectivity."

    3. **Graceful Shutdown**
       - SIGTERM handling behavior
       - Drain period for in-flight requests
       - Example: "On SIGTERM, stop accepting new requests, drain existing
         requests for up to 30s, then exit."

# -----------------------------------------------------------------------------
# EXAMPLES
# -----------------------------------------------------------------------------
examples:
  well_documented:
    - source: "ADD Section 5.1 - Kubernetes Deployment"
      text: |
        "OrderService runs as a Kubernetes Deployment with 3 replicas.
        Resources: CPU request 250m/limit 1000m, memory request 512Mi/limit 1Gi.
        Liveness: HTTP GET /healthz every 10s, 3 failures triggers restart.
        Readiness: HTTP GET /ready every 5s, checks DB and Redis connectivity.
        On SIGTERM, drains in-flight requests for 30s before exit."
      assessment: |
        service_name: "OrderService Kubernetes Deployment"
        resource_limits_documented: true
        health_check_documented: true
        health_check_type: "HTTP GET /healthz (liveness), HTTP GET /ready (readiness)"
        confidence: "high"

  poorly_documented:
    - source: "ADD Section 4.2"
      text: |
        "The notification service runs in Docker containers managed by ECS."
      assessment: |
        service_name: "Notification service (ECS)"
        resource_limits_documented: false
        health_check_documented: false
        health_check_type: null
        confidence: "high"
        gap: "No resource limits or health checks documented. ECS cannot
              make informed placement decisions, and unhealthy containers
              will continue receiving traffic."

# -----------------------------------------------------------------------------
# METADATA
# -----------------------------------------------------------------------------
metadata:
  created: "2026-02"
  last_updated: "2026-02"
  tier: 2
  author: "Multi-Expert Consensus (Claude, Gemini, Codex)"
  related_concerns:
    - "failure-mode-coverage"
    - "alerting-slo-alignment"
  references:
    - "Kubernetes: Configure Liveness, Readiness and Startup Probes"
    - "Kubernetes: Resource Management for Pods and Containers"

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

**Evaluated**: 2026-03-03 (Session 6: Operational Readiness)
**Review**: `OPERATIONAL_READINESS_MULTI_REVIEW.md`
**Verdict**: PASS — 0 ERRORs, 5 WARNINGs

| Finding | Severity | Status |
|---------|----------|--------|
| W16: Resource limits use provider slugs, not absolute units | WARN | Accepted (document actual CPU/memory for basic-xxs) |
| W17: Health check only configures liveness in app spec | WARN | Accepted (DO App Platform may only support single probe; clarify) |
| W18: Graceful shutdown (SIGTERM) not documented | WARN | Accepted (document drain period, BullMQ worker shutdown) |
| W19: Workflow worker health check undocumented | WARN | Accepted (clarify production deployment model) |
| W20: ClamAV health check not configured | WARN | Accepted (add container-level health check) |

**Sign-off**: Gemini PASS, Codex PASS, Claude PASS
