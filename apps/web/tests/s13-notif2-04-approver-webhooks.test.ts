/**
 * NOTIF2-04: Per-Approver Webhook Notifications tests
 * @task NOTIF2-04
 *
 * tests:
 * - notify 3 approvers, all succeed → sent=3, failed=0
 * - one approver fails → sent=2, failed=1
 * - payload includes all required fields
 * - signature computed per approver
 * - empty approvers list → sent=0, failed=0
 * - config URL used as base
 * - dispatch called with correct url per approver
 * - result always ok (failures tracked in results array)
 * - multiple failures tracked correctly
 * - sign called with correct payload and secret
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createApproverWebhookDispatcher,
} from '../src/lib/webhooks/approver-webhook-dispatcher';
import type {
  ApproverWebhookDeps,
  ApproverWebhookConfig,
  ApproverWebhookPayload,
} from '../src/lib/webhooks/approver-webhook-dispatcher';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ApproverWebhookConfig = {
  webhookUrl: 'https://hooks.aptivo.com/v1',
  signingSecret: 'super-secret-signing-key-for-test',
};

function makePayload(overrides?: Partial<ApproverWebhookPayload>): ApproverWebhookPayload {
  return {
    requestId: 'req-001',
    approverId: 'approver-001',
    policyId: 'policy-001',
    policyType: 'quorum',
    approveUrl: 'https://app.aptivo.com/approve/req-001',
    rejectUrl: 'https://app.aptivo.com/reject/req-001',
    summary: 'Approve trade execution for BTC/USDT',
    domain: 'crypto',
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<ApproverWebhookDeps>): ApproverWebhookDeps {
  return {
    dispatch: vi.fn().mockResolvedValue({ status: 200 }),
    sign: vi.fn().mockReturnValue('sig-abc123'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// all approvers succeed
// ---------------------------------------------------------------------------

describe('notifyApprovers — all succeed', () => {
  let deps: ApproverWebhookDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('notifies 3 approvers with sent=3 and failed=0', async () => {
    const dispatcher = createApproverWebhookDispatcher(deps, DEFAULT_CONFIG);
    const approvers = [
      makePayload({ approverId: 'a-1' }),
      makePayload({ approverId: 'a-2' }),
      makePayload({ approverId: 'a-3' }),
    ];

    const result = await dispatcher.notifyApprovers(approvers);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sent).toBe(3);
    expect(result.value.failed).toBe(0);
    expect(result.value.results).toHaveLength(3);
    expect(result.value.results.every((r) => r.success)).toBe(true);
  });

  it('returns ok result type (never err)', async () => {
    const dispatcher = createApproverWebhookDispatcher(deps, DEFAULT_CONFIG);
    const result = await dispatcher.notifyApprovers([makePayload()]);

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// partial failure
// ---------------------------------------------------------------------------

describe('notifyApprovers — partial failure', () => {
  it('tracks one failure in results with sent=2 and failed=1', async () => {
    const dispatch = vi.fn()
      .mockResolvedValueOnce({ status: 200 })
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ status: 200 });

    const deps = makeDeps({ dispatch });
    const dispatcher = createApproverWebhookDispatcher(deps, DEFAULT_CONFIG);

    const approvers = [
      makePayload({ approverId: 'a-1' }),
      makePayload({ approverId: 'a-2' }),
      makePayload({ approverId: 'a-3' }),
    ];

    const result = await dispatcher.notifyApprovers(approvers);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sent).toBe(2);
    expect(result.value.failed).toBe(1);
    expect(result.value.results[0]).toEqual({ approverId: 'a-1', success: true });
    expect(result.value.results[1]).toEqual({ approverId: 'a-2', success: false });
    expect(result.value.results[2]).toEqual({ approverId: 'a-3', success: true });
  });

  it('tracks all failures when all dispatch calls reject', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('all down'));
    const deps = makeDeps({ dispatch });
    const dispatcher = createApproverWebhookDispatcher(deps, DEFAULT_CONFIG);

    const approvers = [
      makePayload({ approverId: 'a-1' }),
      makePayload({ approverId: 'a-2' }),
    ];

    const result = await dispatcher.notifyApprovers(approvers);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sent).toBe(0);
    expect(result.value.failed).toBe(2);
    expect(result.value.results.every((r) => !r.success)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// payload verification
// ---------------------------------------------------------------------------

describe('notifyApprovers — payload fields', () => {
  it('passes all required fields in the dispatch payload', async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: 200 });
    const deps = makeDeps({ dispatch });
    const dispatcher = createApproverWebhookDispatcher(deps, DEFAULT_CONFIG);

    const payload = makePayload();
    await dispatcher.notifyApprovers([payload]);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const [, dispatchedPayload] = dispatch.mock.calls[0]!;
    expect(dispatchedPayload.requestId).toBe('req-001');
    expect(dispatchedPayload.approverId).toBe('approver-001');
    expect(dispatchedPayload.policyId).toBe('policy-001');
    expect(dispatchedPayload.policyType).toBe('quorum');
    expect(dispatchedPayload.approveUrl).toBeDefined();
    expect(dispatchedPayload.rejectUrl).toBeDefined();
    expect(dispatchedPayload.summary).toBeDefined();
    expect(dispatchedPayload.domain).toBe('crypto');
  });
});

// ---------------------------------------------------------------------------
// signature computation
// ---------------------------------------------------------------------------

describe('notifyApprovers — signing', () => {
  it('computes signature per approver using sign dependency', async () => {
    const sign = vi.fn().mockReturnValue('sig-per-approver');
    const deps = makeDeps({ sign });
    const dispatcher = createApproverWebhookDispatcher(deps, DEFAULT_CONFIG);

    const approvers = [
      makePayload({ approverId: 'a-1' }),
      makePayload({ approverId: 'a-2' }),
    ];

    await dispatcher.notifyApprovers(approvers);

    // sign called once per approver
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it('passes JSON-stringified body and signing secret to sign', async () => {
    const sign = vi.fn().mockReturnValue('sig-test');
    const deps = makeDeps({ sign });
    const dispatcher = createApproverWebhookDispatcher(deps, DEFAULT_CONFIG);

    const payload = makePayload({ approverId: 'a-1' });
    await dispatcher.notifyApprovers([payload]);

    expect(sign).toHaveBeenCalledWith(
      JSON.stringify(payload),
      DEFAULT_CONFIG.signingSecret,
    );
  });

  it('passes computed signature to dispatch call', async () => {
    const sign = vi.fn().mockReturnValue('computed-sig-xyz');
    const dispatch = vi.fn().mockResolvedValue({ status: 200 });
    const deps: ApproverWebhookDeps = { dispatch, sign };
    const dispatcher = createApproverWebhookDispatcher(deps, DEFAULT_CONFIG);

    await dispatcher.notifyApprovers([makePayload()]);

    const [, , signature] = dispatch.mock.calls[0]!;
    expect(signature).toBe('computed-sig-xyz');
  });
});

// ---------------------------------------------------------------------------
// empty approvers
// ---------------------------------------------------------------------------

describe('notifyApprovers — empty list', () => {
  it('returns sent=0 and failed=0 with empty results', async () => {
    const deps = makeDeps();
    const dispatcher = createApproverWebhookDispatcher(deps, DEFAULT_CONFIG);

    const result = await dispatcher.notifyApprovers([]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sent).toBe(0);
    expect(result.value.failed).toBe(0);
    expect(result.value.results).toEqual([]);
  });

  it('does not call dispatch for empty list', async () => {
    const deps = makeDeps();
    const dispatcher = createApproverWebhookDispatcher(deps, DEFAULT_CONFIG);

    await dispatcher.notifyApprovers([]);

    expect(deps.dispatch).not.toHaveBeenCalled();
    expect(deps.sign).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// url construction
// ---------------------------------------------------------------------------

describe('notifyApprovers — URL construction', () => {
  it('constructs url using config webhookUrl as base', async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: 200 });
    const deps = makeDeps({ dispatch });
    const config: ApproverWebhookConfig = {
      webhookUrl: 'https://custom.hooks.io/v2',
      signingSecret: 'secret',
    };
    const dispatcher = createApproverWebhookDispatcher(deps, config);

    await dispatcher.notifyApprovers([makePayload({ approverId: 'user-42' })]);

    const [url] = dispatch.mock.calls[0]!;
    expect(url).toBe('https://custom.hooks.io/v2/approver/user-42');
  });

  it('constructs unique url per approver', async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: 200 });
    const deps = makeDeps({ dispatch });
    const dispatcher = createApproverWebhookDispatcher(deps, DEFAULT_CONFIG);

    await dispatcher.notifyApprovers([
      makePayload({ approverId: 'alpha' }),
      makePayload({ approverId: 'beta' }),
    ]);

    expect(dispatch.mock.calls[0]![0]).toBe('https://hooks.aptivo.com/v1/approver/alpha');
    expect(dispatch.mock.calls[1]![0]).toBe('https://hooks.aptivo.com/v1/approver/beta');
  });
});
