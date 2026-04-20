/**
 * CR-2: PII-safe application logger
 *
 * Wraps console methods with automatic PII redaction via sanitizeForLogging.
 * Intended as the default logger for apps/web until Pino + Sentry are wired
 * in a subsequent sprint (tracked as CR-2-FOLLOWUP).
 *
 * Usage:
 *   import { log } from '@/lib/logging/safe-logger';
 *   log.info('workflow started', { userId, email }); // email auto-redacted
 *
 * Accepts structured context objects. Primitive values and arrays are passed
 * through; objects are sanitized field-by-field using the shared PII field
 * list in `security/sanitize-logging.ts`.
 */

import { sanitizeForLogging } from '../security/sanitize-logging.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

// minimum level (from env); below this, logs are dropped
const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function shouldEmit(level: LogLevel, min: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[min];
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const min = resolveMinLevel();
  if (!shouldEmit(level, min)) return;

  const sanitized = context ? sanitizeForLogging(context) : undefined;
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(sanitized ?? {}),
  };

  // route to the appropriate console method; production can pipe to stdout
  // and a log collector can parse the JSON structure
  const line = JSON.stringify(entry);
  switch (level) {
    case 'debug':
      console.debug(line);
      return;
    case 'info':
      console.info(line);
      return;
    case 'warn':
      console.warn(line);
      return;
    case 'error':
      console.error(line);
      return;
  }
}

export const log: Logger = {
  debug: (message, context) => emit('debug', message, context),
  info: (message, context) => emit('info', message, context),
  warn: (message, context) => emit('warn', message, context),
  error: (message, context) => emit('error', message, context),
};
