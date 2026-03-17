/**
 * FEAT-02: Extensible Webhook Action Points tests
 * @task FEAT-02
 *
 * verifies webhook registration, hmac signing, dispatch, and lifecycle.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import {
  createWebhookService,
  WebhookRegistrationInput,
} from '../src/lib/webhooks/webhook-service';
import type {
  WebhookStore,
  WebhookRegistration,
} from '../src/lib/webhooks/webhook-service';

// ---------------------------------------------------------------------------
// in-memory store (mirrors composition root progressive pattern)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// valid test input
// ---------------------------------------------------------------------------

const validInput = {
  url: 'https://hooks.example.com/webhook',
  events: ['workflow.created', 'workflow.activated'],
  secret: 'a-very-secure-webhook-secret-that-is-at-least-32-chars',
  description: 'Integration test webhook',
};

// ---------------------------------------------------------------------------
// WebhookRegistrationInput validation
// ---------------------------------------------------------------------------

describe('WebhookRegistrationInput', () => {
  it('validates a valid input', () => {
    const result = WebhookRegistrationInput.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects invalid url', () => {
    const result = WebhookRegistrationInput.safeParse({
      ...validInput,
      url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty events array', () => {
    const result = WebhookRegistrationInput.safeParse({
      ...validInput,
      events: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects secret shorter than 32 characters', () => {
    const result = WebhookRegistrationInput.safeParse({
      ...validInput,
      secret: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional description', () => {
    const { description: _, ...noDesc } = validInput;
    const result = WebhookRegistrationInput.safeParse(noDesc);
    expect(result.success).toBe(true);
  });

  it('rejects description over 500 characters', () => {
    const result = WebhookRegistrationInput.safeParse({
      ...validInput,
      description: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// service: register
// ---------------------------------------------------------------------------

describe('createWebhookService — register', () => {
  let store: WebhookStore;

  beforeEach(() => {
    store = createInMemoryWebhookStore();
  });

  it('registers a webhook with valid input and returns record with id', async () => {
    const service = createWebhookService({ store });
    const result = await service.register(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBeDefined();
    expect(result.value.url).toBe(validInput.url);
    expect(result.value.events).toEqual(validInput.events);
    expect(result.value.active).toBe(true);
    expect(result.value.createdAt).toBeInstanceOf(Date);
  });

  it('stores secret as hash, not raw value', async () => {
    const service = createWebhookService({ store });
    const result = await service.register(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // secret hash should not equal the raw secret
    expect(result.value.secretHash).not.toBe(validInput.secret);
    // should be a hex string (sha-256 hmac output)
    expect(result.value.secretHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns ValidationError for invalid url', async () => {
    const service = createWebhookService({ store });
    const result = await service.register({ ...validInput, url: 'bad' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('returns ValidationError for missing events', async () => {
    const service = createWebhookService({ store });
    const result = await service.register({ ...validInput, events: [] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('returns ValidationError for short secret', async () => {
    const service = createWebhookService({ store });
    const result = await service.register({ ...validInput, secret: 'abc' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('stores description when provided', async () => {
    const service = createWebhookService({ store });
    const result = await service.register(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.description).toBe('Integration test webhook');
  });
});

// ---------------------------------------------------------------------------
// service: dispatch
// ---------------------------------------------------------------------------

describe('createWebhookService — dispatch', () => {
  let store: WebhookStore;

  beforeEach(() => {
    store = createInMemoryWebhookStore();
  });

  it('dispatches to registered webhooks for matching event', async () => {
    const service = createWebhookService({ store });
    await service.register(validInput);

    const result = await service.dispatch('workflow.created', { id: 'wf-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].url).toBe(validInput.url);
    expect(result.value[0].success).toBe(true);
    expect(result.value[0].status).toBe(200);
    expect(result.value[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('dispatches to multiple registered webhooks', async () => {
    const service = createWebhookService({ store });
    await service.register(validInput);
    await service.register({
      ...validInput,
      url: 'https://hooks.example.com/webhook-2',
    });

    const result = await service.dispatch('workflow.created', { id: 'wf-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
  });

  it('returns empty results for non-matching event', async () => {
    const service = createWebhookService({ store });
    await service.register(validInput);

    const result = await service.dispatch('hitl.decided', { id: 'h-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('skips inactive webhooks', async () => {
    const service = createWebhookService({ store });
    const reg = await service.register(validInput);
    if (!reg.ok) throw new Error('setup failed');

    // deactivate then dispatch
    await service.deactivate(reg.value.id);
    const result = await service.dispatch('workflow.created', { id: 'wf-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('returns empty results when no webhooks exist', async () => {
    const service = createWebhookService({ store });
    const result = await service.dispatch('workflow.created', { id: 'wf-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// service: signPayload
// ---------------------------------------------------------------------------

describe('createWebhookService — signPayload', () => {
  it('produces deterministic hmac-sha256 signature', () => {
    const store = createInMemoryWebhookStore();
    const service = createWebhookService({ store });

    const payload = '{"event":"test","data":{}}';
    const secret = 'test-secret';

    const sig1 = service.signPayload(payload, secret);
    const sig2 = service.signPayload(payload, secret);

    expect(sig1).toBe(sig2);
    // should be a 64-char hex string
    expect(sig1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different signatures for different payloads', () => {
    const store = createInMemoryWebhookStore();
    const service = createWebhookService({ store });

    const secret = 'test-secret';
    const sig1 = service.signPayload('payload-a', secret);
    const sig2 = service.signPayload('payload-b', secret);

    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different secrets', () => {
    const store = createInMemoryWebhookStore();
    const service = createWebhookService({ store });

    const payload = '{"event":"test"}';
    const sig1 = service.signPayload(payload, 'secret-a');
    const sig2 = service.signPayload(payload, 'secret-b');

    expect(sig1).not.toBe(sig2);
  });

  it('matches manual hmac-sha256 computation', () => {
    const store = createInMemoryWebhookStore();
    const service = createWebhookService({ store });

    const payload = '{"event":"workflow.created"}';
    const secret = 'manual-test-secret';

    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const actual = service.signPayload(payload, secret);

    expect(actual).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// service: deactivate
// ---------------------------------------------------------------------------

describe('createWebhookService — deactivate', () => {
  let store: WebhookStore;

  beforeEach(() => {
    store = createInMemoryWebhookStore();
  });

  it('deactivates an existing webhook', async () => {
    const service = createWebhookService({ store });
    const reg = await service.register(validInput);
    if (!reg.ok) throw new Error('setup failed');

    const result = await service.deactivate(reg.value.id);
    expect(result.ok).toBe(true);

    // verify it's inactive via list
    const listResult = await service.list();
    if (!listResult.ok) throw new Error('list failed');
    const found = listResult.value.find((w) => w.id === reg.value.id);
    expect(found?.active).toBe(false);
  });

  it('returns WebhookNotFound for non-existent id', async () => {
    const service = createWebhookService({ store });
    const result = await service.deactivate('non-existent');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('WebhookNotFound');
    expect(result.error.id).toBe('non-existent');
  });
});

// ---------------------------------------------------------------------------
// service: list
// ---------------------------------------------------------------------------

describe('createWebhookService — list', () => {
  let store: WebhookStore;

  beforeEach(() => {
    store = createInMemoryWebhookStore();
  });

  it('returns empty array when no webhooks exist', async () => {
    const service = createWebhookService({ store });
    const result = await service.list();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('returns all registered webhooks', async () => {
    const service = createWebhookService({ store });
    await service.register(validInput);
    await service.register({
      ...validInput,
      url: 'https://hooks.example.com/second',
      events: ['hitl.requested'],
    });

    const result = await service.list();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
  });

  it('includes both active and inactive webhooks', async () => {
    const service = createWebhookService({ store });
    const reg = await service.register(validInput);
    if (!reg.ok) throw new Error('setup failed');
    await service.deactivate(reg.value.id);

    await service.register({
      ...validInput,
      url: 'https://hooks.example.com/active',
    });

    const result = await service.list();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value.filter((w) => w.active)).toHaveLength(1);
    expect(result.value.filter((w) => !w.active)).toHaveLength(1);
  });
});
