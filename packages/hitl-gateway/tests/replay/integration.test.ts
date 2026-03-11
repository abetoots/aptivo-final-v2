/**
 * @testcase CF-03-INT-001 through CF-03-INT-010
 * @task CF-03, HITL-03, HITL-04
 * @condition C1 (Go/No-Go)
 *
 * Integration tests: ReplayStore injection into verifyHitlToken and verifyEventSignatureAsync.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  generateHitlToken,
  verifyHitlToken,
  clearJtiStore,
  type TokenGenerationOptions,
  type VerifyOptions,
} from '../../src/tokens/index.js';
import {
  signEvent,
  verifyEventSignatureAsync,
} from '../../src/events/index.js';
import { InMemoryReplayStore } from '../../src/replay/in-memory-replay-store.js';
import type { ReplayStore } from '../../src/replay/replay-store.js';

const SECRET = 'a-sufficiently-long-signing-secret-32ch!';

const tokenOpts: TokenGenerationOptions = {
  requestId: 'req-cf03',
  action: 'approve',
  channel: 'email',
  audience: 'hitl-approval',
  issuer: 'aptivo-hitl-gateway',
  ttlSeconds: 300,
};

const verifyOpts: VerifyOptions = {
  audience: 'hitl-approval',
  issuer: 'aptivo-hitl-gateway',
};

// ---------------------------------------------------------------------------
// JWT token verification with injected ReplayStore
// ---------------------------------------------------------------------------

describe('CF-03: verifyHitlToken with injected ReplayStore', () => {
  let replayStore: InMemoryReplayStore;

  beforeEach(() => {
    clearJtiStore();
    replayStore = new InMemoryReplayStore();
  });

  afterEach(() => {
    replayStore.clear();
  });

  it('accepts token when using a fresh replay store', async () => {
    const gen = await generateHitlToken(tokenOpts, SECRET);
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;

    const result = await verifyHitlToken(gen.value.token, SECRET, verifyOpts, replayStore);
    expect(result.ok).toBe(true);
  });

  it('rejects replayed token via injected store', async () => {
    const gen = await generateHitlToken(tokenOpts, SECRET);
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;

    // first verification — succeeds
    const first = await verifyHitlToken(gen.value.token, SECRET, verifyOpts, replayStore);
    expect(first.ok).toBe(true);

    // replay same token — rejected
    const replay = await verifyHitlToken(gen.value.token, SECRET, verifyOpts, replayStore);
    expect(replay.ok).toBe(false);
    if (replay.ok) return;
    expect(replay.error.reason).toBe('replayed-jti');
  });

  it('isolated stores dont cross-contaminate', async () => {
    const store1 = new InMemoryReplayStore();
    const store2 = new InMemoryReplayStore();

    const gen = await generateHitlToken(tokenOpts, SECRET);
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;

    // claim in store1
    const r1 = await verifyHitlToken(gen.value.token, SECRET, verifyOpts, store1);
    expect(r1.ok).toBe(true);

    // same JTI in store2 — should also succeed (different store)
    const r2 = await verifyHitlToken(gen.value.token, SECRET, verifyOpts, store2);
    expect(r2.ok).toBe(true);

    store1.clear();
    store2.clear();
  });

  it('fail-closed: store errors result in rejection', async () => {
    const failingStore: ReplayStore = {
      claimOnce: async () => ({ ok: false, reason: 'store-error' }),
    };

    const gen = await generateHitlToken(tokenOpts, SECRET);
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;

    const result = await verifyHitlToken(gen.value.token, SECRET, verifyOpts, failingStore);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('replayed-jti');
    expect(result.error.message).toContain('fail-closed');
  });

  it('10 concurrent verifications — exactly 1 succeeds', async () => {
    const gen = await generateHitlToken(tokenOpts, SECRET);
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        verifyHitlToken(gen.value.token, SECRET, verifyOpts, replayStore),
      ),
    );

    const successes = results.filter((r) => r.ok);
    const replays = results.filter((r) => !r.ok && r.error.reason === 'replayed-jti');

    expect(successes).toHaveLength(1);
    expect(replays).toHaveLength(9);
  });
});

// ---------------------------------------------------------------------------
// async event verification with injected ReplayStore
// ---------------------------------------------------------------------------

describe('CF-03: verifyEventSignatureAsync with injected ReplayStore', () => {
  let replayStore: InMemoryReplayStore;

  const payload = {
    requestId: 'req-001',
    workflowId: 'wf-001',
    decision: 'approved' as const,
  };

  beforeEach(() => {
    replayStore = new InMemoryReplayStore();
  });

  afterEach(() => {
    replayStore.clear();
  });

  it('accepts valid signed event', async () => {
    const signed = signEvent(payload, SECRET);
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const result = await verifyEventSignatureAsync(
      signed.value, SECRET, 5 * 60 * 1_000, replayStore,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(payload);
  });

  it('rejects replayed event', async () => {
    const signed = signEvent(payload, SECRET);
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    // first verification — succeeds
    const first = await verifyEventSignatureAsync(
      signed.value, SECRET, 5 * 60 * 1_000, replayStore,
    );
    expect(first.ok).toBe(true);

    // replay — rejected
    const replay = await verifyEventSignatureAsync(
      signed.value, SECRET, 5 * 60 * 1_000, replayStore,
    );
    expect(replay.ok).toBe(false);
    if (replay.ok) return;
    expect(replay.error.reason).toBe('replayed-nonce');
  });

  it('fail-closed on store error', async () => {
    const failingStore: ReplayStore = {
      claimOnce: async () => ({ ok: false, reason: 'store-error' }),
    };

    const signed = signEvent(payload, SECRET);
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const result = await verifyEventSignatureAsync(
      signed.value, SECRET, 5 * 60 * 1_000, failingStore,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('replayed-nonce');
    expect(result.error.message).toContain('fail-closed');
  });

  it('rejects tampered payload', async () => {
    const signed = signEvent(payload, SECRET);
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const tampered = {
      ...signed.value,
      payload: { ...payload, decision: 'rejected' as const },
    };

    const result = await verifyEventSignatureAsync(
      tampered, SECRET, 5 * 60 * 1_000, replayStore,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('invalid-signature');
  });

  it('10 concurrent verifications — exactly 1 succeeds', async () => {
    const signed = signEvent(payload, SECRET);
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        verifyEventSignatureAsync(signed.value, SECRET, 5 * 60 * 1_000, replayStore),
      ),
    );

    const successes = results.filter((r) => r.ok);
    const replays = results.filter((r) => !r.ok && r.error.reason === 'replayed-nonce');

    expect(successes).toHaveLength(1);
    expect(replays).toHaveLength(9);
  });
});
