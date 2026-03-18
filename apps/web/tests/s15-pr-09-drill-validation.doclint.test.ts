// @testtype doc-lint — validates documentation structure, not code behavior
/**
 * PR-09: Game-Day Runbook Drills — validation tests
 * @task PR-09
 *
 * validates that the e2e results document exists, contains required
 * sections, drill timestamps, and a release gate decision.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const RESULTS_PATH = resolve(
  __dirname,
  '../../../docs/06-sprints/sprint-15-e2e-results.md',
);

function getResultsContent(): string {
  return readFileSync(RESULTS_PATH, 'utf-8');
}

// ---------------------------------------------------------------------------
// PR-09: document existence
// ---------------------------------------------------------------------------

describe('PR-09: E2E Results Document', () => {
  it('sprint-15-e2e-results.md exists', () => {
    expect(existsSync(RESULTS_PATH)).toBe(true);
  });

  it('document contains subsystem validation summary', () => {
    const content = getResultsContent();

    expect(content).toContain('Subsystem Validation Summary');
    expect(content).toContain('Connection Resolution');
    expect(content).toContain('MFA Client Resolution');
    expect(content).toContain('Redis Split');
    expect(content).toContain('SMTP Config');
    expect(content).toContain('Feature Flag Rollout');
    expect(content).toContain('Streaming Content Filter');
    expect(content).toContain('Pool Config');
    expect(content).toContain('Golden Path Simulation');
  });

  it('all subsystems show PASS status', () => {
    const content = getResultsContent();

    // count PASS entries in the summary table
    const passMatches = content.match(/\| PASS \|/g);
    expect(passMatches).not.toBeNull();
    expect(passMatches!.length).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// PR-09: drill timestamps
// ---------------------------------------------------------------------------

describe('PR-09: Drill Timestamps Structure', () => {
  it('contains game-day drill results section', () => {
    const content = getResultsContent();

    expect(content).toContain('Game-Day Drill Results');
  });

  it('contains at least 5 drill entries with timestamps', () => {
    const content = getResultsContent();

    // timestamps are in ISO 8601 format
    const timestampMatches = content.match(/\*\*Timestamp\*\*:\s*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g);
    expect(timestampMatches).not.toBeNull();
    expect(timestampMatches!.length).toBeGreaterThanOrEqual(5);
  });

  it('each drill has scenario, action, and result', () => {
    const content = getResultsContent();

    const scenarios = content.match(/\*\*Scenario\*\*:/g);
    const actions = content.match(/\*\*Action\*\*:/g);
    const results = content.match(/\*\*Result\*\*:/g);

    expect(scenarios).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(results).not.toBeNull();
    expect(scenarios!.length).toBeGreaterThanOrEqual(5);
    expect(actions!.length).toBeGreaterThanOrEqual(5);
    expect(results!.length).toBeGreaterThanOrEqual(5);
  });

  it('all drill results show PASS', () => {
    const content = getResultsContent();

    const drillResults = content.match(/\*\*Result\*\*:\s*PASS/g);
    expect(drillResults).not.toBeNull();
    expect(drillResults!.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// PR-09: release gate decision
// ---------------------------------------------------------------------------

describe('PR-09: Release Gate Decision', () => {
  it('document contains GO/NO-GO decision', () => {
    const content = getResultsContent();

    expect(content).toContain('GO/NO-GO Release Decision');
  });

  it('decision is PENDING (simulated — requires real infra)', () => {
    const content = getResultsContent();

    expect(content).toContain('**Decision**: PENDING');
  });

  it('decision includes rationale', () => {
    const content = getResultsContent();

    expect(content).toContain('**Rationale**:');
    expect(content).toContain('simulated infrastructure');
  });

  it('document contains drill appendix', () => {
    const content = getResultsContent();

    expect(content).toContain('Drill Appendix');
    expect(content).toContain('Environment Configuration Tested');
    expect(content).toContain('Coverage');
  });
});
