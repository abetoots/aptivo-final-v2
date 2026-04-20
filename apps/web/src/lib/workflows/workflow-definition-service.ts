/**
 * FEAT-01: Workflow Definition CRUD service
 * @task FEAT-01
 *
 * provides create/read/update/delete operations for workflow definitions.
 * uses the standard factory + deps injection pattern with Result returns.
 */

import { z } from 'zod';
import { Result } from '@aptivo/types';
import type { WorkflowStep } from '@aptivo/database';
import { validateGraph, type GraphValidationError } from './graph-validation';

// ---------------------------------------------------------------------------
// validation schemas
// ---------------------------------------------------------------------------

export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['action', 'decision', 'hitl', 'notification', 'wait']),
  name: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  nextSteps: z.array(z.string()).optional(),
});

export const CreateWorkflowInput = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().min(1).max(50),
  description: z.string().max(1000).optional(),
  steps: z.array(WorkflowStepSchema).min(1),
});

// partial schema for updates — all fields optional
export const UpdateWorkflowInput = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  steps: z.array(WorkflowStepSchema).min(1).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type WorkflowDefinitionError =
  | { readonly _tag: 'ValidationError'; readonly message: string }
  | { readonly _tag: 'GraphInvalid'; readonly graphError: GraphValidationError }
  | { readonly _tag: 'NotFoundError'; readonly id: string }
  | { readonly _tag: 'PersistenceError'; readonly message: string; readonly cause: unknown };

// ---------------------------------------------------------------------------
// record type
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
// store interface
// ---------------------------------------------------------------------------

export interface WorkflowDefinitionStore {
  create(record: Omit<WorkflowDefinitionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkflowDefinitionRecord>;
  findById(id: string): Promise<WorkflowDefinitionRecord | null>;
  findByName(name: string, domain: string): Promise<WorkflowDefinitionRecord[]>;
  list(domain?: string): Promise<WorkflowDefinitionRecord[]>;
  update(id: string, data: Partial<Pick<WorkflowDefinitionRecord, 'name' | 'description' | 'steps' | 'status'>>): Promise<WorkflowDefinitionRecord | null>;
  delete(id: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// service deps
// ---------------------------------------------------------------------------

export interface WorkflowDefinitionServiceDeps {
  store: WorkflowDefinitionStore;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createWorkflowDefinitionService(deps: WorkflowDefinitionServiceDeps) {
  return {
    async create(input: unknown, createdBy: string): Promise<Result<WorkflowDefinitionRecord, WorkflowDefinitionError>> {
      const parsed = CreateWorkflowInput.safeParse(input);
      if (!parsed.success) {
        return Result.err({ _tag: 'ValidationError', message: parsed.error.message });
      }

      // structural graph validation runs *after* shape validation so the
      // caller can trust steps are well-formed before topological checks
      const graphResult = validateGraph(parsed.data.steps);
      if (!graphResult.ok) {
        return Result.err({ _tag: 'GraphInvalid', graphError: graphResult.error });
      }

      try {
        const record = await deps.store.create({
          ...parsed.data,
          version: 1,
          status: 'draft',
          createdBy,
        });
        return Result.ok(record);
      } catch (cause) {
        return Result.err({ _tag: 'PersistenceError', message: 'Failed to create workflow', cause });
      }
    },

    async findById(id: string): Promise<Result<WorkflowDefinitionRecord, WorkflowDefinitionError>> {
      const record = await deps.store.findById(id);
      if (!record) return Result.err({ _tag: 'NotFoundError', id });
      return Result.ok(record);
    },

    async list(domain?: string): Promise<Result<WorkflowDefinitionRecord[], WorkflowDefinitionError>> {
      try {
        return Result.ok(await deps.store.list(domain));
      } catch (cause) {
        return Result.err({ _tag: 'PersistenceError', message: 'Failed to list workflows', cause });
      }
    },

    async update(id: string, input: unknown): Promise<Result<WorkflowDefinitionRecord, WorkflowDefinitionError>> {
      // validate input
      const parsed = UpdateWorkflowInput.safeParse(input);
      if (!parsed.success) return Result.err({ _tag: 'ValidationError', message: parsed.error.message });

      // verify existence before update
      const existing = await deps.store.findById(id);
      if (!existing) return Result.err({ _tag: 'NotFoundError', id });

      // graph validation policy: validate only when the resulting workflow
      // will be in 'active' status. Drafts may legitimately be incomplete
      // (the workflow-builder-service composes them step-by-step); only
      // promotion to active must produce a sound graph.
      const finalStatus = parsed.data.status ?? existing.status;
      const finalSteps = parsed.data.steps ?? existing.steps;
      if (finalStatus === 'active') {
        const graphResult = validateGraph(finalSteps);
        if (!graphResult.ok) {
          return Result.err({ _tag: 'GraphInvalid', graphError: graphResult.error });
        }
      }

      try {
        // auto-increment version on update (server-controlled)
        const updated = await deps.store.update(id, {
          ...parsed.data,
          version: existing.version + 1,
        } as Record<string, unknown>);
        if (!updated) return Result.err({ _tag: 'NotFoundError', id });
        return Result.ok(updated);
      } catch (cause) {
        return Result.err({ _tag: 'PersistenceError', message: 'Failed to update workflow', cause });
      }
    },

    async delete(id: string): Promise<Result<void, WorkflowDefinitionError>> {
      const deleted = await deps.store.delete(id);
      if (!deleted) return Result.err({ _tag: 'NotFoundError', id });
      return Result.ok(undefined);
    },
  };
}
