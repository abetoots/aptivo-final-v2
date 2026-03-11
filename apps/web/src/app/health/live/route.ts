/**
 * INT-05: liveness probe
 * @task INT-05
 * @warning T1-W29 — no version info, no dependency details
 */

import { isShuttingDown } from '../../../lib/shutdown';

export async function GET() {
  if (isShuttingDown()) {
    return Response.json({ status: 'shutting_down' }, { status: 503 });
  }

  return Response.json({ status: 'ok' });
}
