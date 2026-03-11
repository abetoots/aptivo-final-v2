/**
 * MCP-09: MCP event schemas
 * @task MCP-09
 * @warning S3-W11 (closes)
 *
 * Zod schemas for all MCP-related Inngest events.
 * Used by createValidatedSender() for publish-time validation.
 */

import { z } from 'zod';

export const MCP_EVENT_SCHEMAS = {
  'mcp/tool.called': z.object({
    requestId: z.string().uuid(),
    serverId: z.string().min(1),
    toolName: z.string().min(1),
    workflowId: z.string().optional(),
  }),

  'mcp/tool.completed': z.object({
    requestId: z.string().uuid(),
    serverId: z.string().min(1),
    toolName: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
    cached: z.boolean(),
  }),

  'mcp/tool.failed': z.object({
    requestId: z.string().uuid(),
    serverId: z.string().min(1),
    toolName: z.string().min(1),
    errorTag: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
  }),
} as const;

export type McpEventName = keyof typeof MCP_EVENT_SCHEMAS;
