/**
 * FA3-01: DepartmentBudgetService tests — wires the factory to an
 * in-memory store so the unit tests cover all the policy logic without
 * needing a real DB.
 */

import { describe, it, expect, vi } from 'vitest';
import { createDepartmentBudgetService } from '../src/department-budget-service.js';
import type {
  BudgetConfig,
  DepartmentBudgetStore,
  DepartmentRecord,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// in-memory store
// ---------------------------------------------------------------------------

function createMemoryStore(): DepartmentBudgetStore & {
  _setSpend(departmentId: string, spend: { totalUsd: number; rowCount: number; unstampedRowCount: number }): void;
} {
  const departments = new Map<string, DepartmentRecord>();
  const budgets = new Map<string, BudgetConfig>();
  const spends = new Map<string, { totalUsd: number; rowCount: number; unstampedRowCount: number }>();
  let idCounter = 0;

  return {
    async createDepartment({ name, ownerUserId }) {
      idCounter += 1;
      const id = `dept-${idCounter}`;
      const now = new Date();
      const record: DepartmentRecord = { id, name, ownerUserId, createdAt: now, updatedAt: now };
      departments.set(id, record);
      return record;
    },
    async findDepartmentById(id) {
      return departments.get(id) ?? null;
    },
    async listDepartments() {
      return [...departments.values()];
    },
    async getBudget(departmentId) {
      return budgets.get(departmentId) ?? null;
    },
    async setBudget(departmentId, config) {
      budgets.set(departmentId, config);
    },
    async aggregateSpend({ departmentId }) {
      return spends.get(departmentId) ?? { totalUsd: 0, rowCount: 0, unstampedRowCount: 0 };
    },
    _setSpend(departmentId, spend) {
      spends.set(departmentId, spend);
    },
  };
}

// ---------------------------------------------------------------------------
// createDepartment + findDepartment + listDepartments
// ---------------------------------------------------------------------------

describe('FA3-01: createDepartment / findDepartment / listDepartments', () => {
  it('creates and retrieves a department', async () => {
    const store = createMemoryStore();
    const svc = createDepartmentBudgetService({ store });
    const created = await svc.createDepartment({ name: 'Engineering', ownerUserId: 'user-1' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const found = await svc.findDepartment(created.value.id);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.name).toBe('Engineering');
  });

  it('rejects empty name with BudgetConfigInvalid', async () => {
    const svc = createDepartmentBudgetService({ store: createMemoryStore() });
    const result = await svc.createDepartment({ name: '   ', ownerUserId: 'user-1' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('BudgetConfigInvalid');
  });

  it('returns DepartmentNotFound for unknown id', async () => {
    const svc = createDepartmentBudgetService({ store: createMemoryStore() });
    const result = await svc.findDepartment('nope');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DepartmentNotFound');
  });
});

// ---------------------------------------------------------------------------
// setBudget + getBudget
// ---------------------------------------------------------------------------

describe('FA3-01: setBudget + getBudget', () => {
  it('stores and reads back a valid config', async () => {
    const store = createMemoryStore();
    const svc = createDepartmentBudgetService({ store });
    const dept = await svc.createDepartment({ name: 'HR', ownerUserId: 'u' });
    if (!dept.ok) throw new Error('setup failed');

    const config: BudgetConfig = {
      monthlyLimitUsd: 1000,
      warningThreshold: 0.9,
      blockOnExceed: true,
      notifyOnWarning: true,
    };
    expect((await svc.setBudget(dept.value.id, config)).ok).toBe(true);
    const got = await svc.getBudget(dept.value.id);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value.monthlyLimitUsd).toBe(1000);
  });

  it('rejects zero / negative monthly limit', async () => {
    const svc = createDepartmentBudgetService({ store: createMemoryStore() });
    const dept = await svc.createDepartment({ name: 'X', ownerUserId: 'u' });
    if (!dept.ok) throw new Error('setup failed');
    const result = await svc.setBudget(dept.value.id, {
      monthlyLimitUsd: 0,
      warningThreshold: 0.9,
      blockOnExceed: true,
      notifyOnWarning: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('BudgetConfigInvalid');
  });

  it('rejects warning threshold out of (0, 1] range', async () => {
    const svc = createDepartmentBudgetService({ store: createMemoryStore() });
    const dept = await svc.createDepartment({ name: 'X', ownerUserId: 'u' });
    if (!dept.ok) throw new Error('setup failed');
    for (const bad of [-0.1, 0, 1.5]) {
      const result = await svc.setBudget(dept.value.id, {
        monthlyLimitUsd: 100,
        warningThreshold: bad,
        blockOnExceed: true,
        notifyOnWarning: false,
      });
      expect(result.ok).toBe(false);
    }
  });

  it('setBudget on a non-existent department returns DepartmentNotFound', async () => {
    const svc = createDepartmentBudgetService({ store: createMemoryStore() });
    const result = await svc.setBudget('ghost', {
      monthlyLimitUsd: 100,
      warningThreshold: 0.9,
      blockOnExceed: true,
      notifyOnWarning: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DepartmentNotFound');
  });
});

// ---------------------------------------------------------------------------
// checkBudget
// ---------------------------------------------------------------------------

describe('FA3-01: checkBudget', () => {
  async function setupWith(config: Partial<BudgetConfig> = {}) {
    const store = createMemoryStore();
    const svc = createDepartmentBudgetService({ store });
    const dept = await svc.createDepartment({ name: 'D', ownerUserId: 'u' });
    if (!dept.ok) throw new Error('setup failed');
    await svc.setBudget(dept.value.id, {
      monthlyLimitUsd: 1000,
      warningThreshold: 0.9,
      blockOnExceed: true,
      notifyOnWarning: false,
      ...config,
    });
    return { svc, store, deptId: dept.value.id };
  }

  it('returns { allowed: true, remaining: <limit - spend> } when under limit', async () => {
    const { svc, store, deptId } = await setupWith();
    store._setSpend(deptId, { totalUsd: 200, rowCount: 5, unstampedRowCount: 0 });
    const result = await svc.checkBudget(deptId, 50);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.allowed).toBe(true);
    expect(result.value.remaining).toBe(800);
  });

  it('returns MonthlyBudgetExceeded when projected spend exceeds limit + blockOnExceed', async () => {
    const { svc, store, deptId } = await setupWith({ blockOnExceed: true });
    store._setSpend(deptId, { totalUsd: 950, rowCount: 10, unstampedRowCount: 0 });
    const result = await svc.checkBudget(deptId, 100);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('MonthlyBudgetExceeded');
    if (result.error._tag !== 'MonthlyBudgetExceeded') return;
    expect(result.error.limitUsd).toBe(1000);
    expect(result.error.currentSpendUsd).toBe(950);
  });

  it('soft-exceed (blockOnExceed: false) allows spend over limit but logs warn', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const store = createMemoryStore();
    const svc = createDepartmentBudgetService({ store, logger });
    const dept = await svc.createDepartment({ name: 'D', ownerUserId: 'u' });
    if (!dept.ok) throw new Error('setup failed');
    await svc.setBudget(dept.value.id, {
      monthlyLimitUsd: 100,
      warningThreshold: 0.9,
      blockOnExceed: false,
      notifyOnWarning: false,
    });
    store._setSpend(dept.value.id, { totalUsd: 99, rowCount: 1, unstampedRowCount: 0 });
    const result = await svc.checkBudget(dept.value.id, 20);
    expect(result.ok).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('department_budget_soft_exceed'),
      expect.any(Object),
    );
  });

  it('returns DepartmentNotFound for an unknown department', async () => {
    const svc = createDepartmentBudgetService({ store: createMemoryStore() });
    const result = await svc.checkBudget('ghost', 10);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DepartmentNotFound');
  });
});

// ---------------------------------------------------------------------------
// getSpendReport + coverageLevel
// ---------------------------------------------------------------------------

describe('FA3-01: getSpendReport + binary coverageLevel signal', () => {
  it("returns coverageLevel 'none' when this department has no stamped rows (S16 default state)", async () => {
    const store = createMemoryStore();
    const svc = createDepartmentBudgetService({ store });
    const dept = await svc.createDepartment({ name: 'D', ownerUserId: 'u' });
    if (!dept.ok) throw new Error('setup failed');
    const result = await svc.getSpendReport(dept.value.id, { from: new Date(0), to: new Date() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.coverageLevel).toBe('none');
    expect(result.value.totalUsd).toBe(0);
  });

  it("returns coverageLevel 'full' when at least one stamped row exists for this department", async () => {
    // pre-commit review simplified coverageLevel to a binary signal —
    // 'partial' was misleading because unstamped rows can't be
    // attributed to specific departments.
    const store = createMemoryStore();
    const svc = createDepartmentBudgetService({ store });
    const dept = await svc.createDepartment({ name: 'D', ownerUserId: 'u' });
    if (!dept.ok) throw new Error('setup failed');
    store._setSpend(dept.value.id, { totalUsd: 50, rowCount: 10, unstampedRowCount: 0 });
    const result = await svc.getSpendReport(dept.value.id, { from: new Date(0), to: new Date() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.coverageLevel).toBe('full');
    expect(result.value.totalUsd).toBe(50);
  });

  it('returns DepartmentNotFound for an unknown department', async () => {
    const svc = createDepartmentBudgetService({ store: createMemoryStore() });
    const result = await svc.getSpendReport('ghost', { from: new Date(0), to: new Date() });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DepartmentNotFound');
  });
});

// ---------------------------------------------------------------------------
// S18-B3: threshold-crossing callbacks
// ---------------------------------------------------------------------------

describe('S18-B3: checkBudget threshold callbacks', () => {
  async function setup(opts: {
    spendUsd: number;
    limitUsd: number;
    warningThreshold?: number;
    blockOnExceed?: boolean;
  }) {
    const store = createMemoryStore();
    const onWarningCrossed = vi.fn(async () => undefined);
    const onExceeded = vi.fn(async () => undefined);
    const svc = createDepartmentBudgetService({
      store,
      onWarningCrossed,
      onExceeded,
    });
    const dept = await svc.createDepartment({ name: 'D', ownerUserId: 'u' });
    if (!dept.ok) throw new Error('setup failed');
    await svc.setBudget(dept.value.id, {
      monthlyLimitUsd: opts.limitUsd,
      warningThreshold: opts.warningThreshold ?? 0.8,
      blockOnExceed: opts.blockOnExceed ?? true,
      notifyOnWarning: true,
    });
    store._setSpend(dept.value.id, { totalUsd: opts.spendUsd, rowCount: 5, unstampedRowCount: 0 });
    return { svc, deptId: dept.value.id, onWarningCrossed, onExceeded };
  }

  // utility: wait for fire-and-forget callbacks to settle (they use
  // void deps.onX(...).catch(...); a microtask flush is enough)
  const flush = () => new Promise((r) => setImmediate(r));

  it('fires onWarningCrossed with PROJECTED spend (post-this-request) when threshold crossed', async () => {
    // post-R1: callback receives projected (800) not pre-request spend (500).
    // Earlier draft passed spend.totalUsd which made messages misleading
    // ("spent $500" when actually crossing into 80% with this request).
    const { svc, deptId, onWarningCrossed, onExceeded } = await setup({
      spendUsd: 500,
      limitUsd: 1000,
      warningThreshold: 0.8,
    });

    const result = await svc.checkBudget(deptId, 300); // 500+300=800 = warning
    await flush();

    expect(result.ok).toBe(true);
    expect(onWarningCrossed).toHaveBeenCalledTimes(1);
    expect(onWarningCrossed).toHaveBeenCalledWith(expect.objectContaining({
      deptId,
      deptName: 'D',
      currentSpendUsd: 800, // POST-request value (Codex R1 fix)
      limitUsd: 1000,
    }));
    expect(onExceeded).not.toHaveBeenCalled();
  });

  it('fires onExceeded ONLY when projected spend strictly exceeds the limit (not at exact cap)', async () => {
    // post-R1: exact-cap (projected === limit) does NOT fire onExceeded
    // because the verdict only blocks at projected > limit. Earlier
    // draft used >= and would fire EXCEEDED notification + HITL chain
    // for requests that were actually allowed (Codex R1 finding).
    const { svc, deptId, onExceeded } = await setup({
      spendUsd: 800,
      limitUsd: 1000,
    });

    // 800 + 200 = 1000 = limit exactly → NOT exceeded
    const exact = await svc.checkBudget(deptId, 200);
    await flush();
    expect(exact.ok).toBe(true);
    expect(onExceeded).not.toHaveBeenCalled();

    // 800 + 300 = 1100 > 1000 → exceeded
    const over = await svc.checkBudget(deptId, 300, { requestedBy: { userId: 'user-7' } });
    await flush();
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.error._tag).toBe('MonthlyBudgetExceeded');
    expect(onExceeded).toHaveBeenCalledTimes(1);
    expect(onExceeded).toHaveBeenCalledWith(expect.objectContaining({
      deptId,
      currentSpendUsd: 1100, // POST-request projected value
      limitUsd: 1000,
      requestedBy: { userId: 'user-7' },
    }));
  });

  it('does NOT fire onWarningCrossed when notifyOnWarning is false (Codex R1: flag was ignored)', async () => {
    const store = createMemoryStore();
    const onWarningCrossed = vi.fn(async () => undefined);
    const svc = createDepartmentBudgetService({ store, onWarningCrossed });
    const dept = await svc.createDepartment({ name: 'D', ownerUserId: 'u' });
    if (!dept.ok) throw new Error('setup failed');
    await svc.setBudget(dept.value.id, {
      monthlyLimitUsd: 1000,
      warningThreshold: 0.8,
      blockOnExceed: false,
      notifyOnWarning: false, // explicit opt-out
    });
    store._setSpend(dept.value.id, { totalUsd: 850, rowCount: 1, unstampedRowCount: 0 });

    const result = await svc.checkBudget(dept.value.id, 0);
    await flush();
    expect(result.ok).toBe(true);
    expect(onWarningCrossed).not.toHaveBeenCalled();
  });

  it('fires onWarningCrossed every call when the threshold is met (callback dedupe handles repeat suppression)', async () => {
    // Per AD-S18-6: dedupe lives in the callback (BudgetDedupeStore),
    // not in checkBudget. checkBudget fires the callback on every
    // qualifying call; the callback's internal SET-NX-EX collapses
    // to one notification per period.
    const { svc, deptId, onWarningCrossed } = await setup({
      spendUsd: 850,
      limitUsd: 1000,
    });

    await svc.checkBudget(deptId, 0);
    await svc.checkBudget(deptId, 0);
    await svc.checkBudget(deptId, 0);
    await flush();

    expect(onWarningCrossed).toHaveBeenCalledTimes(3);
  });

  it('does NOT fire callbacks when projected spend is below the warning threshold', async () => {
    const { svc, deptId, onWarningCrossed, onExceeded } = await setup({
      spendUsd: 100,
      limitUsd: 1000,
    });

    await svc.checkBudget(deptId, 50); // 150/1000 = 15%, below 80%
    await flush();

    expect(onWarningCrossed).not.toHaveBeenCalled();
    expect(onExceeded).not.toHaveBeenCalled();
  });

  it('callback rejection is logged but does NOT block the budget verdict', async () => {
    const store = createMemoryStore();
    const warn = vi.fn();
    const onWarningCrossed = vi.fn(async () => { throw new Error('notification adapter exploded'); });
    const svc = createDepartmentBudgetService({
      store,
      onWarningCrossed,
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
    });
    const dept = await svc.createDepartment({ name: 'D', ownerUserId: 'u' });
    if (!dept.ok) throw new Error('setup failed');
    await svc.setBudget(dept.value.id, {
      monthlyLimitUsd: 1000,
      warningThreshold: 0.8,
      blockOnExceed: false,
      notifyOnWarning: true,
    });
    store._setSpend(dept.value.id, { totalUsd: 850, rowCount: 1, unstampedRowCount: 0 });

    const result = await svc.checkBudget(dept.value.id, 0);
    await flush();
    // verdict is still emitted normally — fire-and-forget contract
    expect(result.ok).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'department_budget_on_warning_failed',
      expect.objectContaining({ departmentId: dept.value.id }),
    );
  });
});
