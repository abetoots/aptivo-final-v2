/**
 * LLM-07: Budget Enforcement Tests
 * @task LLM-07
 * @reuse SP-08 boundary test patterns ($49/$50/$51, $499/$500/$501)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BudgetService } from '../../src/budget/budget-service.js';
import type { BudgetStore } from '../../src/budget/budget-service.js';
import { createMockBudgetStore, createBudgetConfig } from '../fixtures/index.js';

describe('BudgetService', () => {
  let store: BudgetStore;
  let service: BudgetService;

  beforeEach(() => {
    store = createMockBudgetStore();
    service = new BudgetService(store);
  });

  describe('checkBudget', () => {
    it('returns ok when under budget', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(10);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(100);

      const result = await service.checkBudget('core');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dailyUsed).toBe(10);
        expect(result.value.dailyLimit).toBe(50);
        expect(result.value.warningTriggered).toBe(false);
      }
    });

    it('blocks at daily limit boundary ($50 blocks)', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(50);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(50);

      const result = await service.checkBudget('core');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('DailyBudgetExceeded');
      }
    });

    it('passes at $49 daily (just under limit)', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(49);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(49);

      const result = await service.checkBudget('core');
      expect(result.ok).toBe(true);
    });

    it('blocks at $51 daily (over limit)', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(51);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(51);

      const result = await service.checkBudget('core');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('DailyBudgetExceeded');
      }
    });

    it('blocks at monthly limit boundary ($500 blocks)', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(0);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(500);

      const result = await service.checkBudget('core');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('MonthlyBudgetExceeded');
      }
    });

    it('passes at $499 monthly (just under limit)', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(0);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(499);

      const result = await service.checkBudget('core');
      expect(result.ok).toBe(true);
    });

    it('blocks at $501 monthly (over limit)', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(0);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(501);

      const result = await service.checkBudget('core');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('MonthlyBudgetExceeded');
      }
    });

    it('triggers warning at 90% daily threshold', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(45); // 90% of 50
      vi.mocked(store.getMonthlySpend).mockResolvedValue(100);

      const result = await service.checkBudget('core');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warningTriggered).toBe(true);
      }
    });

    it('triggers warning at 90% monthly threshold', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(10);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(450); // 90% of 500

      const result = await service.checkBudget('core');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warningTriggered).toBe(true);
      }
    });

    it('fail-closed when no config exists', async () => {
      vi.mocked(store.getConfig).mockResolvedValue(null);

      const result = await service.checkBudget('core');
      expect(result.ok).toBe(false);
    });

    it('does not block when blockOnExceed is false', async () => {
      vi.mocked(store.getConfig).mockResolvedValue(
        createBudgetConfig({ blockOnExceed: false }),
      );
      vi.mocked(store.getDailySpend).mockResolvedValue(100);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(1000);

      const result = await service.checkBudget('core');
      expect(result.ok).toBe(true);
    });
  });

  describe('enforcePreRequest', () => {
    it('passes when projected cost is under daily limit', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(48);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(100);

      const result = await service.enforcePreRequest('core', 1);
      expect(result.ok).toBe(true);
    });

    it('blocks when projected cost exceeds daily limit', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(49);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(100);

      const result = await service.enforcePreRequest('core', 2); // 49+2 = 51 > 50
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('DailyBudgetExceeded');
      }
    });

    it('blocks when projected cost exceeds monthly limit', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(0);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(499);

      const result = await service.enforcePreRequest('core', 2); // 499+2 = 501 > 500
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('MonthlyBudgetExceeded');
      }
    });

    it('fail-closed when no config exists', async () => {
      vi.mocked(store.getConfig).mockResolvedValue(null);

      const result = await service.enforcePreRequest('core', 0.01);
      expect(result.ok).toBe(false);
    });

    it('includes warning flag when projected spend hits 90%', async () => {
      vi.mocked(store.getDailySpend).mockResolvedValue(44);
      vi.mocked(store.getMonthlySpend).mockResolvedValue(100);

      // 44 + 1 = 45, which is 90% of 50
      const result = await service.enforcePreRequest('core', 1);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warningTriggered).toBe(true);
      }
    });
  });
});
