/**
 * INT-W5: Inngest serve endpoint — registers spike + platform functions.
 * @task INT-W5, INT-W6, INT-01
 * @spec docs/04-specs/project-structure.md SS2
 */
import { serve } from 'inngest/next';
import { inngest, spikeFunctions } from '../../../lib/inngest';
import {
  getProcessAuditEventFn,
  getReplayDlqEventsFn,
  getDataDeletionHandler,
  getMetricService,
} from '../../../lib/services';
import { demoWorkflowFn } from '../../../lib/workflows/demo-workflow';
import { paperTradeFn } from '../../../lib/workflows/crypto-paper-trade';
import { securityScanFn } from '../../../lib/workflows/crypto-security-scan';
import { candidateFlowFn } from '../../../lib/workflows/hr-candidate-flow';
import { interviewSchedulingFn } from '../../../lib/workflows/hr-interview-scheduling';
import { contractApprovalFn } from '../../../lib/workflows/hr-contract-approval';
import { createSloCronFunction } from '../../../lib/observability/slo-cron';
import { AUDIT_EVENT_NAME } from '@aptivo/audit/async';
import { DATA_DELETION_EVENT } from '@aptivo/mcp-layer/workflows';

// -- platform inngest functions (INT-W5) --

// factory functions define their own minimal InngestStepTools interface;
// inngest's real step tools are a superset — cast via unknown to bridge
const processAudit = inngest.createFunction(
  { id: 'audit-process-event', retries: 3 },
  { event: AUDIT_EVENT_NAME },
  async ({ event, step }) =>
    getProcessAuditEventFn()(event as unknown as Parameters<ReturnType<typeof getProcessAuditEventFn>>[0], step as unknown as Parameters<ReturnType<typeof getProcessAuditEventFn>>[1]),
);

const replayDlq = inngest.createFunction(
  { id: 'audit-replay-dlq', retries: 2 },
  { cron: '*/5 * * * *' },
  async ({ step }) =>
    getReplayDlqEventsFn()(step as unknown as Parameters<ReturnType<typeof getReplayDlqEventsFn>>[0]),
);

const handleDataDeletion = inngest.createFunction(
  { id: 'mcp-data-deletion', retries: 3 },
  { event: DATA_DELETION_EVENT },
  async ({ event, step }) =>
    getDataDeletionHandler()(event as unknown as Parameters<ReturnType<typeof getDataDeletionHandler>>[0], step as unknown as Parameters<ReturnType<typeof getDataDeletionHandler>>[1]),
);

// slo cron — wired to real metric providers via MetricService (S7-CF-01)
const sloCronFn = createSloCronFunction(getMetricService());

// domain workflow functions (S6-CRY-01, S6-HR-01)
const domainFunctions = [paperTradeFn, securityScanFn, candidateFlowFn, interviewSchedulingFn, contractApprovalFn];

const platformFunctions = [processAudit, replayDlq, handleDataDeletion, demoWorkflowFn, sloCronFn, ...domainFunctions];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...spikeFunctions, ...platformFunctions],
});
