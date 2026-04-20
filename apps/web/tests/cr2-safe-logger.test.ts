/**
 * CR-2: safe-logger PII redaction wiring
 *
 * Verifies that the application logger automatically redacts PII fields
 * via sanitizeForLogging before emitting. This is the minimum viable
 * protection until Pino + Sentry are wired in a future sprint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log } from '../src/lib/logging/safe-logger';

describe('CR-2: safe-logger', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  it('redacts email field before emitting to console', () => {
    log.info('user signed in', { userId: 'u1', email: 'alice@example.com' });

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const payload = consoleInfoSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(payload);
    expect(parsed.userId).toBe('u1');
    expect(parsed.email).toBe('[REDACTED]');
    // raw email must not leak into any log line
    expect(payload).not.toContain('alice@example.com');
  });

  it('redacts nested PII fields in structured context', () => {
    log.warn('profile update', {
      actor: 'u1',
      profile: { name: 'Alice', phone: '555-1234', bio: 'writer' },
    });

    const payload = consoleWarnSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(payload);
    expect(parsed.profile.name).toBe('[REDACTED]');
    expect(parsed.profile.phone).toBe('[REDACTED]');
    expect(parsed.profile.bio).toBe('writer');
    expect(payload).not.toContain('555-1234');
  });

  it('passes non-PII fields through unchanged', () => {
    log.info('workflow started', { workflowId: 'wf-1', step: 'trigger' });
    const payload = consoleInfoSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(payload);
    expect(parsed.workflowId).toBe('wf-1');
    expect(parsed.step).toBe('trigger');
  });

  it('emits level, time, and msg fields', () => {
    log.error('boom', { code: 'E_FAIL' });
    const payload = consoleErrorSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(payload);
    expect(parsed.level).toBe('error');
    expect(parsed.msg).toBe('boom');
    expect(typeof parsed.time).toBe('string');
    expect(parsed.code).toBe('E_FAIL');
  });

  it('supports calls without context', () => {
    log.info('simple message');
    const payload = consoleInfoSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(payload);
    expect(parsed.msg).toBe('simple message');
    expect(parsed.level).toBe('info');
  });

  it('filters debug logs when LOG_LEVEL=info', () => {
    process.env.LOG_LEVEL = 'info';
    log.debug('verbose', {});
    expect(consoleDebugSpy).not.toHaveBeenCalled();

    log.info('visible');
    expect(consoleInfoSpy).toHaveBeenCalledOnce();
  });

  it('redacts authorization header values', () => {
    log.info('api call', { authorization: 'Bearer secret-token' });
    const payload = consoleInfoSpy.mock.calls[0]![0] as string;
    expect(payload).not.toContain('secret-token');
    const parsed = JSON.parse(payload);
    expect(parsed.authorization).toBe('[REDACTED]');
  });
});
