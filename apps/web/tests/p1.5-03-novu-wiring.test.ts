/**
 * P1.5-03: novu SDK wiring tests
 * @task P1.5-03
 *
 * verifies novu client wrapping and stub fallback.
 * the real @novu/node SDK is NOT imported — we test the wrapper
 * and stub using the injectable NovuSdkInstance interface.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createNovuSdkClient,
  createNovuStubClient,
  type NovuSdkInstance,
} from '../src/lib/novu-client.js';

// ---------------------------------------------------------------------------
// test helpers
// ---------------------------------------------------------------------------

function createMockNovuInstance(): NovuSdkInstance {
  return {
    trigger: vi.fn().mockResolvedValue({ acknowledged: true, transactionId: 'tx-1' }),
    subscribers: {
      identify: vi.fn().mockResolvedValue(undefined),
    },
  };
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('P1.5-03: novu SDK wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createNovuSdkClient', () => {
    it('delegates trigger to SDK instance', async () => {
      const mockNovu = createMockNovuInstance();
      const client = createNovuSdkClient(mockNovu);

      const result = await client.trigger('workflow-1', {
        to: { subscriberId: 'sub-1' },
        payload: { message: 'hello' },
      });

      expect(result).toEqual({ acknowledged: true, transactionId: 'tx-1' });
      expect(mockNovu.trigger).toHaveBeenCalledWith('workflow-1', {
        to: { subscriberId: 'sub-1' },
        payload: { message: 'hello' },
      });
    });

    it('delegates identify to SDK subscribers', async () => {
      const mockNovu = createMockNovuInstance();
      const client = createNovuSdkClient(mockNovu);

      expect(client.identify).toBeDefined();
      await client.identify!('sub-1', { email: 'test@example.com' });
      expect(mockNovu.subscribers.identify).toHaveBeenCalledWith('sub-1', {
        email: 'test@example.com',
      });
    });

    it('propagates transactionId from trigger response', async () => {
      const mockNovu = createMockNovuInstance();
      vi.mocked(mockNovu.trigger).mockResolvedValue({
        acknowledged: true,
        transactionId: 'custom-tx-123',
      });

      const client = createNovuSdkClient(mockNovu);
      const result = await client.trigger('wf', {
        to: { subscriberId: 's' },
        payload: {},
        transactionId: 'custom-tx-123',
      });

      expect(result.transactionId).toBe('custom-tx-123');
    });
  });

  describe('createNovuStubClient', () => {
    it('returns acknowledged true on trigger', async () => {
      const client = createNovuStubClient();
      const result = await client.trigger('any-workflow', {
        to: { subscriberId: 'sub-1' },
        payload: {},
      });

      expect(result).toEqual({ acknowledged: true });
    });

    it('does not have identify method', () => {
      const client = createNovuStubClient();
      expect(client.identify).toBeUndefined();
    });

    it('ignores workflow id and payload', async () => {
      const client = createNovuStubClient();
      const r1 = await client.trigger('wf-1', { to: { subscriberId: 'a' }, payload: { x: 1 } });
      const r2 = await client.trigger('wf-2', { to: { subscriberId: 'b' }, payload: { y: 2 } });

      expect(r1).toEqual(r2);
    });
  });

  describe('env-gated initialization pattern', () => {
    it('uses SDK wrapper when instance provided', () => {
      const mockNovu = createMockNovuInstance();
      const client = createNovuSdkClient(mockNovu);

      // real client has identify
      expect(client.identify).toBeDefined();
      expect(client.trigger).toBeDefined();
    });

    it('uses stub when no instance available', () => {
      const client = createNovuStubClient();

      // stub has trigger but no identify
      expect(client.trigger).toBeDefined();
      expect(client.identify).toBeUndefined();
    });
  });
});
