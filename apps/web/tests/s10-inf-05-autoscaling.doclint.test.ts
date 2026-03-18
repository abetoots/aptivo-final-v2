// @testtype doc-lint — validates documentation structure, not code behavior
/**
 * INF-05: Railway Deploy Config tests
 * @task INF-05
 *
 * verifies the railway.json config contains valid
 * deployment configuration with health check path
 * and restart policy.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const railwayJsonPath = resolve(__dirname, '../../../railway.json');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function loadConfig() {
  const content = readFileSync(railwayJsonPath, 'utf-8');
  return JSON.parse(content) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('INF-05: railway deploy config', () => {
  it('railway.json exists', () => {
    expect(existsSync(railwayJsonPath)).toBe(true);
  });

  it('parses as valid json', () => {
    const config = loadConfig();
    expect(config).toBeDefined();
  });

  it('defines build configuration', () => {
    const config = loadConfig();
    const build = config.build as Record<string, unknown> | undefined;

    expect(build).toBeDefined();
    expect(build!.builder).toBe('NIXPACKS');
  });

  it('defines deploy configuration with health check', () => {
    const config = loadConfig();
    const deploy = config.deploy as Record<string, unknown> | undefined;

    expect(deploy).toBeDefined();
    expect(deploy!.healthcheckPath).toBe('/health/live');
    expect(deploy!.startCommand).toBe('pnpm start');
  });

  it('has restart policy configured', () => {
    const config = loadConfig();
    const deploy = config.deploy as Record<string, unknown> | undefined;

    expect(deploy).toBeDefined();
    expect(deploy!.restartPolicyType).toBe('ON_FAILURE');
  });

  it('has $schema for validation', () => {
    const config = loadConfig();
    expect(config['$schema']).toContain('railway.app');
  });
});
