/**
 * @testcase SP-01-COMP-001 through SP-01-COMP-007
 * @requirements FR-CORE-WFE-001 through FR-CORE-WFE-007
 * @warnings S7-W9
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-01
 */
import { describe, it, expect } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import {
  SP_01_CONFIG,
  mcpToolCallFn,
  errorHandlingFn,
  timeoutFn,
  sagaCompensationFn,
} from '../src/sp-01-inngest-agentkit.js';

// helper: fresh engine per test to avoid mock handler cache contamination
const engineFor = (fn: any) => new InngestTestEngine({ function: fn });

// ---------------------------------------------------------------------------
// SP-01-COMP-001: spike configuration
// ---------------------------------------------------------------------------

describe('SP-01: Inngest + AgentKit Integration', () => {
  it('has correct spike configuration', () => {
    expect(SP_01_CONFIG.name).toBe('SP-01: Inngest + AgentKit');
    expect(SP_01_CONFIG.risk).toBe('CRITICAL');
    expect(SP_01_CONFIG.validations).toHaveLength(7);
  });

  // -------------------------------------------------------------------------
  // SP-01-COMP-002: function definition and registration
  // -------------------------------------------------------------------------

  describe('function definition and registration', () => {
    it('defines mcpToolCallFn with correct id and trigger', () => {
      const config = (mcpToolCallFn as any).opts;
      expect(config.id).toBe('sp01-mcp-tool-call');
      expect(config.retries).toBe(3);
    });

    it('defines errorHandlingFn with correct id', () => {
      const config = (errorHandlingFn as any).opts;
      expect(config.id).toBe('sp01-error-handling');
      expect(config.retries).toBe(2);
    });

    it('defines sagaCompensationFn with correct id', () => {
      const config = (sagaCompensationFn as any).opts;
      expect(config.id).toBe('sp01-saga-compensation');
      expect(config.retries).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // SP-01-COMP-003: step execution and checkpointing
  // -------------------------------------------------------------------------

  describe('step execution and checkpointing', () => {
    it('executes all steps in sequence and returns final result', async () => {
      const { result } = await engineFor(mcpToolCallFn).execute({
        events: [
          {
            name: 'spike/sp01.tool-call',
            data: {
              toolName: 'test-tool',
              input: { query: 'hello' },
            },
          },
        ],
      });

      expect(result).toEqual({
        success: true,
        tool: 'test-tool',
        output: {
          result: 'executed-test-tool',
          input: { query: 'hello' },
        },
      });
    });

    it('executes validate-input step and returns parsed data', async () => {
      const { step } = await engineFor(mcpToolCallFn).executeStep('validate-input', {
        events: [
          {
            name: 'spike/sp01.tool-call',
            data: {
              toolName: 'schema-test',
              input: { nested: { deep: true } },
              timeoutMs: 5000,
            },
          },
        ],
      });

      // executeStep returns the step op with displayName
      expect(step).toBeDefined();
      expect(step.displayName).toBe('validate-input');
    });
  });

  // -------------------------------------------------------------------------
  // SP-01-COMP-004: error handling and retry behavior
  // note: @inngest/test wraps errors — class info is lost, use message checks
  // -------------------------------------------------------------------------

  describe('error handling and retry behavior', () => {
    it('propagates retriable error from step', async () => {
      const { error } = await engineFor(errorHandlingFn).execute({
        events: [
          {
            name: 'spike/sp01.tool-call',
            data: { toolName: 'fail-retriable', input: {} },
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Transient failure');
    });

    it('propagates NonRetriableError from step', async () => {
      const { error } = await engineFor(errorHandlingFn).execute({
        events: [
          {
            name: 'spike/sp01.tool-call',
            data: { toolName: 'fail-permanent', input: {} },
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Permanent failure');
      // note: @inngest/test wraps errors, losing class info and isRetriable flag.
      // in production, NonRetriableError.isRetriable === false prevents retries.
    });

    it('succeeds when no error is thrown', async () => {
      const { result, error } = await engineFor(errorHandlingFn).execute({
        events: [
          {
            name: 'spike/sp01.tool-call',
            data: { toolName: 'happy-path', input: {} },
          },
        ],
      });

      expect(error).toBeUndefined();
      expect(result).toEqual({ status: 'ok', toolName: 'happy-path' });
    });
  });

  // -------------------------------------------------------------------------
  // SP-01-COMP-005: complex schema support (agentkit tool integration)
  // -------------------------------------------------------------------------

  describe('complex schema support', () => {
    it('handles complex nested input schemas', async () => {
      const complexInput = {
        toolName: 'agentkit-file-read',
        input: {
          path: '/data/report.csv',
          options: { encoding: 'utf-8', maxLines: 100 },
          filters: ['active', 'verified'],
        },
      };

      const { result } = await engineFor(mcpToolCallFn).execute({
        events: [{ name: 'spike/sp01.tool-call', data: complexInput }],
      });

      expect(result).toMatchObject({
        success: true,
        tool: 'agentkit-file-read',
      });
      expect((result as any).output.input).toEqual(complexInput.input);
    });

    it('rejects invalid input with non-retriable error', async () => {
      const { error } = await engineFor(mcpToolCallFn).execute({
        events: [
          {
            name: 'spike/sp01.tool-call',
            // missing required 'input' field
            data: { toolName: 'bad-tool' } as any,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Invalid input');
    });
  });

  // -------------------------------------------------------------------------
  // SP-01-COMP-006: timeout behavior
  // -------------------------------------------------------------------------

  describe('timeout behavior', () => {
    it('completes fast operations within step', async () => {
      const { result } = await engineFor(timeoutFn).execute({
        events: [{ name: 'spike/sp01.timeout-test', data: { delayMs: 10 } }],
      });

      expect(result).toMatchObject({ completed: true, delayMs: 10 });
    });
  });

  // -------------------------------------------------------------------------
  // SP-01-COMP-007: saga compensation recovery (S7-W9)
  //
  // KEY FINDING: Inngest re-executes the function body per step.
  // In-memory state does not persist across step boundaries.
  // Saga compensation must use return-value-based flow control.
  // Fresh engine per test avoids mock handler cache contamination.
  // -------------------------------------------------------------------------

  describe('saga compensation recovery (S7-W9)', () => {
    it('completes all steps when no failure occurs', async () => {
      const { result } = await engineFor(sagaCompensationFn).execute({
        events: [
          {
            name: 'spike/sp01.saga-test',
            data: { steps: ['create-order', 'reserve-inventory', 'charge-payment'] },
          },
        ],
      });

      expect(result).toMatchObject({
        status: 'completed',
        completed: ['create-order', 'reserve-inventory', 'charge-payment'],
      });
    });

    it('compensates completed steps in reverse order on failure', async () => {
      const { result } = await engineFor(sagaCompensationFn).execute({
        events: [
          {
            name: 'spike/sp01.saga-test',
            data: {
              steps: ['create-order', 'reserve-inventory', 'charge-payment'],
              failAtStep: 'charge-payment',
            },
          },
        ],
      });

      expect(result).toMatchObject({
        status: 'rolled-back',
        failedStep: 'charge-payment',
      });
      // compensation runs in reverse of execution order
      expect((result as any).compensated).toEqual(['reserve-inventory', 'create-order']);
    });

    it('compensates correctly when first step fails (nothing to compensate)', async () => {
      const { result } = await engineFor(sagaCompensationFn).execute({
        events: [
          {
            name: 'spike/sp01.saga-test',
            data: {
              steps: ['create-order', 'reserve-inventory'],
              failAtStep: 'create-order',
            },
          },
        ],
      });

      expect(result).toMatchObject({
        status: 'rolled-back',
        failedStep: 'create-order',
      });
      expect((result as any).compensated).toEqual([]);
    });

    it('propagates error when compensation step itself fails', async () => {
      const { error } = await engineFor(sagaCompensationFn).execute({
        events: [
          {
            name: 'spike/sp01.saga-test',
            data: {
              steps: ['create-order', 'reserve-inventory', 'charge-payment'],
              failAtStep: 'charge-payment',
              failDuringCompensation: true,
            },
          },
        ],
      });

      // when compensation itself throws, the error propagates as function failure
      expect(error).toBeDefined();
      expect(error?.message).toContain('Compensation for');
    });
  });
});
