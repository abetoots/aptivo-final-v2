/**
 * FEAT-07: Visual Workflow Builder Foundation tests
 * @task FEAT-07
 *
 * verifies workflow builder service: step manipulation, status transitions,
 * validation rules, and nextSteps cleanup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWorkflowBuilderService } from '../src/lib/workflows/workflow-builder-service';
import type {
  WorkflowBuilderDeps,
  WorkflowDefinitionRecord,
} from '../src/lib/workflows/workflow-builder-service';
import type { WorkflowStep } from '@aptivo/database';

// ---------------------------------------------------------------------------
// in-memory deps (mirrors composition root progressive pattern)
// ---------------------------------------------------------------------------

function createInMemoryDeps(): WorkflowBuilderDeps & {
  seed: (record: WorkflowDefinitionRecord) => void;
  getAll: () => WorkflowDefinitionRecord[];
} {
  const records = new Map<string, WorkflowDefinitionRecord>();

  return {
    seed(record: WorkflowDefinitionRecord) {
      records.set(record.id, record);
    },
    getAll() {
      return [...records.values()];
    },
    async findById(id: string) {
      return records.get(id) ?? null;
    },
    async update(id: string, data: Record<string, unknown>) {
      const existing = records.get(id);
      if (!existing) return null;
      const updated: WorkflowDefinitionRecord = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      } as WorkflowDefinitionRecord;
      records.set(id, updated);
      return updated;
    },
  };
}

// ---------------------------------------------------------------------------
// test data helpers
// ---------------------------------------------------------------------------

function makeDraftWorkflow(overrides?: Partial<WorkflowDefinitionRecord>): WorkflowDefinitionRecord {
  return {
    id: 'wf-1',
    name: 'test-workflow',
    version: 1,
    domain: 'crypto',
    description: 'a test workflow',
    steps: [
      { id: 'step-1', type: 'action', name: 'Fetch data', config: { url: 'https://api.example.com' }, nextSteps: ['step-2'] },
      { id: 'step-2', type: 'hitl', name: 'Approve', config: { timeout: 3600 } },
    ],
    status: 'draft',
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeStep(id: string, overrides?: Partial<WorkflowStep>): WorkflowStep {
  return {
    id,
    type: 'action',
    name: `Step ${id}`,
    config: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// addStep
// ---------------------------------------------------------------------------

describe('createWorkflowBuilderService — addStep', () => {
  let deps: ReturnType<typeof createInMemoryDeps>;

  beforeEach(() => {
    deps = createInMemoryDeps();
  });

  it('adds a step to a draft workflow', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const result = await service.addStep('wf-1', makeStep('step-3'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps).toHaveLength(3);
    expect(result.value.steps[2].id).toBe('step-3');
  });

  it('returns InvalidTransition when adding to active workflow', async () => {
    deps.seed(makeDraftWorkflow({ status: 'active' }));
    const service = createWorkflowBuilderService(deps);

    const result = await service.addStep('wf-1', makeStep('step-3'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidTransition');
    expect(result.error).toHaveProperty('from', 'active');
  });

  it('returns InvalidTransition when adding to archived workflow', async () => {
    deps.seed(makeDraftWorkflow({ status: 'archived' }));
    const service = createWorkflowBuilderService(deps);

    const result = await service.addStep('wf-1', makeStep('step-3'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidTransition');
  });

  it('returns ValidationError for duplicate step id', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const result = await service.addStep('wf-1', makeStep('step-1'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    expect(result.error).toHaveProperty('message', 'Step step-1 already exists');
  });

  it('returns NotFoundError for non-existent workflow', async () => {
    const service = createWorkflowBuilderService(deps);

    const result = await service.addStep('non-existent', makeStep('step-1'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NotFoundError');
    expect(result.error).toHaveProperty('id', 'non-existent');
  });

  it('preserves existing steps when adding a new one', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const result = await service.addStep('wf-1', makeStep('step-3'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps[0].id).toBe('step-1');
    expect(result.value.steps[1].id).toBe('step-2');
    expect(result.value.steps[2].id).toBe('step-3');
  });
});

// ---------------------------------------------------------------------------
// removeStep
// ---------------------------------------------------------------------------

describe('createWorkflowBuilderService — removeStep', () => {
  let deps: ReturnType<typeof createInMemoryDeps>;

  beforeEach(() => {
    deps = createInMemoryDeps();
  });

  it('removes a step and returns updated workflow', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const result = await service.removeStep('wf-1', 'step-2');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps).toHaveLength(1);
    expect(result.value.steps[0].id).toBe('step-1');
  });

  it('cleans up nextSteps references to removed step', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const result = await service.removeStep('wf-1', 'step-2');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // step-1 had nextSteps: ['step-2'], should now be empty
    expect(result.value.steps[0].nextSteps).toEqual([]);
  });

  it('returns ValidationError for non-existent step', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const result = await service.removeStep('wf-1', 'step-999');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    expect(result.error).toHaveProperty('message', 'Step step-999 not found');
  });

  it('returns InvalidTransition when removing from active workflow', async () => {
    deps.seed(makeDraftWorkflow({ status: 'active' }));
    const service = createWorkflowBuilderService(deps);

    const result = await service.removeStep('wf-1', 'step-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidTransition');
  });

  it('returns NotFoundError for non-existent workflow', async () => {
    const service = createWorkflowBuilderService(deps);

    const result = await service.removeStep('non-existent', 'step-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NotFoundError');
  });
});

// ---------------------------------------------------------------------------
// reorderSteps
// ---------------------------------------------------------------------------

describe('createWorkflowBuilderService — reorderSteps', () => {
  let deps: ReturnType<typeof createInMemoryDeps>;

  beforeEach(() => {
    deps = createInMemoryDeps();
  });

  it('reorders steps to the given order', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const result = await service.reorderSteps('wf-1', ['step-2', 'step-1']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps[0].id).toBe('step-2');
    expect(result.value.steps[1].id).toBe('step-1');
  });

  it('returns ValidationError when step id is unknown', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const result = await service.reorderSteps('wf-1', ['step-1', 'step-999']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    expect(result.error).toHaveProperty('message', 'Step step-999 not found');
  });

  it('returns InvalidTransition when reordering active workflow', async () => {
    deps.seed(makeDraftWorkflow({ status: 'active' }));
    const service = createWorkflowBuilderService(deps);

    const result = await service.reorderSteps('wf-1', ['step-2', 'step-1']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidTransition');
  });

  it('returns NotFoundError for non-existent workflow', async () => {
    const service = createWorkflowBuilderService(deps);

    const result = await service.reorderSteps('missing', ['step-1']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NotFoundError');
  });

  it('handles subset of steps in reorder', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    // only reorder step-1 — step-2 is excluded from the result
    const result = await service.reorderSteps('wf-1', ['step-1']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps).toHaveLength(1);
    expect(result.value.steps[0].id).toBe('step-1');
  });
});

// ---------------------------------------------------------------------------
// activate
// ---------------------------------------------------------------------------

describe('createWorkflowBuilderService — activate', () => {
  let deps: ReturnType<typeof createInMemoryDeps>;

  beforeEach(() => {
    deps = createInMemoryDeps();
  });

  it('activates a draft workflow with steps', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const result = await service.activate('wf-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('active');
  });

  it('returns ValidationError when activating workflow with no steps', async () => {
    deps.seed(makeDraftWorkflow({ steps: [] }));
    const service = createWorkflowBuilderService(deps);

    const result = await service.activate('wf-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    expect(result.error).toHaveProperty('message', 'Cannot activate workflow with no steps');
  });

  it('returns InvalidTransition when activating already active workflow', async () => {
    deps.seed(makeDraftWorkflow({ status: 'active' }));
    const service = createWorkflowBuilderService(deps);

    const result = await service.activate('wf-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidTransition');
    expect(result.error).toHaveProperty('from', 'active');
    expect(result.error).toHaveProperty('to', 'active');
  });

  it('returns InvalidTransition when activating archived workflow', async () => {
    deps.seed(makeDraftWorkflow({ status: 'archived' }));
    const service = createWorkflowBuilderService(deps);

    const result = await service.activate('wf-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidTransition');
  });

  it('returns NotFoundError for non-existent workflow', async () => {
    const service = createWorkflowBuilderService(deps);

    const result = await service.activate('missing');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NotFoundError');
  });
});

// ---------------------------------------------------------------------------
// archive
// ---------------------------------------------------------------------------

describe('createWorkflowBuilderService — archive', () => {
  let deps: ReturnType<typeof createInMemoryDeps>;

  beforeEach(() => {
    deps = createInMemoryDeps();
  });

  it('archives a draft workflow', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const result = await service.archive('wf-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('archived');
  });

  it('archives an active workflow', async () => {
    deps.seed(makeDraftWorkflow({ status: 'active' }));
    const service = createWorkflowBuilderService(deps);

    const result = await service.archive('wf-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('archived');
  });

  it('returns InvalidTransition when archiving already archived workflow', async () => {
    deps.seed(makeDraftWorkflow({ status: 'archived' }));
    const service = createWorkflowBuilderService(deps);

    const result = await service.archive('wf-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidTransition');
    expect(result.error).toHaveProperty('from', 'archived');
    expect(result.error).toHaveProperty('to', 'archived');
  });

  it('returns NotFoundError for non-existent workflow', async () => {
    const service = createWorkflowBuilderService(deps);

    const result = await service.archive('missing');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NotFoundError');
  });
});

// ---------------------------------------------------------------------------
// getValidTransitions
// ---------------------------------------------------------------------------

describe('createWorkflowBuilderService — getValidTransitions', () => {
  it('returns [active, archived] for draft', () => {
    const service = createWorkflowBuilderService(createInMemoryDeps());
    expect(service.getValidTransitions('draft')).toEqual(['active', 'archived']);
  });

  it('returns [archived] for active', () => {
    const service = createWorkflowBuilderService(createInMemoryDeps());
    expect(service.getValidTransitions('active')).toEqual(['archived']);
  });

  it('returns empty array for archived', () => {
    const service = createWorkflowBuilderService(createInMemoryDeps());
    expect(service.getValidTransitions('archived')).toEqual([]);
  });

  it('returns empty array for unknown status', () => {
    const service = createWorkflowBuilderService(createInMemoryDeps());
    expect(service.getValidTransitions('bogus')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// edge cases and combined operations
// ---------------------------------------------------------------------------

describe('createWorkflowBuilderService — combined operations', () => {
  let deps: ReturnType<typeof createInMemoryDeps>;

  beforeEach(() => {
    deps = createInMemoryDeps();
  });

  it('add then remove step roundtrip', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    // add step-3
    const added = await service.addStep('wf-1', makeStep('step-3', { nextSteps: ['step-1'] }));
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.steps).toHaveLength(3);

    // remove step-3
    const removed = await service.removeStep('wf-1', 'step-3');
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.steps).toHaveLength(2);
  });

  it('reorder then activate', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const reordered = await service.reorderSteps('wf-1', ['step-2', 'step-1']);
    expect(reordered.ok).toBe(true);

    const activated = await service.activate('wf-1');
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.value.status).toBe('active');
    expect(activated.value.steps[0].id).toBe('step-2');
  });

  it('activate then archive lifecycle', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    const activated = await service.activate('wf-1');
    expect(activated.ok).toBe(true);

    const archived = await service.archive('wf-1');
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    expect(archived.value.status).toBe('archived');
  });

  it('cannot add step after activation', async () => {
    deps.seed(makeDraftWorkflow());
    const service = createWorkflowBuilderService(deps);

    await service.activate('wf-1');
    const result = await service.addStep('wf-1', makeStep('step-3'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidTransition');
  });

  it('cannot reorder after archive', async () => {
    deps.seed(makeDraftWorkflow({ status: 'archived' }));
    const service = createWorkflowBuilderService(deps);

    const result = await service.reorderSteps('wf-1', ['step-2', 'step-1']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidTransition');
  });
});
