/**
 * S17-B1: requireLlmContext middleware tests
 * @task S17-B1
 *
 * Verifies the LLM-context resolver correctly composes JWT extraction
 * (via extractUser) with department lookup. Three behaviours:
 *
 *   - valid JWT + owned department → ActorContext with departmentId
 *   - valid JWT + no owned department → ActorContext, departmentId undefined
 *   - missing JWT (no x-user-id header in dev mode) → null
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequireLlmContext, type DepartmentLookup } from '../../src/lib/middleware/require-llm-context.js';

function makeLookup(deptId: string | null): DepartmentLookup {
  return {
    findOwnedDepartmentId: vi.fn().mockResolvedValue(deptId),
  };
}

describe('S17-B1: requireLlmContext', () => {
  beforeEach(() => {
    // dev mode → extractUser falls back to x-user-id header
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('returns ActorContext with userId + departmentId when JWT is valid + user owns a department', async () => {
    const lookup = makeLookup('dept-42');
    const requireLlmContext = createRequireLlmContext({ departmentLookup: lookup });

    const req = new Request('http://test/api/llm/complete', {
      headers: { 'x-user-id': 'user-7' },
    });
    const actor = await requireLlmContext(req);

    expect(actor).toEqual({
      userId: 'user-7',
      departmentId: 'dept-42',
      roles: undefined,
    });
    expect(lookup.findOwnedDepartmentId).toHaveBeenCalledWith('user-7');
  });

  it('returns ActorContext with departmentId undefined when user owns no department', async () => {
    const lookup = makeLookup(null);
    const requireLlmContext = createRequireLlmContext({ departmentLookup: lookup });

    const req = new Request('http://test/api/llm/complete', {
      headers: { 'x-user-id': 'user-99' },
    });
    const actor = await requireLlmContext(req);

    expect(actor).toEqual({
      userId: 'user-99',
      departmentId: undefined,
      roles: undefined,
    });
  });

  it('returns null when no JWT (no x-user-id header in dev) is present — caller must skip', async () => {
    const lookup = makeLookup('should-not-be-called');
    const requireLlmContext = createRequireLlmContext({ departmentLookup: lookup });

    const req = new Request('http://test/api/llm/complete');
    const actor = await requireLlmContext(req);

    expect(actor).toBeNull();
    expect(lookup.findOwnedDepartmentId).not.toHaveBeenCalled();
  });
});
