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
  getAnomalyBaselineStore,
  getAnomalyBaselineScopes,
  getAnomalyWindowMs,
  getJobsRedis,
} from '../../../lib/services';
import { getDb } from '../../../lib/db';
import { createAnomalyBaselineBuilder } from '../../../lib/jobs/anomaly-baseline-builder';
import { createWsEventPublisherFunctions } from '../../../lib/inngest/functions/ws-event-publisher';
import { log as appLog } from '../../../lib/logging/safe-logger';
import { demoWorkflowFn } from '../../../lib/workflows/demo-workflow';
import { paperTradeFn } from '../../../lib/workflows/crypto-paper-trade';
import { liveTradeFn } from '../../../lib/workflows/crypto-live-trade';
import { securityScanFn } from '../../../lib/workflows/crypto-security-scan';
import { candidateFlowFn } from '../../../lib/workflows/hr-candidate-flow';
import { interviewSchedulingFn } from '../../../lib/workflows/hr-interview-scheduling';
import { contractApprovalFn } from '../../../lib/workflows/hr-contract-approval';
import { onboardingFn } from '../../../lib/workflows/hr-onboarding';
import { createSloCronFunction } from '../../../lib/observability/slo-cron';
import { createPositionMonitorFn } from '../../../lib/jobs/crypto-position-monitor';
import { getCryptoPositionStore, getExchangeMcpAdapter, getAuditService } from '../../../lib/services';
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

// S17-B3: anomaly baseline builder cron — populates anomaly_baselines
// every 6h so the LLM3-04 gate's getBaseline lookup hits real
// historical data instead of S16's placeholder constant. Closes
// Sprint-16 enablement gate #5.
const anomalyBaselineBuilderFn = createAnomalyBaselineBuilder({
  inngest,
  db: getDb() as unknown as Parameters<typeof createAnomalyBaselineBuilder>[0]['db'],
  store: getAnomalyBaselineStore(),
  scopes: getAnomalyBaselineScopes(),
  logger: { warn: (event, ctx) => appLog.warn(event, ctx) },
  // S17-B3 (post-Codex review): keep cron bucket size in lockstep
  // with the live gate's query window. getAnomalyWindowMs() is the
  // single env-var resolver shared by both sites.
  config: { windowMs: getAnomalyWindowMs() },
});

// S17-WS-PUB: WebSocket-fan-out publisher functions. One Inngest
// function per WS-relevant event (workflow + HITL today; ticket
// events arrive with Epic 4). Each publishes an EventFrame envelope
// to the shared `ws:events` Redis list. The ws-server polls and fans
// out. Closes Sprint-16 enablement gate #6. When jobs Redis isn't
// configured (e.g. local dev without Upstash), the functions are
// skipped — workflow/HITL events still fire normally and Inngest
// retries can be replayed once Redis is wired.
//
// S18-A2: publisher mode is selected via WS_TRANSPORT_MODE env:
//   - `list` (default; S17 back-compat): LPUSH only via Upstash REST
//   - `streams`: XADD only via TCP Redis (WS_REDIS_TCP_URL required)
//   - `dual`: writes both transports for the cutover window;
//     subscribers dedupe by eventId via shared Redis SET ring
//
// Streams binding uses @aptivo/redis createTcpRedis with ioredis
// (optionalDependency); falls back to disabling the streams path if
// ioredis isn't installed and mode requires it.
const wsPublisherFunctions = await (async () => {
  const modeRaw = (process.env.WS_TRANSPORT_MODE ?? 'list').toLowerCase();
  const mode = (modeRaw === 'list' || modeRaw === 'dual' || modeRaw === 'streams')
    ? modeRaw
    : 'list';

  const listRedis = getJobsRedis();

  // streams binding — only constructed when needed
  let streamsRedis: Awaited<ReturnType<typeof import('@aptivo/redis').createTcpRedis>> | null = null;
  if (mode === 'streams' || mode === 'dual') {
    const tcpUrl = process.env.WS_REDIS_TCP_URL;
    if (!tcpUrl) {
      appLog.warn('ws_event_publisher_streams_disabled', {
        reason: 'WS_TRANSPORT_MODE requires streams but WS_REDIS_TCP_URL is missing',
        mode,
      });
    } else {
      try {
        const { createTcpRedis } = await import('@aptivo/redis');
        streamsRedis = await createTcpRedis({
          url: tcpUrl,
          connectionName: 'aptivo-web-publisher',
        });
      } catch (cause) {
        appLog.warn('ws_event_publisher_streams_init_failed', {
          cause: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
  }

  // disabled cases — log + skip the function registration entirely
  const listOk = (mode === 'list' || mode === 'dual') ? !!listRedis : true;
  const streamsOk = (mode === 'streams' || mode === 'dual') ? !!streamsRedis : true;
  if (!listOk || !streamsOk) {
    appLog.info('ws_event_publisher_disabled', {
      reason: 'transport requirements not met for the configured WS_TRANSPORT_MODE',
      mode,
      listAvailable: !!listRedis,
      streamsAvailable: !!streamsRedis,
    });
    return [] as ReturnType<typeof createWsEventPublisherFunctions>;
  }

  return createWsEventPublisherFunctions({
    inngest,
    mode: mode as 'list' | 'dual' | 'streams',
    redis: listRedis
      ? (listRedis as unknown as Parameters<typeof createWsEventPublisherFunctions>[0]['redis'])
      : undefined,
    streams: streamsRedis ?? undefined,
    logger: { warn: (event, ctx) => appLog.warn(event, ctx) },
  });
})();

// S18-B1: position monitor cron — closes live positions on SL/TP
// cross. Runs every minute by default; the schedule is configurable
// for environments that support sub-minute Inngest cron syntax.
const positionMonitorFn = createPositionMonitorFn(
  inngest,
  {
    positionStore: getCryptoPositionStore(),
    exchangeMcp: getExchangeMcpAdapter(),
    emitAudit: async (input) => {
      const audit = getAuditService();
      await audit.emit(input);
    },
  },
);

// domain workflow functions (S6-CRY-01, S6-HR-01, S18-B1, S18-B2)
const domainFunctions = [
  paperTradeFn,
  liveTradeFn,
  securityScanFn,
  candidateFlowFn,
  interviewSchedulingFn,
  contractApprovalFn,
  onboardingFn,
  positionMonitorFn,
];

const platformFunctions = [
  processAudit,
  replayDlq,
  handleDataDeletion,
  demoWorkflowFn,
  sloCronFn,
  anomalyBaselineBuilderFn,
  ...wsPublisherFunctions,
  ...domainFunctions,
];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...spikeFunctions, ...platformFunctions],
});
