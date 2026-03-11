/**
 * @testcase SP-13-SEC-001 through SP-13-SEC-006
 * @requirements ADD §5.1 (MCP Trust), §9.1 (Supply Chain)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-13
 */
import { describe, it, expect } from 'vitest';
import { Result } from '@aptivo/types';
import {
  isExactVersion,
  validateVersionPinning,
  validateRegistryAllowlist,
  computeIntegrity,
  verifyIntegrity,
  toPurl,
  generateSbom,
  runPreDeployVerification,
  type PinnedPackage,
  type PackageResolver,
} from '../src/security/supply-chain.js';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const GOOD_CONTENT = Buffer.from('package-content-for-testing');
const GOOD_INTEGRITY = computeIntegrity(GOOD_CONTENT);

const validPackage: PinnedPackage = {
  name: '@modelcontextprotocol/sdk',
  version: '1.27.1',
  integrity: GOOD_INTEGRITY,
  registry: 'https://registry.npmjs.org',
};

const validPackage2: PinnedPackage = {
  name: 'zod',
  version: '3.23.8',
  integrity: GOOD_INTEGRITY,
  registry: 'https://registry.npmjs.org',
};

// resolver that returns the known good content
const goodResolver: PackageResolver = async () =>
  Result.ok(GOOD_CONTENT);

// resolver that returns tampered content
const tamperedResolver: PackageResolver = async () =>
  Result.ok(Buffer.from('tampered-content'));

// resolver that simulates missing package
const missingResolver: PackageResolver = async (name, version) =>
  Result.err({ reason: 'missing-package' as const, detail: `${name}@${version} not found in registry` });

// ---------------------------------------------------------------------------
// version pinning
// ---------------------------------------------------------------------------
describe('SP-13: MCP Supply-Chain Integrity', () => {
  describe('version pinning', () => {
    it('accepts exact semver versions', () => {
      expect(isExactVersion('1.27.1')).toBe(true);
      expect(isExactVersion('0.0.1')).toBe(true);
      expect(isExactVersion('100.200.300')).toBe(true);
    });

    it('rejects range prefixes', () => {
      expect(isExactVersion('^1.27.1')).toBe(false);
      expect(isExactVersion('~1.27.1')).toBe(false);
      expect(isExactVersion('>=1.0.0')).toBe(false);
    });

    it('rejects wildcard and tag versions', () => {
      expect(isExactVersion('*')).toBe(false);
      expect(isExactVersion('latest')).toBe(false);
      expect(isExactVersion('1.x')).toBe(false);
      expect(isExactVersion('1.2.x')).toBe(false);
    });

    it('validates all packages are pinned', () => {
      const result = validateVersionPinning([validPackage, validPackage2]);
      expect(result.ok).toBe(true);
    });

    it('reports unpinned packages', () => {
      const unpinned: PinnedPackage = {
        ...validPackage,
        name: 'bad-pkg',
        version: '^1.0.0',
      };
      const result = validateVersionPinning([validPackage, unpinned]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.unpinned).toContain('bad-pkg@^1.0.0');
    });
  });

  // ---------------------------------------------------------------------------
  // registry allowlist
  // ---------------------------------------------------------------------------
  describe('registry allowlist', () => {
    it('accepts packages from default registry', () => {
      const result = validateRegistryAllowlist([validPackage, validPackage2]);
      expect(result.ok).toBe(true);
    });

    it('accepts packages from custom allowed registries', () => {
      const pkg: PinnedPackage = { ...validPackage, registry: 'https://npm.internal.co' };
      const result = validateRegistryAllowlist(
        [pkg],
        ['https://npm.internal.co'],
      );
      expect(result.ok).toBe(true);
    });

    it('rejects packages from disallowed registries', () => {
      const pkg: PinnedPackage = { ...validPackage, registry: 'https://evil-registry.com' };
      const result = validateRegistryAllowlist([validPackage, pkg]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.disallowed).toHaveLength(1);
      expect(result.error.disallowed[0]!.registry).toBe('https://evil-registry.com');
    });

    it('rejects all packages when custom list excludes default', () => {
      const result = validateRegistryAllowlist(
        [validPackage],
        ['https://only-this-one.com'],
      );
      expect(result.ok).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // integrity / checksum verification
  // ---------------------------------------------------------------------------
  describe('integrity verification', () => {
    it('computes sha512 integrity hash', () => {
      const hash = computeIntegrity('hello');
      expect(hash).toMatch(/^sha512-[A-Za-z0-9+/=]+$/);
    });

    it('produces consistent hashes for same content', () => {
      expect(computeIntegrity('test')).toBe(computeIntegrity('test'));
    });

    it('produces different hashes for different content', () => {
      expect(computeIntegrity('a')).not.toBe(computeIntegrity('b'));
    });

    it('verifies matching integrity', () => {
      const result = verifyIntegrity(validPackage, GOOD_CONTENT);
      expect(result.ok).toBe(true);
    });

    it('detects tampered content (integrity mismatch)', () => {
      const result = verifyIntegrity(validPackage, Buffer.from('tampered'));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('integrity-mismatch');
    });

    it('rejects package with missing integrity hash', () => {
      const noHash: PinnedPackage = { ...validPackage, integrity: '' };
      const result = verifyIntegrity(noHash, GOOD_CONTENT);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('missing-integrity');
    });
  });

  // ---------------------------------------------------------------------------
  // SBOM generation
  // ---------------------------------------------------------------------------
  describe('SBOM generation', () => {
    it('generates CycloneDX-format SBOM', () => {
      const sbom = generateSbom([validPackage, validPackage2]);
      expect(sbom.bomFormat).toBe('CycloneDX');
      expect(sbom.specVersion).toBe('1.5');
      expect(sbom.components).toHaveLength(2);
    });

    it('includes PURL for each component', () => {
      const sbom = generateSbom([validPackage]);
      expect(sbom.components[0]!.purl).toBe(
        'pkg:npm/%40modelcontextprotocol/sdk@1.27.1',
      );
    });

    it('generates correct PURL for scoped packages', () => {
      expect(toPurl('@scope/pkg', '1.0.0')).toBe('pkg:npm/%40scope/pkg@1.0.0');
    });

    it('generates correct PURL for unscoped packages', () => {
      expect(toPurl('zod', '3.23.8')).toBe('pkg:npm/zod@3.23.8');
    });

    it('includes integrity hashes in SBOM', () => {
      const sbom = generateSbom([validPackage]);
      expect(sbom.components[0]!.hashes).toHaveLength(1);
      expect(sbom.components[0]!.hashes[0]!.alg).toBe('SHA-512');
    });

    it('records generation timestamp', () => {
      const sbom = generateSbom([validPackage]);
      expect(sbom.generatedAt).toBeTruthy();
      // should be valid ISO date
      expect(new Date(sbom.generatedAt).toISOString()).toBe(sbom.generatedAt);
    });
  });

  // ---------------------------------------------------------------------------
  // pre-deploy verification gate
  // ---------------------------------------------------------------------------
  describe('pre-deploy verification gate', () => {
    it('passes when all checks succeed', async () => {
      const report = await runPreDeployVerification(
        [validPackage, validPackage2],
        goodResolver,
      );
      expect(report.passed).toBe(true);
      expect(report.results).toHaveLength(2);
      expect(report.results.every((r) => r.passed)).toBe(true);
      expect(report.sbom.components).toHaveLength(2);
    });

    it('fails on unpinned version', async () => {
      const unpinned: PinnedPackage = { ...validPackage, version: '^1.0.0' };
      const report = await runPreDeployVerification([unpinned], goodResolver);
      expect(report.passed).toBe(false);
      const failures = report.results[0]!.failures;
      expect(failures.some((f) => f.reason === 'unpinned-version')).toBe(true);
    });

    it('fails on disallowed registry', async () => {
      const badReg: PinnedPackage = { ...validPackage, registry: 'https://evil.com' };
      const report = await runPreDeployVerification([badReg], goodResolver);
      expect(report.passed).toBe(false);
      const failures = report.results[0]!.failures;
      expect(failures.some((f) => f.reason === 'disallowed-registry')).toBe(true);
    });

    it('fails on integrity mismatch (tampered package)', async () => {
      const report = await runPreDeployVerification(
        [validPackage],
        tamperedResolver,
      );
      expect(report.passed).toBe(false);
      const failures = report.results[0]!.failures;
      expect(failures.some((f) => f.reason === 'integrity-mismatch')).toBe(true);
    });

    it('fails when package is missing from registry', async () => {
      const report = await runPreDeployVerification(
        [validPackage],
        missingResolver,
      );
      expect(report.passed).toBe(false);
      const failures = report.results[0]!.failures;
      expect(failures.some((f) => f.reason === 'missing-package')).toBe(true);
    });

    it('fails on missing integrity hash', async () => {
      const noHash: PinnedPackage = { ...validPackage, integrity: '' };
      const report = await runPreDeployVerification([noHash], goodResolver);
      expect(report.passed).toBe(false);
      const failures = report.results[0]!.failures;
      expect(failures.some((f) => f.reason === 'missing-integrity')).toBe(true);
    });

    it('accumulates multiple failures for one package', async () => {
      const bad: PinnedPackage = {
        name: 'bad-pkg',
        version: '^1.0.0',
        integrity: '',
        registry: 'https://evil.com',
      };
      const report = await runPreDeployVerification([bad], goodResolver);
      expect(report.passed).toBe(false);
      const failures = report.results[0]!.failures;
      // should have at least: unpinned-version, disallowed-registry, missing-integrity
      expect(failures.length).toBeGreaterThanOrEqual(3);
    });

    it('still generates SBOM even on failure', async () => {
      const unpinned: PinnedPackage = { ...validPackage, version: '~1.0.0' };
      const report = await runPreDeployVerification([unpinned], goodResolver);
      expect(report.passed).toBe(false);
      expect(report.sbom.bomFormat).toBe('CycloneDX');
      expect(report.sbom.components).toHaveLength(1);
    });

    it('includes timestamp in report', async () => {
      const report = await runPreDeployVerification([validPackage], goodResolver);
      expect(report.timestamp).toBeTruthy();
    });
  });
});
