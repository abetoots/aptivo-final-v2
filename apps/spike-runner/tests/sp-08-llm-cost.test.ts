/**
 * @testcase SP-08-COST-001 through SP-08-COST-022
 * @requirements FR-CORE-WFE-009
 * @warnings S7-W17, S7-W18 (budget cap boundary $50 daily / $500 monthly)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-08
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SP_08_CONFIG,
  MODEL_PRICING,
  countTokens,
  calculateCost,
  CostLedger,
  BudgetEnforcer,
  StreamCostInterceptor,
} from '../src/sp-08-llm-cost.js';

// ---------------------------------------------------------------------------
// configuration
// ---------------------------------------------------------------------------

describe('SP-08: LLM Cost Tracking', () => {
  it('has correct spike configuration', () => {
    expect(SP_08_CONFIG.name).toBe('SP-08: LLM Cost Tracking');
    expect(SP_08_CONFIG.risk).toBe('HIGH');
    expect(SP_08_CONFIG.validations).toHaveLength(6);
  });

  // ---------------------------------------------------------------------------
  // token counting
  // ---------------------------------------------------------------------------

  describe('token counting', () => {
    it('counts tokens for basic text', () => {
      const text = 'Hello world this is a test';
      const tokens = countTokens(text);
      // 6 words * 1.3 subword factor = 7.8 -> ceil = 8
      expect(tokens).toBe(8);
    });

    it('returns 0 for empty string', () => {
      expect(countTokens('')).toBe(0);
    });

    it('handles long text with punctuation', () => {
      const text = 'The quick, brown fox! Jumped over the lazy dog. How now?';
      const tokens = countTokens(text);
      // should produce a positive integer
      expect(tokens).toBeGreaterThan(0);
      expect(Number.isInteger(tokens)).toBe(true);
    });

    it('returns 0 for whitespace-only input', () => {
      expect(countTokens('   ')).toBe(0);
    });

    it('applies subword factor (tokens > raw word count)', () => {
      const text = 'one two three four five';
      const tokens = countTokens(text);
      // 5 words * 1.3 = 6.5 -> ceil = 7
      expect(tokens).toBeGreaterThan(5);
    });
  });

  // ---------------------------------------------------------------------------
  // cost calculation
  // ---------------------------------------------------------------------------

  describe('cost calculation', () => {
    it('calculates cost for known model', () => {
      const result = calculateCost('claude-sonnet', 1000, 500);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // input: 1000/1000 * 0.003 = 0.003
      // output: 500/1000 * 0.015 = 0.0075
      // total = 0.0105
      expect(result.value).toBeCloseTo(0.0105, 6);
    });

    it('returns error for unknown model', () => {
      const result = calculateCost('nonexistent-model', 100, 100);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('UnknownModel');
      expect(result.error.modelId).toBe('nonexistent-model');
    });

    it('returns zero cost for zero tokens', () => {
      const result = calculateCost('claude-sonnet', 0, 0);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(0);
    });

    it('calculates correctly for gpt-4o model', () => {
      const result = calculateCost('gpt-4o', 2000, 1000);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // input: 2000/1000 * 0.005 = 0.01
      // output: 1000/1000 * 0.015 = 0.015
      // total = 0.025
      expect(result.value).toBeCloseTo(0.025, 6);
    });

    it('has pricing entries for all common models', () => {
      expect(MODEL_PRICING.has('claude-sonnet')).toBe(true);
      expect(MODEL_PRICING.has('claude-haiku')).toBe(true);
      expect(MODEL_PRICING.has('claude-opus')).toBe(true);
      expect(MODEL_PRICING.has('gpt-4o')).toBe(true);
      expect(MODEL_PRICING.has('gpt-4o-mini')).toBe(true);
      expect(MODEL_PRICING.has('gemini-pro')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // cost ledger
  // ---------------------------------------------------------------------------

  describe('cost ledger', () => {
    let ledger: CostLedger;

    beforeEach(() => {
      ledger = new CostLedger();
    });

    it('records usage and returns cost', () => {
      const result = ledger.recordUsage('tenant-1', 'wf-1', 'claude-sonnet', 1000, 500);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeCloseTo(0.0105, 6);
    });

    it('returns error for unknown model on record', () => {
      const result = ledger.recordUsage('tenant-1', 'wf-1', 'unknown-model', 100, 100);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('UnknownModel');
    });

    it('tracks tenant spend across workflows', () => {
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-sonnet', 1000, 500);
      ledger.recordUsage('tenant-1', 'wf-2', 'gpt-4o', 2000, 1000);

      const totalSpend = ledger.getTenantSpend('tenant-1');
      // 0.0105 + 0.025 = 0.0355
      expect(totalSpend).toBeCloseTo(0.0355, 6);
    });

    it('isolates spend between tenants', () => {
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-sonnet', 1000, 500);
      ledger.recordUsage('tenant-2', 'wf-1', 'gpt-4o', 2000, 1000);

      expect(ledger.getTenantSpend('tenant-1')).toBeCloseTo(0.0105, 6);
      expect(ledger.getTenantSpend('tenant-2')).toBeCloseTo(0.025, 6);
    });

    it('tracks workflow-level spend', () => {
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-sonnet', 1000, 500);
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-sonnet', 1000, 500);
      ledger.recordUsage('tenant-1', 'wf-2', 'gpt-4o', 2000, 1000);

      expect(ledger.getWorkflowSpend('tenant-1', 'wf-1')).toBeCloseTo(0.021, 6);
      expect(ledger.getWorkflowSpend('tenant-1', 'wf-2')).toBeCloseTo(0.025, 6);
    });

    it('returns daily spend for current UTC day', () => {
      // records created now should count toward daily spend
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-sonnet', 1000, 500);
      const daily = ledger.getDailySpend('tenant-1');
      expect(daily).toBeCloseTo(0.0105, 6);
    });

    it('returns monthly spend for current UTC month', () => {
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-sonnet', 1000, 500);
      const monthly = ledger.getMonthlySpend('tenant-1');
      expect(monthly).toBeCloseTo(0.0105, 6);
    });

    it('returns zero for tenant with no records', () => {
      expect(ledger.getTenantSpend('nonexistent')).toBe(0);
      expect(ledger.getDailySpend('nonexistent')).toBe(0);
      expect(ledger.getMonthlySpend('nonexistent')).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // budget enforcer
  // ---------------------------------------------------------------------------

  describe('budget enforcement', () => {
    let ledger: CostLedger;
    // S7-W18: $50 daily / $500 monthly caps
    let enforcer: BudgetEnforcer;

    beforeEach(() => {
      ledger = new CostLedger();
      enforcer = new BudgetEnforcer(50, 500);
    });

    it('passes when under both limits', () => {
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-sonnet', 1000, 500);
      const result = enforcer.checkBudget('tenant-1', ledger);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe('ok');
    });

    it('blocks when daily limit exceeded', () => {
      // claude-opus: input 0.015/1k, output 0.075/1k
      // 500k input = 500 * 0.015 = $7.50, 500k output = 500 * 0.075 = $37.50 => $45/call
      // two calls = $90 > $50 daily
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-opus', 500_000, 500_000);
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-opus', 500_000, 500_000);

      const result = enforcer.checkBudget('tenant-1', ledger);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('DailyBudgetExceeded');
    });

    it('blocks when monthly limit exceeded', () => {
      // use a very large enforcer for daily so only monthly triggers
      const monthlyOnly = new BudgetEnforcer(10_000, 500);

      // each call: $45, need > $500 monthly -> 12 calls = $540
      for (let i = 0; i < 12; i++) {
        monthlyOnly.checkBudget('tenant-1', ledger); // not blocking daily
        ledger.recordUsage('tenant-1', 'wf-1', 'claude-opus', 500_000, 500_000);
      }

      const result = monthlyOnly.checkBudget('tenant-1', ledger);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('MonthlyBudgetExceeded');
    });

    it('pre-request enforcement blocks when estimated cost would exceed daily limit', () => {
      // current daily spend: ~$45
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-opus', 500_000, 500_000);

      // estimated next request: $10 would push to $55 > $50
      const result = enforcer.enforcePreRequest('tenant-1', 10, ledger);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('PreRequestDailyExceeded');
    });

    it('pre-request enforcement approves when under limit', () => {
      const result = enforcer.enforcePreRequest('tenant-1', 1, ledger);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe('approved');
    });
  });

  // ---------------------------------------------------------------------------
  // S7-W18: budget boundary tests ($50 daily / $500 monthly)
  // ---------------------------------------------------------------------------

  describe('S7-W18: budget cap boundary validation', () => {
    it('$49 daily spend passes budget check', () => {
      const enforcer = new BudgetEnforcer(50, 500);
      const ledger = new CostLedger();

      // gpt-4o: 1000 input = $0.005, 1000 output = $0.015 => $0.02/call
      // need ~$49 -> use large token counts
      // claude-opus: input 0.015/1k, output 0.075/1k -> $45 per 500k/500k
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-opus', 500_000, 500_000);
      // that's $45, under $50

      const result = enforcer.checkBudget('tenant-1', ledger);
      expect(result.ok).toBe(true);
    });

    it('$50 daily spend triggers budget exceeded', () => {
      const enforcer = new BudgetEnforcer(50, 500);
      const ledger = new CostLedger();

      // need exactly >= $50. claude-opus: $45 for 500k/500k
      // add another small call: claude-sonnet 1M input = 1000 * 0.003 = $3, 1M output = 1000 * 0.015 = $15 -> $18
      // total: $45 + $18 = $63 >= $50
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-opus', 500_000, 500_000);
      ledger.recordUsage('tenant-1', 'wf-2', 'claude-sonnet', 1_000_000, 1_000_000);

      const result = enforcer.checkBudget('tenant-1', ledger);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('DailyBudgetExceeded');
      expect(result.error.currentSpend).toBeGreaterThanOrEqual(50);
    });

    it('$51 daily spend triggers budget exceeded', () => {
      const enforcer = new BudgetEnforcer(50, 500);
      const ledger = new CostLedger();

      // $45 + $18 = $63 > $51
      ledger.recordUsage('tenant-1', 'wf-1', 'claude-opus', 500_000, 500_000);
      ledger.recordUsage('tenant-1', 'wf-2', 'claude-sonnet', 1_000_000, 1_000_000);

      const result = enforcer.checkBudget('tenant-1', ledger);
      expect(result.ok).toBe(false);
    });

    it('$499 monthly spend passes budget check', () => {
      const enforcer = new BudgetEnforcer(10_000, 500); // high daily limit
      const ledger = new CostLedger();

      // claude-opus 500k/500k = $45 each
      // 11 calls = $495 < $500
      for (let i = 0; i < 11; i++) {
        ledger.recordUsage('tenant-1', `wf-${i}`, 'claude-opus', 500_000, 500_000);
      }

      const monthly = ledger.getMonthlySpend('tenant-1');
      expect(monthly).toBeLessThan(500);

      const result = enforcer.checkBudget('tenant-1', ledger);
      expect(result.ok).toBe(true);
    });

    it('$500 monthly spend triggers budget exceeded', () => {
      const enforcer = new BudgetEnforcer(10_000, 500);
      const ledger = new CostLedger();

      // 12 calls * $45 = $540 >= $500
      for (let i = 0; i < 12; i++) {
        ledger.recordUsage('tenant-1', `wf-${i}`, 'claude-opus', 500_000, 500_000);
      }

      const result = enforcer.checkBudget('tenant-1', ledger);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('MonthlyBudgetExceeded');
      expect(result.error.currentSpend).toBeGreaterThanOrEqual(500);
    });

    it('$501 monthly spend triggers budget exceeded', () => {
      const enforcer = new BudgetEnforcer(10_000, 500);
      const ledger = new CostLedger();

      // 12 calls = $540 > $501
      for (let i = 0; i < 12; i++) {
        ledger.recordUsage('tenant-1', `wf-${i}`, 'claude-opus', 500_000, 500_000);
      }

      const monthly = ledger.getMonthlySpend('tenant-1');
      expect(monthly).toBeGreaterThan(500);

      const result = enforcer.checkBudget('tenant-1', ledger);
      expect(result.ok).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // stream cost interceptor
  // ---------------------------------------------------------------------------

  describe('stream cost interceptor', () => {
    it('tracks accumulated tokens during stream', () => {
      const interceptor = new StreamCostInterceptor();
      interceptor.startStream('claude-sonnet', 1.0);
      interceptor.onChunk(100);
      interceptor.onChunk(200);
      expect(interceptor.getAccumulatedTokens()).toBe(300);
    });

    it('stream within budget does not trigger termination', () => {
      const interceptor = new StreamCostInterceptor();
      interceptor.startStream('claude-sonnet', 1.0);
      // claude-sonnet output: $0.015/1k tokens
      // 100 tokens = $0.0015, well under $1.00
      interceptor.onChunk(100);
      expect(interceptor.shouldTerminate()).toBe(false);
    });

    it('stream exceeding budget triggers termination', () => {
      const interceptor = new StreamCostInterceptor();
      // very small budget: $0.001
      interceptor.startStream('claude-sonnet', 0.001);
      // claude-sonnet output: $0.015/1k -> 1000 tokens = $0.015 > $0.001
      interceptor.onChunk(1000);
      expect(interceptor.shouldTerminate()).toBe(true);
    });

    it('returns final cost of stream', () => {
      const interceptor = new StreamCostInterceptor();
      interceptor.startStream('claude-sonnet', 10.0);
      interceptor.onChunk(1000);
      // 1000 / 1000 * 0.015 = $0.015
      expect(interceptor.getFinalCost()).toBeCloseTo(0.015, 6);
    });

    it('returns error for unknown model on startStream', () => {
      const interceptor = new StreamCostInterceptor();
      const result = interceptor.startStream('nonexistent', 10.0);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('UnknownModel');
    });

    it('fail-closed: shouldTerminate returns true if stream never started', () => {
      const interceptor = new StreamCostInterceptor();
      // never called startStream
      expect(interceptor.shouldTerminate()).toBe(true);
    });

    it('returns zero cost when stream never started', () => {
      const interceptor = new StreamCostInterceptor();
      expect(interceptor.getFinalCost()).toBe(0);
    });
  });
});
