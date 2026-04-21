/**
 * FA3-01: Department budgeting types.
 */

// ---------------------------------------------------------------------------
// records
// ---------------------------------------------------------------------------

export interface DepartmentRecord {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetConfig {
  monthlyLimitUsd: number;
  warningThreshold: number; // 0..1, default 0.90
  blockOnExceed: boolean;
  notifyOnWarning: boolean;
}

export interface SpendReport {
  totalUsd: number;
  rowCount: number;
  /**
   * Signals whether any stamped rows were attributed to this department.
   *
   *   - 'none' — no stamped rows for this department in the window.
   *              In S16 this is the universal answer because
   *              department-ID stamping middleware is S17 work.
   *   - 'full' — at least one stamped row exists for this department.
   *              Does NOT mean every request in the window is stamped
   *              (we can't prove that without a reliable per-request
   *              attribution source); it does mean attribution IS
   *              happening for this department.
   *
   * Pre-commit review caught that distinguishing 'partial' from 'full'
   * at the row level is not actually achievable — we can't look at an
   * unstamped row and say "this should have belonged to department X."
   * The binary signal "this department has stamped rows or doesn't" is
   * the honest answer. If operators need totals across all stamped
   * traffic vs total traffic (to prove no attribution gaps), that's a
   * separate system-level metric, not a per-department one.
   */
  coverageLevel: 'none' | 'full';
}

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export type DepartmentBudgetError =
  | { readonly _tag: 'DepartmentNotFound'; readonly id: string }
  /** the department exists but has no budget config yet */
  | { readonly _tag: 'BudgetNotConfigured'; readonly id: string }
  | { readonly _tag: 'MonthlyBudgetExceeded'; readonly remaining: 0; readonly limitUsd: number; readonly currentSpendUsd: number }
  | { readonly _tag: 'BudgetConfigInvalid'; readonly issues: readonly string[] }
  | { readonly _tag: 'PersistenceError'; readonly cause: unknown };

// ---------------------------------------------------------------------------
// store interface (DB-decoupled so the service unit-tests with an in-memory impl)
// ---------------------------------------------------------------------------

export interface DepartmentBudgetStore {
  createDepartment(input: { name: string; ownerUserId: string }): Promise<DepartmentRecord>;
  findDepartmentById(id: string): Promise<DepartmentRecord | null>;
  listDepartments(): Promise<DepartmentRecord[]>;

  getBudget(departmentId: string): Promise<BudgetConfig | null>;
  setBudget(departmentId: string, config: BudgetConfig): Promise<void>;

  /**
   * Aggregates `llm_usage_logs` filtered by departmentId + time range.
   * Must return `{ totalUsd, rowCount }` with rowCount counting ONLY
   * rows that carried the stamped departmentId. The store must also
   * return `unstampedRowCount` — rows within the window that would have
   * qualified but lack a departmentId — so the service can decide the
   * coverageLevel.
   */
  aggregateSpend(params: {
    departmentId: string;
    from: Date;
    to: Date;
  }): Promise<{ totalUsd: number; rowCount: number; unstampedRowCount: number }>;
}
