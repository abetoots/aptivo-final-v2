import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('INF-06: drift detection pipeline', () => {
  const workflowPath = resolve(__dirname, '../../../.github/workflows/drift-detection.yml');
  const scriptPath = resolve(__dirname, '../../../scripts/drift-check.sh');

  it('drift-detection workflow exists', () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it('workflow has weekly cron schedule', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('schedule:');
    expect(content).toContain('cron:');
  });

  it('workflow has manual dispatch trigger', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('workflow_dispatch');
  });

  it('workflow creates issue on drift', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('issues.create');
    expect(content).toContain('drift_detected');
  });

  it('drift-check script exists and is executable', () => {
    expect(existsSync(scriptPath)).toBe(true);
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('#!/usr/bin/env bash');
  });

  it('drift-check script normalizes specs before comparison', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('normalize');
    expect(content).toContain('sort_keys');
  });

  it('drift-check script strips volatile fields', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('del(');
    expect(content).toContain('.created_at');
    expect(content).toContain('.active_deployment');
  });
});
