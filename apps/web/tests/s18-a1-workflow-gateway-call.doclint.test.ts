// @testtype doc-lint — structural source check, not runtime behaviour
/**
 * S18-A1: CI grep gate enforcing AD-S18-1.
 *
 * Workflow callsites must go through `completeWorkflowRequest` (the
 * typed wrapper that takes ActorContext as a *required* parameter)
 * rather than the bare `gateway.complete()` call. The wrapper makes
 * actor stamping a compile-time obligation; this gate makes drift
 * detectable.
 *
 * Why both layers (type contract + this gate)?
 *   - The wrapper protects new code: a developer constructing a new
 *     workflow LLM step naturally imports the wrapper because that's
 *     the documented path.
 *   - The gate protects against paste-from-elsewhere drift: a
 *     contributor copying an HTTP-route-style `gateway.complete()` call
 *     into the workflow tree compiles cleanly (the underlying gateway
 *     accepts optional actor) but loses the actor enforcement. CI
 *     catches it at the source-text level.
 *
 * Scope: only `apps/web/src/lib/workflows/` non-test paths. Mocks and
 * test fixtures may legitimately reference `gateway.complete` directly.
 *
 * If this test fails, the message will identify the offending file and
 * line. The fix is to switch to `completeWorkflowRequest({ ..., actor })`
 * imported from `apps/web/src/lib/llm/complete-workflow-request.js`.
 * If `actor` cannot be resolved (genuinely external trigger), pass
 * `actor: undefined` explicitly with an inline comment explaining why
 * — that's reviewable; bare `gateway.complete(` is not.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve, join } from 'path';

// ---------------------------------------------------------------------------
// configuration — only this directory is gated
// ---------------------------------------------------------------------------

const WORKFLOW_DIR = resolve(__dirname, '../src/lib/workflows');

/**
 * The pattern that triggers a violation. Doc comments naming the
 * pattern (e.g. "blocked by the CI grep gate") get matched too if the
 * gate isn't careful — we filter those out by requiring an immediately
 * preceding `await ` or non-comment context.
 *
 * Approach: match `gateway.complete(` (or `.complete(` on a variable
 * holding the gateway result), then exclude lines that are inside a
 * comment block. Robust enough for the codebase shape and easy to
 * audit.
 */
const VIOLATION_REGEX = /\bgateway\.complete\s*\(/;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

interface Violation {
  file: string;
  line: number;
  text: string;
}

function findViolations(file: string): Violation[] {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const violations: Violation[] = [];

  // line-by-line scan with a tiny block-comment state machine — handles
  // /* ... */ multiline comments. Single-line // and inline /* ... */
  // on the same line are excluded by stripping comment runs before the
  // regex check.
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    let working = raw;

    // strip closed block comments on this line
    if (inBlockComment) {
      const closeIdx = working.indexOf('*/');
      if (closeIdx >= 0) {
        working = working.slice(closeIdx + 2);
        inBlockComment = false;
      } else {
        continue; // entire line is in a block comment
      }
    }

    // handle inline /* ... */ on the same line
    while (true) {
      const openIdx = working.indexOf('/*');
      if (openIdx < 0) break;
      const closeIdx = working.indexOf('*/', openIdx + 2);
      if (closeIdx >= 0) {
        working = working.slice(0, openIdx) + working.slice(closeIdx + 2);
      } else {
        working = working.slice(0, openIdx);
        inBlockComment = true;
        break;
      }
    }

    // strip line comments
    const lineCommentIdx = working.indexOf('//');
    if (lineCommentIdx >= 0) {
      working = working.slice(0, lineCommentIdx);
    }

    if (VIOLATION_REGEX.test(working)) {
      violations.push({
        file: file.replace(WORKFLOW_DIR + '/', ''),
        line: i + 1,
        text: raw.trim(),
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// test
// ---------------------------------------------------------------------------

describe('S18-A1: workflow gateway-call lint', () => {
  it('no bare gateway.complete( in apps/web/src/lib/workflows/* — use completeWorkflowRequest', () => {
    const files = listSourceFiles(WORKFLOW_DIR);
    expect(files.length).toBeGreaterThan(0); // sanity: gate is actually scanning

    const allViolations: Violation[] = [];
    for (const file of files) {
      allViolations.push(...findViolations(file));
    }

    if (allViolations.length > 0) {
      const summary = allViolations
        .map((v) => `  ${v.file}:${v.line}  ${v.text}`)
        .join('\n');
      throw new Error(
        [
          `Found ${allViolations.length} bare gateway.complete( call(s) in workflow files:`,
          summary,
          '',
          'Per AD-S18-1, workflow LLM callsites must go through the typed wrapper:',
          "  import { completeWorkflowRequest } from '../llm/complete-workflow-request.js';",
          '  const result = await completeWorkflowRequest({ gateway, request, actor, options });',
          '',
          'If no acting user is in scope (genuinely external trigger), pass `actor: undefined`',
          'with an inline comment explaining why — that is reviewable; bare gateway.complete is not.',
        ].join('\n'),
      );
    }

    expect(allViolations).toEqual([]);
  });
});
