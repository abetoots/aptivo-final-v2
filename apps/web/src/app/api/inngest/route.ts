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
// Fail-fast policy (post-A2 round-1 review): when the configured mode
// requires the streams transport and TCP Redis is missing OR ioredis
// init fails, the route module throws so the deploy crashes. Silent
// fallback to list-only would mean streams subscribers never see the
// events they're configured to consume — WS fan-out goes dark in
// production. Crashing the deploy surfaces the misconfig immediately.
const wsPublisherFunctions = await (async () => {
  const modeRaw = (process.env.WS_TRANSPORT_MODE ?? 'list').toLowerCase();
  const mode = (modeRaw === 'list' || modeRaw === 'dual' || modeRaw === 'streams')
    ? modeRaw
    : 'list';

  const listRedis = getJobsRedis();
  const streamsRequired = mode === 'streams' || mode === 'dual';

  // streams binding — only constructed when needed; failures here are
  // fatal when streams are required by mode (post-A2 R1 review).
  let streamsRedis: Awaited<ReturnType<typeof import('@aptivo/redis').createTcpRedis>> | null = null;
  if (streamsRequired) {
    const tcpUrl = process.env.WS_REDIS_TCP_URL;
    if (!tcpUrl) {
      throw new Error(
        `ws_event_publisher: WS_TRANSPORT_MODE=${mode} requires the streams transport ` +
        'but WS_REDIS_TCP_URL is missing. Provision TCP Redis and set WS_REDIS_TCP_URL, ' +
        'or run with WS_TRANSPORT_MODE=list.',
      );
    }
    const { createTcpRedis } = await import('@aptivo/redis');
    streamsRedis = await createTcpRedis({
      url: tcpUrl,
      connectionName: 'aptivo-web-publisher',
    });
  }

  // dual mode requires the list transport too — we'd LPUSH AND XADD,
  // and a missing Upstash means dual-write degrades to streams-only,
  // which is a misconfig rather than a graceful fallback (the cutover
  // window is meaningless without dual writes).
  if (mode === 'dual' && !listRedis) {
    throw new Error(
      'ws_event_publisher: WS_TRANSPORT_MODE=dual requires the list transport ' +
      'but Upstash credentials (jobs Redis) are not configured. Set the Upstash credentials ' +
      'or switch to WS_TRANSPORT_MODE=streams for streams-only.',
    );
  }

  // list mode (default) with no Upstash configured = local dev / test
  // environment. Skip publisher registration — workflow + HITL events
  // still fire normally, just without the WS fan-out side-effect.
  // Production list-mode deployments must have Upstash; the operator
  // is responsible for that, and we don't crash here because
  // module-load-time crashes break the entire route handler chain.
  if (mode === 'list' && !listRedis) {
    appLog.info('ws_event_publisher_disabled', {
      reason: 'list mode with no Upstash credentials (local dev / test)',
      mode,
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
