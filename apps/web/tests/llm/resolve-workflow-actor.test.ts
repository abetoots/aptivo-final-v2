/**
 * S18-A1: resolveWorkflowActor unit tests.
 *
 * Pure-function helper that maps Inngest event payload (`requestedBy`)
 * into an `ActorContext` consumable by `completeWorkflowRequest`. Tests
 * cover the four meaningful input shapes plus the department fallback
 * precedence rule.
 */

import { describe, it, expect } from 'vitest';
import { resolveWorkflowActor } from '../../src/lib/llm/resolve-workflow-actor.js';

describe('S18-A1: resolveWorkflowActor', () => {
  it('returns undefined when no requestedBy is supplied (external trigger)', () => {
    expect(resolveWorkflowActor({})).toBeUndefined();
  });

  it('returns undefined when fallbackDepartmentId is provided but requestedBy is absent', () => {
    // honest behaviour: a fallback department alone does NOT manufacture
    // a synthetic actor — without an acting user, attribution must stay
    // `actor.type='system'` on the audit emit
    expect(resolveWorkflowActor({ fallbackDepartmentId: 'dept-1' })).toBeUndefined();
  });

  it('builds ActorContext from requestedBy.userId alone', () => {
    const actor = resolveWorkflowActor({ requestedBy: { userId: 'user-42' } });

    expect(actor).toEqual({
      userId: 'user-42',
      departmentId: undefined,
      roles: undefined,
    });
  });

  it('preserves requestedBy.departmentId when present', () => {
    const actor = resolveWorkflowActor({
      requestedBy: { userId: 'user-42', departmentId: 'dept-engineering' },
    });

    expect(actor).toEqual({
      userId: 'user-42',
      departmentId: 'dept-engineering',
      roles: undefined,
    });
  });

  it('uses fallbackDepartmentId when requestedBy.departmentId is absent', () => {
    const actor = resolveWorkflowActor({
      requestedBy: { userId: 'user-42' },
      fallbackDepartmentId: 'dept-from-context',
    });

    expect(actor?.departmentId).toBe('dept-from-context');
  });

  it('prefers requestedBy.departmentId over fallbackDepartmentId', () => {
    const actor = resolveWorkflowActor({
      requestedBy: { userId: 'user-42', departmentId: 'dept-explicit' },
      fallbackDepartmentId: 'dept-fallback',
    });

    expect(actor?.departmentId).toBe('dept-explicit');
  });

  it('preserves roles when present', () => {
    const actor = resolveWorkflowActor({
      requestedBy: { userId: 'user-42', roles: ['admin', 'crypto-trader'] },
    });

    expect(actor?.roles).toEqual(['admin', 'crypto-trader']);
  });
});
