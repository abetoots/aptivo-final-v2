/**
 * @testcase SP-14-COMP-001 through SP-14-SEC-002
 * @requirements FR-CORE-HITL-001, FR-CORE-HITL-006
 * @warnings S7-W10, S7-W11
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-14
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  signEvent,
  verifyEventSignature,
  clearNonceStore,
} from '../src/events/event-signer.js';
import type { SignedEvent } from '../src/events/event-types.js';
import { Result } from '@aptivo/types';

const SECRET = 'a-sufficiently-long-signing-secret-32ch!';

interface HitlDecision {
  requestId: string;
  workflowId: string;
  decision: 'approved' | 'rejected';
  decidedBy: string;
}

const samplePayload: HitlDecision = {
  requestId: 'req-001',
  workflowId: 'wf-001',
  decision: 'approved',
  decidedBy: 'alice',
};

describe('SP-14: Event Authenticity & Anti-Replay', () => {
  beforeEach(() => {
    clearNonceStore();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // signing
  // -----------------------------------------------------------------------
  describe('event signing', () => {
    it('signs an event with HMAC-SHA256', () => {
      const result = signEvent(samplePayload, SECRET);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.payload).toEqual(samplePayload);
      expect(result.value.signature).toBeTruthy();
      expect(result.value.timestamp).toBeTruthy();
      expect(result.value.nonce).toBeTruthy();
    });

    it('generates unique nonces per call', () => {
      const r1 = signEvent(samplePayload, SECRET);
      const r2 = signEvent(samplePayload, SECRET);
      expect(r1.ok && r2.ok).toBe(true);
      if (!r1.ok || !r2.ok) return;

      expect(r1.value.nonce).not.toBe(r2.value.nonce);
    });

    it('rejects signing with short secret', () => {
      const result = signEvent(samplePayload, 'short');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('at least 32 characters');
    });
  });

  // -----------------------------------------------------------------------
  // verification — valid events
  // -----------------------------------------------------------------------
  describe('signature verification', () => {
    it('verifies a valid signed event', () => {
      const signed = signEvent(samplePayload, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      const result = verifyEventSignature(signed.value, SECRET);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(samplePayload);
    });

    it('returns the original payload on success', () => {
      const signed = signEvent({ custom: 'data', num: 42 }, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      const result = verifyEventSignature(signed.value, SECRET);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({ custom: 'data', num: 42 });
    });
  });

  // -----------------------------------------------------------------------
  // verification — tampered payloads
  // -----------------------------------------------------------------------
  describe('tampered payload rejection', () => {
    it('rejects events with modified payload', () => {
      const signed = signEvent(samplePayload, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      // tamper with the payload
      const tampered: SignedEvent<HitlDecision> = {
        ...signed.value,
        payload: { ...samplePayload, decision: 'rejected' },
      };

      const result = verifyEventSignature(tampered, SECRET);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('invalid-signature');
    });

    it('rejects events with modified requestId (context binding)', () => {
      const signed = signEvent(samplePayload, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      const tampered: SignedEvent<HitlDecision> = {
        ...signed.value,
        payload: { ...samplePayload, requestId: 'req-DIFFERENT' },
      };

      const result = verifyEventSignature(tampered, SECRET);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('invalid-signature');
    });
  });

  // -----------------------------------------------------------------------
  // verification — invalid signatures (S7-W11)
  // -----------------------------------------------------------------------
  describe('invalid signature rejection (S7-W11)', () => {
    it('rejects events with wrong secret', () => {
      const signed = signEvent(samplePayload, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      const result = verifyEventSignature(
        signed.value,
        'different-secret-that-is-also-at-least-32chars!',
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('invalid-signature');
      expect(result.error.message).toContain('HMAC signature verification failed');
    });

    it('rejects events with corrupted signature', () => {
      const signed = signEvent(samplePayload, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      const corrupted: SignedEvent<HitlDecision> = {
        ...signed.value,
        signature: 'deadbeef' + signed.value.signature.slice(8),
      };

      const result = verifyEventSignature(corrupted, SECRET);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('invalid-signature');
    });
  });

  // -----------------------------------------------------------------------
  // verification — expired timestamp
  // -----------------------------------------------------------------------
  describe('expired timestamp rejection', () => {
    it('rejects events older than maxAge', () => {
      // sign event with old timestamp
      const oldTime = new Date(Date.now() - 10 * 60 * 1_000).toISOString(); // 10 min ago
      vi.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce(oldTime);

      const signed = signEvent(samplePayload, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      vi.restoreAllMocks();

      // verify with 5 minute maxAge — should fail
      const result = verifyEventSignature(signed.value, SECRET, 5 * 60 * 1_000);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('expired-timestamp');
    });

    it('accepts events within maxAge', () => {
      const signed = signEvent(samplePayload, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      // verify with generous maxAge
      const result = verifyEventSignature(signed.value, SECRET, 60 * 60 * 1_000);
      expect(result.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // verification — anti-replay (nonce tracking)
  // -----------------------------------------------------------------------
  describe('anti-replay via nonce', () => {
    it('rejects events with reused nonces', () => {
      const signed = signEvent(samplePayload, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      // first verification succeeds
      const first = verifyEventSignature(signed.value, SECRET);
      expect(first.ok).toBe(true);

      // replay same event — should fail
      const replay = verifyEventSignature(signed.value, SECRET);
      expect(replay.ok).toBe(false);
      if (replay.ok) return;
      expect(replay.error.reason).toBe('replayed-nonce');
    });

    it('accepts different nonces for same payload', () => {
      const signed1 = signEvent(samplePayload, SECRET);
      const signed2 = signEvent(samplePayload, SECRET);
      expect(signed1.ok && signed2.ok).toBe(true);
      if (!signed1.ok || !signed2.ok) return;

      const r1 = verifyEventSignature(signed1.value, SECRET);
      const r2 = verifyEventSignature(signed2.value, SECRET);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // context binding
  // -----------------------------------------------------------------------
  describe('context binding', () => {
    it('signature covers requestId and workflowId', () => {
      const signed = signEvent(samplePayload, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      // attempting to inject a different workflowId breaks signature
      const injected: SignedEvent<HitlDecision> = {
        ...signed.value,
        payload: { ...samplePayload, workflowId: 'wf-ATTACKER' },
      };

      const result = verifyEventSignature(injected, SECRET);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('invalid-signature');
    });

    it('signature covers decidedBy field', () => {
      const signed = signEvent(samplePayload, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      const injected: SignedEvent<HitlDecision> = {
        ...signed.value,
        payload: { ...samplePayload, decidedBy: 'attacker' },
      };

      const result = verifyEventSignature(injected, SECRET);
      expect(result.ok).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // concurrent approval race (S7-W10)
  // -----------------------------------------------------------------------
  describe('concurrent approval race (S7-W10)', () => {
    it('first approval succeeds, replay is rejected', () => {
      const signed = signEvent(samplePayload, SECRET);
      expect(signed.ok).toBe(true);
      if (!signed.ok) return;

      // simulate 10 concurrent attempts with same signed event
      const results = Array.from({ length: 10 }, () =>
        verifyEventSignature(signed.value, SECRET),
      );

      const successes = results.filter((r) => r.ok);
      const failures = results.filter((r) => !r.ok);

      // exactly 1 succeeds (nonce consumed), rest are replays
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(9);
      for (const f of failures) {
        if (!f.ok) expect(f.error.reason).toBe('replayed-nonce');
      }
    });
  });

  // -----------------------------------------------------------------------
  // malformed events
  // -----------------------------------------------------------------------
  describe('malformed event rejection', () => {
    it('rejects events missing signature', () => {
      const result = verifyEventSignature(
        { payload: samplePayload, signature: '', timestamp: new Date().toISOString(), nonce: 'x' },
        SECRET,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('malformed-event');
    });

    it('rejects events missing nonce', () => {
      const result = verifyEventSignature(
        { payload: samplePayload, signature: 'abc', timestamp: new Date().toISOString(), nonce: '' },
        SECRET,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('malformed-event');
    });
  });
});
