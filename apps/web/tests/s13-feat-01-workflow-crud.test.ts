/**
 * FEAT-01: Workflow Definition CRUD API tests
 * @task FEAT-01
 *
 * verifies workflow definition service, validation, and api route handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createWorkflowDefinitionService,
  CreateWorkflowInput,
  WorkflowStepSchema,
} from '../src/lib/workflows/workflow-definition-service';
import type {
  WorkflowDefinitionStore,
  WorkflowDefinitionRecord,
} from '../src/lib/workflows/workflow-definition-service';

// ---------------------------------------------------------------------------
// in-memory store (mirrors composition root progressive pattern)
// ---------------------------------------------------------------------------

function createInMemoryStore(): WorkflowDefinitionStore {
  const records = new Map<string, WorkflowDefinitionRecord>();

  return {
    async create(record) {
      const id = crypto.randomUUID();
      const now = new Date();
      const full: WorkflowDefinitionRecord = {
        ...record,
        id,
        createdAt: now,
        updatedAt: now,
      };
      records.set(id, full);
      return full;
    },
    async findById(id) {
      return records.get(id) ?? null;
    },
    async findByName(name, domain) {
      return [...records.values()].filter((r) => r.name === name && r.domain === domain);
    },
    async list(domain) {
      const all = [...records.values()];
      if (domain) return all.filter((r) => r.domain === domain);
      return all;
    },
    async update(id, data) {
      const existing = records.get(id);
      if (!existing) return null;
      const updated: WorkflowDefinitionRecord = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      records.set(id, updated);
      return updated;
    },
    async delete(id) {
      return records.delete(id);
    },
  };
}

// ---------------------------------------------------------------------------
// valid test input
// ---------------------------------------------------------------------------

const validInput = {
  name: 'test-workflow',
  domain: 'crypto',
  description: 'A test workflow definition',
  steps: [
    {
      id: 'step-1',
      type: 'action' as const,
      name: 'Fetch data',
      config: { url: 'https://api.example.com' },
      nextSteps: ['step-2'],
    },
    {
      id: 'step-2',
      type: 'hitl' as const,
      name: 'Approve trade',
      config: { timeout: 3600 },
    },
  ],
};

const createdBy = 'user-123';

// ---------------------------------------------------------------------------
// WorkflowStepSchema validation
// ---------------------------------------------------------------------------

describe('WorkflowStepSchema', () => {
  it('validates a valid action step', () => {
    const result = WorkflowStepSchema.safeParse({
      id: 'step-1',
      type: 'action',
      name: 'Do something',
      config: { key: 'value' },
    });
    expect(result.success).toBe(true);
  });

  it('validates all step types', () => {
    const types = ['action', 'decision', 'hitl', 'notification', 'wait'] as const;
    for (const type of types) {
      const result = WorkflowStepSchema.safeParse({
        id: `step-${type}`,
        type,
        name: `${type} step`,
        config: {},
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid step type', () => {
    const result = WorkflowStepSchema.safeParse({
      id: 'step-1',
      type: 'invalid',
      name: 'Bad step',
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty id', () => {
    const result = WorkflowStepSchema.safeParse({
      id: '',
      type: 'action',
      name: 'No id step',
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional nextSteps', () => {
    const withNext = WorkflowStepSchema.safeParse({
      id: 'step-1',
      type: 'action',
      name: 'With next',
      config: {},
      nextSteps: ['step-2', 'step-3'],
    });
    expect(withNext.success).toBe(true);

    const withoutNext = WorkflowStepSchema.safeParse({
      id: 'step-1',
      type: 'action',
      name: 'Without next',
      config: {},
    });
    expect(withoutNext.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CreateWorkflowInput validation
// ---------------------------------------------------------------------------

describe('CreateWorkflowInput', () => {
  it('validates a valid input', () => {
    const result = CreateWorkflowInput.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = CreateWorkflowInput.safeParse({ ...validInput, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 200 characters', () => {
    const result = CreateWorkflowInput.safeParse({ ...validInput, name: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects empty steps array', () => {
    const result = CreateWorkflowInput.safeParse({ ...validInput, steps: [] });
    expect(result.success).toBe(false);
  });

  it('rejects missing domain', () => {
    const { domain: _, ...noDomain } = validInput;
    const result = CreateWorkflowInput.safeParse(noDomain);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// service: create
// ---------------------------------------------------------------------------

describe('createWorkflowDefinitionService — create', () => {
  let store: WorkflowDefinitionStore;

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it('creates a workflow with valid steps and returns record with id', async () => {
    const service = createWorkflowDefinitionService({ store });
    const result = await service.create(validInput, createdBy);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBeDefined();
    expect(result.value.name).toBe('test-workflow');
    expect(result.value.domain).toBe('crypto');
    expect(result.value.version).toBe(1);
    expect(result.value.status).toBe('draft');
    expect(result.value.createdBy).toBe(createdBy);
    expect(result.value.steps).toHaveLength(2);
    expect(result.value.createdAt).toBeInstanceOf(Date);
    expect(result.value.updatedAt).toBeInstanceOf(Date);
  });

  it('returns ValidationError for invalid input', async () => {
    const service = createWorkflowDefinitionService({ store });
    const result = await service.create({ name: '' }, createdBy);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('returns ValidationError for missing steps', async () => {
    const service = createWorkflowDefinitionService({ store });
    const result = await service.create({ name: 'test', domain: 'crypto' }, createdBy);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('returns PersistenceError when store throws', async () => {
    const failingStore = createInMemoryStore();
    failingStore.create = () => { throw new Error('db down'); };

    const service = createWorkflowDefinitionService({ store: failingStore });
    const result = await service.create(validInput, createdBy);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('PersistenceError');
  });
});

// ---------------------------------------------------------------------------
// service: findById
// ---------------------------------------------------------------------------

describe('createWorkflowDefinitionService — findById', () => {
  let store: WorkflowDefinitionStore;

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it('finds an existing record by id', async () => {
    const service = createWorkflowDefinitionService({ store });
    const created = await service.create(validInput, createdBy);
    if (!created.ok) throw new Error('setup failed');

    const result = await service.findById(created.value.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(created.value.id);
    expect(result.value.name).toBe('test-workflow');
  });

  it('returns NotFoundError for non-existent id', async () => {
    const service = createWorkflowDefinitionService({ store });
    const result = await service.findById('non-existent-id');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NotFoundError');
    expect(result.error.id).toBe('non-existent-id');
  });
});

// ---------------------------------------------------------------------------
// service: list
// ---------------------------------------------------------------------------

describe('createWorkflowDefinitionService — list', () => {
  let store: WorkflowDefinitionStore;

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it('returns empty array when no workflows exist', async () => {
    const service = createWorkflowDefinitionService({ store });
    const result = await service.list();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('lists all workflows', async () => {
    const service = createWorkflowDefinitionService({ store });
    await service.create(validInput, createdBy);
    await service.create({ ...validInput, name: 'second-workflow', domain: 'hr' }, createdBy);

    const result = await service.list();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
  });

  it('filters by domain', async () => {
    const service = createWorkflowDefinitionService({ store });
    await service.create(validInput, createdBy);
    await service.create({ ...validInput, name: 'hr-workflow', domain: 'hr' }, createdBy);

    const result = await service.list('crypto');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].domain).toBe('crypto');
  });

  it('returns PersistenceError when store throws', async () => {
    const failingStore = createInMemoryStore();
    failingStore.list = () => { throw new Error('db down'); };

    const service = createWorkflowDefinitionService({ store: failingStore });
    const result = await service.list();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('PersistenceError');
  });
});

// ---------------------------------------------------------------------------
// service: update
// ---------------------------------------------------------------------------

describe('createWorkflowDefinitionService — update', () => {
  let store: WorkflowDefinitionStore;

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it('updates an existing workflow', async () => {
    const service = createWorkflowDefinitionService({ store });
    const created = await service.create(validInput, createdBy);
    if (!created.ok) throw new Error('setup failed');

    const result = await service.update(created.value.id, { name: 'updated-name', status: 'active' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('updated-name');
    expect(result.value.status).toBe('active');
  });

  it('returns NotFoundError for non-existent id', async () => {
    const service = createWorkflowDefinitionService({ store });
    const result = await service.update('non-existent', { name: 'updated' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NotFoundError');
  });
});

// ---------------------------------------------------------------------------
// service: delete
// ---------------------------------------------------------------------------

describe('createWorkflowDefinitionService — delete', () => {
  let store: WorkflowDefinitionStore;

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it('deletes an existing workflow', async () => {
    const service = createWorkflowDefinitionService({ store });
    const created = await service.create(validInput, createdBy);
    if (!created.ok) throw new Error('setup failed');

    const result = await service.delete(created.value.id);
    expect(result.ok).toBe(true);

    // verify it's gone
    const findResult = await service.findById(created.value.id);
    expect(findResult.ok).toBe(false);
  });

  it('returns NotFoundError when deleting non-existent id', async () => {
    const service = createWorkflowDefinitionService({ store });
    const result = await service.delete('non-existent');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NotFoundError');
  });
});

// ---------------------------------------------------------------------------
// api route tests
// ---------------------------------------------------------------------------

// mock rbac middleware — allow all in tests
vi.mock('../src/lib/security/rbac-middleware', () => ({
  checkPermissionWithBlacklist: () => () => Promise.resolve(null),
}));

// mock extractUser — returns a test user
vi.mock('../src/lib/security/rbac-resolver', () => ({
  extractUser: () => Promise.resolve({ userId: 'test-user-id', role: 'admin' }),
}));

// mock composition root — use in-memory store
const mockStore = createInMemoryStore();
const mockService = createWorkflowDefinitionService({ store: mockStore });

vi.mock('../src/lib/services', () => ({
  getWorkflowDefinitionService: () => mockService,
}));

// import route handlers after mocks
import { POST, GET } from '../src/app/api/workflows/route';
import { GET as GET_BY_ID, PUT, DELETE } from '../src/app/api/workflows/[id]/route';

// ---------------------------------------------------------------------------
// route helpers
// ---------------------------------------------------------------------------

function jsonRequest(method: string, url: string, body?: unknown): Request {
  const init: RequestInit = { method, headers: { 'x-user-role': 'admin', 'content-type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return new Request(`http://localhost:3000${url}`, init);
}

function makeRouteParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// POST /api/workflows
// ---------------------------------------------------------------------------

describe('POST /api/workflows', () => {
  it('creates a workflow and returns 201', async () => {
    const req = jsonRequest('POST', '/api/workflows', validInput);
    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.id).toBeDefined();
    expect(json.data.name).toBe('test-workflow');
    expect(json.data.status).toBe('draft');
  });

  it('returns 400 for invalid input', async () => {
    const req = jsonRequest('POST', '/api/workflows', { name: '' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid json body', async () => {
    const req = new Request('http://localhost:3000/api/workflows', {
      method: 'POST',
      headers: { 'x-user-role': 'admin', 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/workflows
// ---------------------------------------------------------------------------

describe('GET /api/workflows', () => {
  it('returns list of workflows', async () => {
    const req = jsonRequest('GET', '/api/workflows');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.count).toBeGreaterThanOrEqual(0);
  });

  it('filters by domain query parameter', async () => {
    // create one in a unique domain
    const uniqueDomain = `test-domain-${crypto.randomUUID().slice(0, 8)}`;
    await mockService.create({
      ...validInput,
      name: `domain-filter-test-${uniqueDomain}`,
      domain: uniqueDomain,
    }, 'test-user');

    const req = jsonRequest('GET', `/api/workflows?domain=${uniqueDomain}`);
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.every((w: WorkflowDefinitionRecord) => w.domain === uniqueDomain)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/workflows/[id]
// ---------------------------------------------------------------------------

describe('GET /api/workflows/[id]', () => {
  it('returns workflow by id', async () => {
    const created = await mockService.create(validInput, 'test-user');
    if (!created.ok) throw new Error('setup failed');

    const req = jsonRequest('GET', `/api/workflows/${created.value.id}`);
    const res = await GET_BY_ID(req, makeRouteParams(created.value.id));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.id).toBe(created.value.id);
  });

  it('returns 404 for non-existent id', async () => {
    const req = jsonRequest('GET', '/api/workflows/missing-id');
    const res = await GET_BY_ID(req, makeRouteParams('missing-id'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/workflows/[id]
// ---------------------------------------------------------------------------

describe('PUT /api/workflows/[id]', () => {
  it('updates workflow and returns updated record', async () => {
    const created = await mockService.create(validInput, 'test-user');
    if (!created.ok) throw new Error('setup failed');

    const req = jsonRequest('PUT', `/api/workflows/${created.value.id}`, { name: 'renamed' });
    const res = await PUT(req, makeRouteParams(created.value.id));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.name).toBe('renamed');
  });

  it('returns 404 for non-existent id', async () => {
    const req = jsonRequest('PUT', '/api/workflows/missing-id', { name: 'nope' });
    const res = await PUT(req, makeRouteParams('missing-id'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/workflows/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/workflows/[id]', () => {
  it('deletes workflow and returns success', async () => {
    const created = await mockService.create(validInput, 'test-user');
    if (!created.ok) throw new Error('setup failed');

    const req = jsonRequest('DELETE', `/api/workflows/${created.value.id}`);
    const res = await DELETE(req, makeRouteParams(created.value.id));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 404 for non-existent id', async () => {
    const req = jsonRequest('DELETE', '/api/workflows/missing-id');
    const res = await DELETE(req, makeRouteParams('missing-id'));
    expect(res.status).toBe(404);
  });
});
