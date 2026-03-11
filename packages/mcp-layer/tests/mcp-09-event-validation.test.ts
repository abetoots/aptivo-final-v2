/**
 * @testcase MCP-09-EV-001 through MCP-09-EV-010
 * @task MCP-09
 * @warning S3-W11 (closes)
 *
 * Tests the validated event sender:
 * - Valid events sent successfully
 * - Invalid payloads dropped
 * - Unknown event types rejected
 * - Send failures handled
 * - MCP event schemas validated
 */

import { describe, it, expect, vi } from 'vitest';
import { createValidatedSender } from '../src/events/validated-sender.js';
import { MCP_EVENT_SCHEMAS } from '../src/events/event-schemas.js';
import type { EventSender } from '../src/events/validated-sender.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createMockSender(): EventSender {
  return { send: vi.fn(async () => {}) };
}

describe('MCP-09: Event Schema Validation', () => {
  // -----------------------------------------------------------------------
  // valid events
  // -----------------------------------------------------------------------

  describe('valid events', () => {
    it('sends valid mcp/tool.called event', async () => {
      const sender = createMockSender();
      const validated = createValidatedSender(sender, MCP_EVENT_SCHEMAS);

      const result = await validated.send('mcp/tool.called', {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        serverId: 'server-1',
        toolName: 'echo',
      });

      expect(result.ok).toBe(true);
      expect(sender.send).toHaveBeenCalledTimes(1);
    });

    it('sends valid mcp/tool.completed event', async () => {
      const sender = createMockSender();
      const validated = createValidatedSender(sender, MCP_EVENT_SCHEMAS);

      const result = await validated.send('mcp/tool.completed', {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        serverId: 'server-1',
        toolName: 'echo',
        durationMs: 42,
        cached: false,
      });

      expect(result.ok).toBe(true);
    });

    it('sends valid mcp/tool.failed event', async () => {
      const sender = createMockSender();
      const validated = createValidatedSender(sender, MCP_EVENT_SCHEMAS);

      const result = await validated.send('mcp/tool.failed', {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        serverId: 'server-1',
        toolName: 'echo',
        errorTag: 'RateLimitExceeded',
        durationMs: 0,
      });

      expect(result.ok).toBe(true);
    });

    it('allows optional workflowId in mcp/tool.called', async () => {
      const sender = createMockSender();
      const validated = createValidatedSender(sender, MCP_EVENT_SCHEMAS);

      const result = await validated.send('mcp/tool.called', {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        serverId: 'server-1',
        toolName: 'echo',
        workflowId: 'wf-123',
      });

      expect(result.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // invalid payloads
  // -----------------------------------------------------------------------

  describe('invalid payloads', () => {
    it('rejects event with missing required fields', async () => {
      const sender = createMockSender();
      const validated = createValidatedSender(sender, MCP_EVENT_SCHEMAS);

      const result = await validated.send('mcp/tool.called', {
        serverId: 'server-1',
        // missing requestId and toolName
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ValidationFailed');
        if (result.error._tag === 'ValidationFailed') {
          expect(result.error.issues.length).toBeGreaterThan(0);
        }
      }
      expect(sender.send).not.toHaveBeenCalled();
    });

    it('rejects event with invalid requestId format', async () => {
      const sender = createMockSender();
      const validated = createValidatedSender(sender, MCP_EVENT_SCHEMAS);

      const result = await validated.send('mcp/tool.called', {
        requestId: 'not-a-uuid',
        serverId: 'server-1',
        toolName: 'echo',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ValidationFailed');
      }
    });

    it('rejects event with negative durationMs', async () => {
      const sender = createMockSender();
      const validated = createValidatedSender(sender, MCP_EVENT_SCHEMAS);

      const result = await validated.send('mcp/tool.completed', {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        serverId: 'server-1',
        toolName: 'echo',
        durationMs: -1,
        cached: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ValidationFailed');
      }
    });
  });

  // -----------------------------------------------------------------------
  // unknown event types
  // -----------------------------------------------------------------------

  describe('unknown event types', () => {
    it('rejects unregistered event types', async () => {
      const sender = createMockSender();
      const validated = createValidatedSender(sender, MCP_EVENT_SCHEMAS);

      const result = await validated.send('mcp/unknown.event', {
        anything: true,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('UnknownEventType');
        if (result.error._tag === 'UnknownEventType') {
          expect(result.error.name).toBe('mcp/unknown.event');
        }
      }
      expect(sender.send).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // send failures
  // -----------------------------------------------------------------------

  describe('send failures', () => {
    it('returns SendFailed when sender throws', async () => {
      const sender: EventSender = {
        send: vi.fn(async () => { throw new Error('Inngest unavailable'); }),
      };
      const validated = createValidatedSender(sender, MCP_EVENT_SCHEMAS);

      const result = await validated.send('mcp/tool.called', {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        serverId: 'server-1',
        toolName: 'echo',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('SendFailed');
      }
    });
  });
});
