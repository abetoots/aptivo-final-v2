/**
 * SP-01: Inngest + AgentKit Integration Spike
 * @spike SP-01
 * @brd BO-CORE-001, BRD §6.2 (Build: Workflow Engine)
 * @frd FR-CORE-WFE-001 through FR-CORE-WFE-007
 * @add ADD §3 (Workflow Engine), §3.3 (Idempotency)
 * @warnings S7-W9 (saga compensation path)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-01
 */

import { NonRetriableError } from 'inngest';
import { inngest, mcpToolRequestSchema, type McpToolResult } from './inngest-client.js';

export const SP_01_CONFIG = {
  name: 'SP-01: Inngest + AgentKit',
  risk: 'CRITICAL' as const,
  validations: [
    'Function definition and registration',
    'Step execution and checkpointing',
    'Error handling and retry behavior',
    'AgentKit tool integration',
    'Complex schema support',
    'Timeout behavior',
    'Saga compensation recovery',
  ],
} as const;

// ---------------------------------------------------------------------------
// validation 1 & 2: function definition, step execution, complex schemas
// ---------------------------------------------------------------------------

/**
 * Simulates an MCP tool call within an Inngest step.
 * Validates: function definition, step execution, complex schema handling,
 * and AgentKit-style tool integration.
 */
export const mcpToolCallFn = inngest.createFunction(
  {
    id: 'sp01-mcp-tool-call',
    retries: 3,
  },
  { event: 'spike/sp01.tool-call' },
  async ({ event, step }) => {
    // step 1: validate input against zod schema
    const validated = await step.run('validate-input', () => {
      const result = mcpToolRequestSchema.safeParse(event.data);
      if (!result.success) {
        throw new NonRetriableError(`Invalid input: ${result.error.message}`);
      }
      return result.data;
    });

    // step 2: simulate mcp tool call (would be real agentkit call)
    const toolResult = await step.run('execute-tool', () => {
      const start = Date.now();
      // simulate tool execution
      const output: McpToolResult = {
        toolName: validated.toolName,
        output: { result: `executed-${validated.toolName}`, input: validated.input },
        durationMs: Date.now() - start,
      };
      return output;
    });

    // step 3: post-process result
    const processed = await step.run('post-process', () => {
      return {
        success: true,
        tool: toolResult.toolName,
        output: toolResult.output,
      };
    });

    return processed;
  },
);

// ---------------------------------------------------------------------------
// validation 3: error handling and retry behavior
// ---------------------------------------------------------------------------

/**
 * Function that demonstrates retriable vs non-retriable error patterns.
 * Used in tests to validate Inngest's error propagation and retry behavior.
 */
export const errorHandlingFn = inngest.createFunction(
  {
    id: 'sp01-error-handling',
    retries: 2,
  },
  { event: 'spike/sp01.tool-call' },
  async ({ event, step }) => {
    const result = await step.run('may-fail', () => {
      const toolName = event.data.toolName;

      if (toolName === 'fail-retriable') {
        throw new Error('Transient failure — should retry');
      }

      if (toolName === 'fail-permanent') {
        throw new NonRetriableError('Permanent failure — no retry');
      }

      return { status: 'ok', toolName };
    });

    return result;
  },
);

// ---------------------------------------------------------------------------
// validation 5: timeout behavior
// ---------------------------------------------------------------------------

/**
 * Function that exercises step-level timeout behavior.
 */
export const timeoutFn = inngest.createFunction(
  {
    id: 'sp01-timeout-test',
    retries: 0,
  },
  { event: 'spike/sp01.timeout-test' },
  async ({ event, step }) => {
    const result = await step.run('slow-operation', () => {
      const deadline = Date.now() + event.data.delayMs;
      // simulate slow work (busy-wait; only for spike validation)
      while (Date.now() < deadline) {
        // spin
      }
      return { completed: true, delayMs: event.data.delayMs };
    });

    return result;
  },
);

// ---------------------------------------------------------------------------
// validation 6: saga compensation (S7-W9)
// ---------------------------------------------------------------------------

type StepOutcome = { step: string; status: 'done' } | { step: string; status: 'failed'; error: string };

/**
 * Simulates a multi-step saga with compensation on failure.
 * Validates S7-W9: saga compensation path.
 *
 * KEY FINDING: Inngest re-executes the function body for each step, so
 * in-memory state (arrays, objects) does not persist across step boundaries.
 * Saga compensation must use return-value-based flow control — check each
 * step's return value rather than try/catch around step.run().
 */
export const sagaCompensationFn = inngest.createFunction(
  {
    id: 'sp01-saga-compensation',
    retries: 0,
  },
  { event: 'spike/sp01.saga-test' },
  async ({ event, step }) => {
    const { steps: stepNames, failAtStep, failDuringCompensation } = event.data;
    const completed: string[] = [];
    let failedStep: string | undefined;

    // execute forward steps, using return values (not exceptions) for flow control
    for (const name of stepNames) {
      const outcome: StepOutcome = await step.run(`saga-${name}`, () => {
        if (name === failAtStep) {
          return { step: name, status: 'failed' as const, error: `Step ${name} failed` };
        }
        return { step: name, status: 'done' as const };
      });

      if (outcome.status === 'failed') {
        failedStep = name;
        break;
      }
      completed.push(name);
    }

    // if a step failed, compensate completed steps in reverse order
    if (failedStep) {
      const compensated: string[] = [];
      for (const done of [...completed].reverse()) {
        await step.run(`compensate-${done}`, () => {
          if (failDuringCompensation && done === completed[completed.length - 1]) {
            throw new Error(`Compensation for ${done} failed`);
          }
          return { step: done, status: 'compensated' };
        });
        compensated.push(done);
      }
      return { status: 'rolled-back', failedStep, completed, compensated };
    }

    return { status: 'completed', completed };
  },
);

// -- export all spike functions for inngest serve --
export const sp01Functions = [mcpToolCallFn, errorHandlingFn, timeoutFn, sagaCompensationFn];
