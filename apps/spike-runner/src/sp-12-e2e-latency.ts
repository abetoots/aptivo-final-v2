/**
 * SP-12: End-to-End Latency Spike
 * @spike SP-12
 * @brd BO-CORE-012, BRD §6.13 (Build: Performance)
 * @frd FR-CORE-WFE-010 (Latency SLA)
 * @add ADD §8 (Observability), §8.1 (Latency Tracking)
 * @warnings S7-W16 (queue saturation impact on latency)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-12
 */

// Spike validation: Measure end-to-end latency from event ingestion
// through workflow execution to completion callback

export const SP_12_CONFIG = {
  name: 'SP-12: E2E Latency',
  risk: 'HIGH' as const,
  validations: [
    'Event ingestion latency',
    'Step execution latency',
    'HITL wait overhead',
    'MCP tool call round-trip time',
    'Total workflow completion time',
    'Latency distribution (p50, p95, p99)',
  ],
} as const;
