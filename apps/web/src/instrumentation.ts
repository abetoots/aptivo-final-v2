/**
 * INT-05 / CR-2: Next.js instrumentation — registers lifecycle hooks
 * and the PII-safe application logger.
 *
 * @task INT-05
 *
 * CR-2: Pino + Sentry wiring is deferred (no deps yet). Until then,
 * `safeLogger` provides automatic PII redaction at every call site via
 * `sanitizeForLogging`. Application code MUST import `log` from
 * `@/lib/logging/safe-logger` — direct `console.*` bypasses redaction.
 */
export async function register() {
  // only register in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { log } = await import('./lib/logging/safe-logger');
    const { registerShutdownHandlers } = await import('./lib/shutdown');

    log.info('instrumentation registered', {
      runtime: process.env.NEXT_RUNTIME,
      nodeEnv: process.env.NODE_ENV,
    });

    registerShutdownHandlers({
      onDrainStart: () => log.info('draining connections'),
      onDrainComplete: () => log.info('drain complete'),
    });
  }
}
