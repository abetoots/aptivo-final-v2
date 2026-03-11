/**
 * INT-05: Next.js instrumentation — registers lifecycle hooks
 * @task INT-05
 */
export async function register() {
  // only register in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerShutdownHandlers } = await import('./lib/shutdown');
    registerShutdownHandlers({
      onDrainStart: () => console.log('[instrumentation] draining connections...'),
      onDrainComplete: () => console.log('[instrumentation] drain complete'),
    });
  }
}
