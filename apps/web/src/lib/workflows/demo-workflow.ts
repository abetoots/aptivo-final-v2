/**
 * INT-01: E2E demo workflow — exercises all 6 platform subsystems
 * @task INT-01
 *
 * pipeline: trigger → LLM analysis → HITL approval → MCP action → file storage → audit
 *
 * steps:
 *   1. llm-analyze    — call LLM gateway to analyze input text
 *   2. hitl-request   — create a HITL approval request
 *   3. waitForEvent   — pause for 'hitl/decision.recorded'
 *   4. mcp-action     — if approved, call MCP tool
 *   5. store-result   — store result via file storage presigned upload
 *   6. audit-trail    — record audit event for the entire flow
 */

import { inngest } from '../inngest.js';
import {
  getLlmGateway,
  getMcpWrapper,
  getAuditService,
  getNotificationService,
  getStorageAdapter,
  getHitlRequestDeps,
} from '../services.js';
import { createRequest } from '@aptivo/hitl-gateway';
import type { AuditEventInput } from '@aptivo/audit';
// S18-A1: workflow LLM callsites must stamp `actor` so audit_logs.user_id
// (only set when actor.type='user' per audit-service.ts:61) is populated
// and the anomaly aggregate's `WHERE user_id = $actor` clause matches.
// Importing through the wrapper makes actor a required parameter; bare
// `gateway.complete(` is also blocked by the CI grep gate (S18-A1).
import { completeWorkflowRequest } from '../llm/complete-workflow-request.js';
import { resolveWorkflowActor } from '../llm/resolve-workflow-actor.js';

// ---------------------------------------------------------------------------
// workflow result types
// ---------------------------------------------------------------------------

export type DemoWorkflowResult =
  | { status: 'completed'; llmOutput: string; mcpResult: unknown; fileId: string; auditId: string }
  | { status: 'rejected'; requestId: string; reason: string }
  | { status: 'expired'; requestId: string }
  | { status: 'error'; step: string; error: string };

// ---------------------------------------------------------------------------
// step result types (serializable for inngest memoization)
// ---------------------------------------------------------------------------

interface LlmStepResult {
  success: boolean;
  content?: string;
  error?: string;
}

interface HitlStepResult {
  success: boolean;
  requestId?: string;
  error?: string;
}

interface McpStepResult {
  success: boolean;
  content?: unknown;
  error?: string;
}

interface StorageStepResult {
  success: boolean;
  fileId?: string;
  error?: string;
}

interface AuditStepResult {
  success: boolean;
  auditId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// helper: emit audit event (fire-and-forget, never blocks)
// ---------------------------------------------------------------------------

async function emitAudit(input: AuditEventInput): Promise<AuditStepResult> {
  try {
    const auditService = getAuditService();
    const result = await auditService.emit(input);
    if (!result.ok) {
      return { success: false, error: `${result.error._tag}: audit emit failed` };
    }
    return { success: true, auditId: result.value.id };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// inngest function
// ---------------------------------------------------------------------------

export const demoWorkflowFn = inngest.createFunction(
  { id: 'int-01-demo-workflow', retries: 0 },
  { event: 'demo/workflow.triggered' },
  async ({ event, step }): Promise<DemoWorkflowResult> => {
    const { input, mcpServerId, mcpToolName, requestedBy } = event.data;

    // step 1: llm-analyze — call LLM gateway to analyze input
    const llmResult: LlmStepResult = await step.run('llm-analyze', async () => {
      try {
        const gateway = getLlmGateway();
        const result = await completeWorkflowRequest({
          gateway,
          request: {
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: 'Analyze the following input and provide a brief summary.' },
              { role: 'user', content: input },
            ],
            domain: 'core',
          },
          actor: resolveWorkflowActor({ requestedBy: { userId: requestedBy } }),
          options: { userId: requestedBy },
        });

        if (!result.ok) {
          return { success: false, error: `${result.error._tag}` };
        }
        return { success: true, content: result.value.completion.content };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!llmResult.success) {
      // record audit for failure and exit
      await step.run('audit-llm-failure', () =>
        emitAudit({
          actor: { id: requestedBy, type: 'user' },
          action: 'demo.llm.failed',
          resource: { type: 'demo-workflow', id: 'int-01' },
          metadata: { error: llmResult.error },
        }),
      );
      return { status: 'error', step: 'llm-analyze', error: llmResult.error ?? 'unknown' };
    }

    // step 2: hitl-request — create a real HITL approval request via gateway
    const hitlResult: HitlStepResult = await step.run('hitl-request', async () => {
      try {
        const deps = getHitlRequestDeps();
        const result = await createRequest(
          {
            workflowId: crypto.randomUUID(),
            domain: 'core',
            actionType: 'demo-approval',
            summary: `Approval needed: ${llmResult.content ?? 'analysis complete'}`,
            details: { input, analysis: llmResult.content },
            approverId: requestedBy,
          },
          deps,
        );

        if (!result.ok) {
          return { success: false, error: `${result.error._tag}: ${result.error.message}` };
        }

        // send notification with approval links
        const notifService = getNotificationService();
        await notifService.send({
          recipientId: requestedBy,
          channel: 'email',
          templateSlug: 'demo-approval',
          variables: {
            summary: llmResult.content ?? '',
            approveUrl: result.value.approveUrl,
            rejectUrl: result.value.rejectUrl,
          },
        });

        return { success: true, requestId: result.value.requestId };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!hitlResult.success) {
      await step.run('audit-hitl-failure', () =>
        emitAudit({
          actor: { id: requestedBy, type: 'user' },
          action: 'demo.hitl.failed',
          resource: { type: 'demo-workflow', id: 'int-01' },
          metadata: { error: hitlResult.error },
        }),
      );
      return { status: 'error', step: 'hitl-request', error: hitlResult.error ?? 'unknown' };
    }

    // step 3: wait for human decision
    const decision = await step.waitForEvent('wait-for-decision', {
      event: 'hitl/decision.recorded',
      timeout: '24h',
      if: `async.data.requestId == '${hitlResult.requestId}'`,
    });

    if (decision === null) {
      return { status: 'expired', requestId: hitlResult.requestId! };
    }

    const decisionData = decision.data as { requestId: string; decision: string; reason?: string };

    if (decisionData.decision === 'rejected') {
      return {
        status: 'rejected',
        requestId: hitlResult.requestId!,
        reason: decisionData.reason ?? 'no reason provided',
      };
    }

    // step 4: mcp-action — call MCP tool via wrapper
    const mcpResult: McpStepResult = await step.run('mcp-action', async () => {
      try {
        const wrapper = getMcpWrapper();
        const result = await wrapper.executeTool(mcpServerId, mcpToolName, {
          analysis: llmResult.content,
        });

        if (!result.ok) {
          return { success: false, error: `${result.error._tag}` };
        }
        return { success: true, content: result.value.content };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!mcpResult.success) {
      await step.run('audit-mcp-failure', () =>
        emitAudit({
          actor: { id: requestedBy, type: 'user' },
          action: 'demo.mcp.failed',
          resource: { type: 'demo-workflow', id: 'int-01' },
          metadata: { error: mcpResult.error, serverId: mcpServerId, toolName: mcpToolName },
        }),
      );
      return { status: 'error', step: 'mcp-action', error: mcpResult.error ?? 'unknown' };
    }

    // step 5: store-result — persist result via file storage
    const storageResult: StorageStepResult = await step.run('store-result', async () => {
      try {
        const adapter = getStorageAdapter();
        const result = await adapter.createPresignedUpload({
          fileName: `demo-result-${Date.now()}.json`,
          mimeType: 'application/json',
        });

        if (!result.ok) {
          return { success: false, error: `${result.error._tag}` };
        }
        return { success: true, fileId: result.value.fileId };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!storageResult.success) {
      await step.run('audit-storage-failure', () =>
        emitAudit({
          actor: { id: requestedBy, type: 'user' },
          action: 'demo.storage.failed',
          resource: { type: 'demo-workflow', id: 'int-01' },
          metadata: { error: storageResult.error },
        }),
      );
      return { status: 'error', step: 'store-result', error: storageResult.error ?? 'unknown' };
    }

    // step 6: audit-trail — record full workflow completion
    const auditResult: AuditStepResult = await step.run('audit-trail', () =>
      emitAudit({
        actor: { id: requestedBy, type: 'user' },
        action: 'demo.workflow.completed',
        resource: { type: 'demo-workflow', id: 'int-01' },
        metadata: {
          llmOutput: llmResult.content,
          mcpResult: mcpResult.content,
          fileId: storageResult.fileId,
          requestId: hitlResult.requestId,
        },
      }),
    );

    return {
      status: 'completed',
      llmOutput: llmResult.content ?? '',
      mcpResult: mcpResult.content,
      fileId: storageResult.fileId ?? '',
      auditId: auditResult.auditId ?? '',
    };
  },
);
