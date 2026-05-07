/**
 * S18-B2: requireConsent middleware tests (FR-HR-CM-005).
 *
 * Coverage by branch:
 *   - self-access exemption: candidate's email matches user's email
 *     → ok with reason='self-access'; the consent lookup is NOT
 *     called (cheap-first ordering preserved)
 *   - active consent: lookup returns a non-withdrawn record →
 *     ok with reason='consent-active'
 *   - withdrawn consent: lookup returns a record with
 *     `withdrawnAt` set → denied with reason='consent-withdrawn'
 *   - missing consent: lookup returns null → denied with
 *     reason='consent-required'
 *   - case-insensitive email comparison (default predicate)
 *   - custom isSelfAccess predicate override (e.g. userId-based)
 *   - denyResponse shape: RFC 7807 problem+json with the right
 *     type/title/status/detail fields
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequireConsent } from '../../src/lib/hr/require-consent.js';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const CANDIDATE = {
  id: 'cand-1',
  email: 'alice@example.com',
};

const STRANGER_USER = {
  userId: 'stranger-1',
  email: 'bob@example.com',
};

const SELF_USER = {
  userId: 'self-1',
  email: 'alice@example.com',
};

// ---------------------------------------------------------------------------
// self-access exemption
// ---------------------------------------------------------------------------

describe('S18-B2: requireConsent — self-access exemption', () => {
  it('grants access without a DB hit when emails match', async () => {
    const findActiveConsent = vi.fn();
    const middleware = createRequireConsent({ findActiveConsent });

    const result = await middleware.check(CANDIDATE, SELF_USER, 'data_processing');

    expect(result).toEqual({ ok: true, reason: 'self-access' });
    // critical: lookup NOT called — self-access short-circuits before DB
    expect(findActiveConsent).not.toHaveBeenCalled();
  });

  it('email comparison is case-insensitive', async () => {
    const findActiveConsent = vi.fn();
    const middleware = createRequireConsent({ findActiveConsent });

    const result = await middleware.check(
      { id: 'cand-1', email: 'Alice@Example.com' },
      { userId: 'self-1', email: 'alice@EXAMPLE.com' },
      'data_processing',
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reason).toBe('self-access');
  });

  it('user without email field cannot self-access (no false-equality match)', async () => {
    const findActiveConsent = vi.fn().mockResolvedValue(null);
    const middleware = createRequireConsent({ findActiveConsent });

    const result = await middleware.check(
      CANDIDATE,
      { userId: 'no-email-user' }, // email omitted
      'data_processing',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('consent-required');
    expect(findActiveConsent).toHaveBeenCalledTimes(1);
  });

  it('custom isSelfAccess override (userId-based) takes precedence over default email match', async () => {
    const findActiveConsent = vi.fn();
    const middleware = createRequireConsent({
      findActiveConsent,
      // hypothetical future predicate when candidate→user mapping
      // exists — bypass email comparison entirely
      isSelfAccess: (candidate, user) => user.userId === `user-for-${candidate.id}`,
    });

    const result = await middleware.check(
      CANDIDATE,
      { userId: 'user-for-cand-1', email: 'completely-different@example.com' },
      'data_processing',
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reason).toBe('self-access');
  });
});

// ---------------------------------------------------------------------------
// active consent
// ---------------------------------------------------------------------------

describe('S18-B2: requireConsent — active consent', () => {
  it('grants access when an active (non-withdrawn) consent record exists', async () => {
    const findActiveConsent = vi.fn().mockResolvedValue({
      consentType: 'data_processing',
      consentDate: new Date('2026-04-01T00:00:00Z'),
      withdrawnAt: null,
    });
    const middleware = createRequireConsent({ findActiveConsent });

    const result = await middleware.check(CANDIDATE, STRANGER_USER, 'data_processing');

    expect(result).toEqual({ ok: true, reason: 'consent-active' });
    expect(findActiveConsent).toHaveBeenCalledWith('cand-1', 'data_processing');
  });

  it('passes the consentType to the lookup so different scopes can be gated separately', async () => {
    const findActiveConsent = vi.fn().mockResolvedValue(null);
    const middleware = createRequireConsent({ findActiveConsent });

    await middleware.check(CANDIDATE, STRANGER_USER, 'marketing');

    expect(findActiveConsent).toHaveBeenCalledWith('cand-1', 'marketing');
  });
});

// ---------------------------------------------------------------------------
// missing / withdrawn consent
// ---------------------------------------------------------------------------

describe('S18-B2: requireConsent — denied paths', () => {
  it('denies with reason=consent-required when no record exists', async () => {
    const findActiveConsent = vi.fn().mockResolvedValue(null);
    const middleware = createRequireConsent({ findActiveConsent });

    const result = await middleware.check(CANDIDATE, STRANGER_USER, 'data_processing');

    expect(result).toEqual({ ok: false, reason: 'consent-required' });
  });

  it('denies with reason=consent-withdrawn when record exists but withdrawnAt is set', async () => {
    // The Drizzle adapter typically filters withdrawn rows server-side
    // (`AND withdrawn_at IS NULL`), but the middleware tolerates them
    // in the result and surfaces the distinct reason for audit clarity.
    const findActiveConsent = vi.fn().mockResolvedValue({
      consentType: 'data_processing',
      consentDate: new Date('2026-04-01T00:00:00Z'),
      withdrawnAt: new Date('2026-04-15T00:00:00Z'),
    });
    const middleware = createRequireConsent({ findActiveConsent });

    const result = await middleware.check(CANDIDATE, STRANGER_USER, 'data_processing');

    expect(result).toEqual({ ok: false, reason: 'consent-withdrawn' });
  });
});

// ---------------------------------------------------------------------------
// denyResponse shape (RFC 7807)
// ---------------------------------------------------------------------------

describe('S18-B2: requireConsent — denyResponse shape', () => {
  it('builds 403 problem+json for consent-required', async () => {
    const middleware = createRequireConsent({ findActiveConsent: vi.fn() });
    const response = middleware.denyResponse('consent-required');

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    const body = await response.json();
    expect(body).toMatchObject({
      type: '/errors/consent-required',
      status: 403,
      detail: 'consent-required',
      title: expect.stringContaining('not granted consent'),
    });
  });

  it('builds 403 problem+json for consent-withdrawn with a different title', async () => {
    const middleware = createRequireConsent({ findActiveConsent: vi.fn() });
    const response = middleware.denyResponse('consent-withdrawn');

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({
      type: '/errors/consent-required',
      detail: 'consent-withdrawn',
      title: expect.stringContaining('withdrawn consent'),
    });
  });
});
