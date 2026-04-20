/**
 * WFE3-01: Workflow graph validation
 *
 * pure functions for cycle, unreachable-step, and dangling-reference detection
 * on workflow DAGs. returns Result<void, GraphValidationError> with a tagged
 * union error type. Entry step is implicit: `steps[0]` (the schema has no
 * explicit entryStepId field as of S16).
 *
 * error precedence (first match wins): NoEntryStep → DanglingReference →
 * CycleDetected → UnreachableSteps. Rationale: structural problems are
 * reported before topological ones so callers fix causes, not symptoms.
 *
 * reusable across: workflow-definition-service (create/update), standalone
 * `/api/workflows/validate` endpoint (draft validation), and future
 * tooling. No I/O; no external deps beyond @aptivo/types.
 */

import { Result } from '@aptivo/types';
import type { WorkflowStep } from '@aptivo/database';

// ---------------------------------------------------------------------------
// error type
// ---------------------------------------------------------------------------

export type GraphValidationError =
  | { readonly _tag: 'NoEntryStep' }
  | { readonly _tag: 'DuplicateStepId'; readonly stepId: string }
  | { readonly _tag: 'DanglingReference'; readonly stepId: string; readonly missingRef: string }
  | { readonly _tag: 'CycleDetected'; readonly cycle: readonly string[] }
  | { readonly _tag: 'UnreachableSteps'; readonly stepIds: readonly string[] };

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

export function validateGraph(steps: readonly WorkflowStep[]): Result<void, GraphValidationError> {
  if (steps.length === 0) {
    return Result.err({ _tag: 'NoEntryStep' });
  }

  // detect duplicate step IDs BEFORE building the lookup map — otherwise
  // later duplicates silently overwrite earlier ones (Map#set), which makes
  // reachability/cycle analysis operate on a deduplicated shadow graph and
  // produces misleading errors (e.g. "UnreachableSteps" when the real cause
  // is a duplicate ID shadowing a step with outbound edges).
  const seen = new Set<string>();
  for (const s of steps) {
    if (seen.has(s.id)) {
      return Result.err({ _tag: 'DuplicateStepId', stepId: s.id });
    }
    seen.add(s.id);
  }

  const byId = new Map<string, WorkflowStep>();
  for (const s of steps) byId.set(s.id, s);

  const danglingErr = findDangling(steps, byId);
  if (danglingErr) return Result.err(danglingErr);

  const cycleErr = findCycle(steps, byId);
  if (cycleErr) return Result.err(cycleErr);

  const unreachableErr = findUnreachable(steps, byId);
  if (unreachableErr) return Result.err(unreachableErr);

  return Result.ok(undefined);
}

// ---------------------------------------------------------------------------
// dangling reference detection
// ---------------------------------------------------------------------------

function findDangling(
  steps: readonly WorkflowStep[],
  byId: Map<string, WorkflowStep>,
): GraphValidationError | null {
  for (const s of steps) {
    for (const ref of s.nextSteps ?? []) {
      if (!byId.has(ref)) {
        return { _tag: 'DanglingReference', stepId: s.id, missingRef: ref };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// cycle detection — iterative DFS with gray/black coloring + parent pointers
// ---------------------------------------------------------------------------

type Color = 'white' | 'gray' | 'black';

function findCycle(
  steps: readonly WorkflowStep[],
  byId: Map<string, WorkflowStep>,
): GraphValidationError | null {
  const color = new Map<string, Color>();
  for (const s of steps) color.set(s.id, 'white');
  const parent = new Map<string, string | null>();

  // iterate roots in declaration order so steps[0] is visited first (matches
  // "implicit entry" convention and makes test expectations deterministic)
  for (const root of steps) {
    if (color.get(root.id) !== 'white') continue;
    const cycle = dfsForCycle(root.id, byId, color, parent);
    if (cycle) return { _tag: 'CycleDetected', cycle };
  }
  return null;
}

function dfsForCycle(
  startId: string,
  byId: Map<string, WorkflowStep>,
  color: Map<string, Color>,
  parent: Map<string, string | null>,
): readonly string[] | null {
  // iterative DFS using a work stack of (nodeId, childIndex). When we first
  // push a node we mark it gray; when we exhaust its children we mark black.
  const stack: Array<{ id: string; childIdx: number }> = [];
  color.set(startId, 'gray');
  parent.set(startId, null);
  stack.push({ id: startId, childIdx: 0 });

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    const current = byId.get(frame.id)!;
    const children = current.nextSteps ?? [];

    if (frame.childIdx >= children.length) {
      color.set(frame.id, 'black');
      stack.pop();
      continue;
    }

    const child = children[frame.childIdx]!;
    frame.childIdx += 1;

    const c = color.get(child);
    if (c === 'gray') {
      // back-edge → cycle. walk parents from current back until we hit child.
      return reconstructCycle(frame.id, child, parent);
    }
    if (c === 'black') continue; // cross-edge; skip

    color.set(child, 'gray');
    parent.set(child, frame.id);
    stack.push({ id: child, childIdx: 0 });
  }
  return null;
}

function reconstructCycle(
  fromId: string,
  toId: string,
  parent: Map<string, string | null>,
): readonly string[] {
  // self-loop: A→A
  if (fromId === toId) return [fromId, toId];

  // walk from `fromId` via parent pointers back to `toId`, collecting the path
  const path: string[] = [fromId];
  let cursor: string | null | undefined = parent.get(fromId);
  while (cursor && cursor !== toId) {
    path.push(cursor);
    cursor = parent.get(cursor);
  }
  if (cursor === toId) path.push(toId);
  path.reverse();
  path.push(toId);
  return path;
}

// ---------------------------------------------------------------------------
// unreachability detection — BFS from steps[0]
// ---------------------------------------------------------------------------

function findUnreachable(
  steps: readonly WorkflowStep[],
  byId: Map<string, WorkflowStep>,
): GraphValidationError | null {
  const entry = steps[0]!.id;
  const reachable = new Set<string>();
  const queue: string[] = [entry];
  reachable.add(entry);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = byId.get(id);
    if (!node) continue;
    for (const next of node.nextSteps ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }

  const orphans = steps.filter((s) => !reachable.has(s.id)).map((s) => s.id);
  if (orphans.length === 0) return null;
  return { _tag: 'UnreachableSteps', stepIds: orphans };
}
