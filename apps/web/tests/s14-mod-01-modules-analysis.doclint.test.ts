// @testtype doc-lint — validates documentation structure, not code behavior
/**
 * S14-MOD-01: Deferred Modules Buy/Build Analysis — document verification
 * @task MOD-01
 *
 * verifies the analysis document exists and contains all required sections.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const DOC_PATH = resolve(__dirname, '../../../docs/06-sprints/phase-2-modules-analysis.md');

describe('MOD-01: phase-2-modules-analysis.md', () => {
  it('document file exists', () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const content = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, 'utf-8') : '';

  // -- required top-level sections --

  it('has title header', () => {
    expect(content).toContain('# Phase 2: Deferred Modules');
  });

  it('has module categories section', () => {
    expect(content).toContain('## 1. Module Categories');
  });

  it('has summary decision matrix section', () => {
    expect(content).toContain('## 2. Summary Decision Matrix');
  });

  it('has phase 3 implementation sequence section', () => {
    expect(content).toContain('## 3. Phase 3 Implementation Sequence');
  });

  it('has interface contracts section', () => {
    expect(content).toContain('## 4. Interface Contracts');
  });

  // -- required category subsections --

  it('has financial & admin category', () => {
    expect(content).toContain('### 1.1 Financial & Admin (FA)');
  });

  it('has case tracking category', () => {
    expect(content).toContain('### 1.2 Case Tracking (CT)');
  });

  it('has project management category', () => {
    expect(content).toContain('### 1.3 Project Management (PM)');
  });

  it('has CRM category', () => {
    expect(content).toContain('### 1.4 CRM');
  });

  // -- required module entries --

  it('contains FA-1 through FA-4 modules', () => {
    expect(content).toContain('FA-1: Invoicing');
    expect(content).toContain('FA-2: Payroll');
    expect(content).toContain('FA-3: Expense Management');
    expect(content).toContain('FA-4: Budgeting');
  });

  it('contains CT-1 through CT-5 modules', () => {
    expect(content).toContain('CT-1: Ticket CRUD');
    expect(content).toContain('CT-2: SLA Tracking');
    expect(content).toContain('CT-3: Escalation');
    expect(content).toContain('CT-4: Reporting');
    expect(content).toContain('CT-5: Customer Portal');
  });

  it('contains PM-1 through PM-3 modules', () => {
    expect(content).toContain('PM-1: Task Management');
    expect(content).toContain('PM-2: Time Tracking');
    expect(content).toContain('PM-3: Resource Planning');
  });

  it('contains CRM-1 through CRM-4 modules', () => {
    expect(content).toContain('CRM-1: Contact Management');
    expect(content).toContain('CRM-2: Pipeline');
    expect(content).toContain('CRM-3: Activity Log');
    expect(content).toContain('CRM-4: Reporting');
  });

  // -- decision types present --

  it('contains Buy, Build, and Defer recommendations', () => {
    expect(content).toContain('**Buy**');
    expect(content).toContain('**Build**');
    expect(content).toContain('**Defer**');
  });

  // -- summary totals --

  it('summary matrix has correct totals', () => {
    expect(content).toContain('**16**');
    expect(content).toContain('**9**');
    expect(content).toContain('**5**');
    expect(content).toContain('**2**');
  });

  // -- interface contracts --

  it('defines TicketStore interface', () => {
    expect(content).toContain('TicketStore');
    expect(content).toContain('TicketStatus');
  });

  it('defines DepartmentBudgetService interface', () => {
    expect(content).toContain('DepartmentBudgetService');
    expect(content).toContain('checkBudget');
    expect(content).toContain('getSpendReport');
  });

  // -- rationale present for each category --

  it('has rationale for each category', () => {
    // each category subsection should have a **Rationale** line
    const rationaleCount = (content.match(/\*\*Rationale\*\*/g) || []).length;
    expect(rationaleCount).toBeGreaterThanOrEqual(4);
  });
});
