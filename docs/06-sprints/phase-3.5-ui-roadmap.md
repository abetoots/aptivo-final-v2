---
id: PHASE-3-5-UI-ROADMAP
title: Phase 3.5 UI/UX Roadmap
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-04-20'
parent: ./phase-3-roadmap.md
---

# Phase 3.5 Roadmap: UI/UX Delivery

**Timeline**: 12 weeks (6 sprints × 2 weeks, Sprints 20-25) — runs **after** Phase 3 backend completion
**Team**: 3 engineers + **1 contract product designer** (Phase 3.5 duration minimum)
**Goal**: Turn the Phase 3 API-complete platform into a usable product
**Derived from**: [Phase 3 Roadmap](./phase-3-roadmap.md) UI descope decision (2026-04-20)
**Status**: Explicitly separated from Phase 3 — **prevent scope collapse back into engineering sprints**

---

## 1. Why This Is Its Own Phase

Phase 3 as currently scoped (sprints 15-19) delivers production deployment, LLM safety v2, domain workflows, case tracking APIs, and buy integrations. As of 2026-04-20 the **entire UI layer is descoped** from Phase 3 for these reasons:

1. **Different iteration rhythm** — backend ships when tests pass; UI ships when users can complete their task. Trying to run both in one sprint either compresses design to "whatever the engineer ships first" or slips the whole sprint.
2. **Quality surfaces are orthogonal to features** — accessibility, i18n, responsive, keyboard nav, screen readers, dark mode, empty/error/loading states. These are cross-cutting and need **systemic** solutions, not per-feature rework.
3. **Design system is foundational** — Phase 3 would ship N features against a 3-component design system (`button`, `card`, `code`). Every feature would reinvent modals, forms, tables. Tech debt accelerates.
4. **UX research is strategy-level** — 4 HR personas, 3 crypto personas, and admin/operator personas each need journey mapping. This is upstream of implementation, not inside it.

## 2. Current UI State (Baseline)

| Surface | State |
|---------|-------|
| Root, layout | `apps/web/src/app/{page,layout}.tsx` stubs |
| HITL approval screen | `apps/web/src/app/hitl/[requestId]/` — only functional user-facing UI |
| Admin dashboard | 1 page (`/admin`) + 1 deep link (`/admin/llm-usage`) for **7 admin endpoints** |
| Design system (`packages/ui`) | 3 components: `button`, `card`, `code` |
| HR domain UI | **none** (APIs exist for candidates, interviews, contracts, consent) |
| Crypto domain UI | **none** (APIs exist for signals, positions, security scans) |
| Case tracking UI | **none** (Phase 3 ships APIs only) |
| Workflow visual builder UI | **none** (foundation scaffolding only; canvas not built) |
| MFA + auth UX | minimal (Supabase defaults; no custom enrollment/recovery flow) |
| Consent withdrawal UI | **none** (API only) |
| Accessibility posture | no a11y testing configured; no WCAG target declared |
| i18n posture | none — all strings English-hardcoded; HR domain will need Filipino/Tagalog for local users |

## 3. Phase 3.5 Scope

### 3.1 Foundation Track (must precede any feature UI)

| Work | Owner | SP | Output |
|------|-------|-----|--------|
| **F-1. Designer engagement** | Admin | 0 (contracting) | Contract product designer for 12-week Phase 3.5. Criteria: fintech/SaaS experience, a11y-aware, works in Figma + hands off tokens. |
| **F-2. UX Discovery** | Designer + Senior | 10 | Persona interviews (3-5 per persona), journey maps for HR/Crypto/Case-Tracking/Admin, information architecture per domain. Output: personas doc + journeys folder + IA diagrams. |
| **F-3. Design Language** | Designer | 5 | Color tokens (light + dark), typography scale, spacing (4px base), icon set (Lucide or custom), motion primitives. Output: Figma design library + Tailwind config. |
| **F-4. Design System v1** | Engineer + Designer | 20 | Build 20-30 core primitives in `packages/ui`: Button, Input, Select, Checkbox, Radio, Switch, TextArea, Form, Label, Modal, Drawer, Toast, Table, Pagination, Tabs, Breadcrumb, Card, Badge, Avatar, EmptyState, ErrorBoundary, Skeleton, Spinner, Tooltip, Popover, Dropdown, Accordion, Stepper. Each component: Storybook story + axe-core a11y test + dark-mode variant + keyboard interaction test. Base on Radix UI primitives + Tailwind for speed. |
| **F-5. A11y Baseline** | Engineer | 8 | Axe-core in CI (blocks merge on new violations), keyboard-nav test harness, screen-reader smoke test setup (NVDA/VoiceOver). Target: WCAG 2.2 AA for all new UI. Publish `accessibility.md` guideline. |
| **F-6. i18n Foundation** | Engineer | 5 | next-intl (or equivalent), message catalog structure, English default, Filipino/Tagalog stub for HR compliance screens. Locale switcher in user settings. |
| **F-7. Analytics Instrumentation** | Engineer | 3 | Product analytics (PostHog or Plausible), event taxonomy (per-persona tasks), funnel tracking for onboarding/approval flows. |

**Foundation total: 51 SP.** Runs in Sprints 20-22 largely in parallel between designer (F-2, F-3) and engineers (F-4, F-5, F-6, F-7).

### 3.2 Feature UI Track

Screens-to-build, roughly grouped by domain:

| Epic | Surfaces | SP | Depends on |
|------|----------|-----|-----------|
| **UI-A. Admin & Operator Dashboard** | `/admin` home + dedicated screens for audit log viewer, HITL queue monitor, LLM usage + budget, approval SLA dashboard, feature flags admin, platform health. Merges 7 API endpoints into a cohesive operator console. | 10 | F-1..F-5 |
| **UI-B. HR Domain — 4 personas** | Candidate submission (external), recruiter candidate pipeline + interview scheduler + contract drafting, recruiting-coordinator scheduling view, hiring-manager approval inbox, client-user read-only portal. Consent preferences screen. | 18 | F-2, F-4 |
| **UI-C. Crypto Domain — 3 personas** | Trader signal inbox, position monitor, security scan report viewer, risk-manager override console, trader-readonly dashboard. Trade approval HITL polish. | 14 | F-2, F-4 |
| **UI-D. Case Tracking module UI** | Ticket CRUD screens (list, detail, edit, comment), SLA dashboard (consumes Epic 4 API), escalation view, reporting charts. Greenfield domain — high design leverage. | 12 | Phase 3 E4 API complete |
| **UI-E. Workflow Visual Builder** | Drag-drop canvas with node graph editor, step palette, connection validation feedback, cycle/unreachable detection UX, visual diff for workflow edits. The marquee Phase-3.5 feature. | 15 | Phase 3 E3 graph-validation API |
| **UI-F. Real-Time WebSocket UI** | Live workflow status (running/paused/failed), collaboration cursors, approval notifications push, crypto price/signal tickers. | 6 | UI-E + WebSocket server from Phase 3 |
| **UI-G. Auth & Identity Flows** | MFA enrollment wizard, WebAuthn/Passkey registration UX, SSO provider picker, session management screen, break-glass admin fallback UI. | 6 | F-4 |
| **UI-H. Compliance & Comms UX** | Consent withdrawal flow (DPA RA 10173 compliance), notification preferences (email/push/SMS opt-ins), privacy dashboard (data export request, account deletion), communications preference center. | 5 | Phase 3 E7 API complete |

**Feature total: 86 SP.**

### 3.3 Phase 3.5 Totals

| Track | SP |
|-------|-----|
| Foundation | 51 |
| Feature UI | 86 |
| **Total** | **137** |

**Effort note**: 137 SP over 6 sprints ≈ 23 SP/sprint for 3 engineers + 1 designer. Realistic if foundation work is frontloaded and feature UI uses the design system cleanly. Slipping foundation causes feature UI to absorb the cost — **do not skip F-4 (design system)**.

## 4. Sprint Overview

| Sprint | Weeks | SP | Theme |
|--------|-------|-----|-------|
| 20 | 1-2 | 23 | **Discovery + Language** — F-2 UX discovery, F-3 design language, start F-4 design system. No feature UI. |
| 21 | 3-4 | 23 | **Design System Core** — finish F-4, start F-5 a11y baseline. Begin UI-A admin console shell. |
| 22 | 5-6 | 23 | **Foundation Completion** — F-6 i18n, F-7 analytics. UI-A admin dashboard screens shipped. |
| 23 | 7-8 | 23 | **Domain UI Wave 1** — UI-B HR core screens (candidate + interview), UI-C crypto core (signals + positions), UI-G auth flows. |
| 24 | 9-10 | 22 | **Domain UI Wave 2** — UI-B HR contract/consent, UI-C crypto risk console, UI-D case tracking tickets + SLA. |
| 25 | 11-12 | 23 | **Workflow Builder + Polish** — UI-E visual builder, UI-F real-time, UI-H compliance. Accessibility + i18n audit pass. |
| **Total** | **12 wk** | **137** | |

## 5. Persona Inventory (to be validated in F-2)

### HR personas
| Persona | Primary task | Key screens |
|---------|-------------|-------------|
| Recruiter | Move candidates through pipeline | Candidate list, kanban board, interview scheduler, contract drafting |
| Recruiting Coordinator | Schedule interviews, view candidates | Read-only candidate view, calendar-centric scheduling |
| Hiring Manager | Approve offers + contracts | Approval inbox, decision log, candidate summary |
| Client User | See assigned candidates | Read-only pipeline, report exports |

### Crypto personas
| Persona | Primary task | Key screens |
|---------|-------------|-------------|
| Trader | Review signals, approve trades | Signal inbox, position dashboard, security scan report |
| Risk Manager | Override signals, review exposure | Override console, exposure dashboard, audit trail |
| Trader Readonly | Monitor without executing | Read-only signal/position view |

### Platform/Admin personas
| Persona | Primary task | Key screens |
|---------|-------------|-------------|
| Platform Admin | Monitor system health, review audits | Admin dashboard, audit viewer, SLA monitor |
| On-Call Operator | Triage incidents | HITL queue, workflow failure inspector, runbook console |
| Compliance Officer | Export audit, handle DSAR | Audit export, consent log, data deletion console |

## 6. Design System Specifics (F-4)

Stack recommendation:
- **Base**: Tailwind CSS + Radix UI primitives (unstyled, a11y-correct)
- **Tokens**: CSS custom properties generated from Figma variables
- **Documentation**: Storybook 8+ with Chromatic for visual regression
- **Test harness**: Vitest + Testing Library + axe-core per component
- **Icons**: Lucide React (permissive license, 1000+ icons)
- **Forms**: React Hook Form + Zod (already in the stack for API validation — reuse)
- **Tables**: TanStack Table (headless, a11y-friendly)
- **Charts**: Recharts or Visx (for SLA dashboard, LLM usage, case-tracking reports)

**Do not skip**: Every primitive gets a Storybook story, a11y test, dark-mode variant, keyboard-interaction test, and documented `displayName`. This is the difference between a design system and a component folder.

## 7. Accessibility & Compliance

### Targets
- **WCAG 2.2 AA** for all new UI — enforced in CI via axe-core
- **Keyboard navigation** — every interactive element reachable without mouse
- **Screen-reader tested** — smoke-test with NVDA (Windows) and VoiceOver (macOS) on golden paths
- **Color contrast** — ≥ 4.5:1 for body text, ≥ 3:1 for large text/UI components
- **Focus visible** — no `outline: none` without replacement focus indicator

### Why this matters for Aptivo
- **HR domain** handles PII of job candidates in the Philippines → DPA RA 10173 compliance implies accessibility for applicants with disabilities
- **Enterprise sales** to agencies → buyers increasingly require WCAG AA compliance in RFPs
- **Defensive** — retrofitting accessibility costs ~5-10x more than baking it in

## 8. i18n Strategy (F-6)

**Phase 3.5**: English (primary) + Filipino/Tagalog (HR compliance screens + candidate-facing flows).

Why: HR users in Manila are often bilingual; candidate-facing screens (application form, consent withdrawal) should be in the user's language for DPA compliance clarity.

Non-goals for Phase 3.5: full Crypto domain localization (traders work in English conventionally), non-LTR scripts, RTL languages.

## 9. Analytics (F-7)

Event taxonomy must support:
- **Funnel tracking** per persona (application submitted → acknowledged → interviewed → offered → contracted)
- **Task completion rates** per screen
- **Time-on-task** for workflow builder usage
- **Error rates** per form (identifies UX friction)

Tool: PostHog (self-hosted feasible, free tier generous) or Plausible (privacy-respecting, simpler). Decision in F-7.

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Designer hiring delays | Medium | High | Start contracting now (pre-Phase-3 completion); fallback: hands-on product manager with design instincts |
| F-4 design system under-scoped | Medium | High | Hard-enforce 30-component target before any feature UI; no "I'll just make a custom Dropdown" exceptions |
| UI scope creeps back into Phase 3 engineering sprints | High | High | **This doc**. Plus explicit descope notes in Phase 3 roadmap. Plus MEMORY.md entry so future sessions remember. |
| Accessibility deferred under schedule pressure | High | Medium | Axe-core blocks merge from sprint 20; make accessibility non-negotiable rather than a late-sprint polish item |
| i18n retrofitted is expensive | Medium | Medium | Foundation in sprint 22 (mid-phase) before heavy screen builds; all strings go through message catalog from that point |
| Visual workflow builder complexity | High | High | Spike in sprint 22 to validate canvas library choice (React Flow vs TLDraw vs custom); keep scope to DAG editing, not free-form canvas |

## 11. Success Metrics

| Metric | Target |
|--------|--------|
| WCAG 2.2 AA violations (axe) | 0 on merge |
| Design system coverage | ≥ 80% of screen components use `packages/ui` primitives |
| Persona coverage | All 10 personas have at least one functional screen |
| i18n readiness | 100% of user-facing strings in message catalog (no hardcoded English) |
| Analytics funnels | 4 primary funnels instrumented (one per persona group) |
| Storybook stories | ≥ 1 per design-system component |
| Lighthouse scores | LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms on key screens |

## 12. Non-Goals (Phase 4+)

- Mobile-native apps (React Native or Swift/Kotlin) — Phase 4
- Full RTL support (Arabic/Hebrew) — Phase 4+
- Advanced animations/transitions beyond F-3 motion primitives — Phase 4
- Customer-facing marketing site — separate workstream
- White-labeling / multi-brand theming — Phase 4+
- Offline-first PWA capabilities — Phase 4+

## 13. Hand-Off from Phase 3

Phase 3 closes with backend APIs complete. Phase 3.5 inherits:
- **Stable API contracts** (OpenAPI spec locked at v1.2.0 + admin additions + WebSocket spec)
- **Event schemas** for WebSocket real-time updates
- **Production infrastructure** operational (from Phase 3 Epic 1)
- **ML safety classifiers** operational (from Phase 3 Epic 2) — informs UX copy for blocked prompts/responses
- **Feature flags** operational — enables UI gradual rollout per persona

Phase 3.5 does **not** touch backend except in rare cases where an API contract change is forced by UX discovery (track as Phase 3.5 → Phase 3 bug-fix PRs, not in-scope additions).

## 14. When This Plan Succeeds

Phase 3.5 exit criteria:
- Every persona can complete their primary task without engineering assistance
- Axe-core CI passes on all routes
- Storybook has every component documented
- One round of user feedback incorporated per persona
- Analytics shows funnel completion data for 2+ weeks
- Lighthouse budgets met on golden paths

That's the point at which Aptivo transitions from "API-complete platform" to "product shippable to a pilot agency customer."
