/**
 * NOTIF-01: Notification service tests
 * @task NOTIF-01
 *
 * Tests:
 * - successful delivery pipeline (resolve → render → opt-out check → send → log)
 * - per-channel opt-out enforcement
 * - delivery retry on transient failure
 * - retry exhaustion returns DeliveryFailed
 * - delivery logging for all attempts
 * - InvalidParams for missing fields
 * - TemplateNotFound for unknown slugs
 * - subscriber upsert delegation
 * - opt-out preference setting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';
import { createNotificationService } from '../src/notification-service.js';
import type {
  NotificationAdapter,
  NotificationPreferenceStore,
  DeliveryLogStore,
  TemplateRegistry,
  TemplateRecord,
  NotificationServiceDeps,
  NotificationParams,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const TEST_TEMPLATE: TemplateRecord = {
  slug: 'welcome',
  name: 'Welcome Email',
  version: 1,
  isActive: true,
  emailTemplate: { subject: 'Hello {{name}}', body: 'Welcome, {{name}}!' },
  telegramTemplate: { body: 'Welcome, {{name}}!' },
  pushTemplate: null,
};

function createMockAdapter(overrides?: Partial<NotificationAdapter>): NotificationAdapter {
  return {
    send: vi.fn().mockResolvedValue(Result.ok({ id: 'delivery-001' })),
    upsertSubscriber: vi.fn().mockResolvedValue(Result.ok(undefined)),
    ...overrides,
  };
}

function createMockPreferenceStore(overrides?: Partial<NotificationPreferenceStore>): NotificationPreferenceStore {
  return {
    isOptedOut: vi.fn().mockResolvedValue(false),
    setOptOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockDeliveryLogStore(): DeliveryLogStore {
  return {
    record: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockTemplateRegistry(overrides?: Partial<TemplateRegistry>): TemplateRegistry {
  return {
    resolve: vi.fn().mockResolvedValue(Result.ok(TEST_TEMPLATE)),
    ...overrides,
  };
}

function createDeps(overrides?: Partial<NotificationServiceDeps>): NotificationServiceDeps {
  return {
    adapter: createMockAdapter(),
    preferenceStore: createMockPreferenceStore(),
    deliveryLogStore: createMockDeliveryLogStore(),
    templateRegistry: createMockTemplateRegistry(),
    ...overrides,
  };
}

const VALID_PARAMS: NotificationParams = {
  recipientId: 'user-1',
  channel: 'email',
  templateSlug: 'welcome',
  variables: { name: 'Alice' },
};

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('createNotificationService', () => {
  let deps: NotificationServiceDeps;

  beforeEach(() => {
    deps = createDeps();
  });

  it('returns Result.ok with deliveryId on successful send', async () => {
    const service = createNotificationService(deps);
    const result = await service.send(VALID_PARAMS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deliveryId).toBe('delivery-001');
  });

  it('resolves template before sending', async () => {
    const service = createNotificationService(deps);
    await service.send(VALID_PARAMS);

    expect(deps.templateRegistry.resolve).toHaveBeenCalledWith('welcome', undefined, 'email');
  });

  it('passes rendered body to adapter', async () => {
    const service = createNotificationService(deps);
    await service.send(VALID_PARAMS);

    const sendCall = vi.mocked(deps.adapter.send).mock.calls[0]![0];
    expect(sendCall.body).toBe('Welcome, Alice!');
    expect(sendCall.subject).toBe('Hello Alice');
  });

  it('checks opt-out before sending', async () => {
    const service = createNotificationService(deps);
    await service.send(VALID_PARAMS);

    expect(deps.preferenceStore.isOptedOut).toHaveBeenCalledWith('user-1', 'email');
  });

  it('returns RecipientOptedOut when user is opted out', async () => {
    deps.preferenceStore = createMockPreferenceStore({
      isOptedOut: vi.fn().mockResolvedValue(true),
    });
    const service = createNotificationService(deps);
    const result = await service.send(VALID_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('RecipientOptedOut');
    expect(result.error).toEqual({
      _tag: 'RecipientOptedOut',
      recipientId: 'user-1',
      channel: 'email',
    });
  });

  it('logs opted-out delivery', async () => {
    deps.preferenceStore = createMockPreferenceStore({
      isOptedOut: vi.fn().mockResolvedValue(true),
    });
    const service = createNotificationService(deps);
    await service.send(VALID_PARAMS);

    expect(deps.deliveryLogStore.record).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'opted_out', attempt: 0 }),
    );
  });

  it('retries on transient failure and succeeds', async () => {
    const adapter = createMockAdapter({
      send: vi.fn()
        .mockResolvedValueOnce(Result.err({
          _tag: 'DeliveryFailed' as const,
          message: 'timeout',
          cause: new Error('timeout'),
          attempts: 1,
        }))
        .mockResolvedValueOnce(Result.ok({ id: 'delivery-002' })),
    });
    deps.adapter = adapter;
    const service = createNotificationService(deps);
    const result = await service.send(VALID_PARAMS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deliveryId).toBe('delivery-002');
    expect(adapter.send).toHaveBeenCalledTimes(2);
  });

  it('logs each delivery attempt', async () => {
    const adapter = createMockAdapter({
      send: vi.fn()
        .mockResolvedValueOnce(Result.err({
          _tag: 'DeliveryFailed' as const,
          message: 'timeout',
          cause: new Error('timeout'),
          attempts: 1,
        }))
        .mockResolvedValueOnce(Result.ok({ id: 'delivery-002' })),
    });
    deps.adapter = adapter;
    const service = createNotificationService(deps);
    await service.send(VALID_PARAMS);

    expect(deps.deliveryLogStore.record).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(deps.deliveryLogStore.record).mock.calls;
    expect(calls[0]![0].status).toBe('failed');
    expect(calls[0]![0].attempt).toBe(1);
    expect(calls[1]![0].status).toBe('delivered');
    expect(calls[1]![0].attempt).toBe(2);
  });

  it('returns DeliveryFailed after all retries exhausted', async () => {
    const adapter = createMockAdapter({
      send: vi.fn().mockResolvedValue(Result.err({
        _tag: 'DeliveryFailed' as const,
        message: 'always fails',
        cause: new Error('nope'),
        attempts: 1,
      })),
    });
    deps.adapter = adapter;
    const service = createNotificationService({ ...deps, maxRetries: 2 });
    const result = await service.send(VALID_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DeliveryFailed');
    if (result.error._tag !== 'DeliveryFailed') return;
    expect(result.error.attempts).toBe(2);
    expect(adapter.send).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient errors', async () => {
    const adapter = createMockAdapter({
      send: vi.fn().mockResolvedValue(Result.err({
        _tag: 'InvalidParams' as const,
        message: 'bad recipient',
      })),
    });
    deps.adapter = adapter;
    const service = createNotificationService(deps);
    const result = await service.send(VALID_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidParams');
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });

  it('returns InvalidParams for missing recipientId', async () => {
    const service = createNotificationService(deps);
    const result = await service.send({ ...VALID_PARAMS, recipientId: '' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidParams');
  });

  it('returns InvalidParams for missing channel', async () => {
    const service = createNotificationService(deps);
    const result = await service.send({ ...VALID_PARAMS, channel: '' as 'email' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidParams');
  });

  it('returns InvalidParams for missing templateSlug', async () => {
    const service = createNotificationService(deps);
    const result = await service.send({ ...VALID_PARAMS, templateSlug: '' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidParams');
  });

  it('returns TemplateNotFound for unknown template', async () => {
    deps.templateRegistry = createMockTemplateRegistry({
      resolve: vi.fn().mockResolvedValue(Result.err({
        _tag: 'TemplateNotFound' as const,
        slug: 'unknown',
      })),
    });
    const service = createNotificationService(deps);
    const result = await service.send({ ...VALID_PARAMS, templateSlug: 'unknown' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('TemplateNotFound');
  });

  it('returns TemplateNotFound when channel template missing', async () => {
    // template exists but has no push template
    deps.templateRegistry = createMockTemplateRegistry({
      resolve: vi.fn().mockResolvedValue(Result.ok(TEST_TEMPLATE)),
    });
    const service = createNotificationService(deps);
    const result = await service.send({ ...VALID_PARAMS, channel: 'push' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('TemplateNotFound');
  });

  it('sends telegram messages using telegramTemplate', async () => {
    const service = createNotificationService(deps);
    const result = await service.send({ ...VALID_PARAMS, channel: 'telegram' });

    expect(result.ok).toBe(true);
    const sendCall = vi.mocked(deps.adapter.send).mock.calls[0]![0];
    expect(sendCall.body).toBe('Welcome, Alice!');
    expect(sendCall.channel).toBe('telegram');
  });

  it('delegates upsertSubscriber to adapter', async () => {
    const service = createNotificationService(deps);
    const result = await service.upsertSubscriber('user-1', { email: 'a@b.com' });

    expect(result.ok).toBe(true);
    expect(deps.adapter.upsertSubscriber).toHaveBeenCalledWith('user-1', { email: 'a@b.com' });
  });

  it('delegates setOptOut to preference store', async () => {
    const service = createNotificationService(deps);
    const result = await service.setOptOut('user-1', 'email', true);

    expect(result.ok).toBe(true);
    expect(deps.preferenceStore.setOptOut).toHaveBeenCalledWith('user-1', 'email', true);
  });

  it('returns InvalidParams when setOptOut fails', async () => {
    deps.preferenceStore = createMockPreferenceStore({
      setOptOut: vi.fn().mockRejectedValue(new Error('db error')),
    });
    const service = createNotificationService(deps);
    const result = await service.setOptOut('user-1', 'email', true);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidParams');
  });

  it('returns DeliveryFailed when dependency throws unexpectedly', async () => {
    deps.templateRegistry = createMockTemplateRegistry({
      resolve: vi.fn().mockRejectedValue(new Error('db connection lost')),
    });
    const service = createNotificationService(deps);
    const result = await service.send(VALID_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DeliveryFailed');
  });

  it('logs successful delivery with deliveredAt', async () => {
    const service = createNotificationService(deps);
    await service.send(VALID_PARAMS);

    const logCall = vi.mocked(deps.deliveryLogStore.record).mock.calls[0]![0];
    expect(logCall.status).toBe('delivered');
    expect(logCall.deliveredAt).toBeInstanceOf(Date);
  });

  it('includes transactionId in delivery log', async () => {
    const service = createNotificationService(deps);
    await service.send({ ...VALID_PARAMS, transactionId: 'txn-123' });

    const logCall = vi.mocked(deps.deliveryLogStore.record).mock.calls[0]![0];
    expect(logCall.transactionId).toBe('txn-123');
  });
});
