# Phase 2: Deferred Modules — Buy vs Build Analysis

**Date**: 2026-03-17
**Sprint**: 14 (Phase 2 Delivery)
**Purpose**: Decision matrix for modules deferred from Phase 1 scope to guide Phase 3 implementation planning

---

## 1. Module Categories

### 1.1 Financial & Admin (FA)

| Module | Description | Buy Options | Build Estimate | Recommendation |
|--------|-------------|-------------|----------------|----------------|
| FA-1: Invoicing | Invoice generation + tracking | Stripe Billing, Wave | 8 SP | **Buy** (Stripe Billing) |
| FA-2: Payroll | Salary calculation + disbursement | Gusto API, Deel | 13 SP | **Buy** (Deel API) |
| FA-3: Expense Management | Receipt capture + approval | Expensify API, Ramp | 8 SP | **Buy** (Expensify) |
| FA-4: Budgeting | Department budget tracking | Custom | 5 SP | **Build** (leverages existing LLM usage tracking) |

**Rationale**: Financial operations require regulatory compliance (tax calculation, reporting). Buy is strongly preferred for FA-1/2/3. FA-4 budgeting can reuse the existing budget service pattern.

### 1.2 Case Tracking (CT)

| Module | Description | Buy Options | Build Estimate | Recommendation |
|--------|-------------|-------------|----------------|----------------|
| CT-1: Ticket CRUD | Create/read/update/delete tickets | Linear API, Jira API | 5 SP | **Build** (simple CRUD, aligns with workflow engine) |
| CT-2: SLA Tracking | Response/resolution time monitoring | Built-in to Linear/Jira | 3 SP | **Build** (leverages existing SLO/burn-rate infra) |
| CT-3: Escalation | Auto-escalation on SLA breach | Custom | 3 SP | **Build** (leverages HITL sequential chains) |
| CT-4: Reporting | Ticket volume + resolution metrics | Custom | 3 SP | **Build** (leverages metric service) |
| CT-5: Customer Portal | Self-service ticket submission | Custom | 8 SP | **Defer** to Phase 4 |

**Rationale**: Case tracking is core to the workflow platform. Building in-house leverages existing HITL escalation, SLO monitoring, and metric infrastructure. CT-5 (customer portal) requires UI framework decisions.

### 1.3 Project Management (PM)

| Module | Description | Buy Options | Build Estimate | Recommendation |
|--------|-------------|-------------|----------------|----------------|
| PM-1: Task Management | Tasks with assignments + deadlines | Asana API, Monday API | 5 SP | **Buy** (Asana API) |
| PM-2: Time Tracking | Hours logged per task/project | Harvest API, Toggl | 3 SP | **Buy** (Toggl API) |
| PM-3: Resource Planning | Team capacity + allocation | Custom | 8 SP | **Defer** to Phase 4 |

**Rationale**: PM tools are mature commodity. Buy for PM-1/2. PM-3 (resource planning) is complex and domain-specific — defer.

### 1.4 CRM

| Module | Description | Buy Options | Build Estimate | Recommendation |
|--------|-------------|-------------|----------------|----------------|
| CRM-1: Contact Management | Company/contact database | HubSpot API, Salesforce | 5 SP | **Buy** (HubSpot free tier) |
| CRM-2: Pipeline | Deal stages + forecasting | HubSpot, Pipedrive | 5 SP | **Buy** (same vendor as CRM-1) |
| CRM-3: Activity Log | Interactions + timeline | Built-in to CRM platform | 0 SP | **Buy** (bundled) |
| CRM-4: Reporting | Revenue + conversion metrics | Built-in or custom | 3 SP | **Buy** (CRM built-in) |

**Rationale**: CRM is not a differentiator. Buy across the board from a single vendor (HubSpot) to avoid integration fragmentation.

---

## 2. Summary Decision Matrix

| Category | Total Modules | Buy | Build | Defer |
|----------|--------------|-----|-------|-------|
| Financial & Admin | 4 | 3 | 1 | 0 |
| Case Tracking | 5 | 0 | 4 | 1 |
| Project Management | 3 | 2 | 0 | 1 |
| CRM | 4 | 4 | 0 | 0 |
| **Total** | **16** | **9** | **5** | **2** |

---

## 3. Phase 3 Implementation Sequence

| Priority | Module | Type | SP (est.) | Dependencies |
|----------|--------|------|-----------|-------------|
| 1 | CT-1: Ticket CRUD | Build | 5 | Workflow definition API (FEAT-01) |
| 2 | CT-2: SLA Tracking | Build | 3 | CT-1, burn-rate alerting (OBS-01) |
| 3 | CT-3: Escalation | Build | 3 | CT-2, HITL sequential chains (HITL2-04) |
| 4 | FA-4: Budgeting | Build | 5 | LLM budget service |
| 5 | CT-4: Reporting | Build | 3 | CT-1, metric service |
| 6 | FA-1: Invoicing (Buy) | Integrate | 3 | Stripe Billing API |
| 7 | CRM-1/2/3/4 (Buy) | Integrate | 5 | HubSpot API |
| 8 | PM-1/2 (Buy) | Integrate | 3 | Asana + Toggl APIs |

**Total Phase 3 estimated**: ~30 SP (3 sprints)

---

## 4. Interface Contracts (Top Priority)

### CT-1: Ticket CRUD Interface
```typescript
interface TicketStore {
  create(ticket: CreateTicketInput): Promise<Ticket>;
  findById(id: string): Promise<Ticket | null>;
  list(filters: TicketFilters): Promise<Ticket[]>;
  update(id: string, data: Partial<Ticket>): Promise<Ticket | null>;
  updateStatus(id: string, status: TicketStatus): Promise<void>;
}

type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
```

### FA-4: Budget Service Interface
```typescript
interface DepartmentBudgetService {
  setBudget(departmentId: string, budget: BudgetConfig): Promise<void>;
  checkBudget(departmentId: string, amount: number): Promise<{ allowed: boolean; remaining: number }>;
  getSpendReport(departmentId: string, period: DateRange): Promise<SpendReport>;
}
```
