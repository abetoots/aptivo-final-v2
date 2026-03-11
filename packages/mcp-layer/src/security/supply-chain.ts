/**
 * SP-13: MCP Supply-Chain Integrity
 * @spike SP-13
 * @add ADD §5.1 (MCP Trust), §9.1 (Supply Chain)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-13
 *
 * Provides version pinning, registry allowlist, SBOM generation,
 * checksum verification, and pre-deploy gate for MCP server dependencies.
 */

import { createHash } from 'node:crypto';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

/** a pinned MCP server package dependency */
export interface PinnedPackage {
  /** npm package name */
  name: string;
  /** exact semver version (no ranges) */
  version: string;
  /** sha-512 integrity hash (subresource integrity format) */
  integrity: string;
  /** approved registry URL */
  registry: string;
}

/** SBOM entry (CycloneDX-inspired) */
export interface SbomEntry {
  type: 'library';
  name: string;
  version: string;
  purl: string;
  hashes: { alg: string; content: string }[];
}

export interface Sbom {
  bomFormat: 'CycloneDX';
  specVersion: '1.5';
  version: number;
  components: SbomEntry[];
  generatedAt: string;
}

export type VerificationFailure =
  | 'unpinned-version'
  | 'disallowed-registry'
  | 'integrity-mismatch'
  | 'missing-integrity'
  | 'missing-package'
  | 'invalid-purl';

export interface VerificationResult {
  packageName: string;
  passed: boolean;
  failures: { reason: VerificationFailure; detail: string }[];
}

export interface PreDeployReport {
  passed: boolean;
  timestamp: string;
  results: VerificationResult[];
  sbom: Sbom;
}

// ---------------------------------------------------------------------------
// version pinning
// ---------------------------------------------------------------------------

const EXACT_SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Validates that a version string is an exact pin (no ranges, no prefixes).
 * Accepts: "1.2.3"
 * Rejects: "^1.2.3", "~1.2.3", ">=1.0.0", "1.x", "*", "latest"
 */
export function isExactVersion(version: string): boolean {
  return EXACT_SEMVER.test(version);
}

/**
 * Validates all packages have exact version pins.
 */
export function validateVersionPinning(
  packages: PinnedPackage[],
): Result<void, { unpinned: string[] }> {
  const unpinned = packages
    .filter((p) => !isExactVersion(p.version))
    .map((p) => `${p.name}@${p.version}`);

  if (unpinned.length > 0) {
    return Result.err({ unpinned });
  }
  return Result.ok(undefined);
}

// ---------------------------------------------------------------------------
// registry allowlist
// ---------------------------------------------------------------------------

const DEFAULT_REGISTRIES = ['https://registry.npmjs.org'] as const;

/**
 * Validates all packages are from approved registries.
 */
export function validateRegistryAllowlist(
  packages: PinnedPackage[],
  allowedRegistries: string[] = [...DEFAULT_REGISTRIES],
): Result<void, { disallowed: { name: string; registry: string }[] }> {
  const set = new Set(allowedRegistries);
  const disallowed = packages
    .filter((p) => !set.has(p.registry))
    .map((p) => ({ name: p.name, registry: p.registry }));

  if (disallowed.length > 0) {
    return Result.err({ disallowed });
  }
  return Result.ok(undefined);
}

// ---------------------------------------------------------------------------
// checksum / integrity verification
// ---------------------------------------------------------------------------

/**
 * Computes an SRI integrity hash for given content.
 * Format: "sha512-<base64>"
 */
export function computeIntegrity(content: Buffer | string): string {
  const hash = createHash('sha512').update(content).digest('base64');
  return `sha512-${hash}`;
}

/**
 * Verifies a package's integrity against provided content.
 */
export function verifyIntegrity(
  pkg: PinnedPackage,
  content: Buffer | string,
): Result<void, { reason: VerificationFailure; detail: string }> {
  if (!pkg.integrity) {
    return Result.err({
      reason: 'missing-integrity' as const,
      detail: `No integrity hash for ${pkg.name}@${pkg.version}`,
    });
  }
  const actual = computeIntegrity(content);
  if (actual !== pkg.integrity) {
    return Result.err({
      reason: 'integrity-mismatch' as const,
      detail: `${pkg.name}@${pkg.version}: expected ${pkg.integrity}, got ${actual}`,
    });
  }
  return Result.ok(undefined);
}

// ---------------------------------------------------------------------------
// SBOM generation
// ---------------------------------------------------------------------------

/**
 * Generates a PURL (Package URL) for an npm package.
 * Format: "pkg:npm/<name>@<version>"
 */
export function toPurl(name: string, version: string): string {
  // handle scoped packages: @scope/name -> %40scope/name
  const encoded = name.startsWith('@') ? name.replace('@', '%40') : name;
  return `pkg:npm/${encoded}@${version}`;
}

/**
 * Generates a CycloneDX-format SBOM from pinned packages.
 */
export function generateSbom(packages: PinnedPackage[]): Sbom {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    generatedAt: new Date().toISOString(),
    components: packages.map((p) => ({
      type: 'library' as const,
      name: p.name,
      version: p.version,
      purl: toPurl(p.name, p.version),
      hashes: [{ alg: 'SHA-512', content: p.integrity }],
    })),
  };
}

// ---------------------------------------------------------------------------
// package resolver (abstraction for test + production)
// ---------------------------------------------------------------------------

/**
 * Resolves package content. In production, this would fetch from the registry.
 * Tests inject a mock resolver.
 */
export type PackageResolver = (
  name: string,
  version: string,
  registry: string,
) => Promise<Result<Buffer, { reason: 'missing-package'; detail: string }>>;

// ---------------------------------------------------------------------------
// pre-deploy verification gate
// ---------------------------------------------------------------------------

/**
 * Runs the full pre-deploy verification pipeline:
 * 1. Version pinning check
 * 2. Registry allowlist check
 * 3. Checksum verification (fetches package content via resolver)
 * 4. SBOM generation
 *
 * Returns a comprehensive report. Any failure makes passed=false.
 */
export async function runPreDeployVerification(
  packages: PinnedPackage[],
  resolver: PackageResolver,
  allowedRegistries?: string[],
): Promise<PreDeployReport> {
  const results: VerificationResult[] = [];

  for (const pkg of packages) {
    const failures: VerificationResult['failures'] = [];

    // 1. version pinning
    if (!isExactVersion(pkg.version)) {
      failures.push({
        reason: 'unpinned-version',
        detail: `${pkg.name}@${pkg.version} is not an exact version`,
      });
    }

    // 2. registry allowlist
    const registries = allowedRegistries ?? [...DEFAULT_REGISTRIES];
    if (!new Set(registries).has(pkg.registry)) {
      failures.push({
        reason: 'disallowed-registry',
        detail: `${pkg.name} uses disallowed registry: ${pkg.registry}`,
      });
    }

    // 3. integrity verification (only if we can fetch)
    if (!pkg.integrity) {
      failures.push({
        reason: 'missing-integrity',
        detail: `No integrity hash for ${pkg.name}@${pkg.version}`,
      });
    } else {
      const fetchResult = await resolver(pkg.name, pkg.version, pkg.registry);
      if (!fetchResult.ok) {
        failures.push({
          reason: fetchResult.error.reason,
          detail: fetchResult.error.detail,
        });
      } else {
        const integrityResult = verifyIntegrity(pkg, fetchResult.value);
        if (!integrityResult.ok) {
          failures.push(integrityResult.error);
        }
      }
    }

    results.push({
      packageName: pkg.name,
      passed: failures.length === 0,
      failures,
    });
  }

  const sbom = generateSbom(packages);

  return {
    passed: results.every((r) => r.passed),
    timestamp: new Date().toISOString(),
    results,
    sbom,
  };
}
