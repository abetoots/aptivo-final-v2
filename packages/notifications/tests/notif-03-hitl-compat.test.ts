/**
 * NOTIF-03: HITL notification compatibility shim tests
 * @task NOTIF-03
 *
 * Tests:
 * - Shim routes HITL params through NotificationService.send()
 * - Uses correct template slug and channel
 * - Maps all HITL fields to template variables
 * - Throws on delivery failure (matching HITL-08 behavior)
 * - Uses requestId as transactionId for dedup
 * - Custom template slug and channel
 */

import { describe, it, expect, vi } from 'vitest';
import { Result } from '@aptivo/types';
import { createHitlNotificationShim } from '../src/compat/hitl-shim.js';
import type { NotificationService } from '../src/types.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createMockNotificationService(overrides?: Partial<NotificationService>): NotificationService {
  return {
    send: vi.fn().mockResolvedValue(Result.ok({ deliveryId: 'delivery-001' })),
    upsertSubscriber: vi.fn().mockResolvedValue(Result.ok(undefined)),
    setOptOut: vi.fn().mockResolvedValue(Result.ok(undefined)),
    ...overrides,
  };
}

const HITL_PARAMS = {
  requestId: 'req-1',
  approverId: 'approver-1',
  summary: 'Deploy v2.0 to production',
  approveUrl: 'https://app.example.com/hitl/req-1?action=approve&token=abc',
  rejectUrl: 'https://app.example.com/hitl/req-1?action=reject&token=abc',
  expiresAt: new Date('2026-03-15T12:00:00Z'),
};

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('createHitlNotificationShim', () => {
  it('routes through NotificationService.send()', async () => {
    const service = createMockNotificationService();
    const sendNotification = createHitlNotificationShim(service);

    await sendNotification(HITL_PARAMS);

    expect(service.send).toHaveBeenCalledTimes(1);
  });

  it('uses hitl-approval-request template slug', async () => {
    const service = createMockNotificationService();
    const sendNotification = createHitlNotificationShim(service);

    await sendNotification(HITL_PARAMS);

    const call = vi.mocked(service.send).mock.calls[0]![0];
    expect(call.templateSlug).toBe('hitl-approval-request');
  });

  it('defaults to email channel', async () => {
    const service = createMockNotificationService();
    const sendNotification = createHitlNotificationShim(service);

    await sendNotification(HITL_PARAMS);

    const call = vi.mocked(service.send).mock.calls[0]![0];
    expect(call.channel).toBe('email');
  });

  it('maps all HITL fields to template variables', async () => {
    const service = createMockNotificationService();
    const sendNotification = createHitlNotificationShim(service);

    await sendNotification(HITL_PARAMS);

    const call = vi.mocked(service.send).mock.calls[0]![0];
    expect(call.variables).toEqual({
      approverName: 'approver-1',
      summary: 'Deploy v2.0 to production',
      approveUrl: HITL_PARAMS.approveUrl,
      rejectUrl: HITL_PARAMS.rejectUrl,
      expiresAt: '2026-03-15T12:00:00.000Z',
      requestId: 'req-1',
    });
  });

  it('uses requestId as transactionId for dedup', async () => {
    const service = createMockNotificationService();
    const sendNotification = createHitlNotificationShim(service);

    await sendNotification(HITL_PARAMS);

    const call = vi.mocked(service.send).mock.calls[0]![0];
    expect(call.transactionId).toBe('req-1');
  });

  it('sets recipientId to approverId', async () => {
    const service = createMockNotificationService();
    const sendNotification = createHitlNotificationShim(service);

    await sendNotification(HITL_PARAMS);

    const call = vi.mocked(service.send).mock.calls[0]![0];
    expect(call.recipientId).toBe('approver-1');
  });

  it('throws on delivery failure (matching HITL-08 behavior)', async () => {
    const service = createMockNotificationService({
      send: vi.fn().mockResolvedValue(Result.err({
        _tag: 'DeliveryFailed' as const,
        message: 'Novu down',
        cause: new Error('Novu down'),
        attempts: 3,
      })),
    });
    const sendNotification = createHitlNotificationShim(service);

    await expect(sendNotification(HITL_PARAMS)).rejects.toThrow(
      'Notification delivery failed: DeliveryFailed',
    );
  });

  it('throws on opt-out (matching fire-and-forget pattern)', async () => {
    const service = createMockNotificationService({
      send: vi.fn().mockResolvedValue(Result.err({
        _tag: 'RecipientOptedOut' as const,
        recipientId: 'approver-1',
        channel: 'email',
      })),
    });
    const sendNotification = createHitlNotificationShim(service);

    await expect(sendNotification(HITL_PARAMS)).rejects.toThrow(
      'Notification delivery failed: RecipientOptedOut',
    );
  });

  it('supports custom template slug', async () => {
    const service = createMockNotificationService();
    const sendNotification = createHitlNotificationShim(service, {
      templateSlug: 'custom-approval',
    });

    await sendNotification(HITL_PARAMS);

    const call = vi.mocked(service.send).mock.calls[0]![0];
    expect(call.templateSlug).toBe('custom-approval');
  });

  it('supports custom channel', async () => {
    const service = createMockNotificationService();
    const sendNotification = createHitlNotificationShim(service, {
      channel: 'telegram',
    });

    await sendNotification(HITL_PARAMS);

    const call = vi.mocked(service.send).mock.calls[0]![0];
    expect(call.channel).toBe('telegram');
  });

  it('does not throw on success', async () => {
    const service = createMockNotificationService();
    const sendNotification = createHitlNotificationShim(service);

    await expect(sendNotification(HITL_PARAMS)).resolves.toBeUndefined();
  });
});
