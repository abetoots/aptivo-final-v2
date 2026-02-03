---
id: BRD-MKJP625C
title: 1. Business Requirement Document
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
---
# 1. Business Requirement Document

Created by: Abe Caymo
Created time: February 18, 2025 1:33 PM
Category: Strategy doc
Last edited by: Abe Caymo
Last updated time: June 2, 2025 11:16 AM

# Business Requirements Document (BRD)

Business requirements define the high-level "why" and "what" of a project, outlining the overall business goals and objectives. It should use plain language as much as possible.

**Outsourcing Digital Agency – Integrated Internal Systems Ecosystem**

*v2.0.0 – [01/14/2026]*

> **Revision History (v2.0.0):** Multi-model document review conducted (Gemini 3 Pro Preview, Gemini 2.5 Pro, Codex MCP). Consensus: 5.3/10 - document required significant revision. Changes applied: Added Implementation Strategy section with Build vs Buy framework, restructured scope into Core Domain vs Foundational Integrations, defined phased MVP approach, added module-level success metrics, reframed technical prescriptions as business capabilities, added compliance specificity and organizational readiness requirements. Scope creep items migrated to FRD/ADD.

---

## 1. Executive Summary

This document outlines the strategic business requirements for an integrated internal systems ecosystem for our outsourcing digital agency in the Philippines. The core of our strategy is to excel in talent and candidate management while developing a powerful suite of internal tools. These tools are designed not only to maximize our own operational efficiency but also to create new revenue streams. We envision a flexible technology platform that can be extended as a commercial Software-as-a-Service (SaaS) offering to other organizations and can provide functionalities for future AI-driven services.

The unified ecosystem will encompass several key business functions, including Candidate Management, Financial & Administrative Management, File Storage & Collaboration, Security & IT Management, Customer Support & Ticketing, Project Management, Workflow Automation, and CRM. The primary goal is to build a scalable foundation that supports long-term growth, enhances client and candidate satisfaction, and positions our agency as a technology-forward leader in the outsourcing industry.

---

## 2. Business Objectives

Objectives should be specific and measurable goals (SMART goals).

### 2.1 Agency Objectives

- **Increase Client Market Share in the Philippines:**
    - **Objective:** Capture 15% of the enterprise-level outsourcing market in the Philippines within three years of system launch by targeting established companies.
    - **Why:** Established companies typically have defined outsourcing needs, robust budgets, and demand reliable, scalable solutions with comprehensive support. By focusing on these clients, our agency can secure long-term partnerships and position itself as a trusted provider of customized, compliant outsourcing solutions.
- **Develop Scalable Internal Tools for Future SaaS and AI Services:**
    - **Objective:** Build a modular, integrated ecosystem that can support future commercialization as SaaS products and enable programmatic access for AI-driven automation.
    - **Why:** This strategic direction not only enhances our internal efficiency but also opens new revenue streams by monetizing our solutions and AI capabilities.
    - **Constraint:** Internal operational efficiency is the primary goal for Phase 1. SaaS commercialization requirements will be detailed in a separate planning phase (see Section 2.1.1).

### 2.1.1 Long-Term Commercialization Strategy (Deferred)

The business objective of offering the platform as a commercial SaaS product is acknowledged but explicitly **deferred to Phase 2**. The rationale:

- Internal tools optimized for trusted users differ architecturally from multi-tenant SaaS products requiring public-facing security, billing, metering, and customer support at scale.
- Attempting to design for both simultaneously risks delivering a system that serves neither well.
- Phase 1 will build a well-structured internal platform with stable interfaces that *could later* serve as a foundation for commercialization.

**Phase 2 SaaS requirements** (to be defined in a future dedicated planning effort) will include:
- Market analysis and target segments
- Multi-tenancy and data isolation requirements
- Pricing, billing, and metering capabilities
- Customer onboarding and support models
- Public API documentation and developer experience

### 2.2 Client Objectives

- **Enhanced Process Visibility and Control:**
    - **Objective:** Provide clients with a shared, intuitive dashboard offering real-time updates on candidate pipelines, project status, support ticket progress, and financial operations.
    - **Why:** Clients need either active control or high-level oversight—some prefer to directly adjust workflows and engage deeply, while others want to delegate operations yet retain transparency for critical decisions such as interviews and contract approvals.
- **Operational Efficiency & Compliance:**
    - **Objective:** Automate routine processes (e.g., interview scheduling, contract approval, payroll processing) to reduce administrative burdens and ensure compliance with local labor laws and data protection standards.
    - **Why:** This reduces time-to-hire, minimizes errors, and lowers costs, thereby increasing client satisfaction and trust in our solutions.

### 2.3 Candidate Objectives

- **Increase Retention and Happiness Within 2 Years:**
    - **Objective:** Achieve a 90% candidate retention rate and a candidate satisfaction score of 4.5/5 within two years of the new system's launch.
    - **Why:** A positive candidate experience leads to higher engagement, improved retention, and a stronger employer brand—critical for attracting top talent in a competitive market.

---

## 3. Project Scope

### 3.1 Implementation Strategy: Build vs Buy Framework

Before committing to development, each capability must undergo a **Build vs Buy analysis** evaluating:
- Total Cost of Ownership (TCO) including maintenance and security burden
- Time-to-market and opportunity cost
- Competitive differentiation value
- Availability of mature open-source or commercial alternatives

The following classification reflects the review panel's consensus recommendations:

### 3.2 Core Domain (Custom Build) — MVP Phase 1

These capabilities represent the agency's unique value proposition and justify custom development:

- **Candidate Management System:**

    – Centralized repository for candidate data with customizable workflows, interview scheduling, and modular contract drafting that supports flexible employment terms and compliance.
    – *Success Metric:* Reduce time-to-hire by 25% within 12 months of launch.

- **Workflow Automation Engine:**

    – A system to automate business processes across modules, such as triggering notifications, updating statuses, and enforcing SLAs.
    – *Success Metric:* Automate 60% of routine HR administrative tasks within 12 months.

### 3.3 Required Foundational Integrations (Buy/Integrate)

These are commoditized, high-risk domains where custom solutions offer no competitive advantage. The business requirement is for the *capability*, not a custom-built system:

- **Identity & Access Management:**

    – Secure, role-based access control with support for enterprise SSO. Access to sensitive data must be granted based on user role and context, ensuring no user or system is implicitly trusted (Zero Trust posture).
    – *Implementation Note:* The technical solution will involve integrating with a dedicated identity provider, to be selected during the technical design phase.

- **File Storage & Document Management:**

    – A unified, secure repository for all agency records (resumes, contracts, invoices) with access controls and linking to business entities.
    – *Implementation Note:* The technical solution will integrate with a centralized, secure object storage system, to be selected during the technical design phase.

### 3.4 Buy vs Build Analysis Required (Phase 1+ or Deferred)

For these modules, a formal analysis must be conducted before any development commitment:

- **Financial & Administrative Management:**

    – Comprehensive accounting, invoicing, payroll processing, and expense tracking.
    – *Analysis Required:* Evaluate integration with existing accounting software vs custom build.
    – *Success Metric:* Reduce payroll processing cycle time by 30%.

- **Customer Support & Ticketing:**

    – A system for capturing, categorizing, and tracking support requests with automated routing and SLA monitoring.
    – *Analysis Required:* Evaluate open-source ticketing solutions vs a custom build.
    – *Success Metric:* Achieve 95% SLA compliance rate.

- **Project Management:**

    – A system for tracking project tasks, timelines, and deliverables across the agency.
    – *Analysis Required:* Evaluate integration with existing tools vs custom build.
    – *Success Metric:* Increase on-time project delivery rate by 20%.

- **CRM:**

    – A tool to manage client relationships, track communications, and store leads with integrated follow-up workflows.
    – *Analysis Required:* Evaluate open-source CRM solutions vs custom build.
    – *Success Metric:* Increase client cross-sell rate by 10%.

### 3.5 Cross-Cutting Business Requirements

- **System Interoperability:** The system must support integration with third-party tools and allow for the automation of cross-module business processes. *(Technical implementation deferred to ADD)*

- **AI-Enablement Foundation:** All workflows must emit standardized event logs accessible programmatically to enable future AI-driven observation, learning, and automation. *(Technical implementation deferred to ADD)*

- **Data Governance:** Machine-readable data structures with strict data privacy tagging (PII segregation) to ensure AI services and integrations do not inadvertently expose sensitive candidate or client data.
    

### 3.6 Phased Rollout

**Phase 1: MVP — Internal Operational Efficiency** (Primary Focus)
- Candidate Management System (Core Domain)
- Workflow Automation Engine (Core Domain)
- Identity & Access Management (Integration)
- File Storage & Document Management (Integration)
- *Exit Criteria:* Core hiring workflows operational, 25% reduction in time-to-hire demonstrated

**Phase 1+: Expansion Based on Buy vs Build Analysis**
- Financial & Administrative Management
- Customer Support & Ticketing
- Project Management
- CRM
- *Gate:* Buy vs Build analysis complete for each module before commitment

**Phase 2: Commercialization** (Deferred — See Section 2.1.1)
- Multi-tenant architecture implementation
- External SaaS product requirements
- *Gate:* Phase 1 stable and delivering measurable ROI

**Future Phases:**
- Advanced Analytics & Reporting: Real-time data visualization and predictive analytics for deeper business insights.
- AI Agent Services: Exposing platform capabilities for AI-driven automation (requires stable Phase 1 APIs).

---

## 4. Stakeholder Analysis

- **Agency Leadership:**
    
    – Oversees strategic direction, market expansion, and new service offerings (SaaS and AI agents).
    
- **HR & Recruitment Teams:**
    
    – Primary users of the Candidate Management and CRM modules; responsible for ensuring compliance with local hiring practices.
    
- **Finance & Administration Teams:**
    
    – Use the Financial & Administrative Management Module for payroll, invoicing, and expense tracking.
    
- **IT & Security Teams:**
    
    – Manage system security, integrations, and ensure overall compliance with data protection regulations.
    
- **Project Management Teams:**
    
    – Utilize the Project Management and Workflow Automation modules to track tasks and ensure timely delivery.
    
- **Customer Support Teams:**
    
    – Rely on the Ticketing Module to manage and resolve client issues efficiently.
    
- **Candidates:**
    
    – Benefit from streamlined, transparent interview processes and flexible contract terms.
    
- **Clients:**
    
    – Require comprehensive dashboards and reports for visibility, control, and oversight over the hiring and support processes.
    

---

## 5. Assumptions & Constraints

### Assumptions

- The candidate management system will initially focus on the Philippine market.
- In-house technical expertise is available for building and customizing the Core Domain modules (Candidate Management, Workflow Automation). **This assumption requires validation through a skills gap analysis before project commitment.**
- Stakeholders are aligned with the phased approach: internal efficiency first (Phase 1), commercialization deferred (Phase 2).
- For modules requiring Buy vs Build analysis, mature open-source alternatives exist that can meet business requirements.

### Constraints

- Budget limitations favor cost-effective solutions. The Buy vs Build framework (Section 3.1) will guide procurement decisions balancing upfront cost against Total Cost of Ownership.
- **Regulatory Compliance (Mandatory):** The system must adhere to:
    - Philippine Data Privacy Act of 2012 (RA 10173)
    - Department of Labor and Employment (DOLE) regulations
    - Bureau of Internal Revenue (BIR) tax compliance requirements
    - GDPR (if EU citizen data is processed)
- Integration with existing self-hosted tools must be seamless and should not disrupt current operations. **A complete inventory of existing tools requiring integration is a prerequisite for technical design.**
- Deployment model will be determined during technical design, with preference for approaches that support the deferred SaaS commercialization goal without requiring complete re-architecture.

### Organizational Readiness Requirements

- **Change Management:** A change management plan including training budget, change champions, and adoption metrics must be established before Phase 1 launch.
- **Talent Readiness:** If skills gaps are identified in the prerequisite analysis, vendor partnerships or hiring plans must be in place.
- **Risk Register:** A risk register capturing capability gaps, compliance exposure, and budget sensitivity must be maintained throughout the project lifecycle.

---

## 6. Next Steps / Open Questions

### Prerequisite Actions (Before Technical Design)

1. **Skills Gap Analysis:** Validate the assumption that in-house expertise exists for Core Domain development. Document gaps and mitigation plans.
2. **Existing Tools Inventory:** Complete inventory of current self-hosted tools requiring integration, including their APIs and data formats.
3. **Buy vs Build Analysis:** Conduct formal analysis for Financial, Ticketing, Project Management, and CRM modules.

### Open Questions

- **Integration Prioritization:** Which external integrations are essential for Phase 1 MVP deployment?
- **Baseline Metrics:** What are current time-to-hire, candidate retention, and satisfaction baselines to measure against success metrics?
- **Stakeholder Validation:** Obtain sign-off from HR, Finance, IT, and client representatives on the phased approach and success metrics.

---

## 7. Conclusion

This BRD outlines our strategic vision and business requirements for an integrated internal systems ecosystem tailored for our outsourcing digital agency. Following a comprehensive multi-model document review, the approach has been refined to:

1. **Focus on Core Domain:** Prioritize custom development on Candidate Management and Workflow Automation—the agency's unique value proposition.
2. **Integrate Commodities:** Leverage existing solutions for Identity Management and File Storage rather than building from scratch.
3. **Apply Rigor to Remaining Modules:** Conduct formal Buy vs Build analysis before committing to Financial, Ticketing, Project Management, or CRM development.
4. **Phase the Approach:** Deliver internal operational efficiency first (Phase 1), with SaaS commercialization deferred to Phase 2.

This revised approach reduces project risk, accelerates time-to-value, and positions the agency for sustainable growth. By validating assumptions, inventorying dependencies, and applying disciplined scope management, we aim to deliver a platform that meets the needs of our agency, our clients, and our candidates while maintaining a credible path to future commercialization.
