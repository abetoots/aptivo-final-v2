/**
 * INT-05: readiness probe
 * @task INT-05
 * @warning T1-W29 — no connection strings, no error messages exposed
 */

import { sql } from 'drizzle-orm';
import { isShuttingDown } from '../../../lib/shutdown';
import { getDb } from '../../../lib/db';

export async function GET() {
  if (isShuttingDown()) {
    return Response.json({ status: 'shutting_down' }, { status: 503 });
  }

  try {
    // check db connectivity with a lightweight query
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return Response.json({ status: 'ok' });
  } catch {
    // do not expose internal error details
    return Response.json({ status: 'degraded' }, { status: 503 });
  }
}
