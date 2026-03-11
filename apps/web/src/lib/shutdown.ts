/**
 * INT-05: graceful shutdown handler
 * @task INT-05
 * @warning S6-W18
 */

const GRACE_PERIOD_MS = 30_000; // 30 seconds

export interface ShutdownConfig {
  gracePeriodMs?: number;
  onDrainStart?: () => void;
  onDrainComplete?: () => void;
}

let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

// exposed for testing — resets internal state
export function _resetForTest(): void {
  shuttingDown = false;
}

export function registerShutdownHandlers(config?: ShutdownConfig): void {
  const grace = config?.gracePeriodMs ?? GRACE_PERIOD_MS;

  const handler = async (signal: string) => {
    if (shuttingDown) return; // prevent double-handling
    shuttingDown = true;

    console.log(`[shutdown] received ${signal}, starting ${grace}ms grace period`);
    config?.onDrainStart?.();

    // wait for grace period to allow in-flight requests to complete
    await new Promise((resolve) => setTimeout(resolve, grace));

    config?.onDrainComplete?.();
    console.log('[shutdown] grace period complete, exiting');
    process.exit(0);
  };

  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT', () => handler('SIGINT'));
}
