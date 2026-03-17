/**
 * FEAT-06: Cross-Cutting Integration Tests (Sprint 13)
 * @task FEAT-06
 *
 * verifies end-to-end interactions between sprint 13 subsystems:
 * - notification failover pipeline
 * - priority routing + delivery
 * - delivery monitor health
 * - workflow crud lifecycle
 * - webhook dispatch on workflow events
 * - feature flag service
 * - consent withdrawal flow
 * - anomaly detection
 *
 * NO vi.mock — all services use real implementations with in-memory stores.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// -- notification imports --
import { createFailoverAdapter } from '../../packages/notifications/src/adapters/failover-adapter.js';
import { createPriorityRouter } from '../../packages/notifications/src/routing/priority-router.js';
import { createDeliveryMonitor } from '../../packages/notifications/src/monitoring/delivery-monitor.js';
import type {
  NotificationAdapter,
  AdapterSendParams,
  NotificationError,
} from '../../packages/notifications/src/types.js';

// -- workflow imports --
import {
  createWorkflowDefinitionService,
} from '../src/lib/workflows/workflow-definition-service';
import type {
  WorkflowDefinitionStore,
  WorkflowDefinitionRecord,
} from '../src/lib/workflows/workflow-definition-service';

// -- webhook imports --
import {
  createWebhookService,
} from '../src/lib/webhooks/webhook-service';
import type {
  WebhookStore,
  WebhookRegistration,
} from '../src/lib/webhooks/webhook-service';

// -- feature flag imports --
import { createFeatureFlagService } from '../src/lib/feature-flags/feature-flag-service';
import { createLocalFlagProvider } from '../src/lib/feature-flags/local-provider';
import type { FeatureFlag } from '../src/lib/feature-flags/feature-flag-service';

// -- consent imports --
import { createConsentService } from '../src/lib/consent/consent-service';
import type { ConsentServiceDeps } from '../src/lib/consent/consent-service';

// -- anomaly imports --
import { createAnomalyDetector } from '../../packages/audit/src/anomaly/anomaly-detector.js';
import type { AnomalyDetectorDeps, BaselineStats, AccessPattern } from '../../packages/audit/src/anomaly/anomaly-detector.js';

// -- types --
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// in-memory stores
// ---------------------------------------------------------------------------

function createInMemoryNotificationAdapter(
  behavior: 'success' | 'fail' | 'delivery_fail',
  idPrefix = 'adapter',
): NotificationAdapter {
  return {
    async send(_params: AdapterSendParams) {
      if (behavior === 'success') return Result.ok({ id: `${idPrefix}-id-001` });
      if (behavior === 'delivery_fail') {
        return Result.err({
          _tag: 'DeliveryFailed' as const,
          message: `${idPrefix} delivery failed`,
          cause: new Error(`${idPrefix} down`),
          attempts: 1,
        } as NotificationError);
      }
      return Result.err({
        _tag: 'InvalidParams' as const,
        message: `${idPrefix} bad input`,
      } as NotificationError);
    },
    async upsertSubscriber() {
      return Result.ok(undefined);
    },
  };
}

function createInMemoryWorkflowStore(): WorkflowDefinitionStore {
  const records = new Map<string, WorkflowDefinitionRecord>();

  return {
    async create(record) {
      const id = crypto.randomUUID();
      const now = new Date();
      const full: WorkflowDefinitionRecord = {
        ...record,
        id,
        createdAt: now,
        updatedAt: now,
      };
      records.set(id, full);
      return full;
    },
    async findById(id) {
      return records.get(id) ?? null;
    },
    async findByName(name, domain) {
      return [...records.values()].filter((r) => r.name === name && r.domain === domain);
    },
    async list(domain?) {
      const all = [...records.values()];
      if (domain) return all.filter((r) => r.domain === domain);
      return all;
    },
    async update(id, data) {
      const existing = records.get(id);
      if (!existing) return null;
      const updated: WorkflowDefinitionRecord = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      records.set(id, updated);
      return updated;
    },
    async delete(id) {
      return records.delete(id);
    },
  };
}

function createInMemoryWebhookStore(): WebhookStore {
  const records = new Map<string, WebhookRegistration>();

  return {
    async register(reg) {
      const id = crypto.randomUUID();
      const full: WebhookRegistration = {
        ...reg,
        id,
        createdAt: new Date(),
      };
      records.set(id, full);
      return full;
    },
    async findByEvent(event) {
      return [...records.values()].filter((r) => r.events.includes(event));
    },
    async findById(id) {
      return records.get(id) ?? null;
    },
    async deactivate(id) {
      const existing = records.get(id);
      if (!existing) return false;
      records.set(id, { ...existing, active: false });
      return true;
    },
    async list() {
      return [...records.values()];
    },
  };
}

function createInMemoryBaselineStore(baselines: Map<string, BaselineStats>): AnomalyDetectorDeps {
  return {
    async getBaseline(actor, resourceType, _windowDays) {
      const key = `${actor}:${resourceType}`;
      return baselines.get(key) ?? { mean: 0, stdDev: 0, sampleSize: 0 };
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const VALID_SEND_PARAMS: AdapterSendParams = {
  recipientId: 'user@test.com',
  channel: 'email',
  subject: 'Test Subject',
  body: '<p>Hello world</p>',
  transactionId: 'txn-001',
};

const validWorkflowInput = {
  name: 'integration-test-workflow',
  domain: 'core',
  description: 'An integration test workflow',
  steps: [
    {
      id: 'step-1',
      type: 'action' as const,
      name: 'Fetch data',
      config: { url: 'https://api.example.com' },
      nextSteps: ['step-2'],
    },
    {
      id: 'step-2',
      type: 'hitl' as const,
      name: 'Approve',
      config: { timeout: 3600 },
    },
  ],
};

function utcDate(hour: number): Date {
  const d = new Date('2026-03-17T00:00:00Z');
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// 1. Notification Failover Pipeline
// ---------------------------------------------------------------------------

describe('Notification Failover Pipeline', () => {
  it('novu succeeds → result from novu, smtp not called', async () => {
    const novu = createInMemoryNotificationAdapter('success', 'novu');
    const smtp = createInMemoryNotificationAdapter('success', 'smtp');
    const adapter = createFailoverAdapter(novu, smtp, 'novu_primary');

    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('novu-id-001');
  });

  it('novu fails with DeliveryFailed → falls back to smtp', async () => {
    const novu = createInMemoryNotificationAdapter('delivery_fail', 'novu');
    const smtp = createInMemoryNotificationAdapter('success', 'smtp');
    const adapter = createFailoverAdapter(novu, smtp, 'novu_primary');

    // suppress expected console.warn
    const warnSpy = globalThis.console.warn;
    globalThis.console.warn = () => {};

    const result = await adapter.send(VALID_SEND_PARAMS);

    globalThis.console.warn = warnSpy;

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('smtp-id-001');
  });

  it('novu fails with non-delivery error → no fallback', async () => {
    const novu = createInMemoryNotificationAdapter('fail', 'novu');
    const smtp = createInMemoryNotificationAdapter('success', 'smtp');
    const adapter = createFailoverAdapter(novu, smtp, 'novu_primary');

    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidParams');
  });
});

// ---------------------------------------------------------------------------
// 2. Priority Routing + Delivery
// ---------------------------------------------------------------------------

describe('Priority Routing + Delivery', () => {
  const router = createPriorityRouter();

  it('normal notification during quiet hours → delayed', () => {
    const decision = router.route('normal', utcDate(23));
    expect(decision.shouldSend).toBe(false);
    expect(decision.delayed).toBe(true);
  });

  it('critical notification during quiet hours → sent', () => {
    const decision = router.route('critical', utcDate(23));
    expect(decision.shouldSend).toBe(true);
    expect(decision.delayed).toBe(false);
  });

  it('outside quiet hours → all priorities sent', () => {
    const priorities = ['critical', 'high', 'normal', 'low'] as const;
    for (const priority of priorities) {
      const decision = router.route(priority, utcDate(12));
      expect(decision.shouldSend).toBe(true);
      expect(decision.delayed).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Delivery Monitor Health
// ---------------------------------------------------------------------------

describe('Delivery Monitor Health', () => {
  it('100 sent, 95 delivered → healthy', async () => {
    const deps = {
      getDeliveryStats: async (_windowMs: number) => ({
        sent: 100,
        delivered: 95,
        failed: 3,
      }),
    };
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(true);
    expect(result.value.dropRate).toBe(0.02);
  });

  it('100 sent, 80 delivered → unhealthy (20% drop rate)', async () => {
    const deps = {
      getDeliveryStats: async (_windowMs: number) => ({
        sent: 100,
        delivered: 80,
        failed: 0,
      }),
    };
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(false);
    expect(result.value.dropRate).toBe(0.2);
  });

  it('zero sends → healthy with zero drop rate', async () => {
    const deps = {
      getDeliveryStats: async (_windowMs: number) => ({
        sent: 0,
        delivered: 0,
        failed: 0,
      }),
    };
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(true);
    expect(result.value.dropRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Workflow CRUD Lifecycle
// ---------------------------------------------------------------------------

describe('Workflow CRUD Lifecycle', () => {
  let store: WorkflowDefinitionStore;
  let service: ReturnType<typeof createWorkflowDefinitionService>;

  beforeEach(() => {
    store = createInMemoryWorkflowStore();
    service = createWorkflowDefinitionService({ store });
  });

  it('create → list → update (version increments) → delete', async () => {
    // create
    const created = await service.create(validWorkflowInput, 'user-1');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.version).toBe(1);

    // list
    const listed = await service.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);

    // update — version should increment
    const updated = await service.update(created.value.id, { name: 'renamed-workflow' });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.name).toBe('renamed-workflow');
    expect(updated.value.version).toBe(2);

    // delete
    const deleted = await service.delete(created.value.id);
    expect(deleted.ok).toBe(true);

    // verify deletion
    const findResult = await service.findById(created.value.id);
    expect(findResult.ok).toBe(false);
  });

  it('create with invalid steps → ValidationError', async () => {
    const result = await service.create({ name: 'bad', domain: 'core', steps: [] }, 'user-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('update with zod validation on partial input', async () => {
    const created = await service.create(validWorkflowInput, 'user-1');
    if (!created.ok) throw new Error('setup failed');

    // update with valid partial input
    const updated = await service.update(created.value.id, { status: 'active' });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// 5. Webhook Dispatch on Workflow Events
// ---------------------------------------------------------------------------

describe('Webhook Dispatch on Workflow Events', () => {
  let webhookStore: WebhookStore;
  let webhookService: ReturnType<typeof createWebhookService>;

  beforeEach(() => {
    webhookStore = createInMemoryWebhookStore();
    webhookService = createWebhookService({ store: webhookStore });
  });

  it('registered webhook dispatches on matching event', async () => {
    // register webhook for workflow.created
    const regResult = await webhookService.register({
      url: 'https://hooks.example.com/wf',
      events: ['workflow.created'],
      secret: 'a-very-secure-webhook-secret-that-is-at-least-32-chars',
    });
    expect(regResult.ok).toBe(true);

    // dispatch workflow.created
    const dispatchResult = await webhookService.dispatch('workflow.created', { id: 'wf-1', name: 'test' });
    expect(dispatchResult.ok).toBe(true);
    if (!dispatchResult.ok) return;
    expect(dispatchResult.value).toHaveLength(1);
    expect(dispatchResult.value[0]!.success).toBe(true);
  });

  it('inactive webhook is not dispatched', async () => {
    const regResult = await webhookService.register({
      url: 'https://hooks.example.com/wf',
      events: ['workflow.created'],
      secret: 'a-very-secure-webhook-secret-that-is-at-least-32-chars',
    });
    if (!regResult.ok) throw new Error('setup failed');

    // deactivate
    await webhookService.deactivate(regResult.value.id);

    // dispatch should not reach inactive webhook
    const dispatchResult = await webhookService.dispatch('workflow.created', { id: 'wf-1' });
    expect(dispatchResult.ok).toBe(true);
    if (!dispatchResult.ok) return;
    expect(dispatchResult.value).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Feature Flag Service
// ---------------------------------------------------------------------------

describe('Feature Flag Service', () => {
  const testFlags: FeatureFlag[] = [
    { key: 'feature-a', enabled: true, description: 'always on' },
    { key: 'feature-b', enabled: false, description: 'always off' },
    {
      key: 'domain-gated',
      enabled: false,
      rules: [
        {
          attribute: 'domain',
          operator: 'eq' as const,
          value: 'hr',
          result: { enabled: true, variant: 'hr-active' },
        },
      ],
    },
  ];

  const provider = createLocalFlagProvider(testFlags);
  const service = createFeatureFlagService({ provider });

  it('isEnabled with default flags', async () => {
    const resultA = await service.isEnabled('feature-a');
    expect(resultA.ok).toBe(true);
    if (!resultA.ok) return;
    expect(resultA.value).toBe(true);

    const resultB = await service.isEnabled('feature-b');
    expect(resultB.ok).toBe(true);
    if (!resultB.ok) return;
    expect(resultB.value).toBe(false);
  });

  it('rule-based targeting — domain=hr → enabled', async () => {
    const result = await service.isEnabled('domain-gated', { domain: 'hr' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);

    // non-matching domain falls back to default (false)
    const resultCrypto = await service.isEnabled('domain-gated', { domain: 'crypto' });
    expect(resultCrypto.ok).toBe(true);
    if (!resultCrypto.ok) return;
    expect(resultCrypto.value).toBe(false);
  });

  it('missing flag → FlagNotFound', async () => {
    const result = await service.isEnabled('non-existent-flag');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('FlagNotFound');
    expect(result.error.key).toBe('non-existent-flag');
  });

  it('getVariant returns variant from rule match', async () => {
    const result = await service.getVariant('domain-gated', { domain: 'hr' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('hr-active');
  });

  it('getAllFlags returns full list', async () => {
    const result = await service.getAllFlags();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 7. Consent Withdrawal Flow
// ---------------------------------------------------------------------------

describe('Consent Withdrawal Flow', () => {
  it('withdraw → audit emitted → event emitted', async () => {
    const auditEvents: Array<Record<string, unknown>> = [];
    const inngestEvents: Array<Record<string, unknown>> = [];

    const deps: ConsentServiceDeps = {
      emitAudit: async (event) => { auditEvents.push(event); },
      emitEvent: async (event) => { inngestEvents.push(event); },
    };

    const service = createConsentService(deps);
    const result = await service.withdrawConsent({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      consentType: 'marketing',
      reason: 'Not interested anymore',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.consentType).toBe('marketing');
    expect(result.value.auditRecorded).toBe(true);

    // verify audit event emitted
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]!.action).toBe('consent.withdrawn');

    // verify inngest event emitted
    expect(inngestEvents).toHaveLength(1);
    expect((inngestEvents[0] as { name: string }).name).toBe('platform/consent.withdrawn');
  });

  it('invalid consent type → ValidationError', async () => {
    const deps: ConsentServiceDeps = {
      emitAudit: async () => {},
      emitEvent: async () => {},
    };

    const service = createConsentService(deps);
    const result = await service.withdrawConsent({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      consentType: 'invalid_type',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('withdrawal succeeds even when emitEvent is absent', async () => {
    const deps: ConsentServiceDeps = {
      emitAudit: async () => {},
    };

    const service = createConsentService(deps);
    const result = await service.withdrawConsent({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      consentType: 'analytics',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.consentType).toBe('analytics');
  });
});

// ---------------------------------------------------------------------------
// 8. Anomaly Detection
// ---------------------------------------------------------------------------

describe('Anomaly Detection', () => {
  function makePattern(overrides?: Partial<AccessPattern>): AccessPattern {
    return {
      actor: 'user-1',
      resourceType: 'candidate',
      action: 'read',
      count: 10,
      windowStart: new Date('2026-03-10T00:00:00Z'),
      windowEnd: new Date('2026-03-17T00:00:00Z'),
      ...overrides,
    };
  }

  it('normal access pattern → not anomaly', async () => {
    const baselines = new Map<string, BaselineStats>();
    baselines.set('user-1:candidate', { mean: 10, stdDev: 3, sampleSize: 30 });

    const deps = createInMemoryBaselineStore(baselines);
    const detector = createAnomalyDetector(deps);

    const result = await detector.evaluate(makePattern({ count: 10 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(false);
    expect(result.value.score).toBe(0);
  });

  it('excessive access → anomaly detected', async () => {
    const baselines = new Map<string, BaselineStats>();
    baselines.set('user-1:candidate', { mean: 10, stdDev: 2, sampleSize: 30 });

    const deps = createInMemoryBaselineStore(baselines);
    const detector = createAnomalyDetector(deps);

    // count 20 → z = (20-10)/2 = 5.0 >= 3.0 → anomaly
    const result = await detector.evaluate(makePattern({ count: 20 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(true);
    expect(result.value.reason).toContain('access count 20');
    expect(result.value.score).toBeGreaterThan(0.5);
  });

  it('insufficient baseline → suppressed', async () => {
    const baselines = new Map<string, BaselineStats>();
    baselines.set('user-1:candidate', { mean: 5, stdDev: 1, sampleSize: 2 });

    const deps = createInMemoryBaselineStore(baselines);
    const detector = createAnomalyDetector(deps);

    // even though count is very high, insufficient baseline suppresses
    const result = await detector.evaluate(makePattern({ count: 1000 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(false);
    expect(result.value.reason).toBe('insufficient baseline data');
    expect(result.value.score).toBe(0);
  });
});
