/**
 * NOTIF-02: Template registry + renderer tests
 * @task NOTIF-02
 *
 * Tests:
 * - renderTemplate: variable substitution, missing vars, no placeholders
 * - renderTemplate: Zod schema validation
 * - createTemplateRegistry: resolve by slug, version, inactive → not found
 * - NovuNotificationAdapter: send, upsert subscriber, error handling
 */

import { describe, it, expect, vi } from 'vitest';
import { Result } from '@aptivo/types';
import { renderTemplate } from '../src/templates/template-renderer.js';
import { createTemplateRegistry } from '../src/templates/template-registry.js';
import { NovuNotificationAdapter } from '../src/adapters/novu-adapter.js';
import type { TemplateStore } from '../src/templates/template-registry.js';
import type { TemplateRecord } from '../src/types.js';
import type { NovuClient } from '../src/adapters/novu-adapter.js';

// ---------------------------------------------------------------------------
// renderTemplate
// ---------------------------------------------------------------------------

describe('renderTemplate', () => {
  it('substitutes {{var}} placeholders', () => {
    const result = renderTemplate('Hello, {{name}}!', { name: 'Alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('Hello, Alice!');
  });

  it('substitutes multiple variables', () => {
    const result = renderTemplate('{{greeting}}, {{name}}!', { greeting: 'Hi', name: 'Bob' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('Hi, Bob!');
  });

  it('returns body unchanged when no placeholders', () => {
    const result = renderTemplate('No placeholders here', {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('No placeholders here');
  });

  it('returns RenderError for missing required variable', () => {
    const result = renderTemplate('Hello, {{name}}!', {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('RenderError');
    expect(result.error.message).toContain('name');
  });

  it('returns RenderError for multiple missing variables', () => {
    const result = renderTemplate('{{a}} and {{b}}', {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('a');
    expect(result.error.message).toContain('b');
  });

  it('converts non-string values to string', () => {
    const result = renderTemplate('Count: {{count}}', { count: 42 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('Count: 42');
  });

  it('validates against Zod schema when provided', () => {
    const schema = { name: 'string', age: 'number' };
    const result = renderTemplate('{{name}} is {{age}}', { name: 'Alice', age: 30 }, schema);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('Alice is 30');
  });

  it('returns RenderError when schema validation fails', () => {
    const schema = { name: 'string' };
    const result = renderTemplate('{{name}}', { name: 123 }, schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('RenderError');
    expect(result.error.message).toContain('validation failed');
  });

  it('allows extra variables beyond schema (passthrough)', () => {
    const schema = { name: 'string' };
    const result = renderTemplate('{{name}} {{extra}}', { name: 'Alice', extra: 'bonus' }, schema);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('Alice bonus');
  });
});

// ---------------------------------------------------------------------------
// createTemplateRegistry
// ---------------------------------------------------------------------------

describe('createTemplateRegistry', () => {
  const TEMPLATE: TemplateRecord = {
    slug: 'welcome',
    name: 'Welcome',
    version: 1,
    isActive: true,
    emailTemplate: { subject: 'Welcome', body: 'Hello {{name}}' },
    telegramTemplate: null,
    pushTemplate: null,
  };

  function createMockStore(overrides?: Partial<TemplateStore>): TemplateStore {
    return {
      findBySlug: vi.fn().mockResolvedValue(TEMPLATE),
      ...overrides,
    };
  }

  it('resolves a template by slug', async () => {
    const store = createMockStore();
    const registry = createTemplateRegistry(store);
    const result = await registry.resolve('welcome');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slug).toBe('welcome');
  });

  it('passes version to store', async () => {
    const store = createMockStore();
    const registry = createTemplateRegistry(store);
    await registry.resolve('welcome', 2);

    expect(store.findBySlug).toHaveBeenCalledWith('welcome', 2);
  });

  it('returns TemplateNotFound for unknown slug', async () => {
    const store = createMockStore({
      findBySlug: vi.fn().mockResolvedValue(null),
    });
    const registry = createTemplateRegistry(store);
    const result = await registry.resolve('nonexistent');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('TemplateNotFound');
    expect(result.error.slug).toBe('nonexistent');
  });

  it('returns TemplateNotFound for inactive template', async () => {
    const store = createMockStore({
      findBySlug: vi.fn().mockResolvedValue({ ...TEMPLATE, isActive: false }),
    });
    const registry = createTemplateRegistry(store);
    const result = await registry.resolve('welcome');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('TemplateNotFound');
  });
});

// ---------------------------------------------------------------------------
// NovuNotificationAdapter
// ---------------------------------------------------------------------------

describe('NovuNotificationAdapter', () => {
  function createMockClient(overrides?: Partial<NovuClient>): NovuClient {
    return {
      trigger: vi.fn().mockResolvedValue({ acknowledged: true, transactionId: 'txn-1' }),
      ...overrides,
    };
  }

  it('sends notification via Novu trigger', async () => {
    const client = createMockClient();
    const adapter = new NovuNotificationAdapter(client);
    const result = await adapter.send({
      recipientId: 'user-1',
      channel: 'email',
      subject: 'Test',
      body: 'Hello',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('txn-1');
    expect(client.trigger).toHaveBeenCalledWith(
      'generic-notification',
      expect.objectContaining({
        to: { subscriberId: 'user-1' },
      }),
    );
  });

  it('uses custom workflowId', async () => {
    const client = createMockClient();
    const adapter = new NovuNotificationAdapter(client, { workflowId: 'custom-flow' });
    await adapter.send({
      recipientId: 'user-1',
      channel: 'email',
      body: 'Hello',
    });

    expect(client.trigger).toHaveBeenCalledWith('custom-flow', expect.anything());
  });

  it('returns DeliveryFailed on trigger error', async () => {
    const client = createMockClient({
      trigger: vi.fn().mockRejectedValue(new Error('Novu down')),
    });
    const adapter = new NovuNotificationAdapter(client);
    const result = await adapter.send({
      recipientId: 'user-1',
      channel: 'email',
      body: 'Hello',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DeliveryFailed');
    expect(result.error.message).toBe('Novu down');
  });

  it('upserts subscriber via identify', async () => {
    const client = createMockClient({
      identify: vi.fn().mockResolvedValue(undefined),
    });
    const adapter = new NovuNotificationAdapter(client);
    const result = await adapter.upsertSubscriber('user-1', {
      email: 'alice@test.com',
      name: 'Alice',
    });

    expect(result.ok).toBe(true);
    expect(client.identify).toHaveBeenCalledWith('user-1', expect.objectContaining({
      email: 'alice@test.com',
      firstName: 'Alice',
    }));
  });

  it('returns ok when identify not supported', async () => {
    const client = createMockClient();
    // no identify method
    const adapter = new NovuNotificationAdapter(client);
    const result = await adapter.upsertSubscriber('user-1', { email: 'a@b.com' });

    expect(result.ok).toBe(true);
  });

  it('includes transactionId in trigger payload', async () => {
    const client = createMockClient();
    const adapter = new NovuNotificationAdapter(client);
    await adapter.send({
      recipientId: 'user-1',
      channel: 'email',
      body: 'Hello',
      transactionId: 'txn-abc',
    });

    const payload = vi.mocked(client.trigger).mock.calls[0]![1];
    expect(payload.transactionId).toBe('txn-abc');
  });
});
