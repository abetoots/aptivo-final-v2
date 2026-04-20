/**
 * WFE3-01: Workflow graph validation
 *
 * tests for cycle/unreachable/dangling detection in workflow DAGs.
 * entry step is implicit `steps[0]` (matches existing schema — no explicit entryStepId field).
 */

import { describe, it, expect, vi } from 'vitest';
import type { WorkflowStep } from '@aptivo/database';

// Hoisted mock for the RBAC middleware used by the validate + POST routes.
// Without this the route handlers short-circuit to 401/403 and the tests
// that assert handler behaviour would pass trivially via early-return guards.
vi.mock('../src/lib/security/rbac-middleware', () => ({
  checkPermissionWithBlacklist: () => async () => null,
}));
vi.mock('../src/lib/security/rbac-resolver', () => ({
  extractUser: async () => ({ userId: 'test-user', roles: ['admin'] }),
}));

import { validateGraph } from '../src/lib/workflows/graph-validation';
import {
  createWorkflowDefinitionService,
  type WorkflowDefinitionStore,
  type WorkflowDefinitionRecord,
} from '../src/lib/workflows/workflow-definition-service';
import { POST as ValidateRoute } from '../src/app/api/workflows/validate/route';

// ---------------------------------------------------------------------------
// step builders
// ---------------------------------------------------------------------------

function step(id: string, nextSteps: string[] = []): WorkflowStep {
  return {
    id,
    type: 'action',
    name: `step-${id}`,
    config: {},
    nextSteps,
  };
}

// ---------------------------------------------------------------------------
// happy paths
// ---------------------------------------------------------------------------

describe('WFE3-01: validateGraph — happy paths', () => {
  it('accepts a single-step workflow', () => {
    const result = validateGraph([step('A')]);
    expect(result.ok).toBe(true);
  });

  it('accepts a valid linear DAG (A→B→C)', () => {
    const result = validateGraph([
      step('A', ['B']),
      step('B', ['C']),
      step('C'),
    ]);
    expect(result.ok).toBe(true);
  });

  it('accepts a valid diamond DAG (A→B,C; B,C→D)', () => {
    const result = validateGraph([
      step('A', ['B', 'C']),
      step('B', ['D']),
      step('C', ['D']),
      step('D'),
    ]);
    expect(result.ok).toBe(true);
  });

  it('accepts a DAG with multiple terminal steps', () => {
    const result = validateGraph([
      step('A', ['B', 'C']),
      step('B'),
      step('C'),
    ]);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NoEntryStep
// ---------------------------------------------------------------------------

describe('WFE3-01: validateGraph — NoEntryStep', () => {
  it('rejects an empty step array', () => {
    const result = validateGraph([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NoEntryStep');
  });
});

// ---------------------------------------------------------------------------
// DuplicateStepId
// ---------------------------------------------------------------------------

describe('WFE3-01: validateGraph — DuplicateStepId', () => {
  it('rejects two steps with the same id', () => {
    const result = validateGraph([step('A'), step('A')]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DuplicateStepId');
    if (result.error._tag !== 'DuplicateStepId') return;
    expect(result.error.stepId).toBe('A');
  });

  it('rejects duplicate ids even when interleaved with distinct ids', () => {
    // prior to this check, a later duplicate silently overwrote the earlier
    // entry in the byId map and produced misleading UnreachableSteps errors
    const result = validateGraph([step('A', ['B']), step('B'), step('A')]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DuplicateStepId');
  });

  it('reports DuplicateStepId before other errors (precedence)', () => {
    // dup + dangling + cycle all present — dup fires first (most structural)
    const result = validateGraph([
      step('A', ['B', 'ghost']),
      step('B', ['A']),
      step('A'),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DuplicateStepId');
  });
});

// ---------------------------------------------------------------------------
// CycleDetected
// ---------------------------------------------------------------------------

describe('WFE3-01: validateGraph — CycleDetected', () => {
  it('detects a simple self-loop (A→A)', () => {
    const result = validateGraph([step('A', ['A'])]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('CycleDetected');
    if (result.error._tag !== 'CycleDetected') return;
    expect(result.error.cycle).toEqual(['A', 'A']);
  });

  it('detects a simple two-step cycle (A→B→A)', () => {
    const result = validateGraph([step('A', ['B']), step('B', ['A'])]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('CycleDetected');
    if (result.error._tag !== 'CycleDetected') return;
    expect(result.error.cycle).toEqual(['A', 'B', 'A']);
  });

  it('detects a three-step cycle (A→B→C→A) with full path', () => {
    const result = validateGraph([
      step('A', ['B']),
      step('B', ['C']),
      step('C', ['A']),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('CycleDetected');
    if (result.error._tag !== 'CycleDetected') return;
    expect(result.error.cycle).toEqual(['A', 'B', 'C', 'A']);
  });

  it('detects a cycle nested inside a longer path (A→B→C→D→B)', () => {
    const result = validateGraph([
      step('A', ['B']),
      step('B', ['C']),
      step('C', ['D']),
      step('D', ['B']),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('CycleDetected');
    if (result.error._tag !== 'CycleDetected') return;
    // cycle starts when we re-encounter B; full path from B back to B
    expect(result.error.cycle).toEqual(['B', 'C', 'D', 'B']);
  });
});

// ---------------------------------------------------------------------------
// DanglingReference
// ---------------------------------------------------------------------------

describe('WFE3-01: validateGraph — DanglingReference', () => {
  it('detects a nextSteps reference to a missing step id', () => {
    const result = validateGraph([step('A', ['ghost'])]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DanglingReference');
    if (result.error._tag !== 'DanglingReference') return;
    expect(result.error.stepId).toBe('A');
    expect(result.error.missingRef).toBe('ghost');
  });

  it('detects dangling reference deeper in the graph', () => {
    const result = validateGraph([
      step('A', ['B']),
      step('B', ['ghost']),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DanglingReference');
    if (result.error._tag !== 'DanglingReference') return;
    expect(result.error.stepId).toBe('B');
    expect(result.error.missingRef).toBe('ghost');
  });
});

// ---------------------------------------------------------------------------
// UnreachableSteps
// ---------------------------------------------------------------------------

describe('WFE3-01: validateGraph — UnreachableSteps', () => {
  it('detects a single unreachable step (orphan with no inbound edge)', () => {
    const result = validateGraph([
      step('A', ['B']),
      step('B'),
      step('C'), // orphan — nothing points to C
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('UnreachableSteps');
    if (result.error._tag !== 'UnreachableSteps') return;
    expect(result.error.stepIds).toEqual(['C']);
  });

  it('detects multiple unreachable steps', () => {
    const result = validateGraph([
      step('A', ['B']),
      step('B'),
      step('C', ['D']), // C + D are an unreachable cluster
      step('D'),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('UnreachableSteps');
    if (result.error._tag !== 'UnreachableSteps') return;
    expect([...result.error.stepIds].sort()).toEqual(['C', 'D']);
  });
});

// ---------------------------------------------------------------------------
// error precedence
// ---------------------------------------------------------------------------

describe('WFE3-01: validateGraph — error precedence', () => {
  it('reports DanglingReference before CycleDetected when both exist', () => {
    // A→B→A (cycle) AND B→ghost (dangling); dangling should fire first
    const result = validateGraph([
      step('A', ['B']),
      step('B', ['A', 'ghost']),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DanglingReference');
  });

  it('reports CycleDetected before UnreachableSteps when both exist', () => {
    // A→B→A cycle in main path, C is unreachable — cycle fires first
    const result = validateGraph([
      step('A', ['B']),
      step('B', ['A']),
      step('C'),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('CycleDetected');
  });
});

// ---------------------------------------------------------------------------
// service integration — create/update surface graph errors
// ---------------------------------------------------------------------------

function createInMemoryStore(): WorkflowDefinitionStore {
  const records = new Map<string, WorkflowDefinitionRecord>();
  return {
    async create(record) {
      const id = crypto.randomUUID();
      const now = new Date();
      const full: WorkflowDefinitionRecord = { ...record, id, createdAt: now, updatedAt: now };
      records.set(id, full);
      return full;
    },
    async findById(id) { return records.get(id) ?? null; },
    async findByName(name, domain) { return [...records.values()].filter((r) => r.name === name && r.domain === domain); },
    async list(domain) {
      const all = [...records.values()];
      return domain ? all.filter((r) => r.domain === domain) : all;
    },
    async update(id, data) {
      const existing = records.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...data, updatedAt: new Date() };
      records.set(id, updated);
      return updated;
    },
    async delete(id) { return records.delete(id); },
  };
}

describe('WFE3-01: workflow service integration', () => {
  it('create() rejects a cyclic definition with GraphInvalid', async () => {
    const service = createWorkflowDefinitionService({ store: createInMemoryStore() });
    const input = {
      name: 'cyclic-wf',
      domain: 'crypto',
      steps: [
        { id: 'A', type: 'action' as const, name: 'A', config: {}, nextSteps: ['B'] },
        { id: 'B', type: 'action' as const, name: 'B', config: {}, nextSteps: ['A'] },
      ],
    };
    const result = await service.create(input, 'user-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('GraphInvalid');
    if (result.error._tag !== 'GraphInvalid') return;
    expect(result.error.graphError._tag).toBe('CycleDetected');
  });

  it('create() rejects a dangling reference with GraphInvalid', async () => {
    const service = createWorkflowDefinitionService({ store: createInMemoryStore() });
    const input = {
      name: 'dangling-wf',
      domain: 'hr',
      steps: [{ id: 'A', type: 'action' as const, name: 'A', config: {}, nextSteps: ['ghost'] }],
    };
    const result = await service.create(input, 'user-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('GraphInvalid');
    if (result.error._tag !== 'GraphInvalid') return;
    expect(result.error.graphError._tag).toBe('DanglingReference');
  });

  it('create() accepts a valid DAG', async () => {
    const service = createWorkflowDefinitionService({ store: createInMemoryStore() });
    const input = {
      name: 'valid-wf',
      domain: 'crypto',
      steps: [
        { id: 'A', type: 'action' as const, name: 'A', config: {}, nextSteps: ['B'] },
        { id: 'B', type: 'action' as const, name: 'B', config: {} },
      ],
    };
    const result = await service.create(input, 'user-1');
    expect(result.ok).toBe(true);
  });

  it('update() rejects a cyclic graph when the final status will be active', async () => {
    const store = createInMemoryStore();
    const service = createWorkflowDefinitionService({ store });
    const created = await service.create({
      name: 'wf',
      domain: 'crypto',
      steps: [{ id: 'A', type: 'action' as const, name: 'A', config: {} }],
    }, 'user-1');
    if (!created.ok) throw new Error('setup failed');

    // status transitions to active AND steps become cyclic — validator runs
    const updateResult = await service.update(created.value.id, {
      status: 'active',
      steps: [
        { id: 'A', type: 'action' as const, name: 'A', config: {}, nextSteps: ['B'] },
        { id: 'B', type: 'action' as const, name: 'B', config: {}, nextSteps: ['A'] },
      ],
    });
    expect(updateResult.ok).toBe(false);
    if (updateResult.ok) return;
    expect(updateResult.error._tag).toBe('GraphInvalid');
    if (updateResult.error._tag !== 'GraphInvalid') return;
    expect(updateResult.error.graphError._tag).toBe('CycleDetected');
  });

  it('update() allows a cyclic graph on a draft update (WIP — validation deferred to activate)', async () => {
    // policy: drafts are WIP and may be incomplete; validation kicks in only
    // when the final status will be active. This keeps the builder pattern
    // (addStep/reorderSteps) free of premature rejection during composition.
    const store = createInMemoryStore();
    const service = createWorkflowDefinitionService({ store });
    const created = await service.create({
      name: 'wf',
      domain: 'crypto',
      steps: [{ id: 'A', type: 'action' as const, name: 'A', config: {} }],
    }, 'user-1');
    if (!created.ok) throw new Error('setup failed');

    const updateResult = await service.update(created.value.id, {
      steps: [
        { id: 'A', type: 'action' as const, name: 'A', config: {}, nextSteps: ['B'] },
        { id: 'B', type: 'action' as const, name: 'B', config: {}, nextSteps: ['A'] },
      ],
    });
    expect(updateResult.ok).toBe(true); // deliberate: draft stays draft, no validation
  });

  it('update() status-only transition to active validates the existing stored graph', async () => {
    const store = createInMemoryStore();
    const service = createWorkflowDefinitionService({ store });
    // create a draft with an unreachable step sneaked in via direct store
    // (bypassing create's validator to set up the pre-activation state)
    const created = await service.create({
      name: 'wf',
      domain: 'crypto',
      steps: [{ id: 'A', type: 'action' as const, name: 'A', config: {} }],
    }, 'user-1');
    if (!created.ok) throw new Error('setup failed');

    // add an orphan step via a draft update (allowed — draft is WIP)
    await service.update(created.value.id, {
      steps: [
        { id: 'A', type: 'action' as const, name: 'A', config: {} },
        { id: 'orphan', type: 'action' as const, name: 'orphan', config: {} },
      ],
    });

    // now transition to active without changing steps — validator runs on
    // the stored steps (which are currently invalid) and rejects the activation
    const activateResult = await service.update(created.value.id, { status: 'active' });
    expect(activateResult.ok).toBe(false);
    if (activateResult.ok) return;
    expect(activateResult.error._tag).toBe('GraphInvalid');
    if (activateResult.error._tag !== 'GraphInvalid') return;
    expect(activateResult.error.graphError._tag).toBe('UnreachableSteps');
  });

  it('update() status-only transition to archived does not require graph validation', async () => {
    const store = createInMemoryStore();
    const service = createWorkflowDefinitionService({ store });
    const created = await service.create({
      name: 'wf',
      domain: 'crypto',
      steps: [{ id: 'A', type: 'action' as const, name: 'A', config: {} }],
    }, 'user-1');
    if (!created.ok) throw new Error('setup failed');

    const updateResult = await service.update(created.value.id, { status: 'archived' });
    expect(updateResult.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validate route — draft validation without persistence
// ---------------------------------------------------------------------------

describe('WFE3-01: POST /api/workflows/validate', () => {
  // RBAC is stubbed via vi.mock at the top of this file so the handler body
  // actually runs — previously the tests had guard clauses that would let
  // auth failures pass trivially. Codex flagged this during multi-review.
  const mkRequest = (body: unknown) =>
    new Request('http://localhost/api/workflows/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify(body),
    }) as unknown as Parameters<typeof ValidateRoute>[0];

  it('returns { valid: true, errors: [] } for a valid DAG', async () => {
    const res = await ValidateRoute(mkRequest({
      steps: [
        { id: 'A', type: 'action', name: 'A', config: {}, nextSteps: ['B'] },
        { id: 'B', type: 'action', name: 'B', config: {} },
      ],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.errors).toEqual([]);
  });

  it('returns { valid: false, errors: [CycleDetected] } for a cyclic draft', async () => {
    const res = await ValidateRoute(mkRequest({
      steps: [
        { id: 'A', type: 'action', name: 'A', config: {}, nextSteps: ['B'] },
        { id: 'B', type: 'action', name: 'B', config: {}, nextSteps: ['A'] },
      ],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]._tag).toBe('CycleDetected');
    expect(body.errors[0].type).toBe('https://aptivo.dev/errors/workflow-cycle');
  });

  it('returns 200 (not 400) for invalid drafts — this is a linter, not a gateway', async () => {
    const res = await ValidateRoute(mkRequest({
      steps: [{ id: 'A', type: 'action', name: 'A', config: {}, nextSteps: ['ghost'] }],
    }));
    expect(res.status).toBe(200);
  });

  it('surfaces DuplicateStepId with the correct type URI', async () => {
    const res = await ValidateRoute(mkRequest({
      steps: [
        { id: 'A', type: 'action', name: 'A', config: {} },
        { id: 'A', type: 'action', name: 'A-dup', config: {} },
      ],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.errors[0]._tag).toBe('DuplicateStepId');
    expect(body.errors[0].type).toBe('https://aptivo.dev/errors/workflow-duplicate-step-id');
  });
});

// ---------------------------------------------------------------------------
// POST /api/workflows — GraphInvalid mapping (400 RFC 7807)
// ---------------------------------------------------------------------------

describe('WFE3-01: POST /api/workflows — GraphInvalid → 400', () => {
  it('returns 400 application/problem+json with cycle type URI for cyclic create', async () => {
    const { POST } = await import('../src/app/api/workflows/route');
    const req = new Request('http://localhost/api/workflows', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({
        name: 'cyclic', domain: 'crypto',
        steps: [
          { id: 'A', type: 'action', name: 'A', config: {}, nextSteps: ['B'] },
          { id: 'B', type: 'action', name: 'B', config: {}, nextSteps: ['A'] },
        ],
      }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/workflow-cycle');
    expect(body.graphError._tag).toBe('CycleDetected');
    // nested graphError must carry the type URI so clients can use one schema
    // across linter and gateway responses
    expect(body.graphError.type).toBe('https://aptivo.dev/errors/workflow-cycle');
  });

  it('returns 400 with duplicate-step-id type URI for duplicate-ID create', async () => {
    const { POST } = await import('../src/app/api/workflows/route');
    const req = new Request('http://localhost/api/workflows', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({
        name: 'dup', domain: 'hr',
        steps: [
          { id: 'A', type: 'action', name: 'A', config: {} },
          { id: 'A', type: 'action', name: 'A-dup', config: {} },
        ],
      }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/workflow-duplicate-step-id');
    expect(body.graphError._tag).toBe('DuplicateStepId');
    expect(body.graphError.stepId).toBe('A');
  });
});
