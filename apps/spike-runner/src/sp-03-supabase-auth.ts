/**
 * SP-03: Supabase Auth + RLS Spike
 * @spike SP-03
 * @brd BO-CORE-003, BRD §6.4 (Build: Auth & Tenancy)
 * @frd FR-CORE-AUTH-001 through FR-CORE-AUTH-005
 * @add ADD §6 (Auth & Tenancy), §6.1 (RLS Policies)
 * @warnings S7-W4 (RLS bypass risk)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-03
 */

// Spike validation: Verify Supabase Auth integration, RLS policy enforcement,
// multi-tenant isolation, and JWT claim propagation

export const SP_03_CONFIG = {
  name: 'SP-03: Supabase Auth + RLS',
  risk: 'CRITICAL' as const,
  validations: [
    'Auth session creation and validation',
    'RLS policy enforcement per tenant',
    'Cross-tenant access prevention',
    'JWT claim propagation to Postgres',
    'Service role bypass behavior',
    'Token refresh and expiry',
  ],
} as const;
