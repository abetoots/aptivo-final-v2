---
type: signal-detection
project: aptivo-final-v2
generated: 2026-02-26T09:25:50.329Z
documents: docs/01-strategy/platform-core-brd.md, docs/02-requirements/platform-core-frd.md, docs/03-architecture/platform-core-add.md, docs/06-operations/01-runbook.md, docs/04-specs/index.md, docs/04-specs/openapi/aptivo-core-v1.yaml
---

## System Message

You are a documentation signal detector for doc-lint, a documentation linter that evaluates architecture documents against concern schemas.

Your task is to analyze project documentation and identify which architectural signals are present. Signals indicate areas of concern (e.g., "authentication", "payments", "rate-limiting") that determine which evaluation rules apply to the project.

You must ONLY return signals from the provided vocabulary. If you identify a concept that does not map to any signal in the vocabulary, include it in the unmappedConcepts field.

Respond with valid JSON matching the response schema exactly. No markdown fences, no commentary — just the JSON object.

## Prompt

# Signal Detection

Analyze the following project documentation and identify which architectural signals are present.

## Signal Vocabulary (93 signals)

- **acceptance-criteria**: acceptance criteria, acceptance test, definition of done, done criteria
- **ai-provider**: llm, language model, model provider, ai gateway
- **alerting**: alerting, alert rule, alert threshold, pagerduty
- **api-keys**: api key, api token, access key, client secret
- **api-versioning**: api versioning, api version, version header, deprecation policy
- **approval-gates**: approval gate, approval workflow, manual approval, sign-off
- **async-api**: asyncapi, async api, event schema, message schema
- **async-workflows**: async workflow, asynchronous workflow, background job, job queue
- **audit**: audit log, audit trail, auditing, audit event
- **authentication**: authentication, login, sign in, signin
- **authorization**: authorization, access control, permission, privilege
- **auto-scaling**: auto-scaling, autoscaling, scale out, scale up
- **availability**: availability, high availability, failover, redundancy
- **backward-compatibility**: backward compatibility, backwards compatible, backward-compatible, migration path
- **batch-processing**: batch processing, batch job, bulk operation, batch import
- **caching**: cache, caching, cache invalidation, cache ttl
- **certificates**: certificate, ssl certificate, tls certificate, cert rotation
- **ci-cd**: ci/cd, continuous integration, continuous delivery, continuous deployment
- **compliance**: compliance, regulatory, regulation, compliance requirement
- **containerization**: docker, container, dockerfile, container image
- **cost-management**: cost attribution, cost center, budget, spending limit
- **credentials**: credential, password, secret key, access token
- **data-migration**: data migration, data transfer, data import, etl
- **data-retention**: data retention, retention policy, retention period, data lifecycle
- **database**: database, sql, nosql, postgres
- **database-migration**: database migration, schema migration, db migration, migration script
- **deployment**: deployment, deploy, release process, rollout
- **distributed**: distributed system, distributed architecture, distributed computing, compute cluster
- **durable-execution**: durable execution, temporal, durable task, workflow engine
- **encryption**: encryption, encrypt, at-rest encryption, in-transit encryption
- **enterprise**: enterprise, enterprise-grade, enterprise feature, enterprise platform
- **error-handling**: error handling, error recovery, exception handling, error boundary
- **event-driven**: event-driven, event sourcing, event bus, event store
- **eventual-consistency**: eventual consistency, eventually consistent, consistency model, read-after-write
- **external-api**: external api, third-party api, external service call, api call
- **external-dependency**: external dependency, third-party dependency, vendor, external service
- **fault-tolerance**: fault tolerance, fault-tolerant, fault recovery, self-healing
- **feature-flags**: feature flag, feature toggle, feature switch, launchdarkly
- **file-upload**: file upload, file storage, upload endpoint, multipart upload
- **gdpr**: gdpr, general data protection, data subject, right to erasure
- **graphql**: graphql, graphql schema, graphql query, graphql mutation
- **high-traffic**: high traffic, high volume, peak load, traffic spike
- **human-in-loop**: human-in-the-loop, human in loop, manual review, human approval
- **iac**: terraform, pulumi, cloudformation, ansible
- **inbound-events**: inbound event, incoming event, event ingestion, event receiver
- **integration**: system integration, api integration, integration point, integration layer
- **jwt**: jwt, json web token, jwt token, jwt verification
- **kubernetes**: kubernetes, k8s, helm, kubectl
- **legacy-system**: legacy system, legacy integration, legacy api, migration from
- **limits**: throttle, limit enforcement, usage limit, request limit
- **load-balancing**: load balancing, load balancer, round robin, request routing
- **logging**: logging, log level, structured logging, log aggregation
- **long-running**: long-running, long running process, background process, scheduled task
- **message-queue**: message queue, message broker, rabbitmq, kafka
- **microservices**: microservice, micro-service, service mesh, service discovery
- **monitoring**: monitoring, health check, metrics dashboard, metrics
- **multi-component**: multi-component, multiple components, component interaction, cross-component
- **multi-region**: multi-region, active-active, active-passive, cross-region failover
- **multi-tenant**: multi-tenant, tenant isolation, tenant, tenancy
- **oauth**: oauth, oauth2, oauth 2.0, authorization code
- **observability**: observability, distributed tracing, opentelemetry, otel
- **orchestration**: orchestration, orchestrator, workflow orchestration, service orchestration
- **payments**: payment, charge, payment transaction, refund
- **performance**: performance, latency, response time, benchmark
- **pii**: pii, personally identifiable, personal data, sensitive data
- **privacy**: privacy, privacy policy, data privacy, privacy by design
- **public-api**: public api, developer api, api documentation, api reference
- **qa**: quality assurance, qa process, test plan, test strategy
- **quotas**: quota, usage quota, resource quota, quota management
- **rate-limiting**: rate limiting, rate limit, throttling, request throttle
- **rbac**: rbac, role-based access, role assignment, permission model
- **requirements-tracing**: requirements tracing, traceability, traceability matrix, requirement mapping
- **resilience**: resilience, resilient, chaos engineering, failure injection
- **resilience-triad**: resilience triad, timeout, circuit breaker, retry pattern
- **rest-api**: rest api, restful, rest endpoint, http api
- **retry-policy**: retry policy, retry, backoff, exponential backoff
- **saga**: saga, saga pattern, compensating transaction, distributed transaction
- **saml**: saml, saml 2.0, saml assertion, saml provider
- **scalability**: scalability, scalable, scale horizontally, scale vertically
- **schema-evolution**: schema evolution, backward compatible event, consumer-driven contract, versioned event
- **secrets**: application secret, secret management, secrets vault, hashicorp vault
- **security**: security, security review, security architecture, threat model
- **sla**: sla, service level agreement, slo, service level objective
- **sso**: sso, single sign on, federated login, identity provider
- **testing**: testing, unit test, integration test, end-to-end test
- **third-party**: third party, vendor integration, external vendor, partner api
- **uptime**: uptime, uptime requirement, availability target, nine nines
- **user-data**: user data, customer data, user information, user profile
- **user-input**: user input, form input, user-provided input, input sanitization
- **validation**: validation, input validation, data validation, schema validation
- **webhooks**: webhook, callback url, event notification, webhook endpoint
- **websocket**: websocket, socket.io, real-time connection, persistent connection
- **workflow-approval**: workflow approval, approval process, approval chain, multi-step approval

## Response Schema

```json
{
  "signals": [
    {
      "id": "<signal-id from vocabulary>",
      "confidence": "high | medium | low",
      "rationale": "<brief explanation of why this signal was detected>"
    }
  ],
  "unmappedConcepts": [
    {
      "concept": "<concept name>",
      "rationale": "<why this concept is relevant but not in the vocabulary>"
    }
  ]
}
```

- **confidence**: "high" = explicit and central to the project, "medium" = mentioned or implied, "low" = tangentially related
- **unmappedConcepts**: concepts you identified in the docs that don't map to any signal in the vocabulary — these help evolve the signal library

## Project Documentation

Read the following files fully before analysis:

- **BRD** (brd): `docs/01-strategy/platform-core-brd.md`
- **FRD** (frd): `docs/02-requirements/platform-core-frd.md`
- **ADD** (add): `docs/03-architecture/platform-core-add.md`
- **RUNBOOK** (runbook): `docs/06-operations/01-runbook.md`
- **TSD** (tsd): `docs/04-specs/index.md`
- **API_SPEC** (api_spec): `docs/04-specs/openapi/aptivo-core-v1.yaml`