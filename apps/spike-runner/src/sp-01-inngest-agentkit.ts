/**
 * SP-01: Inngest + AgentKit Integration Spike
 * @spike SP-01
 * @brd BO-CORE-001, BRD §6.2 (Build: Workflow Engine)
 * @frd FR-CORE-WFE-001 through FR-CORE-WFE-007
 * @add ADD §3 (Workflow Engine), §3.3 (Idempotency)
 * @warnings S7-W9 (saga compensation path)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-01
 */

// Spike validation: Verify Inngest function definition, step execution,
// error handling, and AgentKit tool integration

export const SP_01_CONFIG = {
  name: 'SP-01: Inngest + AgentKit',
  risk: 'CRITICAL' as const,
  validations: [
    'Function definition and registration',
    'Step execution and checkpointing',
    'Error handling and retry behavior',
    'AgentKit tool integration',
    'Complex schema support',
    'Timeout behavior',
    'Saga compensation recovery',
  ],
} as const;
