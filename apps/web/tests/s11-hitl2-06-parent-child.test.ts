/**
 * HITL2-06: Parent/Child Workflow Orchestration Tests
 * @task HITL2-06
 *
 * verifies the workflow orchestrator, schema validation, and event constants
 * using mock EventSender and WorkflowStep implementations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWorkflowOrchestrator,
  ORCHESTRATION_EVENTS,
  ChildSpawnedEventSchema,
  ChildCompletedEventSchema,
} from '@aptivo/hitl-gateway/workflow';
import type { EventSender, WorkflowStep } from '@aptivo/hitl-gateway/workflow';

// ---------------------------------------------------------------------------
// mock helpers
// ---------------------------------------------------------------------------

function createMockEventSender() {
  const sent: Array<{ name: string; data: Record<string, unknown> }> = [];
  return {
    sent,
    async send(event: { name: string; data: Record<string, unknown> }) {
      sent.push(event);
    },
  };
}

function createMockStep(responses: Map<string, unknown>): WorkflowStep {
  const waitForEventCalls: Array<{ id: string; opts: { event: string; timeout: string; if?: string } }> = [];
  return {
    waitForEventCalls,
    async waitForEvent<T>(id: string, opts: { event: string; timeout: string; if?: string }): Promise<T | null> {
      waitForEventCalls.push({ id, opts });
      const value = responses.get(id);
      return (value ?? null) as T | null;
    },
    async run<T>(_id: string, fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  } as WorkflowStep & { waitForEventCalls: typeof waitForEventCalls };
}

// ---------------------------------------------------------------------------
// orchestrator tests
// ---------------------------------------------------------------------------

describe('createWorkflowOrchestrator', () => {
  let sender: ReturnType<typeof createMockEventSender>;
  let orchestrator: ReturnType<typeof createWorkflowOrchestrator>;

  beforeEach(() => {
    sender = createMockEventSender();
    orchestrator = createWorkflowOrchestrator({ eventSender: sender });
  });

  // -------------------------------------------------------------------------
  // spawnChild
  // -------------------------------------------------------------------------

  describe('spawnChild', () => {
    it('emits event with parentWorkflowId set', async () => {
      const result = await orchestrator.spawnChild(
        'parent-1',
        'child-a',
        'crypto/trade.requested',
      );

      expect(result.ok).toBe(true);
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0].data.parentWorkflowId).toBe('parent-1');
    });

    it('includes childWorkflowId in event data', async () => {
      const result = await orchestrator.spawnChild(
        'parent-1',
        'child-b',
        'hr/interview.scheduling.requested',
        { extra: 'data' },
      );

      expect(result.ok).toBe(true);
      expect(sender.sent[0].data.childWorkflowId).toBe('child-b');
      expect(sender.sent[0].data.extra).toBe('data');
      expect(sender.sent[0].name).toBe('hr/interview.scheduling.requested');
    });

    it('returns OrchestratorSpawnError when event sender throws', async () => {
      const failingSender: EventSender = {
        async send() {
          throw new Error('connection refused');
        },
      };
      const failOrchestrator = createWorkflowOrchestrator({ eventSender: failingSender });

      const result = await failOrchestrator.spawnChild(
        'parent-1',
        'child-fail',
        'some/event',
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('OrchestratorSpawnError');
        expect(result.error.message).toContain('child-fail');
      }
    });
  });

  // -------------------------------------------------------------------------
  // waitForChildren
  // -------------------------------------------------------------------------

  describe('waitForChildren', () => {
    it('with 2 children both completing returns allCompleted: true', async () => {
      const responses = new Map<string, unknown>();
      responses.set('wait-child-child-1', {
        data: { childWorkflowId: 'child-1', result: { score: 95 } },
      });
      responses.set('wait-child-child-2', {
        data: { childWorkflowId: 'child-2', result: { score: 87 } },
      });
      const step = createMockStep(responses);

      const result = await orchestrator.waitForChildren(
        step,
        { parentWorkflowId: 'parent-1', childTimeout: '30m' },
        ['child-1', 'child-2'],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.allCompleted).toBe(true);
        expect(result.value.completedCount).toBe(2);
        expect(result.value.timedOutCount).toBe(0);
        expect(result.value.parentWorkflowId).toBe('parent-1');
        expect(result.value.children).toHaveLength(2);
        expect(result.value.children[0].status).toBe('completed');
        expect(result.value.children[0].result).toEqual({ score: 95 });
        expect(result.value.children[1].status).toBe('completed');
        expect(result.value.children[1].result).toEqual({ score: 87 });
      }
    });

    it('with 1 child timeout returns partial results', async () => {
      const responses = new Map<string, unknown>();
      // child-1 completes, child-2 times out (null)
      responses.set('wait-child-child-1', {
        data: { childWorkflowId: 'child-1', result: 'ok' },
      });
      // child-2 not in map → returns null (timeout)
      const step = createMockStep(responses);

      const result = await orchestrator.waitForChildren(
        step,
        { parentWorkflowId: 'parent-2', childTimeout: '10m' },
        ['child-1', 'child-2'],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.allCompleted).toBe(false);
        expect(result.value.completedCount).toBe(1);
        expect(result.value.timedOutCount).toBe(1);
        expect(result.value.children[0].status).toBe('completed');
        expect(result.value.children[1].status).toBe('timed_out');
        expect(result.value.children[1].result).toBeUndefined();
      }
    });

    it('with all timeouts returns allCompleted: false', async () => {
      const responses = new Map<string, unknown>();
      // no responses → all timeout
      const step = createMockStep(responses);

      const result = await orchestrator.waitForChildren(
        step,
        { parentWorkflowId: 'parent-3', childTimeout: '5m' },
        ['child-a', 'child-b', 'child-c'],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.allCompleted).toBe(false);
        expect(result.value.completedCount).toBe(0);
        expect(result.value.timedOutCount).toBe(3);
        expect(result.value.children.every((c) => c.status === 'timed_out')).toBe(true);
      }
    });

    it('uses correct event correlation filter with parentWorkflowId and childWorkflowId', async () => {
      const responses = new Map<string, unknown>();
      responses.set('wait-child-child-x', {
        data: { childWorkflowId: 'child-x', result: null },
      });
      const step = createMockStep(responses) as WorkflowStep & {
        waitForEventCalls: Array<{ id: string; opts: { event: string; timeout: string; if?: string } }>;
      };

      await orchestrator.waitForChildren(
        step,
        { parentWorkflowId: 'parent-42', childTimeout: '15m' },
        ['child-x'],
      );

      expect(step.waitForEventCalls).toHaveLength(1);
      const call = step.waitForEventCalls[0];
      expect(call.id).toBe('wait-child-child-x');
      expect(call.opts.event).toBe('workflow/child.completed');
      expect(call.opts.timeout).toBe('15m');
      expect(call.opts.if).toContain("async.data.parentWorkflowId == 'parent-42'");
      expect(call.opts.if).toContain("async.data.childWorkflowId == 'child-x'");
    });

    it('returns OrchestratorError when step throws', async () => {
      const failStep: WorkflowStep = {
        async waitForEvent() {
          throw new Error('inngest internal error');
        },
        async run<T>(_id: string, fn: () => Promise<T>) {
          return fn();
        },
      };

      const result = await orchestrator.waitForChildren(
        failStep,
        { parentWorkflowId: 'parent-fail', childTimeout: '5m' },
        ['child-err'],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('OrchestratorError');
        expect(result.error.message).toBe('Failed to wait for children');
      }
    });
  });

  // -------------------------------------------------------------------------
  // completeChild
  // -------------------------------------------------------------------------

  describe('completeChild', () => {
    it('emits workflow/child.completed event with result', async () => {
      const result = await orchestrator.completeChild(
        'parent-1',
        'child-done',
        { status: 'success', output: 42 },
      );

      expect(result.ok).toBe(true);
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0].name).toBe('workflow/child.completed');
      expect(sender.sent[0].data.parentWorkflowId).toBe('parent-1');
      expect(sender.sent[0].data.childWorkflowId).toBe('child-done');
      expect(sender.sent[0].data.result).toEqual({ status: 'success', output: 42 });
    });

    it('includes completedAt timestamp', async () => {
      const before = new Date().toISOString();
      await orchestrator.completeChild('parent-1', 'child-ts', 'ok');
      const after = new Date().toISOString();

      const completedAt = sender.sent[0].data.completedAt as string;
      expect(completedAt >= before).toBe(true);
      expect(completedAt <= after).toBe(true);
    });

    it('returns OrchestratorSpawnError when event sender throws', async () => {
      const failingSender: EventSender = {
        async send() {
          throw new Error('network error');
        },
      };
      const failOrchestrator = createWorkflowOrchestrator({ eventSender: failingSender });

      const result = await failOrchestrator.completeChild(
        'parent-1',
        'child-fail',
        null,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('OrchestratorSpawnError');
        expect(result.error.message).toContain('child-fail');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// schema validation tests
// ---------------------------------------------------------------------------

describe('ChildSpawnedEventSchema', () => {
  it('validates correct data', () => {
    const data = {
      parentWorkflowId: 'parent-1',
      childWorkflowId: 'child-1',
      childEventName: 'crypto/trade.requested',
      spawnedAt: new Date().toISOString(),
    };

    const result = ChildSpawnedEventSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('rejects empty parentWorkflowId', () => {
    const data = {
      parentWorkflowId: '',
      childWorkflowId: 'child-1',
      childEventName: 'event',
      spawnedAt: new Date().toISOString(),
    };

    const result = ChildSpawnedEventSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    const result = ChildSpawnedEventSchema.safeParse({ parentWorkflowId: 'p1' });
    expect(result.success).toBe(false);
  });
});

describe('ChildCompletedEventSchema', () => {
  it('validates correct data', () => {
    const data = {
      parentWorkflowId: 'parent-1',
      childWorkflowId: 'child-1',
      result: { score: 95, passed: true },
      completedAt: new Date().toISOString(),
    };

    const result = ChildCompletedEventSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('accepts null result', () => {
    const data = {
      parentWorkflowId: 'parent-1',
      childWorkflowId: 'child-1',
      result: null,
      completedAt: new Date().toISOString(),
    };

    const result = ChildCompletedEventSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('rejects empty childWorkflowId', () => {
    const data = {
      parentWorkflowId: 'parent-1',
      childWorkflowId: '',
      result: null,
      completedAt: new Date().toISOString(),
    };

    const result = ChildCompletedEventSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// event constants tests
// ---------------------------------------------------------------------------

describe('ORCHESTRATION_EVENTS', () => {
  it('has correct CHILD_SPAWNED event name', () => {
    expect(ORCHESTRATION_EVENTS.CHILD_SPAWNED).toBe('workflow/child.spawned');
  });

  it('has correct CHILD_COMPLETED event name', () => {
    expect(ORCHESTRATION_EVENTS.CHILD_COMPLETED).toBe('workflow/child.completed');
  });
});
