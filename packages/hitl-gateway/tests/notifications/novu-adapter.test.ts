/**
 * @testcase HITL-08-NTF-001 through HITL-08-NTF-012
 * @task HITL-08
 * @frd FR-CORE-HITL-005
 *
 * Tests the Novu notification adapter:
 * - Approval notification with correct template vars
 * - transactionId dedup using requestId (SP-04 pattern)
 * - Delivery failure returns Result.err (fire-and-forget)
 * - Invalid params validation
 * - createSendNotification factory for HitlWorkflowDeps
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendApprovalNotification,
  createSendNotification,
  DEFAULT_NOTIFICATION_CONFIG,
} from '../../src/notifications/index.js';
import type {
  NovuClient,
  ApprovalNotificationParams,
} from '../../src/notifications/index.js';

// ---------------------------------------------------------------------------
// test fixtures
// ---------------------------------------------------------------------------

const EXPIRES_AT = new Date('2026-03-09T15:00:00Z');

function validParams(overrides?: Partial<ApprovalNotificationParams>): ApprovalNotificationParams {
  return {
    requestId: 'req-001',
    approverId: 'approver-001',
    approverName: 'Alice Smith',
    summary: 'Approve BTC purchase for $50,000',
    approveUrl: 'https://app.aptivo.com/hitl/req-001?action=approve',
    rejectUrl: 'https://app.aptivo.com/hitl/req-001?action=reject',
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function mockNovuClient(overrides?: Partial<NovuClient>): NovuClient {
  return {
    trigger: vi.fn(async () => ({
      acknowledged: true,
      transactionId: 'req-001',
    })),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('HITL-08: Novu Notification Adapter', () => {
  // -----------------------------------------------------------------------
  // sendApprovalNotification — happy path
  // -----------------------------------------------------------------------

  describe('sendApprovalNotification', () => {
    it('calls Novu trigger with correct workflow ID and template vars', async () => {
      const client = mockNovuClient();
      const params = validParams();

      const result = await sendApprovalNotification(params, client);

      expect(result.ok).toBe(true);
      expect(client.trigger).toHaveBeenCalledOnce();
      expect(client.trigger).toHaveBeenCalledWith(
        DEFAULT_NOTIFICATION_CONFIG.approvalWorkflowId,
        {
          to: { subscriberId: 'approver-001' },
          payload: {
            approverName: 'Alice Smith',
            summary: 'Approve BTC purchase for $50,000',
            approveUrl: 'https://app.aptivo.com/hitl/req-001?action=approve',
            rejectUrl: 'https://app.aptivo.com/hitl/req-001?action=reject',
            expiresAt: EXPIRES_AT.toISOString(),
            requestId: 'req-001',
          },
          transactionId: 'req-001',
        },
      );
    });

    it('uses requestId as transactionId for Novu dedup (SP-04 pattern)', async () => {
      const client = mockNovuClient();
      const params = validParams({ requestId: 'req-dedup-test' });

      await sendApprovalNotification(params, client);

      const triggerCall = vi.mocked(client.trigger).mock.calls[0]!;
      expect(triggerCall[1].transactionId).toBe('req-dedup-test');
    });

    it('returns transactionId from Novu response', async () => {
      const client = mockNovuClient({
        trigger: vi.fn(async () => ({
          acknowledged: true,
          transactionId: 'novu-txn-123',
        })),
      });

      const result = await sendApprovalNotification(validParams(), client);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.transactionId).toBe('novu-txn-123');
      }
    });

    it('falls back to requestId when Novu response has no transactionId', async () => {
      const client = mockNovuClient({
        trigger: vi.fn(async () => ({
          acknowledged: true,
        })),
      });

      const result = await sendApprovalNotification(
        validParams({ requestId: 'req-fallback' }),
        client,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.transactionId).toBe('req-fallback');
      }
    });

    it('uses approverId as approverName when approverName not provided', async () => {
      const client = mockNovuClient();
      const params = validParams({ approverName: undefined });

      await sendApprovalNotification(params, client);

      const triggerCall = vi.mocked(client.trigger).mock.calls[0]!;
      expect(triggerCall[1].payload.approverName).toBe('approver-001');
    });

    it('uses custom workflow ID from config', async () => {
      const client = mockNovuClient();
      const params = validParams();

      await sendApprovalNotification(params, client, {
        approvalWorkflowId: 'custom-approval-flow',
      });

      expect(client.trigger).toHaveBeenCalledWith(
        'custom-approval-flow',
        expect.any(Object),
      );
    });
  });

  // -----------------------------------------------------------------------
  // sendApprovalNotification — delivery failure (fire-and-forget)
  // -----------------------------------------------------------------------

  describe('delivery failure', () => {
    it('returns Result.err with DeliveryFailed tag on Novu error', async () => {
      const client = mockNovuClient({
        trigger: vi.fn(async () => { throw new Error('Novu service unavailable'); }),
      });

      const result = await sendApprovalNotification(validParams(), client);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('DeliveryFailed');
        expect(result.error.message).toBe('Novu service unavailable');
      }
    });

    it('handles non-Error thrown values', async () => {
      const client = mockNovuClient({
        trigger: vi.fn(async () => { throw 'connection reset'; }),
      });

      const result = await sendApprovalNotification(validParams(), client);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('DeliveryFailed');
        expect(result.error.message).toBe('Unknown Novu delivery error');
        expect(result.error).toHaveProperty('cause', 'connection reset');
      }
    });

    it('never throws — always returns Result', async () => {
      const client = mockNovuClient({
        trigger: vi.fn(async () => { throw new TypeError('Network failure'); }),
      });

      // should not throw
      const result = await sendApprovalNotification(validParams(), client);
      expect(result.ok).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // sendApprovalNotification — invalid params
  // -----------------------------------------------------------------------

  describe('invalid params', () => {
    it('returns InvalidParams when requestId is empty', async () => {
      const client = mockNovuClient();
      const result = await sendApprovalNotification(
        validParams({ requestId: '' }),
        client,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('InvalidParams');
      }
      // novu trigger should not be called
      expect(client.trigger).not.toHaveBeenCalled();
    });

    it('returns InvalidParams when approveUrl is empty', async () => {
      const client = mockNovuClient();
      const result = await sendApprovalNotification(
        validParams({ approveUrl: '' }),
        client,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('InvalidParams');
      }
    });
  });

  // -----------------------------------------------------------------------
  // createSendNotification factory
  // -----------------------------------------------------------------------

  describe('createSendNotification factory', () => {
    it('creates a function compatible with HitlWorkflowDeps', async () => {
      const client = mockNovuClient();
      const sendNotification = createSendNotification(client);

      // should not throw on success
      await sendNotification({
        requestId: 'req-factory-test',
        approverId: 'approver-001',
        summary: 'Test approval',
        approveUrl: 'https://app.aptivo.com/hitl/req-factory-test?action=approve',
        rejectUrl: 'https://app.aptivo.com/hitl/req-factory-test?action=reject',
        expiresAt: EXPIRES_AT,
      });

      expect(client.trigger).toHaveBeenCalledOnce();
    });

    it('throws on delivery failure (caught by workflow fire-and-forget)', async () => {
      const client = mockNovuClient({
        trigger: vi.fn(async () => { throw new Error('Novu down'); }),
      });
      const sendNotification = createSendNotification(client);

      await expect(
        sendNotification({
          requestId: 'req-fail',
          approverId: 'approver-001',
          summary: 'Test',
          approveUrl: 'https://example.com/approve',
          rejectUrl: 'https://example.com/reject',
          expiresAt: EXPIRES_AT,
        }),
      ).rejects.toThrow('Notification delivery failed');
    });
  });
});
