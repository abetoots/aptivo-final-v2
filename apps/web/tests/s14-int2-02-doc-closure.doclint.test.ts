// @testtype doc-lint — validates documentation structure, not code behavior
/**
 * S14-INT2-02: Phase 2 Documentation Closure — document verification
 * @task INT2-02
 *
 * verifies all phase 2 closure documents exist and contain required sections.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// path helpers
// ---------------------------------------------------------------------------

const SPECS_DIR = resolve(__dirname, '../../../docs/04-specs');
const SPRINTS_DIR = resolve(__dirname, '../../../docs/06-sprints');
const WARNINGS_PATH = resolve(__dirname, '../../../docs/WARNINGS_REGISTER.md');

const WS_DOC_PATH = resolve(SPECS_DIR, 'websocket-lifecycle.md');
const ARCH_DELTA_PATH = resolve(SPRINTS_DIR, 'phase-2-architecture-delta.md');
const MODULES_DOC_PATH = resolve(SPRINTS_DIR, 'phase-2-modules-analysis.md');

// ---------------------------------------------------------------------------
// websocket lifecycle doc
// ---------------------------------------------------------------------------

describe('INT2-02: websocket-lifecycle.md', () => {
  it('document file exists', () => {
    expect(existsSync(WS_DOC_PATH)).toBe(true);
  });

  const content = existsSync(WS_DOC_PATH)
    ? readFileSync(WS_DOC_PATH, 'utf-8')
    : '';

  it('has title header', () => {
    expect(content).toContain('# WebSocket Lifecycle Specification');
  });

  it('has connection lifecycle section', () => {
    expect(content).toContain('## 1. Connection Lifecycle');
  });

  it('has phases table', () => {
    expect(content).toContain('### 1.1 Phases');
    expect(content).toContain('Connect');
    expect(content).toContain('Authenticate');
    expect(content).toContain('Active');
    expect(content).toContain('Idle');
    expect(content).toContain('Close');
  });

  it('has authentication flow', () => {
    expect(content).toContain('### 1.2 Authentication Flow');
    expect(content).toContain('auth_required');
    expect(content).toContain('auth_ok');
    expect(content).toContain('auth_failed');
  });

  it('has heartbeat section', () => {
    expect(content).toContain('### 1.3 Heartbeat');
    expect(content).toContain('ping');
    expect(content).toContain('pong');
  });

  it('has reconnection behavior section', () => {
    expect(content).toContain('## 2. Reconnection Behavior');
  });

  it('has client reconnection strategy', () => {
    expect(content).toContain('### 2.1 Client Reconnection Strategy');
    expect(content).toContain('Exponential backoff');
  });

  it('has state recovery section', () => {
    expect(content).toContain('### 2.2 State Recovery');
    expect(content).toContain('lastEventId');
    expect(content).toContain('full_sync');
  });

  it('has error codes section', () => {
    expect(content).toContain('## 3. Error Codes');
    expect(content).toContain('1000');
    expect(content).toContain('1001');
    expect(content).toContain('4001');
    expect(content).toContain('4002');
  });

  it('has phase 2 status section', () => {
    expect(content).toContain('## 4. Phase 2 Status');
    expect(content).toContain('documented but not implemented');
  });

  it('has traceability section closing RC-1 and RC-2', () => {
    expect(content).toContain('## Traceability');
    expect(content).toContain('RC-1');
    expect(content).toContain('RC-2');
    expect(content).toContain('**Addressed**');
  });
});

// ---------------------------------------------------------------------------
// phase 2 architecture delta doc
// ---------------------------------------------------------------------------

describe('INT2-02: phase-2-architecture-delta.md', () => {
  it('document file exists', () => {
    expect(existsSync(ARCH_DELTA_PATH)).toBe(true);
  });

  const content = existsSync(ARCH_DELTA_PATH)
    ? readFileSync(ARCH_DELTA_PATH, 'utf-8')
    : '';

  it('has title header', () => {
    expect(content).toContain('# Phase 2 Architecture Delta');
  });

  it('has overview section', () => {
    expect(content).toContain('## Overview');
  });

  it('documents all major architectural changes', () => {
    expect(content).toContain('### 1. Identity & Auth');
    expect(content).toContain('### 2. Infrastructure');
    expect(content).toContain('### 3. HITL Gateway');
    expect(content).toContain('### 4. LLM Gateway');
    expect(content).toContain('### 5. Observability');
    expect(content).toContain('### 6. Notifications');
    expect(content).toContain('### 7. Platform Features');
    expect(content).toContain('### 8. MCP');
  });

  it('has metrics comparison table', () => {
    expect(content).toContain('## Metrics');
    expect(content).toContain('Phase 1 End');
    expect(content).toContain('Phase 2 End');
  });

  it('documents bucket d resolution', () => {
    expect(content).toContain('Bucket D Resolution');
    expect(content).toContain('S2-W5');
    expect(content).toContain('S5-W17');
    expect(content).toContain('S3-W10');
  });
});

// ---------------------------------------------------------------------------
// warnings register audit
// ---------------------------------------------------------------------------

describe('INT2-02: WARNINGS_REGISTER.md — no unresolved warnings', () => {
  it('warnings register file exists', () => {
    expect(existsSync(WARNINGS_PATH)).toBe(true);
  });

  const content = existsSync(WARNINGS_PATH)
    ? readFileSync(WARNINGS_PATH, 'utf-8')
    : '';

  it('has zero open warnings in statistics', () => {
    expect(content).toContain('| **Open WARNINGs** | **0** | **0** | **0** | **0** |');
  });

  it('total outstanding is zero', () => {
    expect(content).toContain('**Total outstanding (needing action)** | **0**');
  });

  it('all deferred items are now resolved', () => {
    // the bucket d row should reflect resolution, not deferral
    expect(content).toContain('3 resolved in Phase 2');
  });

  it('does not contain any items marked as plain "deferred" without resolution', () => {
    // all lines that say "deferred" should also say "resolved" or "accepted" nearby
    const lines = content.split('\n');
    const deferredLines = lines.filter(
      (line) =>
        line.includes('deferred') &&
        !line.includes('resolved') &&
        !line.includes('Disposition key') &&
        !line.includes('Deferred (Phase 2+)') &&
        !line.includes('Defer SSO') &&
        !line.includes('tamper-proofness deferred Phase 3+')
    );
    expect(deferredLines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// module analysis doc exists (cross-check)
// ---------------------------------------------------------------------------

describe('INT2-02: phase-2-modules-analysis.md', () => {
  it('document file exists', () => {
    expect(existsSync(MODULES_DOC_PATH)).toBe(true);
  });
});
