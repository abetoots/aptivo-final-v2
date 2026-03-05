/**
 * SP-02: HITL Wait-for-Event Spike
 * @spike SP-02
 * @brd BO-CORE-002, BRD §6.3 (Build: HITL Subsystem)
 * @frd FR-CORE-HITL-001 through FR-CORE-HITL-006
 * @add ADD §4 (HITL Subsystem), §4.2 (Wait Semantics)
 * @warnings S7-W10 (event forgery), S7-W11 (timeout path)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-02
 */

// Spike validation: Verify Inngest waitForEvent semantics, timeout handling,
// and approval/rejection flow

export const SP_02_CONFIG = {
  name: 'SP-02: HITL Wait-for-Event',
  risk: 'CRITICAL' as const,
  validations: [
    'waitForEvent basic usage and matching',
    'Timeout expiry behavior',
    'Approval event delivery',
    'Rejection event handling',
    'Multiple concurrent wait states',
    'Event correlation accuracy',
  ],
} as const;
