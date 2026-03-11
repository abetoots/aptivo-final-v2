/**
 * INT-W5: Inngest client and function registry for the web app.
 * @task INT-W5
 *
 * Merges spike event schemas (backward compat) with platform events
 * for audit processing and data deletion workflows.
 */
import { Inngest, EventSchemas, NonRetriableError } from 'inngest';
import { z } from 'zod/v3';
import { AUDIT_EVENT_NAME } from '@aptivo/audit/async';
import { DATA_DELETION_EVENT } from '@aptivo/mcp-layer/workflows';

// -- spike event schemas (backward compatibility) --

const mcpToolRequestSchema = z.object({
  toolName: z.string(),
  input: z.record(z.unknown()),
  timeoutMs: z.number().optional(),
});

type McpToolResult = {
  toolName: string;
  output: Record<string, unknown>;
  durationMs: number;
};

type StepOutcome =
  | { step: string; status: 'done' }
  | { step: string; status: 'failed'; error: string };

type SpikeEvents = {
  'spike/sp01.tool-call': { data: z.infer<typeof mcpToolRequestSchema> };
  'spike/sp01.saga-test': {
    data: {
      steps: string[];
      failAtStep?: string;
      failDuringCompensation?: boolean;
    };
  };
  'spike/sp01.timeout-test': { data: { delayMs: number } };
};

// -- platform event schemas (INT-W5) --

type PlatformEvents = {
  [AUDIT_EVENT_NAME]: {
    data: {
      actor: { id: string; type: 'user' | 'system' | 'workflow' };
      action: string;
      resource: { type: string; id: string };
      domain?: string;
      metadata?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
    };
  };
  [DATA_DELETION_EVENT]: {
    data: { userId: string };
  };
};

// -- INT-01 demo workflow event schemas --

type DemoEvents = {
  'demo/workflow.triggered': {
    data: {
      input: string;
      mcpServerId: string;
      mcpToolName: string;
      requestedBy: string;
    };
  };
};

// -- S6-INF-CRY crypto domain event schemas --

type CryptoEvents = {
  'crypto/signal.created': {
    data: {
      signalId: string;
      token: string;
      direction: string;
      confidenceScore: number;
    };
  };
  'crypto/trade.requested': {
    data: {
      signalId: string;
      tradeId: string;
    };
  };
  'crypto/trade.executed': {
    data: {
      tradeId: string;
      entryPrice: string;
      sizeUsd: string;
      isPaper: boolean;
    };
  };
  'crypto/alert.fired': {
    data: {
      alertType: string;
      token: string;
      message: string;
      severity: string;
    };
  };
  'crypto/security.scan.requested': {
    data: {
      tokenAddress: string;
      chain: string;
      requestedBy: string;
      domain: 'crypto';
    };
  };
};

// -- S6-INF-HR HR domain event schemas --

type HrEvents = {
  'hr/application.received': {
    data: {
      resumeText: string;
      source: string;
      positionId?: string;
      candidateEmail?: string;
    };
  };
  'hr/interview.scheduled': {
    data: {
      applicationId: string;
      dateTime: string;
      interviewerId: string;
      type: string;
    };
  };
  'hr/interview.scheduling.requested': {
    data: {
      applicationId: string;
      interviewerId: string;
      interviewType: string; // technical | behavioral | culture-fit
      candidateEmail: string;
      candidateName: string;
    };
  };
  'hr/interview.slot.selected': {
    data: {
      interviewId: string;
      selectedSlot: string; // ISO date string
    };
  };
  'hr/offer.approved': {
    data: {
      applicationId: string;
      candidateId: string;
      position: string;
      salary: string;
    };
  };
  'hr/consent.withdrawn': {
    data: {
      candidateId: string;
      consentType: string;
      withdrawnAt: string;
    };
  };
  'hr/contract.approval.requested': {
    data: {
      candidateId: string;
      positionId: string;
      templateSlug: string;
      terms: Record<string, unknown>;
      requestedBy: string;
      domain: 'hr';
    };
  };
  'hr/contract.decision.submitted': {
    data: {
      requestId: string;
      decision: 'approved' | 'rejected';
      reviewerNotes?: string;
      domain: 'hr';
    };
  };
  'hr/contract.approved': {
    data: {
      contractId: string;
      candidateId: string;
      positionId: string;
      domain: 'hr';
    };
  };
};

// -- S6-CF-01 SLO alert event schemas --

type SloEvents = {
  'platform/slo.alert.fired': {
    data: {
      alertId: string;
      value: number;
      threshold: number;
      message: string;
      firedAt: string;
    };
  };
};

export const inngest = new Inngest({
  id: 'aptivo-platform',
  schemas: new EventSchemas().fromRecord<SpikeEvents & PlatformEvents & DemoEvents & CryptoEvents & HrEvents & SloEvents>(),
});

// -- SP-01 functions --

const mcpToolCallFn = inngest.createFunction(
  { id: 'sp01-mcp-tool-call', retries: 3 },
  { event: 'spike/sp01.tool-call' },
  async ({ event, step }) => {
    const validated = await step.run('validate-input', () => {
      const result = mcpToolRequestSchema.safeParse(event.data);
      if (!result.success) {
        throw new NonRetriableError(`Invalid input: ${result.error.message}`);
      }
      return result.data;
    });

    const toolResult = await step.run('execute-tool', () => {
      const start = Date.now();
      const output: McpToolResult = {
        toolName: validated.toolName,
        output: { result: `executed-${validated.toolName}`, input: validated.input },
        durationMs: Date.now() - start,
      };
      return output;
    });

    return await step.run('post-process', () => ({
      success: true,
      tool: toolResult.toolName,
      output: toolResult.output,
    }));
  },
);

const errorHandlingFn = inngest.createFunction(
  { id: 'sp01-error-handling', retries: 2 },
  { event: 'spike/sp01.tool-call' },
  async ({ event, step }) => {
    return await step.run('may-fail', () => {
      if (event.data.toolName === 'fail-retriable') throw new Error('Transient failure');
      if (event.data.toolName === 'fail-permanent') throw new NonRetriableError('Permanent failure');
      return { status: 'ok', toolName: event.data.toolName };
    });
  },
);

const timeoutFn = inngest.createFunction(
  { id: 'sp01-timeout-test', retries: 0 },
  { event: 'spike/sp01.timeout-test' },
  async ({ event, step }) => {
    return await step.run('slow-operation', () => {
      const deadline = Date.now() + event.data.delayMs;
      while (Date.now() < deadline) { /* spin */ }
      return { completed: true, delayMs: event.data.delayMs };
    });
  },
);

const sagaCompensationFn = inngest.createFunction(
  { id: 'sp01-saga-compensation', retries: 0 },
  { event: 'spike/sp01.saga-test' },
  async ({ event, step }) => {
    const { steps: stepNames, failAtStep, failDuringCompensation } = event.data;
    const completed: string[] = [];
    let failedStep: string | undefined;

    for (const name of stepNames) {
      const outcome: StepOutcome = await step.run(`saga-${name}`, () => {
        if (name === failAtStep) return { step: name, status: 'failed' as const, error: `Step ${name} failed` };
        return { step: name, status: 'done' as const };
      });
      if (outcome.status === 'failed') { failedStep = name; break; }
      completed.push(name);
    }

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

export const spikeFunctions = [mcpToolCallFn, errorHandlingFn, timeoutFn, sagaCompensationFn];
