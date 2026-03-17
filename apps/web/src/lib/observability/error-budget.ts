/**
 * OBS-01: error budget computation — pure functions
 * @task OBS-01
 *
 * computes error budgets and normalized burn rates for SLO monitoring.
 * no side effects — all inputs/outputs are plain data.
 */

// -- types --

export interface ErrorBudget {
  totalBudget: number; // total allowable failures in the window
  consumed: number; // actual failures
  remaining: number; // totalBudget - consumed (can be negative)
  burnRate: number; // consumed / totalBudget (1.0 = exactly on budget)
}

// -- functions --

/**
 * compute error budget for a given SLO target.
 * @param sloTarget - e.g., 0.99 for 99% SLO
 * @param totalEvents - total events in the window
 * @param failedEvents - failed events in the window
 */
export function computeErrorBudget(
  sloTarget: number,
  totalEvents: number,
  failedEvents: number,
): ErrorBudget {
  const totalBudget = totalEvents * (1 - sloTarget);
  const consumed = failedEvents;
  const remaining = totalBudget - consumed;
  const burnRate = totalBudget > 0 ? consumed / totalBudget : 0;

  return { totalBudget, consumed, remaining, burnRate };
}

/**
 * compute monthly-normalized burn rate from a windowed observation.
 * if the current burn rate in a 5-minute window were sustained for a month,
 * how fast would the monthly budget be consumed?
 */
export function computeNormalizedBurnRate(
  windowBurnRate: number,
  windowMs: number,
  monthMs: number = 30 * 24 * 60 * 60 * 1000,
): number {
  if (windowMs <= 0) return 0;
  return windowBurnRate * (monthMs / windowMs);
}
