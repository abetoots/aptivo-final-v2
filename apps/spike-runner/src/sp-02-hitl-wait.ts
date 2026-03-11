/**
 * SP-02: HITL Wait-for-Event Spike
 * @spike SP-02
 * @brd BO-CORE-002, BRD §6.3 (Build: HITL Subsystem)
 * @frd FR-CORE-HITL-001 through FR-CORE-HITL-006
 * @add ADD §4 (HITL Subsystem), §4.2 (Wait Semantics)
 * @warnings S7-W8 (checkpoint recovery), S7-W20 (TTL expiry boundary)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-02
 *
 * Validates Inngest waitForEvent semantics:
 *   1. Basic wait → resume on matching event
 *   2. Timeout expiry → returns null
 *   3. Approval/rejection branching
 *   4. Event correlation via match filter
 *   5. Multi-step workflow with memoization across wait
 */

import { inngest } from './inngest-client.js';
import { NonRetriableError } from 'inngest';

export const SP_02_CONFIG = {
  name: 'SP-02: HITL Wait-for-Event',
  risk: 'CRITICAL' as const,
  validations: [
    'waitForEvent basic usage and matching',
    'Timeout expiry behavior',
    'Approval event delivery',
    'Rejection event handling',
    'Multiple concurrent wait states',
    'Event correlation accuracy',
  ],
} as const;

// ---------------------------------------------------------------------------
// 1. basic HITL approval workflow
// ---------------------------------------------------------------------------

/**
 * Simulates a complete HITL approval flow:
 *   step 1: prepare request (memoized)
 *   step 2: waitForEvent for approval response
 *   step 3: process decision (memoized)
 */
export const hitlApprovalFn = inngest.createFunction(
  { id: 'sp02-hitl-approval', retries: 0 },
  { event: 'spike/sp02.approval-request' },
  async ({ event, step }) => {
    // step 1 — prepare (validates memoization across wait boundary)
    const prepared = await step.run('prepare-request', () => ({
      requestId: event.data.requestId,
      preparedAt: Date.now(),
    }));

    // step 2 — wait for human decision
    const response = await step.waitForEvent('wait-for-decision', {
      event: 'spike/sp02.approval-response',
      timeout: event.data.timeoutMs
        ? `${event.data.timeoutMs}ms`
        : '1h',
      match: 'data.requestId',
    });

    // step 3 — process the decision
    if (response === null) {
      // timeout — no human responded
      return await step.run('handle-timeout', () => ({
        status: 'timed-out' as const,
        requestId: prepared.requestId,
      }));
    }

    if (response.data.decision === 'rejected') {
      return await step.run('handle-rejection', () => ({
        status: 'rejected' as const,
        requestId: prepared.requestId,
        decidedBy: response.data.decidedBy,
        reason: response.data.reason ?? null,
      }));
    }

    return await step.run('handle-approval', () => ({
      status: 'approved' as const,
      requestId: prepared.requestId,
      decidedBy: response.data.decidedBy,
    }));
  },
);

// ---------------------------------------------------------------------------
// 2. concurrent wait — two independent approvals in one workflow
// ---------------------------------------------------------------------------

export const concurrentWaitFn = inngest.createFunction(
  { id: 'sp02-concurrent-wait', retries: 0 },
  { event: 'spike/sp02.approval-request' },
  async ({ event, step }) => {
    // two parallel wait-for-event calls with different correlation ids
    const [decision1, decision2] = await Promise.all([
      step.waitForEvent('wait-decision-1', {
        event: 'spike/sp02.approval-response',
        timeout: '5m',
        match: 'data.requestId',
      }),
      step.waitForEvent('wait-decision-2', {
        event: 'spike/sp02.approval-response',
        timeout: '5m',
        if: `async.data.requestId == '${event.data.requestId}-second'`,
      }),
    ]);

    return {
      decision1: decision1?.data.decision ?? 'timed-out',
      decision2: decision2?.data.decision ?? 'timed-out',
    };
  },
);

// ---------------------------------------------------------------------------
// 3. long-sleep resilience — simulates 24h+ wait
// ---------------------------------------------------------------------------

export const longSleepFn = inngest.createFunction(
  { id: 'sp02-long-sleep', retries: 0 },
  { event: 'spike/sp02.approval-request' },
  async ({ event, step }) => {
    const beforeWait = await step.run('before-wait', () => ({
      startedAt: Date.now(),
      requestId: event.data.requestId,
    }));

    // long timeout — in production this could be 24h+
    const response = await step.waitForEvent('wait-long', {
      event: 'spike/sp02.approval-response',
      timeout: '24h',
      match: 'data.requestId',
    });

    const afterWait = await step.run('after-wait', () => ({
      resumedAt: Date.now(),
      hadResponse: response !== null,
    }));

    return {
      beforeWait,
      afterWait,
      decision: response?.data.decision ?? 'timed-out',
    };
  },
);

export const sp02Functions = [hitlApprovalFn, concurrentWaitFn, longSleepFn];
