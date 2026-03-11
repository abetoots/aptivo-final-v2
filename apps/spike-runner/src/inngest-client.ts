/**
 * Shared Inngest client for Sprint 0 spike validation.
 * @see docs/06-sprints/sprint-0-technical-spikes.md
 */
import { Inngest, EventSchemas } from 'inngest';
// inngest v3 uses zod/v3 internally — use v3 compat to avoid v4 _zod bugs
import { z } from 'zod/v3';

// -- event schemas for spike validation --

export const mcpToolRequestSchema = z.object({
  toolName: z.string(),
  input: z.record(z.unknown()),
  timeoutMs: z.number().optional(),
});

export const mcpToolResultSchema = z.object({
  toolName: z.string(),
  output: z.record(z.unknown()),
  durationMs: z.number(),
});

export type McpToolRequest = z.infer<typeof mcpToolRequestSchema>;
export type McpToolResult = z.infer<typeof mcpToolResultSchema>;

type SpikeEvents = {
  // sp-01 events
  'spike/sp01.tool-call': { data: McpToolRequest };
  'spike/sp01.saga-test': {
    data: {
      steps: string[];
      failAtStep?: string;
      failDuringCompensation?: boolean;
    };
  };
  'spike/sp01.timeout-test': {
    data: { delayMs: number };
  };
  // sp-02 events — HITL approval flow
  'spike/sp02.approval-request': {
    data: {
      requestId: string;
      workflowId: string;
      description: string;
      timeoutMs?: number;
    };
  };
  'spike/sp02.approval-response': {
    data: {
      requestId: string;
      decision: 'approved' | 'rejected';
      decidedBy: string;
      reason?: string;
    };
  };
};

export const inngest = new Inngest({
  id: 'aptivo-spike-runner',
  schemas: new EventSchemas().fromRecord<SpikeEvents>(),
});
