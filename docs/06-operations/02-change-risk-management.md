---
id: RUNBOOK-CHANGE-MGMT
title: 6.b Change Management & Risk Mitigation
status: Draft
version: 1.0.0
owner: "@owner"
last_updated: "2026-01-18"
parent: ../03-architecture/platform-core-add.md
---

# 6.b Change Management & Risk Mitigation

Created by: Abe Caymo
Created time: February 18, 2025 5:27 PM
Category: Strategy doc
Last edited by: Document Review Panel
Last updated time: January 15, 2026

# **Change Management & Risk Mitigation**

_Aptivo Agentic Platform_

_v2.0.0 – [January 15, 2026]_

_Aligned with: ADD v2.0.0, TSD v3.0.0, Coding Guidelines v3.0.0, Testing Strategies v2.0.0, Deployment Operations v2.0.0_

---

## **1. Introduction**

### 1.1 Purpose

This document establishes the official framework for managing changes to and mitigating risks for Aptivo. It provides a structured process aligned with modern DevOps practices, ensuring that all modifications are controlled, observable, and strategically aligned while maintaining the velocity benefits of CI/CD and GitOps workflows.

### 1.2 Scope

This framework applies to all changes, including:

- New features and enhancements
- Bug fixes and hotfixes
- Configuration changes
- Infrastructure updates (via GitOps)
- Dependency upgrades
- Security patches

It also covers the identification and management of all technical, operational, security, and business risks related to the system.

### 1.3 Audience

- Project Managers
- Team Leads
- Developers
- QA Engineers
- Site Reliability Engineers (SRE)
- Security Engineers
- Operations Teams
- Business Stakeholders (Management)

### 1.4 Related Documents

- **ADD v2.0.0** - Architecture, RTO < 4h / RPO < 1h targets
- **TSD v3.0.0** - Technical specifications, Result types, RFC 7807 errors
- **Coding Guidelines v3.0.0** - Functional patterns, OpenTelemetry, Zero Trust
- **Testing Strategies v2.0.0** - Tiered coverage, CI/CD security scans
- **Deployment Operations v2.0.0** - K8s, feature flags, incident severity model, GitOps

---

## **2. Change Management Process**

This process governs how all changes to the production system are proposed, approved, and implemented. It is designed to complement the GitOps workflow described in _Deployment Operations v2.0.0_, ensuring stability and clear communication without creating bottlenecks.

### **2.1 Core Principles**

1. **Change-as-Code**: The Pull Request (PR) is the Change Request. All change metadata, approvals, and audit trails are captured in version control.
2. **Automation First**: Automated pipelines validate changes through tests, security scans, and quality gates before human review.
3. **Progressive Delivery**: Feature flags decouple deployment from release, reducing risk without slowing velocity.
4. **Observability-Driven Validation**: Post-deployment validation uses OpenTelemetry metrics and traces, not just manual checks.

### **2.2 Roles & Responsibilities**

| Role                            | Responsibility                                                           | When Involved                |
| ------------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| **Change Author**               | Creates PR with change description, impact assessment, and test evidence | All changes                  |
| **Code Reviewer**               | Reviews code quality, security, and alignment with standards             | All changes                  |
| **Tech Lead**                   | Approves architectural decisions, complex changes                        | Normal/Major changes         |
| **QA Engineer**                 | Validates test coverage, approves test plans                             | Normal/Major changes         |
| **Security Engineer**           | Reviews security implications, approves security-sensitive changes       | Security-impacting changes   |
| **SRE**                         | Validates operational readiness, rollback plans                          | Infrastructure/Major changes |
| **Product Owner**               | Approves business impact, feature flag strategy                          | Feature releases             |
| **Change Advisory Board (CAB)** | Reviews and approves high-risk/architectural changes                     | Major changes only           |

#### CAB Composition

For Major Changes requiring CAB review:

- Technical Lead (Chair)
- Lead QA Engineer
- Security Engineer
- SRE Lead
- Product/Operations Manager
- Affected business department representative (e.g., HR, Finance)

### **2.3 Change Classification**

| Type                 | Definition                                             | Approval Process                                     | Turnaround        |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------- | ----------------- |
| **Standard Change**  | Low-risk, pre-approved change passing all CI/CD checks | Automated + 1 peer approval                          | Minutes to hours  |
| **Normal Change**    | Planned change with moderate risk                      | Automated + Tech Lead + relevant specialist approval | Hours to 1 day    |
| **Major Change**     | High-risk architectural or multi-domain change         | Async CAB review via GitHub Discussion               | 1-3 business days |
| **Emergency Change** | Urgent fix for SEV-1 or SEV-2 incident                 | Expedited: On-call lead approval                     | Immediate         |

#### Standard Change Examples

- Bug fixes with existing test coverage
- Minor UI updates
- Documentation updates
- Dependency patches (no breaking changes)
- Configuration changes behind feature flags

#### Normal Change Examples

- New features (deployed behind feature flags)
- API endpoint additions
- Database schema additions (non-breaking)
- Major dependency upgrades

#### Major Change Examples

- Breaking API changes
- Database migrations with data transformation
- New infrastructure components
- Security model changes
- Cross-module architectural changes

### **2.4 Change-as-Code: The Pull Request Workflow**

The Pull Request serves as the official Change Request Form (CRF). All change metadata is captured in the PR description and labels.

#### PR Template (Change Request)

```markdown
## Change Summary

<!-- Brief description of what this change does -->

## Change Type

<!-- Select one: Standard / Normal / Major / Emergency -->

## Business Justification

<!-- Why is this change needed? Link to ticket/issue -->

## Impact Assessment

- **Modules affected:**
- **Users affected:**
- **Data changes:** Yes / No
- **API changes:** Yes / No (if yes, describe)

## Risk Assessment

- **Risk Level:** Low / Medium / High
- **Rollback Plan:**
- **Feature Flag:** (if applicable)

## Testing Evidence

- [ ] Unit tests pass (coverage meets tiered requirements)
- [ ] Integration tests pass
- [ ] Security scans pass (SAST, SCA, secrets)
- [ ] Manual testing completed (if applicable)

## Deployment Strategy

- [ ] Standard deployment
- [ ] Canary rollout (specify %)
- [ ] Feature flag controlled

## Reviewer Checklist

- [ ] Code follows Coding Guidelines v3.0.0
- [ ] Error handling uses Result types and RFC 7807
- [ ] OpenTelemetry instrumentation included
- [ ] No security vulnerabilities introduced
```

#### Label-Based Classification

| Label                  | Meaning                               |
| ---------------------- | ------------------------------------- |
| `change:standard`      | Standard change, auto-merge eligible  |
| `change:normal`        | Normal change, requires Tech Lead     |
| `change:major`         | Major change, requires CAB review     |
| `change:emergency`     | Emergency hotfix, expedited process   |
| `risk:low`             | Low risk assessment                   |
| `risk:medium`          | Medium risk assessment                |
| `risk:high`            | High risk, additional review required |
| `flag:feature-flagged` | Deployed behind feature flag          |

### **2.5 Standard Change Workflow**

```
Developer creates PR
        │
        ▼
┌─────────────────┐
│  CI/CD Pipeline │ ◄── Automated validation
│  (Automated)    │     - Lint & type check
└────────┬────────┘     - Unit tests (tiered coverage)
         │              - Integration tests
         │              - Security scans (SAST, SCA, secrets)
         ▼              - Container scan (Trivy)
┌─────────────────┐
│  Peer Review    │ ◄── 1+ approval required
│  (Async)        │     - Code quality
└────────┬────────┘     - Standards compliance
         │
         ▼
┌─────────────────┐
│  Merge to main  │ ◄── Auto-merge if approved
│  (GitOps)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ArgoCD Sync    │ ◄── Automatic deployment
│  (Automated)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Validation     │ ◄── OpenTelemetry monitoring
│  (Automated)    │     - Error rate check
└────────┬────────┘     - Latency check
         │              - Auto-rollback if degraded
         ▼
┌─────────────────┐
│  PR Closed      │ ◄── Audit trail complete
│  (Automatic)    │
└─────────────────┘
```

### **2.6 Normal Change Workflow**

Same as Standard Change, with additional gates:

1. **Required Reviewers**: Tech Lead + relevant specialist (QA, Security, SRE)
2. **Feature Flag Requirement**: New features must be deployed behind feature flags
3. **Staged Rollout**: Canary deployment (1% → 10% → 50% → 100%)
4. **Extended Validation**: 15-minute monitoring window post-deployment

### **2.7 Major Change Workflow**

```
RFC Document Created
        │
        ▼
┌─────────────────┐
│  GitHub         │ ◄── Async CAB review
│  Discussion     │     - Architecture review
└────────┬────────┘     - Risk assessment
         │              - 72-hour comment period
         ▼
┌─────────────────┐
│  CAB Decision   │ ◄── Approve / Request Changes / Reject
│  (Async Vote)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Implementation │ ◄── Normal Change workflow
│  (Multiple PRs) │     with additional oversight
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Post-Impl      │ ◄── CAB review of outcomes
│  Review         │
└─────────────────┘
```

#### Major Change RFC Template

```markdown
# RFC: [Change Title]

## Status

<!-- Draft / Under Review / Approved / Rejected / Implemented -->

## Summary

<!-- 2-3 sentence summary -->

## Motivation

<!-- Why is this change needed? Business value? -->

## Detailed Design

<!-- Technical approach, architecture diagrams -->

## Alternatives Considered

<!-- What other approaches were evaluated? -->

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
|      |            |        |            |

## Migration Plan

<!-- How will existing data/users be migrated? -->

## Rollback Plan

<!-- How can this change be reverted if needed? -->

## Security Considerations

<!-- Security implications and mitigations -->

## Timeline

<!-- Estimated implementation phases -->

## Open Questions

<!-- Unresolved decisions -->
```

### **2.8 Emergency Change Workflow**

Emergency Changes respond to active **SEV-1** or **SEV-2** incidents as defined in _Deployment Operations v2.0.0_.

```
SEV-1/SEV-2 Incident Declared
        │
        ▼
┌─────────────────┐
│  Hotfix Branch  │ ◄── Create from main
│  Created        │     hotfix/INCIDENT-ID
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Expedited PR   │ ◄── Minimal approval:
│  Review         │     On-call lead only
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Fast-track     │ ◄── CI checks still run
│  Deployment     │     but don't block
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Incident       │ ◄── Verify fix resolved
│  Validation     │     the incident
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Post-Incident  │ ◄── Blameless review
│  Documentation  │     within 48 hours
└─────────────────┘
```

#### Emergency Change Requirements

- [ ] Incident ticket linked (SEV-1 or SEV-2)
- [ ] On-call lead verbal/chat approval documented
- [ ] Change scoped only to incident resolution
- [ ] Post-deployment validation confirms fix
- [ ] Retroactive CRF created within 24 hours
- [ ] Post-incident review scheduled within 48 hours

### **2.9 Post-Deployment Validation**

All deployments are validated using observability data from OpenTelemetry:

#### Automated Validation Checks

| Metric                | Threshold               | Action on Breach        |
| --------------------- | ----------------------- | ----------------------- |
| HTTP 5xx error rate   | > 1% increase           | Auto-rollback triggered |
| P95 response time     | > 500ms                 | Alert + manual review   |
| Health check failures | Any pod unhealthy 3x    | Auto-rollback triggered |
| New Sentry errors     | New error type detected | Alert to on-call        |

#### Validation Query Example

```promql
# Error rate increase detection
(
  sum(rate(http_requests_total{status=~"5.."}[5m]))
  /
  sum(rate(http_requests_total[5m]))
) > 0.01
```

### **2.10 Change Metrics & KPIs**

Track these metrics to measure change management effectiveness:

| Metric                    | Target                | Measurement                   |
| ------------------------- | --------------------- | ----------------------------- |
| **Lead Time for Changes** | < 24 hours (Standard) | PR creation to production     |
| **Deployment Frequency**  | Multiple per day      | Deployments per week          |
| **Change Failure Rate**   | < 5%                  | Rollbacks / Total deployments |
| **Mean Time to Recovery** | < 1 hour              | Time from failure to rollback |
| **CAB Turnaround**        | < 3 business days     | RFC submission to decision    |

---

## **3. Risk Management Framework**

This framework provides a proactive, data-driven process for identifying, assessing, and mitigating risks to the system. It integrates with the observability stack (OpenTelemetry) and incident management (SEV model) defined in related documents.

### **3.1 Risk Management Principles**

1. **Data-Driven Assessment**: Use observability metrics to inform risk likelihood and impact
2. **Continuous Monitoring**: Risks are monitored in real-time, not just in monthly reviews
3. **Aligned with Incident Model**: Risk impact maps to SEV levels for consistent response
4. **Resilience by Design**: Mitigation strategies leverage technical capabilities (feature flags, auto-rollback)

### **3.2 The Risk Register**

All identified risks are tracked in a centralized Risk Register. This register is:

- Stored as code in the repository (`docs/risk-register.yaml`)
- Linked to OpenTelemetry dashboards for real-time monitoring
- Reviewed weekly in engineering standups
- Formally assessed monthly by leadership

#### Risk Register Schema

```yaml
# docs/risk-register.yaml
risks:
  - id: SEC-001
    title: Third-party API unavailability
    description: A critical third-party API (e.g., payment processor) becomes unavailable
    category: technical # technical | operational | security | business | legal
    likelihood: 3 # 1-5 scale
    impact: 4 # 1-5 scale, mapped to SEV level
    risk_score: 12 # likelihood * impact
    sev_equivalent: SEV-2 # auto-calculated from impact
    mitigation:
      strategy: mitigate
      actions:
        - Implement circuit breaker pattern
        - Configure automatic failover to backup provider
        - Set up SLA monitoring alerts
    owner: tech-lead
    status: mitigated # open | in_progress | mitigated | accepted | closed
    otel_dashboard: https://grafana.aptivo.com/d/api-health
    last_reviewed: 2026-01-15
    created: 2025-06-01
```

### **3.3 Risk Categories**

| Category        | Description                          | Example Risks                                                |
| --------------- | ------------------------------------ | ------------------------------------------------------------ |
| **Technical**   | Technology failures, dependencies    | API outages, database corruption, dependency vulnerabilities |
| **Operational** | Process and operational issues       | Deployment failures, capacity issues, on-call gaps           |
| **Security**    | Security threats and vulnerabilities | Data breaches, zero-day exploits, credential leaks           |
| **Business**    | Business impact risks                | Vendor lock-in, regulatory changes, key person dependency    |
| **Legal**       | Compliance and legal risks           | GDPR violations, contract breaches, IP issues                |

### **3.4 Risk Assessment Matrix**

The Risk Score (Likelihood × Impact) determines priority. Impact levels are aligned with the incident severity model from _Deployment Operations v2.0.0_.

#### Likelihood Scale

| Score | Level          | Description        | Indicator                         |
| ----- | -------------- | ------------------ | --------------------------------- |
| 1     | Rare           | < 1% probability   | Never occurred, unlikely to occur |
| 2     | Unlikely       | 1-10% probability  | Occurred once in similar systems  |
| 3     | Possible       | 10-50% probability | Has occurred occasionally         |
| 4     | Likely         | 50-90% probability | Occurs regularly                  |
| 5     | Almost Certain | > 90% probability  | Expected to occur                 |

#### Impact Scale (Aligned with SEV Model)

| Score | Level         | SEV Equivalent | Description                             | Response Time     |
| ----- | ------------- | -------------- | --------------------------------------- | ----------------- |
| 5     | Catastrophic  | SEV-1          | Complete outage, data loss risk         | 5 minutes         |
| 4     | Major         | SEV-2          | Major degradation, > 50% users affected | 15 minutes        |
| 3     | Moderate      | SEV-3          | Minor degradation, < 50% users affected | 1 hour            |
| 2     | Minor         | SEV-4          | Cosmetic issues, workaround available   | 4 hours           |
| 1     | Insignificant | N/A            | No user impact                          | Next business day |

#### Risk Score Matrix

| Likelihood \ Impact    | Insignificant (1) | Minor (2)  | Moderate (3) | Major (4)    | Catastrophic (5) |
| ---------------------- | ----------------- | ---------- | ------------ | ------------ | ---------------- |
| **Almost Certain (5)** | Medium (5)        | High (10)  | High (15)    | Extreme (20) | Extreme (25)     |
| **Likely (4)**         | Low (4)           | Medium (8) | High (12)    | High (16)    | Extreme (20)     |
| **Possible (3)**       | Low (3)           | Medium (6) | Medium (9)   | High (12)    | High (15)        |
| **Unlikely (2)**       | Low (2)           | Low (4)    | Medium (6)   | Medium (8)   | Medium (10)      |
| **Rare (1)**           | Low (1)           | Low (2)    | Low (3)      | Low (4)      | Medium (5)       |

#### Risk Priority Actions

| Priority    | Score Range | Required Actions                                                |
| ----------- | ----------- | --------------------------------------------------------------- |
| **Extreme** | 20-25       | Immediate escalation to leadership, dedicated mitigation sprint |
| **High**    | 12-16       | Active mitigation required, tracked in weekly standups          |
| **Medium**  | 5-10        | Mitigation planned, tracked in monthly reviews                  |
| **Low**     | 1-4         | Accepted or monitored, reviewed quarterly                       |

### **3.5 Risk Response Strategies**

Modern risk response integrates technical capabilities from the ecosystem:

| Strategy     | Description                 | Technical Implementation                       |
| ------------ | --------------------------- | ---------------------------------------------- |
| **Avoid**    | Eliminate the risk entirely | Remove risky dependency, change architecture   |
| **Mitigate** | Reduce likelihood or impact | Feature flags, circuit breakers, redundancy    |
| **Transfer** | Shift risk to third party   | Insurance, managed services, SLAs with vendors |
| **Accept**   | Acknowledge and monitor     | OpenTelemetry dashboards, alerting             |

#### Technical Mitigation Techniques

| Technique              | Risk Addressed        | Implementation                        |
| ---------------------- | --------------------- | ------------------------------------- |
| **Feature Flags**      | New feature failures  | Deploy behind flag, instant disable   |
| **Canary Deployments** | Bad deployments       | Gradual rollout, automated rollback   |
| **Circuit Breakers**   | Dependency failures   | Auto-disable failing dependencies     |
| **Auto-Rollback**      | Deployment failures   | GitOps revert on health check failure |
| **Rate Limiting**      | Capacity exhaustion   | Traefik rate limits                   |
| **Chaos Engineering**  | Unknown failure modes | Scheduled fault injection tests       |
| **Multi-Region**       | Regional outages      | Active-passive failover               |
| **Backup/Recovery**    | Data loss             | Automated backups, tested recovery    |

### **3.6 Risk Monitoring with OpenTelemetry**

Risks are continuously monitored using the observability stack:

#### Risk-Linked Dashboards

Each risk in the register should link to relevant OpenTelemetry dashboards:

```yaml
# example risk with monitoring
- id: PERF-001
  title: Database connection pool exhaustion
  otel_alerts:
    - name: db_connection_pool_high
      query: |
        pg_stat_activity_count{state="active"}
        /
        pg_settings_max_connections
        > 0.8
      threshold: 80%
      action: Page SRE
  otel_dashboard: https://grafana.aptivo.com/d/database-health
```

#### Risk Metric Examples

```promql
# Third-party API availability (SEC-001)
avg_over_time(
  probe_success{job="api-health-check", target="payment-api"}[1h]
) < 0.99

# Database connection saturation (PERF-001)
pg_stat_activity_count{state="active"} / pg_settings_max_connections > 0.8

# Security vulnerability count (SEC-002)
sum(trivy_vulnerability_count{severity="CRITICAL"}) > 0
```

### **3.7 Risk Review Cadence**

| Review Type   | Frequency           | Participants       | Focus                                |
| ------------- | ------------------- | ------------------ | ------------------------------------ |
| **Real-time** | Continuous          | Automated (alerts) | Metric threshold breaches            |
| **Daily**     | Daily standup       | Engineering team   | Active incident risks                |
| **Weekly**    | Engineering sync    | Tech leads, SRE    | High/Extreme risks status            |
| **Monthly**   | Risk review meeting | Leadership, CAB    | Full register review, trend analysis |
| **Quarterly** | Strategic review    | Executive team     | Risk posture, emerging threats       |

### **3.8 Common Risks Baseline**

Initial risk register for Aptivo:

| ID       | Risk                           | Category    | L   | I   | Score | Mitigation                            |
| -------- | ------------------------------ | ----------- | --- | --- | ----- | ------------------------------------- |
| SEC-001  | Third-party API unavailability | Technical   | 3   | 4   | 12    | Circuit breakers, fallback providers  |
| SEC-002  | Critical CVE in dependency     | Security    | 4   | 4   | 16    | SCA scanning, automated patching      |
| SEC-003  | Data breach via injection      | Security    | 2   | 5   | 10    | Zod validation, parameterized queries |
| OPS-001  | Database failover failure      | Operational | 2   | 5   | 10    | Quarterly DR testing                  |
| OPS-002  | Deployment causes outage       | Operational | 3   | 3   | 9     | Canary deployments, feature flags     |
| BUS-001  | Key person dependency          | Business    | 3   | 3   | 9     | Documentation, cross-training         |
| TECH-001 | Container orchestrator failure | Technical   | 2   | 5   | 10    | Multi-zone deployment                 |
| LEG-001  | GDPR data retention violation  | Legal       | 2   | 4   | 8     | Automated data lifecycle policies     |

---

## **4. Integration with Incident Management**

Change Management and Risk Management integrate with the Incident Management process defined in _Deployment Operations v2.0.0_:

### **4.1 Change → Incident Linkage**

```
Change Deployed
      │
      ├── Success ──────────────────────────▶ Close PR, update metrics
      │
      └── Failure detected (OpenTelemetry)
              │
              ▼
        ┌──────────────┐
        │ Auto-rollback │
        │ triggered     │
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │ Incident     │◄── SEV determined by impact
        │ Created      │
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │ Post-incident │◄── Links back to change PR
        │ Review       │
        └──────────────┘
```

### **4.2 Risk → Incident Prevention**

```
Risk Identified
      │
      ▼
┌──────────────┐
│ Mitigation   │◄── Proactive: reduce likelihood
│ Implemented  │
└──────┬───────┘
       │
       ├── Risk Realized ──────────▶ Incident triggered
       │                            (SEV from risk impact)
       │
       └── Risk Avoided ──────────▶ Risk status: mitigated
```

---

## **5. Governance & Compliance**

### **5.1 Audit Trail Requirements**

All changes maintain a complete audit trail:

| Artifact              | Location       | Retention |
| --------------------- | -------------- | --------- |
| PR history            | GitHub         | Permanent |
| Pipeline logs         | GitHub Actions | 90 days   |
| Deployment logs       | ArgoCD         | 90 days   |
| Approval records      | PR approvals   | Permanent |
| Risk register history | Git commits    | Permanent |
| Incident reports      | Issue tracker  | 7 years   |

### **5.2 Compliance Mapping**

| Requirement           | Control              | Evidence                 |
| --------------------- | -------------------- | ------------------------ |
| Change authorization  | PR approval workflow | GitHub PR approvals      |
| Segregation of duties | Author ≠ Approver    | GitHub branch protection |
| Security testing      | CI/CD security scans | Pipeline logs            |
| Rollback capability   | GitOps revert        | ArgoCD history           |
| Risk assessment       | PR risk labels       | GitHub labels            |
| Incident response     | SEV-based playbooks  | Incident reports         |

### **5.3 Exceptions Process**

When a change cannot follow standard process:

1. Document exception in PR description
2. Obtain explicit approval from Tech Lead AND Security Engineer
3. Create follow-up ticket to address the exception condition
4. Review exception in next CAB meeting

---

## **6. Roles & Responsibilities (RACI Matrix)**

| Task                  | Developer | Tech Lead    | QA    |     Security | SRE          | Product | CAB   |
| --------------------- | --------- | ------------ | ----- | -----------: | ------------ | ------- | ----- |
| Create PR (Standard)  | **R**     | I            | I     |            I | I            | I       | -     |
| Review PR (Standard)  | C         | **A**        | C     |            C | C            | I       | -     |
| Approve PR (Normal)   | C         | **R**, **A** | **R** |            C | C            | I       | -     |
| Review RFC (Major)    | C         | **R**        | C     |        **R** | **R**        | C       | **A** |
| Security review       | C         | C            | I     | **R**, **A** | I            | I       | I     |
| Deployment validation | I         | C            | C     |            I | **R**, **A** | I       | I     |
| Risk identification   | **R**     | **R**        | C     |        **R** | **R**        | C       | I     |
| Risk mitigation       | **R**     | **A**        | C     |        **R** | **R**        | I       | C     |
| Incident response     | C         | **R**        | I     |            C | **R**, **A** | I       | I     |
| Post-incident review  | **R**     | **R**        | C     |            C | **R**        | C       | **A** |

**Legend:**

- **R** = Responsible (does the work)
- **A** = Accountable (final decision maker)
- **C** = Consulted (provides input)
- **I** = Informed (kept updated)

---

## **Revision History**

| Version | Date       | Author                | Changes                                                                                                                                                  |
| ------- | ---------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0.0  | 2025-02-18 | Abe Caymo             | Initial version                                                                                                                                          |
| v1.0.1  | 2025-06-04 | Abe Caymo             | Minor updates                                                                                                                                            |
| v2.0.0  | 2026-01-15 | Document Review Panel | Major rewrite: aligned with GitOps workflow, PR-based governance, SEV-aligned risk model, OpenTelemetry risk monitoring, technical mitigation strategies |
