---
id: SPEC-MKJP625C
title: Deferred Module Interface Contracts
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
---
# Deferred Module Interface Contracts

**Parent:** [04-Technical-Specifications.md](index.md)

---

## 1. Overview

This document defines **TypeScript interface contracts** for modules deferred to Phase 1+ pending Buy vs Build analysis. These contracts establish service boundaries and API shapes without prescribing implementation details.

Per BRD v2.0.0, these modules will undergo evaluation for:
- Total Cost of Ownership (TCO)
- Time-to-market
- Competitive differentiation
- Availability of mature alternatives

---

## 2. Financial & Administrative Module

**FRD Reference:** FA1-FA4

### 2.1 Service Interface

```typescript
/**
 * Financial service interface for accounting, invoicing, payroll, and expenses.
 *
 * Implementation options:
 * - Custom build with PostgreSQL
 * - Integration with QuickBooks/Xero
 * - Open-source: Invoice Ninja, Crater
 */
interface FinancialService {
  // Invoicing (FA1)
  createInvoice(request: CreateInvoiceRequest): Promise<Result<Invoice, FinancialError>>;
  getInvoice(invoiceId: string): Promise<Result<Invoice, NotFoundError>>;
  listInvoices(filters: InvoiceFilters): Promise<Result<PaginatedResult<Invoice>, FinancialError>>;
  sendInvoice(invoiceId: string): Promise<Result<void, FinancialError>>;
  recordPayment(invoiceId: string, payment: PaymentRecord): Promise<Result<Invoice, FinancialError>>;

  // Payroll (FA2)
  createPayrollRun(request: CreatePayrollRunRequest): Promise<Result<PayrollRun, FinancialError>>;
  getPayrollRun(runId: string): Promise<Result<PayrollRun, NotFoundError>>;
  approvePayrollRun(runId: string, approverId: string): Promise<Result<PayrollRun, FinancialError>>;
  processPayrollRun(runId: string): Promise<Result<PayrollRun, FinancialError>>;

  // Expenses (FA3)
  submitExpense(request: SubmitExpenseRequest): Promise<Result<Expense, FinancialError>>;
  approveExpense(expenseId: string, approverId: string): Promise<Result<Expense, FinancialError>>;
  rejectExpense(expenseId: string, reason: string): Promise<Result<Expense, FinancialError>>;
  listExpenses(filters: ExpenseFilters): Promise<Result<PaginatedResult<Expense>, FinancialError>>;

  // Budgeting (FA4)
  createBudget(request: CreateBudgetRequest): Promise<Result<Budget, FinancialError>>;
  getBudgetStatus(budgetId: string): Promise<Result<BudgetStatus, NotFoundError>>;
  trackExpenseAgainstBudget(expenseId: string, budgetId: string): Promise<Result<void, FinancialError>>;
}
```

### 2.2 Domain Types

```typescript
// Invoice types
interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'void';
  issueDate: Date;
  dueDate: Date;
  lineItems: InvoiceLineItem[];
  subtotal: Money;
  taxAmount: Money;
  totalAmount: Money;
  currency: string;
  notes?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: Money;
  taxRate?: number;
  amount: Money;
}

interface Money {
  amount: string;  // decimal string for precision
  currency: string;
}

// Payroll types
interface PayrollRun {
  id: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  status: 'draft' | 'pending_approval' | 'approved' | 'processing' | 'completed' | 'failed';
  employeeCount: number;
  totalGrossPay: Money;
  totalDeductions: Money;
  totalNetPay: Money;
  approvedBy?: string;
  approvedAt?: Date;
  processedAt?: Date;
  createdAt: Date;
}

// Expense types
interface Expense {
  id: string;
  submittedById: string;
  status: 'pending' | 'approved' | 'rejected' | 'reimbursed';
  category: string;
  amount: Money;
  description: string;
  receiptFileId?: string;
  submittedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
}

// Budget types
interface Budget {
  id: string;
  name: string;
  period: { start: Date; end: Date };
  totalAmount: Money;
  allocations: BudgetAllocation[];
  createdAt: Date;
}

interface BudgetAllocation {
  category: string;
  amount: Money;
  spent: Money;
}

interface BudgetStatus {
  budget: Budget;
  totalSpent: Money;
  remainingAmount: Money;
  utilizationPercentage: number;
  allocationStatus: Array<{
    category: string;
    allocated: Money;
    spent: Money;
    remaining: Money;
  }>;
}
```

### 2.3 Error Types

```typescript
type FinancialError =
  | ValidationError
  | NotFoundError
  | PersistenceError
  | { _tag: 'InsufficientFunds'; available: Money; required: Money }
  | { _tag: 'InvalidAmount'; amount: string; reason: string }
  | { _tag: 'PaymentFailed'; gateway: string; reason: string }
  | { _tag: 'TaxCalculationError'; jurisdiction: string; reason: string }
  | { _tag: 'AccountingPeriodClosed'; period: string }
  | { _tag: 'DuplicateInvoice'; invoiceNumber: string }
  | { _tag: 'PayrollLocked'; runId: string; reason: string }
  | { _tag: 'ApprovalRequired'; action: string; threshold: Money };
```

---

## 3. Ticketing & Support Module

**FRD Reference:** CT1-CT5

### 3.1 Service Interface

```typescript
/**
 * Ticketing service interface for internal support and client communication.
 *
 * Implementation options:
 * - Integration with Zammad (open-source)
 * - Integration with osTicket (open-source)
 * - Integration with Freshdesk/Zendesk (SaaS)
 */
interface TicketingService {
  // Ticket CRUD (CT1)
  createTicket(request: CreateTicketRequest): Promise<Result<Ticket, TicketingError>>;
  getTicket(ticketId: string): Promise<Result<Ticket, NotFoundError>>;
  updateTicket(ticketId: string, update: UpdateTicketRequest): Promise<Result<Ticket, TicketingError>>;
  listTickets(filters: TicketFilters): Promise<Result<PaginatedResult<Ticket>, TicketingError>>;

  // Assignment & Routing (CT2)
  assignTicket(ticketId: string, assigneeId: string): Promise<Result<Ticket, TicketingError>>;
  routeTicket(ticketId: string, departmentId: string): Promise<Result<Ticket, TicketingError>>;
  escalateTicket(ticketId: string, reason: string): Promise<Result<Ticket, TicketingError>>;

  // Communication (CT3)
  addComment(ticketId: string, comment: TicketComment): Promise<Result<Ticket, TicketingError>>;
  addInternalNote(ticketId: string, note: string): Promise<Result<Ticket, TicketingError>>;

  // SLA Management (CT4)
  getSlaStatus(ticketId: string): Promise<Result<SlaStatus, NotFoundError>>;
  pauseSla(ticketId: string, reason: string): Promise<Result<void, TicketingError>>;
  resumeSla(ticketId: string): Promise<Result<void, TicketingError>>;

  // Entity Linking (CT5)
  linkToEntity(ticketId: string, entityType: EntityType, entityId: string): Promise<Result<void, TicketingError>>;
  getTicketsByEntity(entityType: EntityType, entityId: string): Promise<Result<Ticket[], TicketingError>>;
}
```

### 3.2 Domain Types

```typescript
type EntityType = 'candidate' | 'client' | 'employee' | 'contract' | 'invoice';

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  requesterId: string;
  assigneeId?: string;
  departmentId?: string;
  linkedEntities: LinkedEntity[];
  comments: TicketComment[];
  internalNotes: string[];
  sla?: SlaConfig;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  closedAt?: Date;
}

interface LinkedEntity {
  entityType: EntityType;
  entityId: string;
  linkedAt: Date;
}

interface TicketComment {
  id: string;
  authorId: string;
  content: string;
  isPublic: boolean;
  attachments?: string[];
  createdAt: Date;
}

interface SlaConfig {
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
}

interface SlaStatus {
  ticketId: string;
  responseDeadline: Date;
  resolutionDeadline: Date;
  responseBreached: boolean;
  resolutionBreached: boolean;
  pausedAt?: Date;
  pauseReason?: string;
}
```

### 3.3 Error Types

```typescript
type TicketingError =
  | ValidationError
  | NotFoundError
  | PersistenceError
  | { _tag: 'TicketClosed'; ticketId: string }
  | { _tag: 'InvalidAssignment'; assigneeId: string; reason: string }
  | { _tag: 'SlaAlreadyBreached'; ticketId: string; slaType: 'response' | 'resolution' }
  | { _tag: 'InvalidEntityLink'; entityType: string; entityId: string };
```

---

## 4. Project Management Module

**FRD Reference:** PM1-PM3

### 4.1 Service Interface

```typescript
/**
 * Project management service interface for tracking recruitment projects and tasks.
 *
 * Implementation options:
 * - Integration with OpenProject (open-source)
 * - Integration with Plane (open-source)
 * - Custom lightweight implementation
 */
interface ProjectManagementService {
  // Projects (PM1)
  createProject(request: CreateProjectRequest): Promise<Result<Project, PMError>>;
  getProject(projectId: string): Promise<Result<Project, NotFoundError>>;
  updateProject(projectId: string, update: UpdateProjectRequest): Promise<Result<Project, PMError>>;
  listProjects(filters: ProjectFilters): Promise<Result<PaginatedResult<Project>, PMError>>;

  // Tasks (PM2)
  createTask(projectId: string, request: CreateTaskRequest): Promise<Result<Task, PMError>>;
  getTask(taskId: string): Promise<Result<Task, NotFoundError>>;
  updateTask(taskId: string, update: UpdateTaskRequest): Promise<Result<Task, PMError>>;
  assignTask(taskId: string, assigneeId: string): Promise<Result<Task, PMError>>;
  completeTask(taskId: string): Promise<Result<Task, PMError>>;

  // Time Tracking (PM3)
  logTime(taskId: string, entry: TimeEntry): Promise<Result<TimeEntry, PMError>>;
  getTimeEntries(taskId: string): Promise<Result<TimeEntry[], PMError>>;
  getProjectTimeReport(projectId: string, period: DateRange): Promise<Result<TimeReport, PMError>>;
}
```

### 4.2 Domain Types

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  clientId?: string;
  managerId: string;
  memberIds: string[];
  startDate?: Date;
  targetEndDate?: Date;
  actualEndDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface Task {
  id: string;
  projectId: string;
  parentTaskId?: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  assigneeId?: string;
  dueDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

interface TimeEntry {
  id: string;
  taskId: string;
  userId: string;
  date: Date;
  hours: number;
  description?: string;
  createdAt: Date;
}

interface TimeReport {
  projectId: string;
  period: DateRange;
  totalHours: number;
  byUser: Array<{ userId: string; hours: number }>;
  byTask: Array<{ taskId: string; hours: number }>;
}

interface DateRange {
  start: Date;
  end: Date;
}
```

---

## 5. CRM Module

**FRD Reference:** CRM1-CRM4

### 5.1 Service Interface

```typescript
/**
 * CRM service interface for client relationship management.
 *
 * Implementation options:
 * - Integration with SuiteCRM (open-source)
 * - Integration with Twenty CRM (open-source)
 * - Integration with HubSpot/Salesforce (SaaS)
 */
interface CrmService {
  // Client Management (CRM1)
  createClient(request: CreateClientRequest): Promise<Result<Client, CrmError>>;
  getClient(clientId: string): Promise<Result<Client, NotFoundError>>;
  updateClient(clientId: string, update: UpdateClientRequest): Promise<Result<Client, CrmError>>;
  listClients(filters: ClientFilters): Promise<Result<PaginatedResult<Client>, CrmError>>;

  // Contact Management (CRM2)
  createContact(clientId: string, request: CreateContactRequest): Promise<Result<Contact, CrmError>>;
  getContact(contactId: string): Promise<Result<Contact, NotFoundError>>;
  updateContact(contactId: string, update: UpdateContactRequest): Promise<Result<Contact, CrmError>>;
  listContacts(clientId: string): Promise<Result<Contact[], CrmError>>;

  // Interaction Tracking (CRM3)
  logInteraction(clientId: string, interaction: Interaction): Promise<Result<Interaction, CrmError>>;
  getInteractionHistory(clientId: string, filters?: InteractionFilters): Promise<Result<Interaction[], CrmError>>;

  // Pipeline Management (CRM4)
  createOpportunity(request: CreateOpportunityRequest): Promise<Result<Opportunity, CrmError>>;
  updateOpportunityStage(opportunityId: string, stage: string): Promise<Result<Opportunity, CrmError>>;
  getPipelineOverview(): Promise<Result<PipelineOverview, CrmError>>;
}
```

### 5.2 Domain Types

```typescript
interface Client {
  id: string;
  companyName: string;
  industry?: string;
  website?: string;
  status: 'prospect' | 'active' | 'inactive' | 'churned';
  tier: 'standard' | 'premium' | 'enterprise';
  primaryContactId?: string;
  accountManagerId?: string;
  billingAddress?: Address;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Contact {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface Interaction {
  id: string;
  clientId: string;
  contactId?: string;
  type: 'call' | 'email' | 'meeting' | 'note';
  subject: string;
  description?: string;
  outcome?: string;
  scheduledAt?: Date;
  completedAt?: Date;
  createdById: string;
  createdAt: Date;
}

interface Opportunity {
  id: string;
  clientId: string;
  name: string;
  value: Money;
  stage: string;
  probability: number;
  expectedCloseDate?: Date;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  wonLost?: 'won' | 'lost';
}

interface PipelineOverview {
  stages: Array<{
    name: string;
    opportunityCount: number;
    totalValue: Money;
  }>;
  totalPipelineValue: Money;
  weightedPipelineValue: Money;
}

interface Address {
  street: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}
```

---

## 6. Integration Points

### 6.1 Event Subscriptions

When implemented, these modules should subscribe to relevant domain events:

| Module | Subscribes To | Purpose |
|--------|--------------|---------|
| Financial | `aptivo.contract.signed` | Auto-create payroll record |
| Financial | `aptivo.candidate.hired` | Link to employee payroll |
| Ticketing | `aptivo.candidate.created` | Auto-create onboarding ticket |
| Ticketing | `aptivo.contract.sent` | Auto-create follow-up ticket |
| CRM | `aptivo.candidate.hired` | Update client placement count |
| PM | `aptivo.workflow.triggered` | Create task from workflow |

### 6.2 Published Events

| Module | Publishes | Consumers |
|--------|-----------|-----------|
| Financial | `aptivo.invoice.paid` | Analytics, Notifications |
| Financial | `aptivo.payroll.processed` | Notifications |
| Ticketing | `aptivo.ticket.sla-breached` | Notifications, Escalation |
| CRM | `aptivo.opportunity.won` | Analytics, Notifications |

---

## 7. Evaluation Criteria

When selecting Build vs Buy for each module:

| Criterion | Weight | Evaluation Questions |
|-----------|--------|---------------------|
| TCO | 30% | 5-year cost including maintenance, hosting, support? |
| Time-to-market | 25% | Can we deploy within 3 months? |
| Customization | 20% | Does it support our specific workflows? |
| Integration | 15% | API quality? Event support? |
| Vendor risk | 10% | Open-source viability? Vendor stability? |
