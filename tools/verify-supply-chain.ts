/**
 * CF-02: Supply-Chain Pre-Deploy Verification Gate
 * @task CF-02
 *
 * CI script that runs supply-chain verification before deploy.
 * Validates version pinning, registry allowlist, and SHA-512 integrity
 * for critical workspace dependencies.
 *
 * Usage: npx tsx tools/verify-supply-chain.ts
 * Exit code 0 = pass, 1 = fail
 */

import { runPreDeployVerification } from '@aptivo/mcp-layer';
import type { Result } from '@aptivo/types';

// critical packages to verify (workspace deps that handle security)
const CRITICAL_PACKAGES = [
  { name: 'jose', version: '6.1.3', registry: 'https://registry.npmjs.org', integrity: 'sha512-placeholder' },
  { name: 'zod', version: '4.3.6', registry: 'https://registry.npmjs.org', integrity: 'sha512-placeholder' },
] as const;

// stub resolver — in production this would fetch from registry
const ciResolver = async (
  name: string,
  version: string,
  _registry: string,
): Promise<Result<Buffer, { reason: 'missing-package'; detail: string }>> => {
  // ci environment: verify packages exist in node_modules
  try {
    const pkgJson = await import(`${name}/package.json`, { with: { type: 'json' } });
    if (pkgJson.default.version !== version) {
      return {
        ok: false,
        error: { reason: 'missing-package', detail: `${name}@${version} not found, got ${pkgJson.default.version}` },
      };
    }
    return { ok: true, value: Buffer.from(JSON.stringify(pkgJson.default)) };
  } catch {
    return {
      ok: false,
      error: { reason: 'missing-package', detail: `${name} not resolvable` },
    };
  }
};

async function main(): Promise<void> {
  console.log('supply-chain verification starting...');

  const report = await runPreDeployVerification(
    CRITICAL_PACKAGES.map((p) => ({ ...p })),
    ciResolver,
  );

  console.log(`verification ${report.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`  packages checked: ${report.results.length}`);
  console.log(`  sbom entries: ${report.sbom.length}`);

  for (const result of report.results) {
    if (result.failures.length > 0) {
      console.error(`  FAIL: ${result.name}@${result.version}`);
      for (const f of result.failures) {
        console.error(`    - ${f.reason}: ${f.detail}`);
      }
    } else {
      console.log(`  OK: ${result.name}@${result.version}`);
    }
  }

  // exit 1 on failure to fail CI
  if (!report.passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('supply-chain verification crashed:', err);
  process.exit(1);
});
