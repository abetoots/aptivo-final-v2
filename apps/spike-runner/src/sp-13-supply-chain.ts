/**
 * SP-13: Supply Chain Security Spike
 * @spike SP-13
 * @brd BO-CORE-013, BRD §6.14 (Build: Security)
 * @frd FR-CORE-SEC-001 (Dependency auditing)
 * @add ADD §9 (Security), §9.1 (Supply Chain)
 * @warnings S7-W20 (transitive dependency risk)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-13
 */

// Spike validation: Verify dependency auditing, lockfile integrity,
// and SBOM generation for supply chain security

export const SP_13_CONFIG = {
  name: 'SP-13: Supply Chain Security',
  risk: 'MEDIUM' as const,
  validations: [
    'pnpm audit integration',
    'Lockfile integrity verification',
    'SBOM generation (CycloneDX)',
    'License compliance checking',
    'Transitive dependency analysis',
    'CI/CD gate integration',
  ],
} as const;
