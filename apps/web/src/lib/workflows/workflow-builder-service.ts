/**
 * FEAT-07: Visual Workflow Builder Foundation
 * @task FEAT-07
 *
 * provides higher-level workflow building operations on top of the crud api.
 * supports step manipulation, status transitions, and validation.
 */

import { Result } from '@aptivo/types';
import type { WorkflowStep } from '@aptivo/database';

// ---------------------------------------------------------------------------
// record type (re-export aligned with definition service)
// ---------------------------------------------------------------------------

export interface WorkflowDefinitionRecord {
  id: string;
  name: string;
  version: number;
  domain: string;
  description?: string;
  steps: WorkflowStep[];
  status: 'draft' | 'active' | 'archived';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type BuilderError =
  | { readonly _tag: 'ValidationError'; readonly message: string }
  | { readonly _tag: 'NotFoundError'; readonly id: string }
  | { readonly _tag: 'InvalidTransition'; readonly from: string; readonly to: string }
  | { readonly _tag: 'BuilderError'; readonly cause: unknown };

// ---------------------------------------------------------------------------
// deps interface
// ---------------------------------------------------------------------------

export interface WorkflowBuilderDeps {
  findById: (id: string) => Promise<WorkflowDefinitionRecord | null>;
  update: (id: string, data: Record<string, unknown>) => Promise<WorkflowDefinitionRecord | null>;
}

// ---------------------------------------------------------------------------
// valid status transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived'],
  active: ['archived'],
  archived: [], // terminal state
};

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createWorkflowBuilderService(deps: WorkflowBuilderDeps) {
  return {
    /**
     * add a step to a draft workflow.
     * rejects if workflow is not in draft status or step id already exists.
     */
    async addStep(
      workflowId: string,
      step: WorkflowStep,
    ): Promise<Result<WorkflowDefinitionRecord, BuilderError>> {
      const workflow = await deps.findById(workflowId);
      if (!workflow) return Result.err({ _tag: 'NotFoundError', id: workflowId });

      if (workflow.status !== 'draft') {
        return Result.err({ _tag: 'InvalidTransition', from: workflow.status, to: 'edit' });
      }

      // validate step has unique id
      if (workflow.steps.some((s) => s.id === step.id)) {
        return Result.err({ _tag: 'ValidationError', message: `Step ${step.id} already exists` });
      }

      const updated = await deps.update(workflowId, { steps: [...workflow.steps, step] });
      if (!updated) return Result.err({ _tag: 'NotFoundError', id: workflowId });
      return Result.ok(updated);
    },

    /**
     * remove a step from a draft workflow.
     * cleans up nextSteps references from remaining steps.
     */
    async removeStep(
      workflowId: string,
      stepId: string,
    ): Promise<Result<WorkflowDefinitionRecord, BuilderError>> {
      const workflow = await deps.findById(workflowId);
      if (!workflow) return Result.err({ _tag: 'NotFoundError', id: workflowId });

      if (workflow.status !== 'draft') {
        return Result.err({ _tag: 'InvalidTransition', from: workflow.status, to: 'edit' });
      }

      const filtered = workflow.steps.filter((s) => s.id !== stepId);
      if (filtered.length === workflow.steps.length) {
        return Result.err({ _tag: 'ValidationError', message: `Step ${stepId} not found` });
      }

      // clean up nextSteps references to the removed step
      const cleaned = filtered.map((s) => ({
        ...s,
        nextSteps: s.nextSteps?.filter((n) => n !== stepId),
      }));

      const updated = await deps.update(workflowId, { steps: cleaned });
      if (!updated) return Result.err({ _tag: 'NotFoundError', id: workflowId });
      return Result.ok(updated);
    },

    /**
     * reorder steps in a draft workflow.
     * all provided step ids must match existing steps.
     */
    async reorderSteps(
      workflowId: string,
      stepIds: string[],
    ): Promise<Result<WorkflowDefinitionRecord, BuilderError>> {
      const workflow = await deps.findById(workflowId);
      if (!workflow) return Result.err({ _tag: 'NotFoundError', id: workflowId });

      if (workflow.status !== 'draft') {
        return Result.err({ _tag: 'InvalidTransition', from: workflow.status, to: 'edit' });
      }

      // validate all step ids exist
      const existingIds = new Set(workflow.steps.map((s) => s.id));
      for (const id of stepIds) {
        if (!existingIds.has(id)) {
          return Result.err({ _tag: 'ValidationError', message: `Step ${id} not found` });
        }
      }

      const reordered = stepIds.map((id) => workflow.steps.find((s) => s.id === id)!);
      const updated = await deps.update(workflowId, { steps: reordered });
      if (!updated) return Result.err({ _tag: 'NotFoundError', id: workflowId });
      return Result.ok(updated);
    },

    /**
     * transition a draft workflow to active status.
     * requires at least one step to activate.
     */
    async activate(
      workflowId: string,
    ): Promise<Result<WorkflowDefinitionRecord, BuilderError>> {
      const workflow = await deps.findById(workflowId);
      if (!workflow) return Result.err({ _tag: 'NotFoundError', id: workflowId });

      if (!VALID_TRANSITIONS[workflow.status]?.includes('active')) {
        return Result.err({ _tag: 'InvalidTransition', from: workflow.status, to: 'active' });
      }

      // validate workflow has at least one step
      if (workflow.steps.length === 0) {
        return Result.err({ _tag: 'ValidationError', message: 'Cannot activate workflow with no steps' });
      }

      const updated = await deps.update(workflowId, { status: 'active' });
      if (!updated) return Result.err({ _tag: 'NotFoundError', id: workflowId });
      return Result.ok(updated);
    },

    /**
     * transition a workflow to archived status.
     * archived is terminal — cannot transition out.
     */
    async archive(
      workflowId: string,
    ): Promise<Result<WorkflowDefinitionRecord, BuilderError>> {
      const workflow = await deps.findById(workflowId);
      if (!workflow) return Result.err({ _tag: 'NotFoundError', id: workflowId });

      if (!VALID_TRANSITIONS[workflow.status]?.includes('archived')) {
        return Result.err({ _tag: 'InvalidTransition', from: workflow.status, to: 'archived' });
      }

      const updated = await deps.update(workflowId, { status: 'archived' });
      if (!updated) return Result.err({ _tag: 'NotFoundError', id: workflowId });
      return Result.ok(updated);
    },

    /** returns the list of valid target statuses from the given status */
    getValidTransitions(status: string): string[] {
      return VALID_TRANSITIONS[status] ?? [];
    },
  };
}
