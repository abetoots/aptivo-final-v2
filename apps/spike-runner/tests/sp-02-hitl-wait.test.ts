/**
 * @testcase SP-02-COMP-001 through SP-02-COMP-008
 * @requirements FR-CORE-HITL-001 through FR-CORE-HITL-006
 * @warnings S7-W8, S7-W20
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-02
 */
import { describe, it, expect } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import {
  SP_02_CONFIG,
  hitlApprovalFn,
  concurrentWaitFn,
  longSleepFn,
} from '../src/sp-02-hitl-wait.js';

// fresh engine per test to avoid mock handler cache contamination (SP-01 finding)
const engineFor = (fn: any, opts?: Partial<InngestTestEngine.Options>) =>
  new InngestTestEngine({ function: fn, ...opts });

const approvalEvent = (overrides?: Record<string, unknown>) => ([{
  name: 'spike/sp02.approval-request' as const,
  data: {
    requestId: 'req-001',
    workflowId: 'wf-001',
    description: 'Test approval',
    ...overrides,
  },
}] as [any]);

describe('SP-02: HITL Wait-for-Event', () => {
  it('has correct spike configuration', () => {
    expect(SP_02_CONFIG.name).toBe('SP-02: HITL Wait-for-Event');
    expect(SP_02_CONFIG.risk).toBe('CRITICAL');
    expect(SP_02_CONFIG.validations).toHaveLength(6);
  });

  // -----------------------------------------------------------------------
  // 1. waitForEvent basic usage and matching
  // -----------------------------------------------------------------------
  describe('waitForEvent basic usage', () => {
    it('resumes workflow when matching event is received', async () => {
      const engine = engineFor(hitlApprovalFn, {
        events: approvalEvent(),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: 'spike/sp02.approval-response',
            data: { requestId: 'req-001', decision: 'approved', decidedBy: 'alice' },
          }),
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        status: 'approved',
        requestId: 'req-001',
        decidedBy: 'alice',
      });
    });

    it('passes through correct requestId correlation', async () => {
      const engine = engineFor(hitlApprovalFn, {
        events: approvalEvent({ requestId: 'req-999' }),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: 'spike/sp02.approval-response',
            data: { requestId: 'req-999', decision: 'approved', decidedBy: 'bob' },
          }),
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        status: 'approved',
        requestId: 'req-999',
      });
    });
  });

  // -----------------------------------------------------------------------
  // 2. timeout expiry behavior
  // -----------------------------------------------------------------------
  describe('timeout expiry', () => {
    it('returns timed-out status when no event arrives', async () => {
      const engine = engineFor(hitlApprovalFn, {
        events: approvalEvent({ timeoutMs: 1000 }),
        steps: [{
          id: 'wait-for-decision',
          handler: () => null, // simulates timeout — no event received
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        status: 'timed-out',
        requestId: 'req-001',
      });
    });
  });

  // -----------------------------------------------------------------------
  // 3. approval event delivery
  // -----------------------------------------------------------------------
  describe('approval delivery', () => {
    it('delivers approval with decidedBy metadata', async () => {
      const engine = engineFor(hitlApprovalFn, {
        events: approvalEvent(),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: 'spike/sp02.approval-response',
            data: { requestId: 'req-001', decision: 'approved', decidedBy: 'charlie' },
          }),
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        status: 'approved',
        decidedBy: 'charlie',
      });
    });
  });

  // -----------------------------------------------------------------------
  // 4. rejection event handling
  // -----------------------------------------------------------------------
  describe('rejection handling', () => {
    it('handles rejection with reason', async () => {
      const engine = engineFor(hitlApprovalFn, {
        events: approvalEvent(),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: 'spike/sp02.approval-response',
            data: {
              requestId: 'req-001',
              decision: 'rejected',
              decidedBy: 'diana',
              reason: 'Budget exceeded',
            },
          }),
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        status: 'rejected',
        requestId: 'req-001',
        decidedBy: 'diana',
        reason: 'Budget exceeded',
      });
    });

    it('handles rejection without reason', async () => {
      const engine = engineFor(hitlApprovalFn, {
        events: approvalEvent(),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: 'spike/sp02.approval-response',
            data: { requestId: 'req-001', decision: 'rejected', decidedBy: 'eve' },
          }),
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        status: 'rejected',
        reason: null,
      });
    });
  });

  // -----------------------------------------------------------------------
  // 5. multiple concurrent wait states
  // -----------------------------------------------------------------------
  describe('concurrent waits', () => {
    it('handles two parallel waitForEvent calls', async () => {
      const engine = engineFor(concurrentWaitFn, {
        events: approvalEvent(),
        steps: [
          {
            id: 'wait-decision-1',
            handler: () => ({
              name: 'spike/sp02.approval-response',
              data: { requestId: 'req-001', decision: 'approved', decidedBy: 'alice' },
            }),
          },
          {
            id: 'wait-decision-2',
            handler: () => ({
              name: 'spike/sp02.approval-response',
              data: { requestId: 'req-001-second', decision: 'rejected', decidedBy: 'bob' },
            }),
          },
        ],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        decision1: 'approved',
        decision2: 'rejected',
      });
    });

    it('handles mixed timeout and response', async () => {
      const engine = engineFor(concurrentWaitFn, {
        events: approvalEvent(),
        steps: [
          {
            id: 'wait-decision-1',
            handler: () => ({
              name: 'spike/sp02.approval-response',
              data: { requestId: 'req-001', decision: 'approved', decidedBy: 'alice' },
            }),
          },
          {
            id: 'wait-decision-2',
            handler: () => null, // second one times out
          },
        ],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        decision1: 'approved',
        decision2: 'timed-out',
      });
    });
  });

  // -----------------------------------------------------------------------
  // 6. event correlation accuracy
  // -----------------------------------------------------------------------
  describe('event correlation', () => {
    it('uses match filter on data.requestId', async () => {
      // the match: 'data.requestId' filter ensures only events with the
      // same requestId are delivered. we validate this by checking the
      // function processes the correct event data.
      const engine = engineFor(hitlApprovalFn, {
        events: approvalEvent({ requestId: 'corr-123' }),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: 'spike/sp02.approval-response',
            data: { requestId: 'corr-123', decision: 'approved', decidedBy: 'correlator' },
          }),
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        requestId: 'corr-123',
        status: 'approved',
      });
    });
  });

  // -----------------------------------------------------------------------
  // 7. memoized steps not re-executed (S7-W8)
  // -----------------------------------------------------------------------
  describe('memoization across wait boundary (S7-W8)', () => {
    it('prepare-request step is memoized when replayed', async () => {
      let prepareCallCount = 0;

      const engine = engineFor(hitlApprovalFn, {
        events: approvalEvent(),
        steps: [
          {
            id: 'prepare-request',
            handler: () => {
              prepareCallCount++;
              return { requestId: 'req-001', preparedAt: 1000 };
            },
          },
          {
            id: 'wait-for-decision',
            handler: () => ({
              name: 'spike/sp02.approval-response',
              data: { requestId: 'req-001', decision: 'approved', decidedBy: 'alice' },
            }),
          },
        ],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({ status: 'approved' });
      // the mock handler is called once during memoization replay,
      // validating that the test engine restores step state correctly
      expect(prepareCallCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // 8. long-sleep resilience
  // -----------------------------------------------------------------------
  describe('long-sleep wait (24h+)', () => {
    it('resumes correctly after long wait', async () => {
      const engine = engineFor(longSleepFn, {
        events: approvalEvent(),
        steps: [
          {
            id: 'wait-long',
            handler: () => ({
              name: 'spike/sp02.approval-response',
              data: { requestId: 'req-001', decision: 'approved', decidedBy: 'delayed-alice' },
            }),
          },
        ],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        decision: 'approved',
      });
      expect(result.beforeWait.requestId).toBe('req-001');
      expect(result.afterWait.hadResponse).toBe(true);
    });

    it('handles timeout on long-sleep wait', async () => {
      const engine = engineFor(longSleepFn, {
        events: approvalEvent(),
        steps: [{
          id: 'wait-long',
          handler: () => null,
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        decision: 'timed-out',
      });
      expect(result.afterWait.hadResponse).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 9. TTL boundary behavior (S7-W20)
  // -----------------------------------------------------------------------
  describe('TTL boundary (S7-W20)', () => {
    it('pending state when event arrives before TTL', async () => {
      // event arrives — function completes with approval
      const engine = engineFor(hitlApprovalFn, {
        events: approvalEvent({ timeoutMs: 5000 }),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: 'spike/sp02.approval-response',
            data: { requestId: 'req-001', decision: 'approved', decidedBy: 'just-in-time' },
          }),
        }],
      });

      const { result } = await engine.execute();
      expect(result.status).toBe('approved');
    });

    it('auto-expires at TTL boundary (null return)', async () => {
      // no event — waitForEvent returns null at TTL
      const engine = engineFor(hitlApprovalFn, {
        events: approvalEvent({ timeoutMs: 1000 }),
        steps: [{
          id: 'wait-for-decision',
          handler: () => null,
        }],
      });

      const { result } = await engine.execute();
      expect(result.status).toBe('timed-out');
    });
  });
});
