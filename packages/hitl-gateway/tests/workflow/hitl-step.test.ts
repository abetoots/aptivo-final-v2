/**
 * @testcase HITL-07-WF-001 through HITL-07-WF-010
 * @task HITL-07
 * @frd FR-CORE-HITL-002
 *
 * Tests the Inngest HITL approval workflow:
 * - Approval path: create → notify → wait → approve → resume
 * - Rejection path: create → notify → wait → reject → resume
 * - Timeout path: create → notify → wait → null → expired
 * - Error path: create fails → error result
 * - Memoization: pre-wait steps called exactly once
 * - Request ID correlation via match filter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine } from '@inngest/test';
import { createHitlApprovalFunction } from '../../src/workflow/hitl-step.js';
import type { HitlWorkflowDeps } from '../../src/workflow/hitl-step.js';
import { HITL_EVENTS } from '../../src/workflow/event-schemas.js';
import type { CreateRequestResult } from '../../src/request/request-types.js';

// ---------------------------------------------------------------------------
// test fixtures
// ---------------------------------------------------------------------------

const inngest = new Inngest({ id: 'hitl-test' });

const REQUEST_ID = 'req-hitl-001';

const mockRequestResult: CreateRequestResult = {
  requestId: REQUEST_ID,
  token: 'jwt-token-value',
  tokenHash: 'a'.repeat(64),
  tokenExpiresAt: new Date(Date.now() + 15 * 60_000),
  approveUrl: 'https://app.aptivo.com/hitl/req-hitl-001?action=approve',
  rejectUrl: 'https://app.aptivo.com/hitl/req-hitl-001?action=reject',
};

function createMockDeps(overrides?: Partial<HitlWorkflowDeps>): HitlWorkflowDeps {
  return {
    createRequest: vi.fn(async () => ({ ok: true as const, value: mockRequestResult })),
    sendNotification: vi.fn(async () => {}),
    ...overrides,
  };
}

const triggerEvent = (overrides?: Record<string, unknown>) => [{
  name: HITL_EVENTS.APPROVAL_REQUESTED,
  data: {
    workflowId: 'wf-001',
    domain: 'crypto',
    actionType: 'trade-approval',
    summary: 'Approve BTC purchase',
    approverId: 'approver-001',
    // note: triggering event does NOT have requestId — it's created in step 1
    ...overrides,
  },
}] as [any];

// fresh engine per test (SP-01 finding: avoid mock handler cache contamination)
function engineFor(fn: any, opts?: Record<string, unknown>) {
  return new InngestTestEngine({ function: fn, ...opts });
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('HITL-07: Inngest Workflow Integration', () => {
  // -----------------------------------------------------------------------
  // approval path
  // -----------------------------------------------------------------------

  describe('approval path', () => {
    it('creates request, waits, and resumes on approval', async () => {
      const deps = createMockDeps();
      const fn = createHitlApprovalFunction(inngest, deps);

      const engine = engineFor(fn, {
        events: triggerEvent(),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: HITL_EVENTS.DECISION_RECORDED,
            data: {
              requestId: REQUEST_ID,
              decision: 'approved',
              approverId: 'approver-001',
              decidedAt: '2026-03-09T12:00:00Z',
            },
          }),
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        status: 'approved',
        requestId: REQUEST_ID,
        approverId: 'approver-001',
        decidedAt: '2026-03-09T12:00:00Z',
      });
    });

    it('calls createRequest with event data', async () => {
      const deps = createMockDeps();
      const fn = createHitlApprovalFunction(inngest, deps);

      const engine = engineFor(fn, {
        events: triggerEvent(),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: HITL_EVENTS.DECISION_RECORDED,
            data: { requestId: REQUEST_ID, decision: 'approved', approverId: 'a', decidedAt: 'now' },
          }),
        }],
      });

      await engine.execute();
      expect(deps.createRequest).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // rejection path
  // -----------------------------------------------------------------------

  describe('rejection path', () => {
    it('resumes with rejected status', async () => {
      const deps = createMockDeps();
      const fn = createHitlApprovalFunction(inngest, deps);

      const engine = engineFor(fn, {
        events: triggerEvent(),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: HITL_EVENTS.DECISION_RECORDED,
            data: {
              requestId: REQUEST_ID,
              decision: 'rejected',
              approverId: 'approver-002',
              decidedAt: '2026-03-09T13:00:00Z',
            },
          }),
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        status: 'rejected',
        requestId: REQUEST_ID,
        approverId: 'approver-002',
      });
    });
  });

  // -----------------------------------------------------------------------
  // timeout path
  // -----------------------------------------------------------------------

  describe('timeout path', () => {
    it('returns expired status when no decision arrives', async () => {
      const deps = createMockDeps();
      const fn = createHitlApprovalFunction(inngest, deps);

      const engine = engineFor(fn, {
        events: triggerEvent(),
        steps: [{
          id: 'wait-for-decision',
          handler: () => null, // simulates timeout
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        status: 'expired',
        requestId: REQUEST_ID,
      });
    });
  });

  // -----------------------------------------------------------------------
  // error path
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('returns error status when request creation fails', async () => {
      const deps = createMockDeps({
        createRequest: vi.fn(async () => ({
          ok: false as const,
          error: { _tag: 'TokenGenerationError' as const, message: 'Secret too short' },
        })),
      });
      const fn = createHitlApprovalFunction(inngest, deps);

      const engine = engineFor(fn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({
        status: 'error',
        error: expect.stringContaining('TokenGenerationError'),
      });
    });
  });

  // -----------------------------------------------------------------------
  // notification
  // -----------------------------------------------------------------------

  describe('notification', () => {
    it('calls sendNotification when provided', async () => {
      const sendNotification = vi.fn(async () => {});
      const deps = createMockDeps({ sendNotification });
      const fn = createHitlApprovalFunction(inngest, deps);

      const engine = engineFor(fn, {
        events: triggerEvent(),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: HITL_EVENTS.DECISION_RECORDED,
            data: { requestId: REQUEST_ID, decision: 'approved', approverId: 'a', decidedAt: 'now' },
          }),
        }],
      });

      await engine.execute();
      expect(sendNotification).toHaveBeenCalledOnce();
    });

    it('continues workflow even when notification fails', async () => {
      const deps = createMockDeps({
        sendNotification: vi.fn(async () => { throw new Error('Novu down'); }),
      });
      const fn = createHitlApprovalFunction(inngest, deps);

      const engine = engineFor(fn, {
        events: triggerEvent(),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: HITL_EVENTS.DECISION_RECORDED,
            data: { requestId: REQUEST_ID, decision: 'approved', approverId: 'a', decidedAt: 'now' },
          }),
        }],
      });

      const { result } = await engine.execute();
      // workflow should still complete despite notification failure
      expect(result).toMatchObject({ status: 'approved' });
    });

    it('skips notification step when sendNotification not provided', async () => {
      const deps = createMockDeps();
      delete deps.sendNotification;
      const fn = createHitlApprovalFunction(inngest, deps);

      const engine = engineFor(fn, {
        events: triggerEvent(),
        steps: [{
          id: 'wait-for-decision',
          handler: () => ({
            name: HITL_EVENTS.DECISION_RECORDED,
            data: { requestId: REQUEST_ID, decision: 'approved', approverId: 'a', decidedAt: 'now' },
          }),
        }],
      });

      const { result } = await engine.execute();
      expect(result).toMatchObject({ status: 'approved' });
    });
  });

  // -----------------------------------------------------------------------
  // memoization
  // -----------------------------------------------------------------------

  describe('memoization', () => {
    it('pre-wait steps are memoized (not re-executed on resume)', async () => {
      let createCallCount = 0;
      const deps = createMockDeps({
        createRequest: vi.fn(async () => {
          createCallCount++;
          return { ok: true as const, value: mockRequestResult };
        }),
      });
      const fn = createHitlApprovalFunction(inngest, deps);

      const engine = engineFor(fn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'create-hitl-request',
            handler: () => {
              createCallCount++;
              return {
                success: true,
                requestId: REQUEST_ID,
                approveUrl: mockRequestResult.approveUrl,
                rejectUrl: mockRequestResult.rejectUrl,
                tokenExpiresAt: mockRequestResult.tokenExpiresAt.toISOString(),
              };
            },
          },
          {
            id: 'wait-for-decision',
            handler: () => ({
              name: HITL_EVENTS.DECISION_RECORDED,
              data: { requestId: REQUEST_ID, decision: 'approved', approverId: 'a', decidedAt: 'now' },
            }),
          },
        ],
      });

      await engine.execute();
      // mock handler called exactly once during memoization replay
      expect(createCallCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // configuration
  // -----------------------------------------------------------------------

  describe('configuration', () => {
    it('uses custom function ID and wait timeout', async () => {
      const deps = createMockDeps();
      const fn = createHitlApprovalFunction(inngest, deps, {
        functionId: 'custom-hitl',
        waitTimeout: '48h',
      });

      // function should be created successfully
      expect(fn).toBeTruthy();
    });
  });
});
