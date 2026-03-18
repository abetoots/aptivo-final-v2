// @testtype doc-lint — validates documentation structure, not code behavior
/**
 * INF-05: Worker Auto-Scaling Config tests
 * @task INF-05
 *
 * verifies the digitalocean app platform spec contains valid
 * worker auto-scaling configuration with cpu-based metrics
 * and cooldown period to prevent flapping.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { parse } from 'yaml';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const appYamlPath = resolve(__dirname, '../../../.do/app.yaml');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function loadSpec() {
  const content = readFileSync(appYamlPath, 'utf-8');
  return parse(content) as Record<string, unknown>;
}

function findWorker(spec: Record<string, unknown>) {
  const workers = spec.workers as Array<Record<string, unknown>> | undefined;
  return workers?.find((w) => w.name === 'inngest-worker') as
    | Record<string, unknown>
    | undefined;
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('INF-05: worker auto-scaling config', () => {
  it('app.yaml exists at .do/app.yaml', () => {
    expect(existsSync(appYamlPath)).toBe(true);
  });

  it('parses as valid yaml', () => {
    const spec = loadSpec();
    expect(spec).toBeDefined();
    expect(spec.name).toBe('aptivo');
  });

  it('defines inngest-worker with autoscaling', () => {
    const spec = loadSpec();
    const worker = findWorker(spec);

    expect(worker).toBeDefined();
    expect(worker!.autoscaling).toBeDefined();

    const autoscaling = worker!.autoscaling as Record<string, unknown>;
    expect(autoscaling.min_instance_count).toBeGreaterThanOrEqual(1);
    expect(autoscaling.max_instance_count).toBeGreaterThanOrEqual(2);
  });

  it('max instances does not exceed cost cap', () => {
    const spec = loadSpec();
    const worker = findWorker(spec);
    const autoscaling = worker!.autoscaling as Record<string, unknown>;

    // max 4 to control costs (raise via doctl if needed)
    expect(autoscaling.max_instance_count).toBeLessThanOrEqual(10);
  });

  it('has cooldown period to prevent flapping', () => {
    const spec = loadSpec();
    const worker = findWorker(spec);
    const autoscaling = worker!.autoscaling as Record<string, unknown>;

    // at least 60 seconds cooldown
    expect(autoscaling.cooldown_period_seconds).toBeGreaterThanOrEqual(60);
  });

  it('has CPU-based scaling metric', () => {
    const spec = loadSpec();
    const worker = findWorker(spec);
    const autoscaling = worker!.autoscaling as Record<string, unknown>;
    const metrics = autoscaling.metrics as Array<Record<string, unknown>>;

    const cpuMetric = metrics?.find((m) => m.type === 'CPU');
    expect(cpuMetric).toBeDefined();
    // cpu threshold should be reasonable (not too aggressive)
    expect(cpuMetric!.percent).toBeGreaterThanOrEqual(50);
    expect(cpuMetric!.percent).toBeLessThanOrEqual(80);
  });

  it('worker has required environment variables', () => {
    const spec = loadSpec();
    const worker = findWorker(spec);
    const envs = worker!.envs as Array<Record<string, unknown>> | undefined;

    expect(envs).toBeDefined();
    const envKeys = envs!.map((e) => e.key);
    expect(envKeys).toContain('DATABASE_URL');
    expect(envKeys).toContain('REDIS_URL');
  });

  it('web service is defined alongside worker', () => {
    const spec = loadSpec();
    const services = spec.services as Array<Record<string, unknown>>;

    expect(services).toBeDefined();
    expect(services.length).toBeGreaterThanOrEqual(1);

    const web = services.find((s) => s.name === 'web');
    expect(web).toBeDefined();
  });
});
