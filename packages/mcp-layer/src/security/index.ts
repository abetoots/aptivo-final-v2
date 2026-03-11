/**
 * MCP Security — barrel export
 * @spike SP-06, SP-13
 */

export { sanitizeEnvForMcp, isBlockedEnvVar } from './env-sanitizer.js';
export { validateServerConfig } from './allowlist.js';
export type { McpServerConfig } from './allowlist.js';
export { generateScopedToken, verifyScopedToken } from './scoped-tokens.js';
export type { ScopedTokenOptions, ScopedTokenPayload } from './scoped-tokens.js';
export {
  isExactVersion,
  validateVersionPinning,
  validateRegistryAllowlist,
  computeIntegrity,
  verifyIntegrity,
  toPurl,
  generateSbom,
  runPreDeployVerification,
} from './supply-chain.js';
export type {
  PinnedPackage,
  SbomEntry,
  Sbom,
  VerificationFailure,
  VerificationResult,
  PreDeployReport,
  PackageResolver,
} from './supply-chain.js';
