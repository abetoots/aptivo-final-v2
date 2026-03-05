/**
 * SP-10: Circuit Breaker + Inngest Retry Interaction
 * @spike SP-10
 * @frd FR-CORE-MCP-002, FR-CORE-MCP-003
 * @add ADD §5.2 (MCP Resilience)
 * @warnings S7-W2, S7-W13, S7-W23
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-10
 */

// Spike validation: Verify circuit breaker state machine interacts correctly
// with Inngest retry policies — no double-retry amplification

export const SP_10_CONFIG = {
  name: 'SP-10: Circuit Breaker + Inngest Retry',
  risk: 'HIGH' as const,
  validations: [
    'Circuit breaker state transitions (closed -> open -> half-open)',
    'Inngest retry policy interaction',
    'Double-retry prevention',
    'Half-open probe behavior',
    'Reset timeout accuracy',
    'Failure threshold calibration',
  ],
} as const;
