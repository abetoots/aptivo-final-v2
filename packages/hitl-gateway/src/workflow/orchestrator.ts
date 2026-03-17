/**
 * HITL2-06: Parent/Child Workflow Orchestration
 * @task HITL2-06
 *
 * provides utilities for parent/child workflow coordination.
 * decoupled from Inngest via EventSender and WorkflowStep interfaces.
 */

import { Result } from '@aptivo/types';
import type {
  OrchestratorConfig,
  ChildResult,
  OrchestrationResult,
  OrchestratorError,
} from './orchestrator-types.js';

// ---------------------------------------------------------------------------
// event sender interface (decoupled from Inngest)
// ---------------------------------------------------------------------------

export interface EventSender {
  send(event: { name: string; data: Record<string, unknown> }): Promise<void>;
}

// ---------------------------------------------------------------------------
// step interface (subset of Inngest step)
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  waitForEvent<T>(
    id: string,
    opts: { event: string; timeout: string; if?: string },
  ): Promise<T | null>;
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// factory deps
// ---------------------------------------------------------------------------

export interface WorkflowOrchestratorDeps {
  eventSender: EventSender;
}

// ---------------------------------------------------------------------------
// factory — creates the workflow orchestrator
// ---------------------------------------------------------------------------

export function createWorkflowOrchestrator(deps: WorkflowOrchestratorDeps) {
  return {
    /**
     * spawn a child workflow by emitting its trigger event with parent correlation
     */
    async spawnChild(
      parentWorkflowId: string,
      childWorkflowId: string,
      childEventName: string,
      childEventData: Record<string, unknown> = {},
    ): Promise<Result<void, OrchestratorError>> {
      try {
        await deps.eventSender.send({
          name: childEventName,
          data: {
            ...childEventData,
            parentWorkflowId,
            childWorkflowId,
          },
        });
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          _tag: 'OrchestratorSpawnError',
          message: `Failed to spawn child ${childWorkflowId}`,
          cause,
        });
      }
    },

    /**
     * wait for N children to complete, with per-child timeout
     */
    async waitForChildren(
      step: WorkflowStep,
      config: OrchestratorConfig,
      expectedChildren: string[], // child workflow IDs
    ): Promise<Result<OrchestrationResult, OrchestratorError>> {
      try {
        const children: ChildResult[] = [];

        for (const childId of expectedChildren) {
          const event = await step.waitForEvent<{
            data: { childWorkflowId: string; result: unknown };
          }>(`wait-child-${childId}`, {
            event: 'workflow/child.completed',
            timeout: config.childTimeout,
            if: `async.data.parentWorkflowId == '${config.parentWorkflowId}' && async.data.childWorkflowId == '${childId}'`,
          });

          if (event) {
            children.push({
              childWorkflowId: childId,
              status: 'completed',
              result: event.data.result,
            });
          } else {
            children.push({
              childWorkflowId: childId,
              status: 'timed_out',
            });
          }
        }

        const completedCount = children.filter((c) => c.status === 'completed').length;
        const timedOutCount = children.filter((c) => c.status === 'timed_out').length;

        return Result.ok({
          parentWorkflowId: config.parentWorkflowId,
          children,
          allCompleted: timedOutCount === 0,
          completedCount,
          timedOutCount,
        });
      } catch (cause) {
        return Result.err({
          _tag: 'OrchestratorError',
          message: 'Failed to wait for children',
          cause,
        });
      }
    },

    /**
     * emit child completion event (called by child workflows)
     */
    async completeChild(
      parentWorkflowId: string,
      childWorkflowId: string,
      result: unknown,
    ): Promise<Result<void, OrchestratorError>> {
      try {
        await deps.eventSender.send({
          name: 'workflow/child.completed',
          data: {
            parentWorkflowId,
            childWorkflowId,
            result,
            completedAt: new Date().toISOString(),
          },
        });
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          _tag: 'OrchestratorSpawnError',
          message: `Failed to complete child ${childWorkflowId}`,
          cause,
        });
      }
    },
  };
}
